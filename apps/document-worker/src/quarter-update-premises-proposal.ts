import {z} from "zod";
import {composeQuarterUpdateFromStoredPriors, prepareQuarterUpdatePacket, proposeQuarterUpdateHypotheses, quarterUpdateFactsSchema, type QuarterUpdateFacts} from "@offroad/financial-model";
import {statedLabel, withRecordIdentity, unsourcedFields, citedSource, extractedOrigin, factsOrGaps, repeatedLabels, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn, sameLabel, sourced, stated,
  summaryRow, type Lote2Completion, type Lote2Summary, type Lote2TurnPremises, type PriorResultPin} from "./lote2-premises";
import {premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";
import {readerGaps, type BoundBasis} from "./lote3-reader-check";

/** The method these premises feed, pinned to its implemented version. */
export const quarterUpdatePremiseMethod = {methodId: "update-after-quarter-close", methodVersion: "2026.10.26-v1"} as const;

/** A quarter close to carry forward: the turn may propose the update's premises. A statement after the latest such
 * question among the recent messages is a continuation candidate; the extraction's `turnIntent` decides it. */
export function shouldProposeQuarterUpdatePremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return premiseEntry("quarter_update", message, hasAttachments, earlierUserMessages) !== null;
}

/** The prior completed results of the same work the close updates, as the worker reads them from the database. */
const priorSchema = z.looseObject({executionId: z.uuid(), resultFingerprint: z.string().regex(/^[a-f0-9]{64}$/), envelopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  packet: z.looseObject({}),
  /** The stream ids of the prior weekly cash input, when the database states them; the packet names only the outflows. */
  streamIds: z.array(z.string()).optional(),
  /** The stored input snapshot of the prior execution, verbatim: the confirmation composes the close over it. */
  inputSnapshot: z.string().min(2)});
export const quarterUpdatePriorsSchema = z.looseObject({weeklyCash: priorSchema.nullable(), covenant: priorSchema.nullable()});
export type QuarterUpdatePriorsRead = z.infer<typeof quarterUpdatePriorsSchema>;
type Prior = z.infer<typeof priorSchema>;

/** The prior weekly cash streams, by id and label: the inputs' ids and the labels the packet carries for its outflows. */
export function priorStreams(prior: Prior): {id: string; label: string}[] {
  const labels = new Map<string, string>();
  const weekly = (prior.packet as {result?: {weekly?: {cases?: {rows?: {outflowsByStream?: {streamId: string; label: string}[]}[]}[]}}}).result?.weekly;
  for (const c of weekly?.cases ?? []) for (const r of c.rows ?? []) for (const s of r.outflowsByStream ?? []) if (!labels.has(s.streamId)) labels.set(s.streamId, s.label);
  const ids = [...prior.streamIds ?? [], ...labels.keys()];
  return [...new Set(ids)].map((id) => ({id, label: labels.get(id) ?? id}));
}
/** The prior covenant measurements, the headline first, then the tests, then the contrasts. */
export function priorMeasurements(prior: Prior): {id: string; label: string; role: string; date: string | null}[] {
  const p = prior.packet as {readings?: {headline?: {measurementId?: string}} | null; result?: {headroom?: {measurements?: {id: string; label: string; role: string; date?: string}[]} | null}};
  const all = (p.result?.headroom?.measurements ?? []).map((m) => ({id: m.id, label: m.label, role: m.role, date: m.date ?? null}));
  const headline = p.readings?.headline?.measurementId ?? null;
  const rank = (m: {id: string; role: string}) => m.id === headline ? 0 : m.role === "test" ? 1 : 2;
  return [...all].sort((a, b) => rank(a) - rank(b));
}

