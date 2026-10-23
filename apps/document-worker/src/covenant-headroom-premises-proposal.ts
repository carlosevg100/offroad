import {z} from "zod";
import {covenantHeadroomFactsSchema, proposeCovenantHeadroomHypotheses, type CovenantHeadroomFacts} from "@offroad/financial-model";
import {citedSource, extractedAmount, extractedMoney, extractedOrigin, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn,
  sameLabel, sourced, stated, type Lote2Completion, summaryRow, type Lote2Summary} from "./lote2-premises";
import {foldCue, proposesPremisesOfKind} from "./premise-cue";

/** The method these premises feed, pinned to its implemented version. */
export const covenantHeadroomPremiseMethod = {methodId: "measure-covenant-headroom", methodVersion: "2026.10.23-v1"} as const;
const covenantData = /\b(covenants?|ebitda|divida liquida|divida bruta|caixa|limite|escritura|aditamento|ata|politica|conselho|apuracao|teste|arrendamento\w*|ifrs|ajuste\w*|safra|vezes|r\$|milh\w*)/;
/** Qualitative answers to the gaps this extraction asks for, which carry no number. */
const covenantGaps = /\b(definicao|cvm|automatic\w*|assembleia|cross|vencimento antecipado|superad\w*|vigente|em vigor|nao (tem|ha|diz|escreve|define)|nenhum|nenhuma)\b/;

/** Headroom under a covenant: the turn may propose the measurement's premises. An answer with
 * covenant data and a quantity continues the latest such question among the recent messages. A
 * conceptual question ("o que é covenant?") routes elsewhere and proposes nothing. */
export function shouldProposeCovenantHeadroomPremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return proposesPremisesOfKind("covenant_headroom", covenantData, message, hasAttachments, earlierUserMessages, covenantGaps);
}

export const covenantSituation = "near-covenant";
const text = z.string().trim().min(1).max(2000);
const item = {label: itemLabel, origin: extractedOrigin, source: itemSource};

/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const covenantHeadroomExtractionSchema = z.strictObject({
  /** The date the question is read at: measurements after it are projected. */
  readingDate: sourced(z.iso.date()),
  /** The label of the test measurement the person asked about, when the question names one. */
  headlineMeasurement: sourced(itemLabel),
  limits: z.array(z.strictObject({...item,
    kind: z.enum(["contractual", "board_policy"]).nullable(), status: z.enum(["in_force", "superseded"]).nullable(),
    maximumRatio: z.number().gt(0).max(20).nullable(), testDates: z.array(z.iso.date()).max(24).nullable(),
    /** The EBITDA definition the limit is measured on. value null with origin and source when the
     * document was read and does not write it; all null when nobody said. */
    definition: sourced(text),
  })).max(6),
  measurements: z.array(z.strictObject({...item,
    role: z.enum(["test", "contrast"]), scenario: z.string().trim().min(1).max(60),
    /** Labels of the limits this measurement is read against. */
    limitLabels: z.array(itemLabel).max(6),
    date: z.iso.date(), debt: extractedAmount.nullable(), cash: extractedMoney.nullable(), reportedEbitda: extractedMoney.nullable(),
    adjustments: z.array(z.strictObject({label: itemLabel, amount: extractedMoney})).max(8),
    unrealizedEbitda: extractedMoney.nullable(),
  })).max(12),
  /** A seasonal or one-off effect read as the difference of two measurements of the same date. */
  effects: z.array(z.strictObject({label: itemLabel, withLabel: itemLabel, withoutLabel: itemLabel})).max(4),
  consequence: z.strictObject({acceleration: sourced(z.enum(["automatic", "non_automatic"])), process: sourced(text), crossDefault: sourced(text)}),
});
export type CovenantHeadroomExtraction = z.infer<typeof covenantHeadroomExtractionSchema>;

