import Decimal from "decimal.js";
import {z} from "zod";
import {composeBoundProjectionChallenge, prepareProjectionChallengePacket, projectionChallengeDriverUnits, projectionChallengeFactsSchema, proposeProjectionChallengeHypotheses, type ProjectionChallengeFacts} from "@offroad/financial-model";
import {withRecordIdentity, unsourcedFields, factsOrGaps, citedSource, extractedOrigin, fingerprintedProposal, itemKeys, itemLabel, itemSource, proposeLote2PremisesForTurn, sourced, stated,
  summaryRow, type Lote2Completion, type Lote2Summary} from "./lote2-premises";
import {premiseEntry, turnIntentInstruction, turnIntents} from "./premise-cue";
import {readerGaps, type BoundBasis} from "./lote3-reader-check";

/** The method these premises feed, pinned to its implemented version. */
export const projectionChallengePremiseMethod = {methodId: "challenge-financial-projection", methodVersion: "2026.10.26-v1"} as const;

/** A plan to read before it goes to the bank: the turn may propose the challenge's premises. A statement after
 * the latest such question among the recent messages is a continuation candidate; the extraction's
 * `turnIntent` decides it. */
export function shouldProposeProjectionChallengePremises(message: string, hasAttachments: boolean, earlierUserMessages: readonly string[] = []): boolean {
  return premiseEntry("projection_challenge", message, hasAttachments, earlierUserMessages) !== null;
}

export const projectionChallengeSituation = "stable-business-high-conversion";
type Driver = keyof typeof projectionChallengeDriverUnits;
const periodDrivers = ["quantity", "netUnitPrice", "variableUnitCost", "fixedCosts", "interestExpense"] as const;
const caseDrivers = ["receivableDays", "inventoryDays", "payableDays", "maintenanceCapex", "leasePayments", "depreciation", "taxRate"] as const;
const drivers = [...periodDrivers, ...caseDrivers] as const;
const operand = z.string().regex(/^\d{1,15}(?:\.\d{1,8})?$/);
const series = z.array(operand).min(2).max(20).nullable();
const extractedCase = z.strictObject({origin: extractedOrigin, source: itemSource,
  ...Object.fromEntries(periodDrivers.map((d) => [d, series])) as Record<(typeof periodDrivers)[number], typeof series>,
  ...Object.fromEntries(caseDrivers.map((d) => [d, operand.nullable()])) as Record<(typeof caseDrivers)[number], ReturnType<typeof operand.nullable>>,
});

/** Only what the person said or a document states. Absence stays null; nothing is estimated here. */
export const projectionChallengeExtractionSchema = z.strictObject({
  turnIntent: z.enum(turnIntents),
  /** The years of the plan in order, the first being the last actual year. */
  periods: sourced(z.array(z.string().regex(/^(?:19|20)\d{2}$/)).min(2).max(20)),
  /** The year the plan is read at; the last one when nobody said. */
  targetPeriod: sourced(z.string().regex(/^(?:19|20)\d{2}$/)),
  unitConvention: sourced(z.string().trim().min(1).max(500)),
  /** The company's plan, one value per year for the series. */
  plan: extractedCase.nullable(),
  /** The reference by historical drivers the plan is read against (for example the house projection). */
  reference: extractedCase.nullable(),
  assumptions: z.array(z.strictObject({label: itemLabel, origin: extractedOrigin, source: itemSource, drivers: z.array(z.enum(drivers)).min(1).max(12),
    ruler: z.string().trim().min(1).max(500).nullable(), evidence: z.array(z.string().trim().min(1).max(300)).max(8),
    evidenceStatus: z.enum(["documented", "not_presented"]).nullable()})).max(12),
  capacityQuantity: sourced(operand), capacityInvestmentInPlan: sourced(z.boolean()),
  marginCause: sourced(z.string().trim().min(1).max(500)),
  requestedReceivableDays: sourced(operand),
  /** How much dearer a premium line is than the average price, as a fraction, when the company defends the price with it. */
  premiumOverAverage: sourced(z.string().regex(/^\d{1,4}(?:\.\d{1,8})?$/)),
});
export type ProjectionChallengeExtraction = z.infer<typeof projectionChallengeExtractionSchema>;

