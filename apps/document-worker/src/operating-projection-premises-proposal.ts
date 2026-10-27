import {z} from "zod";
import {composeBoundOperatingProjection, prepareOperatingProjectionPacket, actualOperatingItems, operatingProjectionDriverUnits, operatingProjectionFactsSchema, proposeOperatingProjectionHypotheses,
  type OperatingProjectionFacts} from "@offroad/financial-model";
import {statedLabel, withRecordIdentity, unsourcedFields, conflictingKeys, factsOrGaps, repeatedLabels, citedSource, extractedOrigin, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn, sameLabel, sourced, stated,
  summaryRow, type Lote2Completion, type Lote2Summary} from "./lote2-premises";
import {premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";
import {readerGaps, type BoundBasis} from "./lote3-reader-check";

/** The method these premises feed, pinned to its implemented version. */
export const operatingProjectionPremiseMethod = {methodId: "build-operating-projection", methodVersion: "2026.10.26-v1"} as const;

type ProjectedOperatingDriver = keyof typeof operatingProjectionDriverUnits;
const projectedOperatingDriverNames = Object.keys(operatingProjectionDriverUnits) as [ProjectedOperatingDriver, ...ProjectedOperatingDriver[]];
const actualOperatingDriverNames = actualOperatingItems.filter((k) => k !== "reportedRevenue" && k !== "reportedEbitda") as [ProjectedOperatingDriver, ...ProjectedOperatingDriver[]];

/** A projection to build: the turn may propose its premises. A statement after the latest such question among
 * the recent messages is a continuation candidate; the extraction's `turnIntent` decides it. */
export function shouldProposeOperatingProjectionPremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return premiseEntry("operating_projection", message, hasAttachments, earlierUserMessages) !== null;
}

export const operatingProjectionSituation = "stable-business-high-conversion";
const operand = z.string().regex(/^\d{1,15}(?:\.\d{1,8})?$/);
const signedOperand = z.string().regex(/^-?\d{1,15}(?:\.\d{1,8})?$/);
const rate = z.string().regex(/^-?\d{1,4}(?:\.\d{1,8})?$/);
const year = z.number().int().min(1990).max(2100);
const actualDriver = z.enum(actualOperatingDriverNames);
const driver = z.enum(projectedOperatingDriverNames);
const item = {label: itemLabel, origin: extractedOrigin, source: itemSource};

/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const operatingProjectionExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  /** What the projection is for, when said (for example, to discuss the financing with banks). */
  purpose: sourced(z.string().trim().min(1).max(500)),
  /** The last closed year with reported figures, and its drivers. */
  actualYear: sourced(year),
  actualDrivers: z.array(z.strictObject({driver: actualDriver, value: operand, origin: extractedOrigin, source: itemSource})).max(16),
  reportedRevenue: sourced(signedOperand), reportedEbitda: sourced(signedOperand),
  /** The last year to project, when asked. */
  lastProjectedYear: sourced(year),
  /** A driver column the company or a document states for the projected years, one value per year in order. */
  baseColumns: z.array(z.strictObject({driver, values: z.array(operand).min(1).max(40), origin: extractedOrigin, source: itemSource})).max(13),
  /** Alternatives and the company's own corrections, each against the base or an earlier scenario. */
  scenarios: z.array(z.strictObject({...item, role: z.enum(["alternative", "informed"]), basedOnLabel: itemLabel.nullable(),
    volumeGrowthRate: rate.nullable(), volumeFactor: rate.nullable(),
    overrides: z.array(z.strictObject({driver, values: z.array(operand).min(1).max(40)})).max(13),
    inputCostShock: z.strictObject({fromYear: year, rate, passThroughLagMonths: z.number().int().min(0).max(12)}).nullable()})).max(10),
  /** The company's budget or revision for a projected year; the cause of the difference only when someone stated it. */
  companyVersions: z.array(z.strictObject({...item, status: z.enum(["approved", "under_review"]), year, metric: z.enum(["revenue", "ebitda"]), value: signedOperand,
    cause: z.string().trim().min(1).max(500).nullable()})).max(10),
});
export type OperatingProjectionExtraction = z.infer<typeof operatingProjectionExtractionSchema>;