export const covenantHeadroomExtractionContract = {
  task: "covenant_headroom_extraction" as const,
  system: [
    "Você extrai os dados que permitem medir a folga de covenant da companhia, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (escritura, aditamentos, atas do conselho, projeção, balancetes).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo). Nunca estime, nunca complete, nunca projete, nunca arredonde por conta própria.",
    "Valores monetários em reais, sem separador de milhar (R$ 54,5 milhões vira 54500000). Limites como número de vezes (3,0x vira 3). Datas no formato AAAA-MM-DD.",
    "readingDate é a data em que a pergunta é feita ou a posição mais recente. headlineMeasurement é o rótulo da apuração de teste que a pessoa perguntou (por exemplo o teste de dezembro), quando disser.",
    "Para cada limite: contratual (contractual) ou política do conselho (board_policy), em vigor (in_force) ou superado (superseded, como a escritura original depois de um aditamento), o índice máximo de dívida líquida sobre EBITDA, as datas de teste e a definição de EBITDA como escrita. Se o documento foi lido e não escreve a definição, devolva definition com value null e source dizendo onde não está.",
    "Para cada apuração (data e cenário): rótulo curto, cenário (base, adverso ou o nome dito), test quando é o teste de um limite em vigor na sua data, contrast quando é só comparação (data errada, EBITDA gerencial, escritura sem aditamento), os rótulos dos limites, dívida, caixa, EBITDA reportado dos últimos doze meses, os ajustes que a definição manda fazer (por exemplo pagamentos de arrendamento, negativos) e o EBITDA ainda não realizado depois da data da leitura, quando houver. Os números de cada data vêm da projeção da companhia.",
    "effects só quando a conversa compara duas apurações da mesma data (por exemplo com e sem a safra): rótulo do efeito, a apuração com o efeito e a sem.",
    "consequence: vencimento antecipado automático ou não automático, o processo de declaração e o cross-default com outras dívidas, como escritos.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
  ].join("\n"),
  schema: covenantHeadroomExtractionSchema,
  schemaName: "covenant_headroom_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 10_000,
  cacheKey: "covenant-headroom-extraction-2026.10.23-v1",
};

const scenarioKey = (label: string) => foldCue(label).replace(/[^a-z0-9_]+/g, "-").replace(/^[-_]+|-+$/g, "").slice(0, 60) || "base";
const ratio = (n: number) => String(n);

/** Turns the extraction into the facts the method needs. Required facts nobody stated make the
 * proposal wait; the reply asks for them in one batch. A test off its limit's dates or on a superseded
 * limit is a contrast, as the method frames it. House premises are only the headline when the
 * question names none and the reading of an effect as the difference of two measurements; every
 * number of the company comes from what was said or written. */