/** An amount as written, in the scale the document or the conversation states; the bridge checks its size. */
const signed = z.string().regex(/^-?\d{1,40}(?:\.\d{1,40})?$/);
const unsigned = z.string().regex(/^\d{1,40}(?:\.\d{1,40})?$/);
/** Where a cause or a new stream was read (the invoice line, the page, the cell); null when the source does not say. */
const anchor = z.string().trim().min(1).max(200).nullable();
/** The scale an amount is written in: reais, thousands or millions of reais; null when nobody stated it. */
const scale = z.enum(["reais", "milhares", "milhoes"]).nullable();
export type AmountScale = NonNullable<z.infer<typeof scale>>;
/** The basis of the close is in reais: the prior weekly cash and covenant results it updates were adopted in reais. */
const basisMoney = /^-?\d{1,24}(?:\.\d{1,8})?$/;
const lineMeasure = /^-?\d{1,6}(?:\.\d{1,8})?$/;
/** An amount written in a scale, in reais, exactly: the decimal point moves, no floating point is involved. */
export function amountInReais(value: string, from: AmountScale): string {
  const negative = value.startsWith("-"), [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const shift = from === "milhoes" ? 6 : from === "milhares" ? 3 : 0, digits = whole! + fraction.padEnd(shift, "0"), point = whole!.length + shift;
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0", decimals = digits.slice(point).replace(/0+$/, "");
  const out = decimals ? `${integer}.${decimals}` : integer;
  return negative && /[1-9]/.test(out) ? `-${out}` : out;
}
const item = {label: itemLabel, origin: extractedOrigin, source: itemSource};
const text = z.string().trim().min(1).max(500);

/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const quarterUpdateExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  quarterStart: sourced(z.iso.date()), quarterEnd: sourced(z.iso.date()),
  /** Each line of the close, projected and actual, in reais, days or a fraction. */
  lines: z.array(z.strictObject({...item, unit: z.enum(["currency", "days", "ratio"]), scale, projected: signed, actual: signed})).max(24),
  cashLineLabel: sourced(itemLabel), ebitdaLineLabel: sourced(itemLabel),
  /** Each cause of a deviation, on the line it explains. */
  causes: z.array(z.strictObject({...item, anchor, lineLabel: itemLabel, amount: signed, scale, classification: z.enum(["calendar", "structural"]), until: z.iso.date().nullable(),
    nature: z.enum(["flow", "balance"]).nullable(), basis: z.enum(["document", "interpretation"]), question: text.nullable(),
    equalsDeviationOfLabel: itemLabel.nullable(), driverLineLabel: itemLabel.nullable()})).max(48),
  /** A prior weekly stream a persisting cause moves: amounts scaled by a factor, or events delayed by days. */
  streamUpdates: z.array(z.strictObject({streamId: z.string().min(1).max(40), causeLabels: z.array(itemLabel).min(1).max(8), kind: z.enum(["scale", "delay"]),
    factor: z.string().regex(/^\d{1,4}(?:\.\d{1,8})?$/).nullable(), days: z.number().int().min(-366).max(366).nullable(), origin: extractedOrigin, source: itemSource})).max(16),
  addedStreams: z.array(z.strictObject({...item, anchor, scale, events: z.array(z.strictObject({date: z.iso.date(), amount: unsigned})).min(1).max(2000)})).max(4),
  facilities: z.array(z.strictObject({...item, limit: unsigned, scale, approval: text})).max(8),
  steps: z.array(z.strictObject({facilityLabel: itemLabel, mode: z.enum(["fixed", "residual"]), addedStreamLabel: itemLabel.nullable(),
    replacesStreamIds: z.array(z.string().min(1).max(40)).max(8), date: z.iso.date().nullable(), origin: extractedOrigin, source: itemSource})).max(4),
  covenantMeasurementIds: z.array(z.string().min(1).max(40)).max(8),
  dependents: z.array(z.strictObject({...item, kind: z.enum(["analysis", "plan", "material"]), readsLineLabels: z.array(itemLabel).max(24),
    horizonStart: z.iso.date(), horizonEnd: z.iso.date(), recomputedBy: z.string().regex(/^(none|weekly_cash|covenant:[a-z0-9][a-z0-9-]{0,39}|projection:[1-9]\d{3})$/),
    owner: text.nullable(), quantities: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,59}$/)).max(8), definition: text.nullable(), scenario: z.string().min(1).max(160).nullable()})).max(24),
  askedDependentLabels: z.array(itemLabel).max(24),
});
export type QuarterUpdateExtraction = z.infer<typeof quarterUpdateExtractionSchema>;