export const operatingProjectionExtractionContract = {
  task: "operating_projection_extraction" as const,
  system: [
    "Você extrai os dados que permitem projetar a companhia por driver (volume, preço líquido, custo do insumo principal por unidade, demais custos variáveis por unidade, custos fixos, prazos de recebimento, estoque e pagamento, capex de manutenção, arrendamentos, depreciação, despesa de juros e alíquota), a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (demonstrações, gerencial, orçamento, revisões).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo) ou lista vazia. Nunca estime, nunca complete, nunca calcule uma série a partir de uma taxa.",
    "Valores monetários em reais, sem separador de milhar e com ponto decimal (R$ 420 milhões vira 420000000); volume na unidade declarada, e preço e custos por unidade em reais por essa mesma unidade. Taxas em fração (3% vira 0.03). Prazos em dias. Alíquota em fração.",
    "actualYear é o último ano fechado; actualDrivers são os drivers desse ano (volume, netUnitPrice, inputCostPerUnit, otherVariableCostPerUnit, fixedCosts, receivableDays, inventoryDays, payableDays); reportedRevenue e reportedEbitda são a receita e o EBITDA reportados desse ano.",
    "baseColumns só quando um documento ou a pessoa dá o valor de um driver para cada ano projetado, em ordem. lastProjectedYear é o último ano que a pessoa quer projetar, quando dito.",
    "scenarios: cada correção que a pessoa informa sobre a projeção (por exemplo volume crescendo 3% ao ano, ou clientes pedindo 60 dias) é um cenário de papel informed; uma alternativa discutida (alta do insumo, volume menor) é alternative. volumeGrowthRate é o crescimento anual do volume; volumeFactor multiplica o volume da base; overrides dão uma série por ano para um driver; inputCostShock é a alta do insumo a partir de um ano, com os meses até o repasse ao preço (12 quando não há repasse no ano). basedOnLabel é o rótulo do cenário em que este se apoia, ou null para a base.",
    "companyVersions são o orçamento aprovado ou a revisão da companhia para um ano projetado, com a métrica e o valor; cause só quando alguém explicou a diferença.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: operatingProjectionExtractionSchema,
  schemaName: "operating_projection_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 10_000,
  cacheKey: "operating-projection-extraction-2026.10.26-v1",
};

type Origin = OperatingProjectionFacts["base"][number]["origins"][number];
/** Contradictions inside one record of an operating projection turn, each named by its field. */
export function operatingProjectionContradictions(e: OperatingProjectionExtraction): string[] {
  const out: string[] = [];
  if (e.reportedRevenue.value !== null && !(Number(e.reportedRevenue.value) > 0)) out.push("reportedRevenue");
  e.companyVersions.forEach((v, k) => {
    if (v.metric === "revenue" && !(Number(v.value) > 0)) out.push(`companyVersions.${k + 1}.value`);
    if (e.actualYear.value !== null && v.year <= e.actualYear.value) out.push(`companyVersions.${k + 1}.year`);
  });
  e.scenarios.forEach((s, k) => {if (s.inputCostShock && e.actualYear.value !== null && s.inputCostShock.fromYear <= e.actualYear.value) out.push(`scenarios.${k + 1}.inputCostShock`);});
  return out;
}

/** Turns the extraction into the facts the method needs. The last year and its reported figures are
 * required: without them nothing can be rebuilt, so the proposal waits and the reply asks for them in one
 * batch. House premises are conventions of the method and stated as such: the purpose when none was said,
 * three projected years, a commercial year and a 0.5% calibration tolerance, the nominal income tax rate,
 * and an operating driver nobody projected held at the last year's level as an estimate. Capex, leases,
 * depreciation and interest are never assumed. Alternatives come only from what the person described; with
 * none, the reply asks which alternatives to test (`alternativesToTest`) and the house supplies no number. */
export function completeOperatingProjectionFacts(input: {extraction: OperatingProjectionExtraction; ids: {projectionId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}):
  Lote2Completion<OperatingProjectionFacts> {
  // Record identity (see withRecordIdentity): a keyed collection holds one fact per key; a countable one merges only the
  // same record read twice from one source and asks equal records from another source (duplicateOf). Gap positions count after merging.
  const missing: string[] = [], used: string[] = [];
  const {e, ambiguous} = withRecordIdentity(input.extraction, {keyed: ["scenarios", "companyVersions", "actualDrivers", "baseColumns"], countable: []}, missing);
  // A value stated without its origin is asked, never replaced by a house default nor dropped.
  missing.push(...unsourcedFields(e as unknown as Record<string, unknown>));
  // Fields of one record that contradict each other are asked, never resolved in favour of either (independent review, round 12).
  missing.push(...operatingProjectionContradictions(e));
  const actualYear = stated(e.actualYear), revenue = stated(e.reportedRevenue), ebitda = stated(e.reportedEbitda);
  if (!actualYear) missing.push("actualYear");
  if (!revenue) missing.push("reportedRevenue");
  if (!ebitda) missing.push("reportedEbitda");
  // A driver stated twice with different values is asked, never resolved by order (independent review, round 8).
  const actualConflicts = conflictingKeys(e.actualDrivers, (d) => d.driver, (d) => d.value);
  for (const k of actualConflicts) missing.push(`actual.${k}`);
  const actual = new Map<string, OperatingProjectionExtraction["actualDrivers"][number]>();
  for (const d of e.actualDrivers) if (!actual.has(d.driver) && !actualConflicts.has(d.driver)) actual.set(d.driver, d);
  for (const k of actualOperatingDriverNames) if (!actual.has(k)) missing.push(`actual.${k}`);
  if (!actualYear) return {status: "missing", missing: [...new Set(missing)]};
  const asked = stated(e.lastProjectedYear);
  // The house horizon applies only when nobody stated one; a stated horizon that does not follow the actual year is asked.
  if (asked && asked.value <= actualYear.value) missing.push("lastProjectedYear");
  const last = asked && asked.value > actualYear.value ? asked.value : actualYear.value + 3;
  if (!asked) used.push("horizon");
  if (last - actualYear.value > 40) missing.push("lastProjectedYear");
  const periodEnds = Array.from({length: Math.min(last - actualYear.value, 40)}, (_, k) => `${actualYear.value + k + 1}-12-31`), n = periodEnds.length;
  const columnConflicts = conflictingKeys(e.baseColumns, (c) => c.driver, (c) => c.values);
  for (const k of columnConflicts) missing.push(`baseColumns.${k}`);
  const columns = new Map<string, OperatingProjectionExtraction["baseColumns"][number]>();
  for (const c of e.baseColumns) if (!columns.has(c.driver)) columns.set(c.driver, c);
  const base = projectedOperatingDriverNames.map((d) => {
    const c = columns.get(d);
    if (c) {
      if (c.values.length !== n) missing.push(`baseColumns.${d}`);
      return {driver: d, values: c.values, origins: c.values.map(() => c.origin as Origin), source: citedSource(c.origin, c.source)};
    }
    const a = actual.get(d);
    if (a) {used.push("heldDrivers"); return {driver: d, values: periodEnds.map(() => a.value), origins: periodEnds.map(() => "estimate" as Origin), source: "Mantido no nível do último ano realizado até a companhia informar"};}
    if (d === "taxRate") {used.push("taxRate"); return {driver: d, values: periodEnds.map(() => "0.34"), origins: periodEnds.map(() => "house" as Origin), source: "Alíquota nominal de IR e CSLL"};}
    missing.push(`baseColumns.${d}`);
    return null;
  });
  // Scenarios keep the order they were described; a basis that is not the base must be described before.
  const scenarioIds = itemKeys(e.scenarios.map((s) => s.label));
  const scenarios: OperatingProjectionFacts["scenarios"] = e.scenarios.flatMap((s, k) => {
    const p = `scenarios.${k + 1}.`, before = missing.length;
    const basedOn = s.basedOnLabel === null ? "base" : (() => {const j = e.scenarios.findIndex((x) => sameLabel(x.label, s.basedOnLabel!)); return j >= 0 && j < k ? scenarioIds[j]! : null;})();
    if (basedOn === null) missing.push(p + "basedOnLabel");
    if (s.overrides.some((o) => o.values.length !== n) || conflictingKeys(s.overrides, (o) => o.driver, (o) => o.values).size) missing.push(p + "overrides");
    if (repeatedLabels(e.scenarios.map((x) => x.label)).includes(k + 1) && !ambiguous.get("scenarios")!.has(k + 1)) missing.push(p + "label");
    // A scenario with no rule, no override and no shock would run as the base with zero effect: its parameters are asked.
    if (s.volumeGrowthRate === null && s.volumeFactor === null && !s.overrides.length && s.inputCostShock === null) missing.push(p + "parameters");
    const shockEnd = s.inputCostShock ? `${s.inputCostShock.fromYear}-12-31` : null;
    if (shockEnd && !periodEnds.includes(shockEnd)) missing.push(p + "inputCostShock");
    if (s.volumeFactor?.startsWith("-")) missing.push(p + "volumeFactor");
    if ((s.volumeGrowthRate !== null) && (s.volumeFactor !== null) || ((s.volumeGrowthRate !== null || s.volumeFactor !== null) && s.overrides.some((o) => o.driver === "volume"))) missing.push(p + "volume");
    if (missing.length > before) return [];
    const source = citedSource(s.origin, s.source), fact = <T>(value: T) => ({value, origin: s.origin, source});
    return [{id: scenarioIds[k]!, label: s.label, role: s.role, basedOn: basedOn!,
      volumeGrowthRate: s.volumeGrowthRate === null ? null : fact(s.volumeGrowthRate), volumeFactor: s.volumeFactor === null ? null : fact(s.volumeFactor),
      overrides: s.overrides.map((o) => ({driver: o.driver, values: o.values, origin: s.origin, source})),
      inputCostShock: s.inputCostShock && shockEnd ? fact({fromPeriodEnd: shockEnd, rate: s.inputCostShock.rate, passThroughLagMonths: s.inputCostShock.passThroughLagMonths}) : null}];
  });
  if (!e.scenarios.some((s) => s.role === "alternative")) used.push("alternativesToTest");
  // A company version is a set of figures: the identity of one figure is (version label, metric, period). The same
  // budget holding revenue and EBITDA, or several years, is normal; one figure stated with two values is asked
  // (independent review, round 14).
  const figure = (v: OperatingProjectionExtraction["companyVersions"][number]) => `${statedLabel(v.label)}|${v.metric}|${v.year}`;
  const versionConflicts = conflictingKeys(e.companyVersions, figure, (v) => ({status: v.status, value: v.value, cause: v.cause}));
  e.companyVersions.forEach((v, k) => {if (versionConflicts.has(figure(v)) && e.companyVersions.findIndex((x) => figure(x) === figure(v)) !== k) missing.push(`companyVersions.${k + 1}`);});
  const versionIds = itemKeys(e.companyVersions.map((v) => v.label));
  const companyVersions = e.companyVersions.flatMap((v, k) => {
    const end = `${v.year}-12-31`;
    if (!periodEnds.includes(end)) {missing.push(`companyVersions.${k + 1}.year`); return [];}
    const source = citedSource(v.origin, v.source);
    return [{id: versionIds[k]!, label: v.label, version: {value: {status: v.status, periodEnd: end, metric: v.metric, value: v.value}, origin: v.origin, source},
      cause: v.cause === null ? {value: null, origin: "house" as const, source: "A companhia não explicou a diferença; a causa é perguntada"} : {value: v.cause, origin: v.origin, source}}];
  });
  if (missing.length || !revenue || !ebitda) return {status: "missing", missing: [...new Set(missing)]};
  const said = stated(e.purpose);
  const purpose = said ?? {value: "Projeção por driver para discutir a dívida da companhia: caixa disponível para a dívida e o que pode dar errado", origin: "house" as const, source: "Propósito padrão de uma projeção para financiamento"};
  if (!said) used.push("purpose");
  const drivers = actualOperatingDriverNames.map((k) => actual.get(k)!);
  const driversOrigin = drivers.every((d) => d.origin === "document") ? "document" as const : "informed" as const;
  const parsedFacts = factsOrGaps(operatingProjectionFactsSchema, {...input.ids, perimeter: "standalone", currency: input.currency, purpose,
    conventions: {dayCountBasis: {value: "360", origin: "house", source: "Prazos médios em ano comercial"},
      calibrationTolerance: {value: "0.005", origin: "house", source: "Reproduzir o último ano em até 0,5% antes de projetar"}},
    actual: {periodStart: `${actualYear.value}-01-01`, periodEnd: `${actualYear.value}-12-31`,
      drivers: {value: Object.fromEntries(drivers.map((d) => [d.driver, d.value])), origin: driversOrigin, source: [...new Set(drivers.map((d) => citedSource(d.origin, d.source)))].join("; ").slice(0, 2000)},
      reportedRevenue: revenue, reportedEbitda: ebitda},
    periodEnds, base: base.map((b) => b!), scenarios, companyVersions});
  if (!parsedFacts.ok) return {status: "missing", missing: parsedFacts.missing};
  const facts = parsedFacts.facts;
  return {status: "complete", facts, situationId: operatingProjectionSituation, housePremiseKeys: [...new Set(used)]};
}

const driverKey = (d: ProjectedOperatingDriver) => `driver${d[0]!.toUpperCase()}${d.slice(1)}`;
const driverLabels: Record<ProjectedOperatingDriver, string> = {volume: "Volume", netUnitPrice: "Preço líquido por unidade", inputCostPerUnit: "Custo do insumo principal por unidade",
  otherVariableCostPerUnit: "Demais custos variáveis por unidade", fixedCosts: "Custos fixos", receivableDays: "Prazo de recebimento", inventoryDays: "Prazo de estoque",
  payableDays: "Prazo de pagamento", maintenanceCapex: "Capex de manutenção", leasePayments: "Arrendamentos", depreciation: "Depreciação", interestExpense: "Despesa de juros", taxRate: "Alíquota"};


/** What the method's own reader and packet would refuse after confirmation, named before the card is offered. */
/** The method's own reader and packet over a basis, as the confirmation will run them. */
export const operatingProjectionReader = (b: BoundBasis) => {
  const question = "Verificação das premissas antes da confirmação";
  return prepareOperatingProjectionPacket(composeBoundOperatingProjection({...b, question}));
};
export function operatingProjectionReaderGaps(facts: OperatingProjectionFacts): string[] {
  return readerGaps(proposeOperatingProjectionHypotheses(facts), operatingProjectionReader);
}

/** The card: the purpose, the last year and its reported figures, each driver column, each scenario and each company version. */
export function operatingProjectionSummary(facts: OperatingProjectionFacts): Lote2Summary {
  const row = summaryRow;
  const weakest = (origins: readonly Origin[]): Origin => (["house", "estimate", "informed", "document"] as const).find((o) => origins.includes(o)) ?? "estimate";
  return {situationId: operatingProjectionSituation, referenceDate: facts.actual.periodEnd, items: [
    row("premise", "Propósito da projeção", facts.purpose, "purpose"),
    row("premise", "Último ano realizado", facts.actual.drivers, "actualYear"),
    row("premise", "Receita reportada", facts.actual.reportedRevenue, "reportedRevenue"),
    row("premise", "EBITDA reportado", facts.actual.reportedEbitda, "reportedEbitda"),
    ...facts.base.map((b) => row("driver", driverLabels[b.driver], {origin: weakest(b.origins), source: b.source}, driverKey(b.driver))),
    ...facts.scenarios.map((s) => {
      const origin = s.volumeGrowthRate?.origin ?? s.volumeFactor?.origin ?? s.inputCostShock?.origin ?? s.overrides[0]?.origin ?? "house";
      const source = s.volumeGrowthRate?.source ?? s.volumeFactor?.source ?? s.inputCostShock?.source ?? s.overrides[0]?.source ?? "Cenário descrito";
      return row("scenario", s.label, {origin, source});
    }),
    ...facts.companyVersions.map((v) => row("version", v.label, v.version)),
  ]};
}

export function buildOperatingProjectionPremiseProposal(facts: OperatingProjectionFacts) {
  return fingerprintedProposal(operatingProjectionPremiseMethod, facts, proposeOperatingProjectionHypotheses(facts), operatingProjectionSummary(facts));
}

export async function proposeOperatingProjectionPremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}) {
  const entry = input.projectId ? premiseEntry("operating_projection", input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  return proposeLote2PremisesForTurn({logPrefix: "operating_projection_premises", idName: "operating-projection", expansionRefusalAsGap: true, schema: operatingProjectionExtractionSchema,
    complete: (extraction, id) => completeOperatingProjectionFacts({extraction, ids: {projectionId: id, entityId: id, definitionVersionId: id}, currency: "BRL"}),
    build: buildOperatingProjectionPremiseProposal, readerCheck: operatingProjectionReaderGaps}, {...input, entry, projectId: input.projectId});
}