export const projectionChallengeExtractionContract = {
  task: "projection_challenge_extraction" as const,
  system: [
    "Você extrai os dados que permitem ler o plano de uma companhia contra uma referência por drivers históricos, a partir da mensagem de uma pessoa, das mensagens anteriores e de campos já extraídos de documentos (o modelo do plano, demonstrações, a projeção por drivers da casa).",
    "Extraia somente o que foi dito ou o que está em documento. Se não estiver, devolva null (em value, origin e source, ou no campo) ou lista vazia. Nunca estime, nunca complete, nunca rode cenário.",
    "periods são os anos do plano em ordem, começando pelo último ano realizado. Para plan e reference: quantity, netUnitPrice, variableUnitCost, fixedCosts e interestExpense são séries com um valor por ano; receivableDays, inventoryDays, payableDays, maintenanceCapex, leasePayments, depreciation e taxRate são um valor do caso. Taxas em fração. Valores monetários em reais, sem separador de milhar e com ponto decimal (R$ 85 milhões vira 85000000); volume na unidade declarada e preço e custo por unidade em reais por essa unidade.",
    "assumptions são as premissas do plano como o plano as descreve (por exemplo preço +3,5% ao ano), com os drivers que cada uma mexe; um driver pertence a uma premissa só. ruler e evidence só quando alguém disse; evidenceStatus documented quando a companhia apresentou o documento que sustenta a premissa.",
    "capacityQuantity é a capacidade instalada na unidade do volume; capacityInvestmentInPlan diz se o plano inclui o investimento de capacidade. requestedReceivableDays é o prazo que os clientes pedem. marginCause é a causa da expansão de margem quando a companhia explicou. premiumOverAverage é quanto uma linha premium é mais cara que o preço médio, em fração.",
    "origin é informed quando a pessoa disse, document quando veio de um campo de documento. source cita em poucas palavras de onde veio.",
    turnIntentInstruction,
  ].join("\n"),
  schema: projectionChallengeExtractionSchema,
  schemaName: "projection_challenge_extraction_v1",
  outputMode: "prompted_json" as const,
  maxOutputTokens: 10_000,
  cacheKey: "projection-challenge-extraction-2026.10.26-v1",
};

/** The house yardstick and the evidence that would sustain an assumption, by the first driver it moves. */
const houseRulers: Record<Driver, {label: string; ruler: string; evidence: string[]}> = {
  quantity: {label: "Volume", ruler: "Crescimento histórico do volume e capacidade instalada", evidence: ["Pedidos ou contratos com volume mínimo", "Projeto de ampliação de capacidade, com o capex e o financiamento dele"]},
  netUnitPrice: {label: "Preço líquido", ruler: "Preço da referência por drivers, que acompanha o custo", evidence: ["Histórico de repasse de preço acima do custo", "Contratos com cláusula de reajuste", "Mudança de mix documentada, com participação e preço por linha"]},
  variableUnitCost: {label: "Custo variável por unidade", ruler: "Custo variável por unidade da referência", evidence: ["Contratos de fornecimento com preço", "Projeto de eficiência com o ganho por unidade"]},
  fixedCosts: {label: "Custos fixos", ruler: "Inflação e dissídio sobre os custos fixos", evidence: ["Projeto de produtividade que gera o ganho, com prazo e responsável"]},
  interestExpense: {label: "Despesa de juros", ruler: "Despesa de juros da tabela de dívida", evidence: ["Tabela de dívida com o cronograma e o custo de cada operação"]},
  receivableDays: {label: "Prazos e capex", ruler: "Prazos, capex e alíquota praticados hoje", evidence: ["Acordo comercial que fixe os prazos", "Plano de manutenção que sustente o capex", "Parecer que sustente a alíquota"]},
  inventoryDays: {label: "Prazos e capex", ruler: "", evidence: []}, payableDays: {label: "Prazos e capex", ruler: "", evidence: []}, maintenanceCapex: {label: "Prazos e capex", ruler: "", evidence: []},
  leasePayments: {label: "Prazos e capex", ruler: "", evidence: []}, depreciation: {label: "Prazos e capex", ruler: "", evidence: []}, taxRate: {label: "Prazos e capex", ruler: "", evidence: []},
};
const rulerOf = (d: Driver) => (caseDrivers as readonly string[]).includes(d) ? houseRulers.receivableDays : houseRulers[d];
const same = (a: string | readonly string[], b: string | readonly string[]) => Array.isArray(a)
  ? a.length === (b as string[]).length && a.every((x, k) => new Decimal(x).eq((b as string[])[k]!)) : new Decimal(a as string).eq(b as string);