export const quarterUpdateExtractionContract = {
  task: "quarter_update_extraction" as const,
  system: [
    "Você extrai os dados do fechamento de um trimestre para atualizar o caixa semanal e o teste de covenant que a companhia já tem, a partir da mensagem de uma pessoa, das mensagens anteriores, de campos já extraídos de documentos (balancete, gerencial do trimestre) e dos resultados anteriores registrados (priorWeeklyCash com os fluxos e priorCovenant com as medições).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo) ou lista vazia. Nunca estime, nunca complete, nunca atribua uma causa que ninguém deu.",
    "Valores monetários como estão escritos, com ponto decimal e sem separador de milhar, e em scale a escala em que o documento ou a conversa os dá: reais, milhares ou milhoes (R$ 1,25 milhão vira 1.25 com milhoes; R$ 1.250 mil vira 1250 com milhares; R$ 1.250.000 vira 1250000 com reais). Nunca converta de uma escala para outra. Se a escala não estiver dita nem no documento nem na conversa, scale é null. Em linhas em dias ou em fração, scale é null. Com sinal quando são desvios ou causas. Prazos em dias. Variações em fração (3% vira 0.03). Datas no formato AAAA-MM-DD.",
    "lines são as linhas do fechamento com o projetado e o realizado (receita, EBITDA, caixa, prazo médio, custo do insumo); cashLineLabel e ebitdaLineLabel dizem qual linha é o caixa e qual é o EBITDA.",
    "causes explicam cada desvio na linha que explicam (lineLabel): calendar quando volta sozinho, structural quando continua até uma data (until), com nature flow quando se repete a cada período e balance quando é um saldo deslocado uma vez; basis document quando o documento mostra, interpretation quando é leitura de alguém; question é a pergunta que muda o diagnóstico, quando houver. equalsDeviationOfLabel quando a causa é o desvio de outra linha (por exemplo o EBITDA abaixo na ponte do caixa); driverLineLabel é a linha que mede a causa.",
    "streamUpdates dizem como uma causa estrutural move um fluxo do caixa semanal anterior: streamId é um id de priorWeeklyCash.streams; scale multiplica os valores por factor, delay atrasa os eventos em days.",
    "addedStreams são fluxos novos (por exemplo o desembolso de um programa aprovado); facilities são as linhas aprovadas com o limite e a aprovação; steps são a ação: fixed usa um fluxo novo no lugar de fluxos anteriores (replacesStreamIds), residual cobre o que falta a partir de uma data.",
    "anchor, em causes e addedStreams, é onde o item foi lido (a linha da nota, a página, a célula), null quando a fonte não diz; source cita o documento do item (a nota, o contrato).",
    "covenantMeasurementIds são os ids de priorCovenant.measurements que o fechamento atualiza, a principal primeiro. dependents são as análises, planos e materiais que leem o fechamento, com as linhas que leem, o horizonte, quem recalcula (weekly_cash, covenant:<id>, projection:<ano> ou none) e o dono quando for outro.",
    "askedDependentLabels são os rótulos, como em dependents, das análises, planos e materiais que a pessoa pediu expressamente para atualizar (por exemplo 'atualiza também o plano de 2027'); lista vazia quando ela não pediu nenhum pelo nome. Um pedido genérico ('atualiza tudo') não nomeia nenhum.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: quarterUpdateExtractionSchema,
  schemaName: "quarter_update_extraction_v4",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 16_000,
  cacheKey: "quarter-update-extraction-2026.10.26-v4",
};

export const quarterUpdateSituation = "near-covenant";
const short = (id: string) => id.slice(0, 8);

/** Every amount whose scale is stated, carried in reais before records are reconciled: R$ 4.2 milhões and 4200000
 * reais of the same line are one fact (independent review, round 15). An amount without a stated scale is left as
 * written, and asked later. */
export function statedInReais(e: QuarterUpdateExtraction): QuarterUpdateExtraction {
  const to = (v: string, scale: AmountScale | null) => scale === null ? v : amountInReais(v, scale);
  return {...e,
    lines: e.lines.map((l) => l.unit !== "currency" || l.scale === null ? l : {...l, projected: to(l.projected, l.scale), actual: to(l.actual, l.scale), scale: "reais" as const}),
    causes: e.causes.map((c) => c.scale === null ? c : {...c, amount: to(c.amount, c.scale), scale: "reais" as const}),
    addedStreams: e.addedStreams.map((x) => x.scale === null ? x : {...x, events: x.events.map((v) => ({...v, amount: to(v.amount, x.scale)})), scale: "reais" as const}),
    facilities: e.facilities.map((x) => x.scale === null ? x : {...x, limit: to(x.limit, x.scale), scale: "reais" as const}),
  };
}
/** Contradictions inside one record of a quarter close turn, each named by its field. */
export function quarterUpdateContradictions(e: QuarterUpdateExtraction): string[] {
  const out: string[] = [], start = e.quarterStart.value, end = e.quarterEnd.value;
  if (start !== null && end !== null && end <= start) out.push("quarterEnd");
  e.lines.forEach((l, k) => {if (l.unit !== "currency" && l.scale !== null) out.push(`lines.${k + 1}.scale`);});
  e.causes.forEach((c, k) => {
    const p = `causes.${k + 1}.`;
    if (c.classification === "structural" && c.until !== null && end !== null && c.until <= end) out.push(p + "until");
    if (c.equalsDeviationOfLabel !== null && sameLabel(c.equalsDeviationOfLabel, c.lineLabel)) out.push(p + "equalsDeviationOfLabel");
  });
  e.streamUpdates.forEach((u, k) => {if ((u.kind === "scale" && u.days !== null) || (u.kind === "delay" && u.factor !== null)) out.push(`streamUpdates.${k + 1}.kind`);});
  e.steps.forEach((s, k) => {
    if (s.mode === "fixed" && s.date !== null) out.push(`steps.${k + 1}.date`);
    if (s.mode === "residual" && (s.addedStreamLabel !== null || s.replacesStreamIds.length)) out.push(`steps.${k + 1}.mode`);
  });
  e.dependents.forEach((d, k) => {
    if (d.horizonEnd < d.horizonStart) out.push(`dependents.${k + 1}.horizonEnd`);
    if (d.recomputedBy !== "none" && d.owner !== null) out.push(`dependents.${k + 1}.owner`);
  });
  return out;
}

/** Turns the extraction and the prior results into the facts the method needs. The close, its two bridges
 * and each cause are the company's or its documents'; what nobody stated is asked in one batch. The prior
 * versions are the recorded results, named by the fingerprint of the basis each was adopted on. House
 * premises are conventions of the method and stated as such: the floor of R$ 1,000 under which a weekly
 * effect does not propagate, and, when the close names none, the covenant measurements at the date of the
 * headline test. */
export type QuarterUpdateCompletion = (Extract<Lote2Completion<QuarterUpdateFacts>, {status: "complete"}> & {askedDependentIds: string[]})
  | Extract<Lote2Completion<QuarterUpdateFacts>, {status: "missing"}>;
export function completeQuarterUpdateFacts(input: {extraction: QuarterUpdateExtraction; priors: {weeklyCash: Prior; covenant: Prior};
  ids: {updateId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}): QuarterUpdateCompletion {
  // Record identity (see withRecordIdentity): a keyed collection holds one fact per key; a countable one merges only the
  // same record read twice from one source and asks equal records from another source (duplicateOf). Gap positions count after merging.
  const missing: string[] = [], used: string[] = [];
  const {e, ambiguous} = withRecordIdentity(statedInReais(input.extraction), {keyed: ["lines", "streamUpdates", "facilities", "steps", "dependents"], countable: [{name: "causes", sourceIdentifies: true}, {name: "addedStreams", sourceIdentifies: true}]}, missing);
  // A value stated without its origin is asked, never replaced by a house default nor dropped.
  missing.push(...unsourcedFields(e as unknown as Record<string, unknown>));
  // Fields of one record that contradict each other are asked, never resolved in favour of either (independent review, round 12).
  missing.push(...quarterUpdateContradictions(e));
  // Every amount is carried in reais, the units of the prior results. An amount whose scale nobody stated is
  // asked, never guessed; one that does not fit the basis after the exact conversion is named, never dropped.
  const money = (value: string, from: AmountScale | null, path: string, scalePath: string, fits = basisMoney): string | null => {
    if (from === null) { missing.push(scalePath); return null; }
    const out = amountInReais(value, from);
    if (!fits.test(out)) { missing.push(path); return null; }
    return out;
  };
  const start = stated(e.quarterStart), end = stated(e.quarterEnd);
  if (!start) missing.push("quarterStart");
  if (!end) missing.push("quarterEnd");
  if (!e.lines.length) missing.push("lines");
  const lineValues = e.lines.map((l, k) => {
    const p = `lines.${k + 1}.`;
    if (l.unit !== "currency") return [l.projected, l.actual].map((v, n) => lineMeasure.test(v) ? v : (missing.push(p + (n ? "actual" : "projected")), null));
    return [money(l.projected, l.scale, p + "projected", p + "scale"), money(l.actual, l.scale, p + "actual", p + "scale")];
  });
  // A keyed collection referenced by label never carries the same label twice: the reference would silently take the
  // first. Causes and new streams add up: two with one label are two records, asked only where something names them
  // by that label (a stream update names its causes, a step names its new stream).
  for (const [name, labels] of [["lines", e.lines.map((x) => x.label)], ["facilities", e.facilities.map((x) => x.label)], ["dependents", e.dependents.map((x) => x.label)]] as const)
    for (const k of repeatedLabels(labels)) if (!ambiguous.get(name)!.has(k)) missing.push(`${name}.${k}.label`);
  const named = {causes: new Set(e.streamUpdates.flatMap((u) => u.causeLabels.map(statedLabel))),
    addedStreams: new Set(e.steps.flatMap((x) => x.addedStreamLabel === null ? [] : [statedLabel(x.addedStreamLabel)]))};
  for (const [name, labels] of [["causes", e.causes.map((x) => x.label)], ["addedStreams", e.addedStreams.map((x) => x.label)]] as const)
    for (const k of repeatedLabels(labels)) if (!ambiguous.get(name)!.has(k) && named[name].has(statedLabel(labels[k - 1]!))) missing.push(`${name}.${k}.label`);
  const lineIds = itemKeys(e.lines.map((l) => l.label));
  const lineOf = (label: string | null) => {
    if (label === null) return null;
    const k = e.lines.findIndex((l) => sameLabel(l.label, label));
    return k < 0 ? undefined : lineIds[k]!;
  };
  const cash = stated(e.cashLineLabel), ebitda = stated(e.ebitdaLineLabel);
  const cashId = cash ? lineOf(cash.value) : null, ebitdaId = ebitda ? lineOf(ebitda.value) : null;
  if (!cashId) missing.push("cashLineLabel");
  if (!ebitdaId) missing.push("ebitdaLineLabel");
  const causeIds = itemKeys(e.causes.map((c) => c.label));
  const bridges = new Map<string, QuarterUpdateFacts["bridges"][number]["causes"]>();
  e.causes.forEach((c, k) => {
    const p = `causes.${k + 1}.`, line = lineOf(c.lineLabel), equals = lineOf(c.equalsDeviationOfLabel), driver = lineOf(c.driverLineLabel);
    if (!line) missing.push(p + "lineLabel");
    if (equals === undefined) missing.push(p + "equalsDeviationOfLabel");
    if (driver === undefined) missing.push(p + "driverLineLabel");
    if ((c.classification === "structural") !== (c.until !== null)) missing.push(p + "until");
    if ((c.classification === "structural") !== (c.nature !== null)) missing.push(p + "nature");
    const amount = money(c.amount, c.scale, p + "amount", p + "scale");
    if (!line || equals === undefined || driver === undefined || amount === null) return;
    bridges.set(line, [...bridges.get(line) ?? [], {value: {id: causeIds[k]!, label: c.label, amount, classification: c.classification, until: c.until,
      equalsDeviationOf: equals, driverLineId: driver, basis: c.basis, question: c.question, nature: c.nature}, origin: c.origin, source: citedSource(c.origin, c.source)}]);
  });
  for (const [id, name] of [[cashId, "cash"], [ebitdaId, "ebitda"]] as const) if (id && !bridges.has(id)) missing.push(`causes.${name}`);
  const streams = new Set(priorStreams(input.priors.weeklyCash).map((s) => s.id));
  const causeOf = (label: string) => {const k = e.causes.findIndex((c) => sameLabel(c.label, label)); return k < 0 ? null : causeIds[k]!;};
  const streamUpdates = e.streamUpdates.flatMap((u, k) => {
    const p = `streamUpdates.${k + 1}.`, before = missing.length, causes = u.causeLabels.map(causeOf);
    if (!streams.has(u.streamId)) missing.push(p + "streamId");
    // One transform per stream: two for the same stream are asked, never resolved by order (independent review, round 9).
    if (e.streamUpdates.findIndex((x) => x.streamId === u.streamId) !== k && !ambiguous.get("streamUpdates")!.has(k + 1)) missing.push(p + "streamId");
    if (causes.some((c) => c === null)) missing.push(p + "causeLabels");
    if ((u.kind === "scale" && u.factor === null) || (u.kind === "delay" && u.days === null)) missing.push(p + u.kind);
    if (missing.length > before) return [];
    return [{value: {streamId: u.streamId, causeIds: causes as string[], transform: u.kind === "scale" ? {kind: "scale" as const, factor: u.factor!} : {kind: "delay" as const, days: u.days!}},
      origin: u.origin, source: citedSource(u.origin, u.source)}];
  });
  const addedIds = itemKeys(e.addedStreams.map((s) => s.label));
  const addedStreams = e.addedStreams.map((s, k) => ({value: {id: addedIds[k]!, label: s.label, dates: s.events.map((x) => x.date),
    amounts: s.events.map((x, n) => money(x.amount, s.scale, `addedStreams.${k + 1}.events.${n + 1}.amount`, `addedStreams.${k + 1}.scale`, /^\d{1,24}(?:\.\d{1,8})?$/) ?? "0")},
    origin: s.origin, source: citedSource(s.origin, s.source)}));
  const facilityIds = itemKeys(e.facilities.map((f) => f.label));
  const facilities = e.facilities.map((f, k) => ({value: {id: facilityIds[k]!, label: f.label,
    limit: money(f.limit, f.scale, `facilities.${k + 1}.limit`, `facilities.${k + 1}.scale`, /^\d{1,24}(?:\.\d{1,8})?$/) ?? "0", source: f.approval}, origin: f.origin, source: citedSource(f.origin, f.source)}));
  const steps = e.steps.flatMap((s, k) => {
    const p = `steps.${k + 1}.`, before = missing.length;
    const f = e.facilities.findIndex((x) => sameLabel(x.label, s.facilityLabel)), a = s.addedStreamLabel === null ? -1 : e.addedStreams.findIndex((x) => sameLabel(x.label, s.addedStreamLabel!));
    if (f < 0) missing.push(p + "facilityLabel");
    if (s.mode === "fixed" && (a < 0 || !s.replacesStreamIds.length || s.replacesStreamIds.some((id) => !streams.has(id)))) missing.push(p + "addedStreamLabel");
    if (s.mode === "residual" && s.date === null) missing.push(p + "date");
    if (missing.length > before) return [];
    const source = citedSource(s.origin, s.source);
    return [s.mode === "fixed" ? {value: {facilityId: facilityIds[f]!, mode: "fixed" as const, streamId: addedIds[a]!, replacesStreamIds: s.replacesStreamIds}, origin: s.origin, source}
      : {value: {facilityId: facilityIds[f]!, mode: "residual" as const, date: s.date!}, origin: s.origin, source}];
  });
  const measurements = priorMeasurements(input.priors.covenant), known = new Set(measurements.map((m) => m.id));
  let measurementIds = e.covenantMeasurementIds, measurementsChosenByHouse = false;
  if (measurementIds.some((id) => !known.has(id)) || new Set(measurementIds).size !== measurementIds.length) missing.push("covenantMeasurementIds");
  if (!measurementIds.length && measurements.length) {
    const headline = measurements[0]!;
    measurementIds = measurements.filter((m) => m.id === headline.id || (m.role === "test" && m.date !== null && m.date === headline.date)).map((m) => m.id);
    used.push("covenantMeasurements"); measurementsChosenByHouse = true;
  }
  if (!measurementIds.length) missing.push("covenantMeasurementIds");
  const dependentIds = itemKeys(e.dependents.map((d) => d.label));
  const dependents = e.dependents.flatMap((d, k) => {
    const reads = d.readsLineLabels.map(lineOf);
    if (reads.some((r) => !r)) {missing.push(`dependents.${k + 1}.readsLineLabels`); return [];}
    // Who recomputes is never absent: a dependent recomputed elsewhere names its owner, and one this close recomputes
    // names the quantities and the scenario it reads, or it would bind to nothing and stay silently stale.
    if (d.recomputedBy === "none" && d.owner === null) {missing.push(`dependents.${k + 1}.owner`); return [];}
    if (d.recomputedBy !== "none" && (!d.quantities.length || d.scenario === null)) {missing.push(`dependents.${k + 1}.${d.quantities.length ? "scenario" : "quantities"}`); return [];}
    return [{value: {id: dependentIds[k]!, label: d.label, kind: d.kind, reads: reads as string[], horizonStart: d.horizonStart, horizonEnd: d.horizonEnd, recomputedBy: d.recomputedBy,
      owner: d.owner, quantities: d.quantities, definition: d.definition, scenario: d.scenario}, origin: d.origin, source: citedSource(d.origin, d.source)}];
  });
  // The dependents the person asked by name to update, by id; a label that names no dependent is asked back.
  const askedDependentIds: string[] = [];
  e.askedDependentLabels.forEach((label, k) => {
    const d = e.dependents.findIndex((x) => sameLabel(x.label, label));
    if (d < 0) missing.push(`askedDependentLabels.${k + 1}`);
    else if (!askedDependentIds.includes(dependentIds[d]!)) askedDependentIds.push(dependentIds[d]!);
  });
  if (missing.length || !start || !end || !cashId || !ebitdaId) return {status: "missing", missing: [...new Set(missing)]};
  used.push("materialityFloor");
  const {weeklyCash, covenant} = input.priors;
  const parsed = factsOrGaps(quarterUpdateFactsSchema, {...input.ids, perimeter: "standalone", currency: input.currency, quarterStart: start.value, quarterEnd: end.value,
    priorWeeklyFingerprint: {value: weeklyCash.envelopeFingerprint, origin: "document", source: `Resultado registrado do caixa semanal (execução ${short(weeklyCash.executionId)})`},
    priorCovenantFingerprint: {value: covenant.envelopeFingerprint, origin: "document", source: `Resultado registrado da folga de covenant (execução ${short(covenant.executionId)})`},
    lines: e.lines.map((l, k) => ({value: {id: lineIds[k]!, label: l.label, unit: l.unit, projected: lineValues[k]![0]!, actual: lineValues[k]![1]!}, origin: l.origin, source: citedSource(l.origin, l.source)})),
    carry: {value: {cashLineId: cashId, ebitdaLineId: ebitdaId}, origin: cash!.origin, source: cash!.source},
    bridges: [...bridges.entries()].map(([lineId, causes]) => ({lineId, causes})),
    streamUpdates, materialityFloor: {value: "1000", origin: "house", source: "R$ 1 mil, piso de materialidade do efeito semanal"},
    addedStreams, covenant: measurementsChosenByHouse
      ? {value: {measurementIds}, origin: "house", source: "Medições do teste registrado na data da apuração principal, escolhidas pela casa"}
      : {value: {measurementIds}, origin: "informed", source: "Medições do teste registrado citadas na conversa"}, facilities, steps, dependents});
  // What the method refuses is named for the card, never dropped.
  if (!parsed.ok) return {status: "missing", missing: parsed.missing};
  const facts = parsed.facts;
  return {status: "complete", facts, situationId: quarterUpdateSituation, housePremiseKeys: [...new Set(used)], askedDependentIds};
}

/** The card: the prior versions, each line, each cause, the facilities and the dependents, and the materiality floor.
 * The exact prior executions shown are pinned on the card, so confirmation never silently moves to other results,
 * and the dependents the person asked to update travel with it to the request. */
export function quarterUpdateSummary(facts: QuarterUpdateFacts, priorResults: PriorResultPin[], askedDependentIds: string[] = []): Lote2Summary {
  const row = summaryRow;
  return {situationId: quarterUpdateSituation, referenceDate: facts.quarterEnd, priorResults, askedDependentIds, items: [
    row("premise", "Caixa semanal anterior", facts.priorWeeklyFingerprint, "priorWeeklyCash"),
    row("premise", "Teste de covenant anterior", facts.priorCovenantFingerprint, "priorCovenant"),
    ...facts.lines.map((l) => row("line", l.value.label, l)),
    ...facts.bridges.flatMap((b) => b.causes.map((c) => row("cause", c.value.label, c))),
    ...facts.facilities.map((f) => row("facility", f.value.label, f)),
    ...facts.dependents.map((d) => row("dependent", d.value.label, d)),
    row("premise", "Piso de materialidade", facts.materialityFloor, "materialityFloor"),
  ]};
}

export function buildQuarterUpdatePremiseProposal(facts: QuarterUpdateFacts, priorResults: PriorResultPin[], askedDependentIds: string[] = []) {
  return fingerprintedProposal(quarterUpdatePremiseMethod, facts, proposeQuarterUpdateHypotheses(facts), quarterUpdateSummary(facts, priorResults, askedDependentIds));
}
/** The pins of the priors a card is proposed over, weekly cash first. */
export const priorResultPins = (priors: {weeklyCash: Prior; covenant: Prior}): PriorResultPin[] => [
  {role: "weekly_cash", executionId: priors.weeklyCash.executionId, resultFingerprint: priors.weeklyCash.resultFingerprint},
  {role: "covenant", executionId: priors.covenant.executionId, resultFingerprint: priors.covenant.resultFingerprint}];


/** What the method's own reader and packet would refuse after confirmation, named before the card is offered. */
/** The method's own reader and packet over a basis, as the confirmation will run them. */
/** The full chain the confirmation runs, over the pinned priors: the close composed with the stored prior inputs
 * verbatim, then the packet. Series shared by causes, a zero factor, a draw outside the horizon and any other
 * refusal of the reader or the packet become named gaps before the card is offered (independent review, round 10). */
export const quarterUpdateReader = (priors: {weeklyCash: Prior; covenant: Prior}, askedDependentIds: readonly string[] = []) => (b: BoundBasis) =>
  prepareQuarterUpdatePacket(composeQuarterUpdateFromStoredPriors({update: b, question: "Verificação das premissas antes da confirmação",
    prior: {weeklyCash: priors.weeklyCash.inputSnapshot, covenant: priors.covenant.inputSnapshot}, askedDependentIds: [...askedDependentIds]}));
export function quarterUpdateReaderGaps(facts: QuarterUpdateFacts, priors: {weeklyCash: Prior; covenant: Prior}, askedDependentIds: readonly string[] = []): string[] {
  // The confirmation binds the close to the company the priors were measured on; the check does the same.
  let entityId = facts.entityId;
  try { entityId = (JSON.parse(priors.weeklyCash.inputSnapshot) as {analysis?: {entityId?: string}}).analysis?.entityId ?? entityId; } catch { /* the reader names it */ }
  const hypotheses = proposeQuarterUpdateHypotheses(facts).map((h) => ({...h, dimensions: {...h.dimensions, entityId}}));
  return readerGaps(hypotheses, quarterUpdateReader(priors, askedDependentIds));
}

/** One turn's premise step for the quarter close. Without both prior completed results of the work it proposes
 * nothing and names what is missing, before any extraction. */
export async function proposeQuarterUpdatePremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; loadPriors: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}): Promise<Lote2TurnPremises | null> {
  const entry = input.projectId ? premiseEntry("quarter_update", input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  let priors: QuarterUpdatePriorsRead;
  try { priors = quarterUpdatePriorsSchema.parse(await input.loadPriors()); }
  catch (error) { input.log("quarter_update_premises.failed", {message: error instanceof Error ? error.message.slice(0, 200) : "unknown"}); return null; }
  const absent = [...priors.weeklyCash ? [] : ["priorWeeklyCash"], ...priors.covenant ? [] : ["priorCovenant"]];
  if (absent.length) {
    input.log("quarter_update_premises.priors_missing", {missing: absent});
    return {forAdvisor: {status: "missing", missing: absent}, proposal: null};
  }
  const found = {weeklyCash: priors.weeklyCash!, covenant: priors.covenant!};
  const context = {priorWeeklyCash: {streams: priorStreams(found.weeklyCash)}, priorCovenant: {measurements: priorMeasurements(found.covenant)}};
  let asked: string[] = [];
  return proposeLote2PremisesForTurn({logPrefix: "quarter_update_premises", idName: "quarter-update", expansionRefusalAsGap: true, schema: quarterUpdateExtractionSchema,
    complete: (extraction, id) => {
      const completion = completeQuarterUpdateFacts({extraction, priors: found, ids: {updateId: id, entityId: id, definitionVersionId: id}, currency: "BRL"});
      if (completion.status === "complete") asked = completion.askedDependentIds;
      return completion;
    },
    build: (facts) => buildQuarterUpdatePremiseProposal(facts, priorResultPins(found), asked), readerCheck: (facts) => quarterUpdateReaderGaps(facts, found, asked)}, {...input, entry, projectId: input.projectId,
    loadEvidence: async () => ({documentFields: await input.loadEvidence(), ...context})});
}