export function completeCovenantHeadroomFacts(input: {extraction: CovenantHeadroomExtraction; ids: {headroomId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}): Lote2Completion<CovenantHeadroomFacts> {
  const e = input.extraction, missing: string[] = [], used: string[] = [];
  const reading = stated(e.readingDate);
  if (!reading) missing.push("readingDate");
  if (!e.limits.length) missing.push("limits");
  if (!e.measurements.length) missing.push("measurements");
  const limitIds = itemKeys(e.limits.map((l) => l.label), 40);
  const limits = e.limits.map((l, n) => {
    const p = `limits.${n + 1}.`, before = missing.length;
    for (const k of ["kind", "status", "maximumRatio", "testDates"] as const) if (l[k] === null) missing.push(p + k);
    if (l.status === "in_force" && l.testDates !== null && !l.testDates.length) missing.push(p + "testDates");
    // An unwritten definition is a named gap only when someone looked; nobody saying is a question.
    if (l.definition.origin === null) missing.push(p + "definition");
    if (missing.length > before) return null;
    return {term: {value: {id: limitIds[n]!, kind: l.kind!, status: l.status!, label: l.label, maximumRatio: ratio(l.maximumRatio!), testDates: [...l.testDates!].sort()},
      origin: l.origin, source: citedSource(l.origin, l.source)},
    definition: {value: l.definition.value, origin: l.definition.origin!, source: citedSource(l.definition.origin!, l.definition.source)}};
  });
  const known = limits.filter((l) => l !== null);
  const measurementIds = itemKeys(e.measurements.map((m) => m.label), 40);
  const measurements = e.measurements.map((m, n) => {
    const p = `measurements.${n + 1}.`, before = missing.length;
    for (const k of ["debt", "cash", "reportedEbitda"] as const) if (m[k] === null) missing.push(p + k);
    const named = m.limitLabels.map((label) => e.limits.findIndex((l) => sameLabel(l.label, label)));
    if (named.some((k) => k < 0)) missing.push(p + "limitLabels");
    if (m.role === "test" && !named.length) missing.push(p + "limitLabels");
    if (reading && m.unrealizedEbitda !== null && m.date <= reading.value) missing.push(p + "unrealizedEbitda");
    if (missing.length > before) return null;
    const terms = named.map((k) => limits[k]?.term.value);
    // A test is a test only of limits in force on a date they are tested; anything else is a contrast.
    const isTest = m.role === "test" && terms.every((t) => t && t.status === "in_force" && t.testDates.includes(m.date));
    const adjustmentIds = itemKeys(m.adjustments.map((a) => a.label), 40);
    return {value: {id: measurementIds[n]!, label: m.label, role: isTest ? "test" as const : "contrast" as const, scenario: scenarioKey(m.scenario),
      limitIds: [...new Set(named.map((k) => limitIds[k]!))], date: m.date, debt: m.debt!, cash: m.cash!, reportedEbitda: m.reportedEbitda!,
      adjustments: m.adjustments.map((a, k) => ({id: adjustmentIds[k]!, label: a.label, amount: a.amount})), unrealizedEbitda: m.unrealizedEbitda},
      origin: m.origin, source: citedSource(m.origin, m.source)};
  });
  const ms = measurements.filter((m) => m !== null);
  // Every limit in force is tested at least once; an untested one asks for its measurement.
  if (missing.length === 0) known.forEach((l) => {
    if (l.term.value.status === "in_force" && !ms.some((m) => m.value.role === "test" && m.value.limitIds.includes(l.term.value.id)))
      missing.push(`limits.${limitIds.indexOf(l.term.value.id) + 1}.test`);
  });
  const effects = e.effects.map((x, n) => {
    const a = e.measurements.findIndex((m) => sameLabel(m.label, x.withLabel)), b = e.measurements.findIndex((m) => sameLabel(m.label, x.withoutLabel));
    if (a < 0 || b < 0 || a === b || e.measurements[a]!.date !== e.measurements[b]!.date) {missing.push(`effects.${n + 1}`); return null;}
    return {label: x.label, measurementId: measurementIds[a]!, withoutEffectMeasurementId: measurementIds[b]!};
  });
  if (effects.length) used.push("effectAsDifference");
  const consequence = {acceleration: stated(e.consequence.acceleration), process: stated(e.consequence.process), crossDefault: stated(e.consequence.crossDefault)};
  if (missing.length || !reading) return {status: "missing", missing: [...new Set(missing)]};
  const endDate = ms.map((m) => m.value.date).sort().at(-1)!;
  if (endDate <= reading.value) return {status: "missing", missing: ["measurements"]};
  // The headline is the test the person asked about; otherwise the first test after the reading date.
  const asked = stated(e.headlineMeasurement);
  const askedIndex = asked ? e.measurements.findIndex((m) => sameLabel(m.label, asked.value)) : -1;
  if (asked && (askedIndex < 0 || ms.find((m) => m.value.id === measurementIds[askedIndex])?.value.role !== "test")) return {status: "missing", missing: ["headlineMeasurement"]};
  const tests = ms.filter((m) => m.value.role === "test").sort((a, b) => a.value.date.localeCompare(b.value.date));
  const fallback = tests.find((m) => m.value.date > reading.value) ?? tests[0]!;
  if (!asked) used.push("headline");
  const headline = asked ? {value: measurementIds[askedIndex]!, origin: asked.origin, source: asked.source}
    : {value: fallback.value.id, origin: "house" as const, source: "Primeiro teste depois da data da leitura"};
  const headlineScenario = ms.find((m) => m.value.id === headline.value)!.value.scenario;
  const facts = covenantHeadroomFactsSchema.parse({...input.ids, perimeter: "standalone", currency: input.currency, readingDate: reading.value, endDate, scenario: headlineScenario,
    headline, limits: known, measurements: ms,
    effects: effects.map((x, n) => ({value: {id: itemKeys(e.effects.map((f) => f.label), 40)[n]!, ...x!}, origin: "house", source: "efeito lido pela diferença das duas medições"})),
    consequence});
  return {status: "complete", facts, situationId: covenantSituation, housePremiseKeys: [...new Set(used)]};
}

const accelerationLabel = {automatic: "Vencimento antecipado automático", non_automatic: "Vencimento antecipado não automático"} as const;
/** The card: each limit, each measurement and the consequence terms. */
export function covenantHeadroomSummary(facts: CovenantHeadroomFacts): Lote2Summary {
  const row = summaryRow;
  const c = facts.consequence;
  return {situationId: covenantSituation, referenceDate: facts.readingDate, items: [
    ...facts.limits.map((l) => row("limit", l.term.value.label, l.term)),
    ...facts.measurements.map((m) => row("measurement", m.value.label, m)),
    ...c.acceleration ? [row("premise", accelerationLabel[c.acceleration.value], c.acceleration, c.acceleration.value === "automatic" ? "accelerationAutomatic" : "accelerationNonAutomatic")] : [],
    ...c.process ? [row("premise", c.process.value, c.process)] : [],
    ...c.crossDefault ? [row("premise", c.crossDefault.value, c.crossDefault)] : [],
  ]};
}

export function buildCovenantHeadroomPremiseProposal(facts: CovenantHeadroomFacts) {
  return fingerprintedProposal(covenantHeadroomPremiseMethod, facts, proposeCovenantHeadroomHypotheses(facts), covenantHeadroomSummary(facts));
}

export async function proposeCovenantHeadroomPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}) {
  if (!input.projectId || !shouldProposeCovenantHeadroomPremises(input.message, input.hasAttachments, input.recentUserMessages)) return null;
  return proposeLote2PremisesForTurn({logPrefix: "covenant_premises", idName: "covenant-headroom", schema: covenantHeadroomExtractionSchema,
    complete: (extraction, id) => completeCovenantHeadroomFacts({extraction, ids: {headroomId: id, entityId: id, definitionVersionId: id}, currency: "BRL"}),
    build: buildCovenantHeadroomPremiseProposal}, {...input, projectId: input.projectId});
}