/** Contradictions inside one record of a projection challenge turn, each named by its field. */
export function projectionChallengeContradictions(e: ProjectionChallengeExtraction): string[] {
  const out: string[] = [], d = (x: string) => new Decimal(x);
  if (e.capacityInvestmentInPlan.value !== null && e.capacityQuantity.value === null) out.push("capacityQuantity");
  if (e.capacityQuantity.value !== null && !d(e.capacityQuantity.value).gt(0)) out.push("capacityQuantity");
  if (e.premiumOverAverage.value !== null && !d(e.premiumOverAverage.value).gt(0)) out.push("premiumOverAverage");
  for (const [name, c] of [["plan", e.plan], ["reference", e.reference]] as const) if (c?.taxRate != null && d(c.taxRate).gt(1)) out.push(`${name}.taxRate`);
  e.assumptions.forEach((a, k) => {if (a.evidenceStatus === "documented" && !a.evidence.length) out.push(`assumptions.${k + 1}.evidence`);});
  return out;
}

/** Turns the extraction into the facts the method needs. The plan, the reference and the years are required:
 * without them nothing can be read, so the proposal waits and the reply asks for them in one batch. House
 * premises are conventions of the method and stated as such: the last year as the target, a commercial year,
 * the units as the plan writes them, the yardstick and the evidence of each
 * assumption, an assumption not presented as documented, and one assumption per group of drivers that differ
 * when the plan describes none. No number of the plan or of the reference is assumed, the tax rate included:
 * a case without its rate is asked, never filled and never attributed to the case's document. */
export function completeProjectionChallengeFacts(input: {extraction: ProjectionChallengeExtraction; ids: {challengeId: string; entityId: string; definitionVersionId: string}; currency: "BRL"}):
  Lote2Completion<ProjectionChallengeFacts> {
  // Record identity (see withRecordIdentity): a keyed collection holds one fact per key; a countable one merges only the
  // same record read twice from one source and asks equal records from another source (duplicateOf). Gap positions count after merging.
  const missing: string[] = [], used: string[] = [];
  const {e} = withRecordIdentity(input.extraction, {keyed: ["assumptions"], countable: []}, missing);
  // A value stated without its origin is asked, never replaced by a house default nor dropped.
  missing.push(...unsourcedFields(e as unknown as Record<string, unknown>));
  // Fields of one record that contradict each other are asked, never resolved in favour of either (independent review, round 12).
  missing.push(...projectionChallengeContradictions(e));
  const periods = stated(e.periods);
  if (!periods) missing.push("periods");
  else if (new Set(periods.value).size !== periods.value.length || periods.value.some((p, k) => k > 0 && p <= periods.value[k - 1]!)) missing.push("periods");
  const n = periods?.value.length ?? 0;
  const kase = (name: "plan" | "reference", c: ProjectionChallengeExtraction["plan"]) => {
    if (!c) {missing.push(name); return null;}
    const before = missing.length;
    for (const d of periodDrivers) if (c[d] === null || (n && c[d]!.length !== n)) missing.push(`${name}.${d}`);
    for (const d of caseDrivers) if (c[d] === null) missing.push(`${name}.${d}`);
    if (missing.length > before) return null;
    const value = {...Object.fromEntries(periodDrivers.map((d) => [d, [...c[d]!]])), ...Object.fromEntries(caseDrivers.map((d) => [d, c[d]!]))};
    return {value, origin: c.origin, source: citedSource(c.origin, c.source)};
  };
  const plan = kase("plan", e.plan), reference = kase("reference", e.reference);
  const asked = stated(e.targetPeriod);
  if (asked && periods && periods.value.indexOf(asked.value) < 1) missing.push("targetPeriod");
  // Each assumption names the drivers it moves; a driver belongs to one. With none described, one per group of drivers that differ.
  let terms = e.assumptions.map((a) => ({label: a.label, origin: a.origin as "document" | "informed" | "house", source: citedSource(a.origin, a.source), drivers: [...new Set(a.drivers)],
    ruler: a.ruler, evidence: a.evidence, evidenceStatus: a.evidenceStatus}));
  if (new Set(terms.flatMap((t) => t.drivers)).size !== terms.flatMap((t) => t.drivers).length) missing.push("assumptions.drivers");
  if (!terms.length && plan && reference) {
    const differ = (d: Driver) => !same((plan.value as Record<string, string | string[]>)[d]!, (reference.value as Record<string, string | string[]>)[d]!);
    const groups: Driver[][] = [...periodDrivers.map((d) => [d] as Driver[]), [...caseDrivers]].map((g) => g.filter(differ)).filter((g) => g.length);
    terms = groups.map((g) => ({label: rulerOf(g[0]!).label, origin: "house" as const, source: "Premissa que difere da referência, agrupada pela casa", drivers: g,
      ruler: null, evidence: [], evidenceStatus: null}));
    used.push("assumptions");
    if (!terms.length) missing.push("assumptions");
  }
  if (!terms.length && !missing.includes("assumptions") && !missing.includes("plan") && !missing.includes("reference")) missing.push("assumptions");
  const capacity = stated(e.capacityQuantity), investment = stated(e.capacityInvestmentInPlan);
  if (capacity && !investment) missing.push("capacityInvestmentInPlan");
  if (missing.length || !periods || !plan || !reference) return {status: "missing", missing: [...new Set(missing)]};
  const target = asked ?? {value: periods.value.at(-1)!, origin: "house" as const, source: "Último ano do plano"};
  if (!asked) used.push("targetPeriod");
  const units = stated(e.unitConvention) ?? {value: "Valores nas unidades em que o plano os escreve", origin: "house" as const, source: "Convenção de unidades do plano"};
  if (!stated(e.unitConvention)) used.push("unitConvention");
  const ids = itemKeys(terms.map((t) => t.label));
  const assumptions = terms.map((t, k) => {
    const house = rulerOf(t.drivers[0]!);
    if (t.ruler === null || !t.evidence.length) used.push("rulers");
    if (t.evidenceStatus === null) used.push("evidenceStatus");
    return {term: {value: {id: ids[k]!, label: t.label, drivers: t.drivers}, origin: t.origin, source: t.source},
      ruler: t.ruler === null ? {value: house.ruler, origin: "house" as const, source: "Régua da casa"} : {value: t.ruler, origin: t.origin, source: t.source},
      evidence: t.evidence.length ? {value: t.evidence, origin: t.origin, source: t.source} : {value: house.evidence, origin: "house" as const, source: "Evidência que sustentaria a premissa diante de um comitê de crédito"},
      evidenceStatus: t.evidenceStatus === null ? {value: "not_presented" as const, origin: "house" as const, source: "Nenhum documento apresentado ainda"}
        : {value: t.evidenceStatus, origin: t.origin, source: t.source}};
  });
  const parsedFacts = factsOrGaps(projectionChallengeFactsSchema, {...input.ids, perimeter: "standalone", currency: input.currency,
    openingDate: `${periods.value[0]}-01-01`, endDate: `${target.value}-12-31`, scenario: "plano", referenceScenario: "referencia", planScenario: "plano",
    periodIds: periods, targetPeriodId: target, dayBasis: {value: "360", origin: "house", source: "Ano comercial de 360 dias para giro por prazos"},
    unitConvention: units, reference, plan, assumptions,
    capacity: capacity && investment ? {maximumQuantity: capacity, investmentInPlan: investment, source: {value: capacity.source, origin: capacity.origin, source: capacity.source}} : null,
    marginCause: stated(e.marginCause), requestedReceivableDays: stated(e.requestedReceivableDays), premiumOverAverage: stated(e.premiumOverAverage)});
  if (!parsedFacts.ok) return {status: "missing", missing: parsedFacts.missing};
  const facts = parsedFacts.facts;
  return {status: "complete", facts, situationId: projectionChallengeSituation, housePremiseKeys: [...new Set(used)]};
}


/** What the method's own reader and packet would refuse after confirmation, named before the card is offered. */
/** The method's own reader and packet over a basis, as the confirmation will run them. */
export const projectionChallengeReader = (b: BoundBasis) => {
  const question = "Verificação das premissas antes da confirmação";
  return prepareProjectionChallengePacket(composeBoundProjectionChallenge({...b, question}));
};
export function projectionChallengeReaderGaps(facts: ProjectionChallengeFacts): string[] {
  return readerGaps(proposeProjectionChallengeHypotheses(facts), projectionChallengeReader);
}

/** The card: the reference and the plan, each assumption, and the yardsticks the company stated. */
export function projectionChallengeSummary(facts: ProjectionChallengeFacts): Lote2Summary {
  const row = summaryRow;
  return {situationId: projectionChallengeSituation, referenceDate: facts.endDate, items: [
    row("case", "Referência por drivers", facts.reference, "referenceCase"),
    row("case", "Plano da companhia", facts.plan, "planCase"),
    ...facts.assumptions.map((a) => row("assumption", a.term.value.label, a.term)),
    ...facts.capacity ? [row("premise", "Capacidade instalada", facts.capacity.maximumQuantity, "capacity")] : [],
    ...facts.requestedReceivableDays ? [row("premise", "Prazo pedido pelos clientes", facts.requestedReceivableDays, "requestedReceivableDays")] : [],
    ...facts.premiumOverAverage ? [row("premise", "Prêmio da linha sobre o preço médio", facts.premiumOverAverage, "premiumOverAverage")] : [],
    ...facts.marginCause ? [row("premise", "Causa da expansão de margem", facts.marginCause, "marginCause")] : [],
  ]};
}

export function buildProjectionChallengePremiseProposal(facts: ProjectionChallengeFacts) {
  return fingerprintedProposal(projectionChallengePremiseMethod, facts, proposeProjectionChallengeHypotheses(facts), projectionChallengeSummary(facts));
}

export async function proposeProjectionChallengePremisesForTurn(input: {
  message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}) {
  const entry = input.projectId ? premiseEntry("projection_challenge", input.message, input.hasAttachments, input.recentUserMessages) : null;
  if (!input.projectId || !entry) return null;
  return proposeLote2PremisesForTurn({logPrefix: "projection_challenge_premises", idName: "projection-challenge", expansionRefusalAsGap: true, schema: projectionChallengeExtractionSchema,
    complete: (extraction, id) => completeProjectionChallengeFacts({extraction, ids: {challengeId: id, entityId: id, definitionVersionId: id}, currency: "BRL"}),
    build: buildProjectionChallengePremiseProposal, readerCheck: projectionChallengeReaderGaps}, {...input, entry, projectId: input.projectId});
}
