import {createHash} from "node:crypto";

import {aggregateDebtViews, applyRateShock, calculateCovenantHeadroom, calculateLeverage, calculateLiquidityCoverage, calculateProFormaPosition} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `declare-scenarios` (v5, after the fourth independent review). When
 * management data is missing, the work goes on with declared scenarios: every parameter carries its
 * origin, its rationale and an anchor in a document of the class that origin requires; the executor
 * picks, per role and period, the best origin the register offers. A scenario that declares a lever
 * (shock, haircut, refinancing, rollover) without a registered assumption is blocked, never filled
 * with zero. CFADS is declared per period of the ledger's schedule and never split or repeated by
 * the executor; a CFADS haircut is its own assumption, never derived from the EBITDA haircut. Net
 * debt follows the contractual components; leverage carries the EBITDA's comparability; headroom
 * exists only against an applicable, resolved and comparable limit, otherwise the arithmetic
 * difference is shown as conditioned; a tier is applicable, conditional or not applicable, never a
 * bare boolean. Interest enters the service only when the ledger states it for that period, and the
 * rate shock is reported apart, never spread over periods. Every derived number carries every
 * assumption and anchor it rests on, the previous periods' included; a contracted source keeps its
 * contract and disbursement in the output; documents are bound to the corpus by their hash, checked
 * against the manifest the caller passes. An implied EBITDA is an approximation and the leverage
 * on it is shown to two decimals; the adverse scenario shocks the rate and haircuts the EBITDA, both;
 * a full rollover of future maturities is never taken from history; the EBITDA's comparability is
 * carried per instrument and the headroom follows the instrument of the covenant.
 */
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const key = z.string().regex(/^[a-z][a-z0-9_.-]*$/);
const moneyUnit = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand", "ratio"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const UNIT_WORDS: Record<z.infer<typeof moneyUnit>, RegExp> = {"BRL": /\b(R\$|reais|BRL)\b(?!\s*(mil|milh))/i, "BRL thousand": /\b(mil|thousand)\b/i, "BRL million": /\b(milh[õo]es|million)\b/i, "USD": /\bUSD\b(?!\s*(mil|thousand))/i, "USD thousand": /\bUSD\b.*\b(mil|thousand)\b/i};

export const parameterOriginSchema = z.enum(["authorized_management_data", "public_announcement", "company_history", "versioned_benchmark", "user_range"]);
const originRank: Record<z.infer<typeof parameterOriginSchema>, number> = {authorized_management_data: 0, public_announcement: 1, company_history: 2, versioned_benchmark: 3, user_range: 4};
const originLabel: Record<string, string> = {authorized_management_data: "dado gerencial autorizado", public_announcement: "anúncio público", company_history: "histórico da companhia", versioned_benchmark: "benchmark versionado", user_range: "intervalo declarado pelo usuário"};
export const documentKindSchema = z.enum(["management", "announcement", "itr", "ledger", "benchmark", "user", "indenture", "contract", "disbursement_proof", "other"]);
/** The document classes each origin may cite; an announcement cannot pose as management data and a user range cannot pose as history. */
const ORIGIN_DOCUMENTS: Record<z.infer<typeof parameterOriginSchema>, Array<z.infer<typeof documentKindSchema>>> = {authorized_management_data: ["management"], public_announcement: ["announcement"], company_history: ["itr", "ledger"], versioned_benchmark: ["benchmark"], user_range: ["user"]};

export const assumptionRoleSchema = z.enum(["cfads", "cfads_haircut", "rate_shock", "ebitda_haircut", "new_debt", "refinanced_debt", "contracted_source", "rollover"]);
const RATIO_ROLES = new Set(["cfads_haircut", "rate_shock", "ebitda_haircut", "rollover"]);
const BOUNDED_ROLES = new Set(["cfads_haircut", "ebitda_haircut", "rollover"]);

export const assumptionSchema = z.object({
  key,
  role: assumptionRoleSchema,
  /** The period the assumption applies to; null for a scalar that applies everywhere. CFADS and contracted sources are always per period. */
  period: nonEmpty.nullable(),
  value: nonNegative,
  unit: unitSchema,
  origin: parameterOriginSchema,
  rationale: nonEmpty,
  asOf: isoDate,
  anchor: anchorSchema,
  confidence: z.enum(["high", "medium", "low"]),
  /** For a contracted source: the base must hold the contract and the disbursement, each in a document of its class. */
  evidence: z.object({contract: anchorSchema.nullable(), disbursement: anchorSchema.nullable()}).strict().nullable().default(null),
}).strict();

export const scenarioInputSchema = z.object({
  referenceDate: isoDate,
  unit: moneyUnit,
  /** Where the source states the unit; its note must name it, so a relabelled scale is refused. */
  unitAnchor: anchorSchema.extend({note: nonEmpty}),
  /** The corpus manifest (name and SHA-256 of every file), against which the documents below are checked; a document absent from it or with another hash is refused. */
  manifest: z.array(z.object({name: nonEmpty, sha256: z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1),
  /** The documents of the base with their class and the SHA-256 the corpus manifest records; every anchor must name one, and an origin may cite only the classes it is allowed. */
  documents: z.array(z.object({name: nonEmpty, kind: documentKindSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1),
  assumptions: z.array(assumptionSchema).min(1),
  position: z.object({
    perimeter: z.enum(["consolidated", "parent"]).default("consolidated"),
    /** Contractual net debt components at the reference date, each with its anchor; a release figure is not a component. */
    components: z.object({
      grossDebt: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      derivativeLiabilities: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      derivativeAssets: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      cashAndEquivalents: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      financialInvestments: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    }).strict(),
    /** The EBITDA the leverage is measured on: twelve months, its definition, how it was derived, and how comparable it is with the covenant definitions. */
    ltmEbitda: z.object({value: nonNegative, /** The twelve months the figure covers, as dates: an annualized quarter cannot claim them. */ periodStart: isoDate, periodEnd: isoDate, definitionKey: nonEmpty, basis: z.enum(["company_opened", "implied_from_reported_index", "derived_proxy"]), /** Comparability with each instrument's own EBITDA definition, from the covenant executor: the base definition and the adjustments each indenture adds. */ comparabilityByInstrument: z.array(z.object({instrument: nonEmpty, comparability: z.enum(["comparable", "conditional", "not_comparable"]), reasons: z.array(nonEmpty).default([])}).strict()).min(1), anchor: anchorSchema}).strict().nullable(),
    averageDebtBalance: z.object({value: nonNegative, basis: nonEmpty, anchor: anchorSchema}).strict(),
    baseAnnualRate: z.object({value: nonNegative, basis: nonEmpty, anchor: anchorSchema}).strict(),
  }).strict(),
  /** The covenant the scenarios are read against, from the covenant executor; null when none is resolved. */
  covenant: z.object({instrument: nonEmpty, limit: nonNegative, direction: z.enum(["maximum", "minimum"]), /** applicable when its condition is proven, conditional while the proof is missing, not_applicable when the indenture rules it out. */ tier: z.object({applicability: z.enum(["applicable", "conditional", "not_applicable"]), condition: nonEmpty}).strict(), state: z.enum(["resolved", "insufficient_evidence"]), comparability: z.enum(["comparable", "conditional", "not_comparable"]), measurement: z.object({frequency: z.enum(["annual", "semiannual", "quarterly"]), nextDate: isoDate}).strict(), anchor: anchorSchema}).strict().nullable().default(null),
  /** Debt service by period from the ledger, in the ledger's own periods; interest only when the ledger states it. */
  periods: z.array(z.object({period: nonEmpty, endsAt: isoDate, principal: z.object({value: nonNegative, anchor: anchorSchema}).strict(), interest: z.object({value: nonNegative, anchor: anchorSchema}).strict().nullable()}).strict()).min(1),
  scenarios: z.array(z.object({
    id: z.enum(["base", "adverse", "no_rollover"]).or(z.string().regex(/^[a-z][a-z0-9_-]*$/)),
    label: nonEmpty,
    rolloverAllowed: z.boolean(),
    usesRateShock: z.boolean().default(false),
    usesEbitdaHaircut: z.boolean().default(false),
    usesCfadsHaircut: z.boolean().default(false),
    usesRefinancing: z.boolean().default(false),
  }).strict()).min(1),
}).strict().superRefine((input, context) => {
  if (!UNIT_WORDS[input.unit].test(input.unitAnchor.note)) context.addIssue({code: "custom", path: ["unitAnchor"], message: `the unit anchor's note does not name the unit ${input.unit}; a relabelled scale is refused`});
  const documents = new Map(input.documents.map((document) => [document.name, document.kind]));
  const manifest = new Map(input.manifest.map((entry) => [entry.name, entry.sha256]));
  const names = new Set<string>();
  input.documents.forEach((document, index) => {
    if (names.has(document.name)) context.addIssue({code: "custom", path: ["documents", index], message: `duplicate document ${document.name}`});
    names.add(document.name);
    const recorded = manifest.get(document.name);
    if (recorded === undefined) context.addIssue({code: "custom", path: ["documents", index], message: `${document.name} is not in the corpus manifest; a document outside the manifest is not evidence`});
    else if (recorded !== document.sha256) context.addIssue({code: "custom", path: ["documents", index], message: `${document.name} carries a hash the manifest does not record; the file is not the one the corpus froze`});
  });
  const checkAnchor = (anchor: Anchor, path: (string | number)[]) => { if (!documents.has(anchor.document)) context.addIssue({code: "custom", path, message: `anchor names ${anchor.document}, which is not a document of the base`}); };
  checkAnchor(input.unitAnchor, ["unitAnchor"]);
  for (const [name, component] of Object.entries(input.position.components)) checkAnchor(component.anchor, ["position", "components", name]);
  if (input.position.ltmEbitda) {
    checkAnchor(input.position.ltmEbitda.anchor, ["position", "ltmEbitda"]);
    const start = new Date(`${input.position.ltmEbitda.periodStart}T00:00:00Z`); start.setUTCMonth(start.getUTCMonth() + 12);
    if (start.toISOString().slice(0, 10) !== input.position.ltmEbitda.periodEnd) context.addIssue({code: "custom", path: ["position", "ltmEbitda"], message: `the EBITDA covers ${input.position.ltmEbitda.periodStart} to ${input.position.ltmEbitda.periodEnd}, not twelve months; an annualized shorter period is not an LTM figure`});
    if (input.position.ltmEbitda.periodEnd > input.referenceDate) context.addIssue({code: "custom", path: ["position", "ltmEbitda"], message: "the EBITDA period ends after the reference date"});
  }
  checkAnchor(input.position.averageDebtBalance.anchor, ["position", "averageDebtBalance"]);
  checkAnchor(input.position.baseAnnualRate.anchor, ["position", "baseAnnualRate"]);
  if (input.covenant) { checkAnchor(input.covenant.anchor, ["covenant"]); if (input.covenant.measurement.nextDate <= input.referenceDate) context.addIssue({code: "custom", path: ["covenant", "measurement"], message: "the next measurement date must follow the reference date"}); }
  const periodIds = new Set<string>();
  const sorted = [...input.periods].sort((a, b) => compare(a.endsAt, b.endsAt) || compare(a.period, b.period));
  sorted.forEach((period, index) => {
    if (periodIds.has(period.period)) context.addIssue({code: "custom", path: ["periods", index], message: `duplicate period ${period.period}`});
    periodIds.add(period.period);
    if (period.endsAt <= input.referenceDate) context.addIssue({code: "custom", path: ["periods", index], message: `period ${period.period} ends on or before the reference date`});
    checkAnchor(period.principal.anchor, ["periods", index, "principal"]);
    if (period.interest) checkAnchor(period.interest.anchor, ["periods", index, "interest"]);
  });
  const keys = new Set<string>();
  input.assumptions.forEach((assumption, index) => {
    if (keys.has(assumption.key)) context.addIssue({code: "custom", path: ["assumptions", index, "key"], message: `duplicate assumption ${assumption.key}`});
    keys.add(assumption.key);
    checkAnchor(assumption.anchor, ["assumptions", index, "anchor"]);
    const kind = documents.get(assumption.anchor.document);
    if (kind && !ORIGIN_DOCUMENTS[assumption.origin].includes(kind)) context.addIssue({code: "custom", path: ["assumptions", index, "origin"], message: `${assumption.key}: the origin ${assumption.origin} cannot rest on a ${kind} document; it needs ${ORIGIN_DOCUMENTS[assumption.origin].join(" or ")}`});
    if (assumption.role === "contracted_source") {
      if (!assumption.evidence || !assumption.evidence.contract || !assumption.evidence.disbursement) context.addIssue({code: "custom", path: ["assumptions", index, "evidence"], message: `${assumption.key}: a contracted source needs its contract and its disbursement in the base; an approval is not a source`});
      else {
        if (documents.get(assumption.evidence.contract.document) !== "contract") context.addIssue({code: "custom", path: ["assumptions", index, "evidence", "contract"], message: `${assumption.key}: the contract must be a contract document of the base`});
        if (documents.get(assumption.evidence.disbursement.document) !== "disbursement_proof") context.addIssue({code: "custom", path: ["assumptions", index, "evidence", "disbursement"], message: `${assumption.key}: the disbursement must be a disbursement proof of the base`});
        if (assumption.evidence.contract.document === assumption.evidence.disbursement.document) context.addIssue({code: "custom", path: ["assumptions", index, "evidence"], message: `${assumption.key}: contract and disbursement proof must be two documents`});
      }
      if (assumption.period === null) context.addIssue({code: "custom", path: ["assumptions", index, "period"], message: `${assumption.key}: a contracted source belongs to one period and is used once`});
    }
    if (assumption.role === "cfads" && assumption.period === null) context.addIssue({code: "custom", path: ["assumptions", index, "period"], message: `${assumption.key}: CFADS is declared per period of the schedule, never split or repeated by the executor`});
    if (RATIO_ROLES.has(assumption.role) && assumption.unit !== "ratio") context.addIssue({code: "custom", path: ["assumptions", index, "unit"], message: `${assumption.key}: a ${assumption.role} is a ratio`});
    if (BOUNDED_ROLES.has(assumption.role) && new Decimal(assumption.value).gt(1)) context.addIssue({code: "custom", path: ["assumptions", index, "value"], message: `${assumption.key}: a ${assumption.role} lies between 0 and 1`});
    if ((assumption.role === "rate_shock" || assumption.role === "ebitda_haircut" || assumption.role === "cfads_haircut") && new Decimal(assumption.value).isZero()) context.addIssue({code: "custom", path: ["assumptions", index, "value"], message: `${assumption.key}: a ${assumption.role} of zero is not a stress; register a positive value or leave the lever out`});
    if (!RATIO_ROLES.has(assumption.role) && assumption.unit !== input.unit) context.addIssue({code: "custom", path: ["assumptions", index, "unit"], message: `${assumption.key}: a monetary assumption must be in ${input.unit}`});
    if (assumption.period !== null && !periodIds.has(assumption.period)) context.addIssue({code: "custom", path: ["assumptions", index, "period"], message: `${assumption.key} names a period that is not projected`});
    if (assumption.role === "rollover" && assumption.origin === "company_history") context.addIssue({code: "custom", path: ["assumptions", index, "origin"], message: `${assumption.key}: past rollovers in the cash flow statement are history, not a policy for future maturities; a rollover share must be declared as management data or as a user range`});
  });
  const ids = new Set<string>();
  input.scenarios.forEach((scenario, index) => {
    if (ids.has(scenario.id)) context.addIssue({code: "custom", path: ["scenarios", index], message: `duplicate scenario ${scenario.id}`});
    ids.add(scenario.id);
    if (scenario.id === "adverse" && (!scenario.usesRateShock || !scenario.usesEbitdaHaircut)) context.addIssue({code: "custom", path: ["scenarios", index], message: "the adverse scenario of the minimum set shocks the rate and haircuts the EBITDA, both; an adverse scenario with less is a label"});
    if (scenario.id === "no_rollover" && scenario.rolloverAllowed) context.addIssue({code: "custom", path: ["scenarios", index], message: "the no-rollover scenario cannot allow rollover"});
  });
  for (const required of ["base", "adverse", "no_rollover"]) if (!ids.has(required)) context.addIssue({code: "custom", path: ["scenarios"], message: `the minimum set needs a ${required} scenario`});
});
export type ScenarioInput = z.input<typeof scenarioInputSchema>;

type Origin = {origin: string; key: string; anchor: Anchor; evidence?: {contract: Anchor; disbursement: Anchor}};
type Calculation = {id: string; scenario: string; formula: string; operands: Record<string, string>; result: string; unit: string; origins: Origin[]};
type Assumption = z.infer<typeof assumptionSchema>;

export type ScenarioOutput = {
  schema_version: "method.declare-scenarios.v5";
  reference_date: string;
  unit: string;
  state: "declared" | "partial" | "blocked";
  block_reasons: string[];
  assumption_register: Array<{key: string; role: string; period: string | null; value: string; unit: string; origin: string; origin_rank: number; rationale: string; as_of: string; anchor: Anchor; evidence: {contract: Anchor; disbursement: Anchor} | null; confidence: string; selected: boolean}>;
  scenarios: Array<{
    id: string; label: string;
    state: "declared" | "partial" | "blocked";
    block_reasons: string[];
    parameters: Array<{role: string; period: string | null; key: string; value: string; origin: string; rationale: string; anchor: Anchor; evidence: {contract: Anchor; disbursement: Anchor} | null}>;
    results: {
      pro_forma: {gross_debt: string; deductible_cash: string; contractual_net_debt: string; leverage: {value: string; precision: "exact" | "approximate_two_decimals"; precision_note: string | null; ebitda_definition: string; ebitda_basis: string; comparability_by_instrument: Array<{instrument: string; comparability: string; reasons: string[]}>} | null; origins: Origin[]};
      headroom: {absolute: string; within_limit: boolean; limit: string; instrument: string; note: string} | null;
      headroom_note: string;
      interest: {base: string; stressed: string; delta: string; origins: Origin[]} | null;
      liquidity: {basis: "principal_only" | "full_debt_service" | "mixed"; rows: Array<{period: string; basis: "principal_only" | "full_debt_service"; principal: string; interest: string | null; cfads_declared: string; cfads_used: string; cfads_haircut: string | null; contracted_sources: string; rolled_principal: string; coverage: string | null; closing_cash: string; deficit: string; origins: Origin[]}>} | null;
    };
    caveat: string;
    uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  }>;
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

function canonical(input: z.infer<typeof scenarioInputSchema>) {
  return {
    ...input,
    documents: [...input.documents].sort((a, b) => compare(a.name, b.name)),
    assumptions: [...input.assumptions].sort((a, b) => compare(a.key, b.key)),
    scenarios: [...input.scenarios].sort((a, b) => compare(a.id, b.id)),
    periods: [...input.periods].sort((a, b) => compare(a.endsAt, b.endsAt) || compare(a.period, b.period)),
    manifest: [...input.manifest].sort((a, b) => compare(a.name, b.name)),
    position: {...input.position, ltmEbitda: input.position.ltmEbitda ? {...input.position.ltmEbitda, comparabilityByInstrument: [...input.position.ltmEbitda.comparabilityByInstrument].sort((a, b) => compare(a.instrument, b.instrument)).map((entry) => ({...entry, reasons: [...entry.reasons].sort(compare)}))} : null},
  };
}

export function declareScenarios(raw: ScenarioInput): ScenarioOutput {
  const input = canonical(scenarioInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const selectedKeys = new Set<string>();
  const originOf = (assumption: Assumption): Origin => ({origin: originLabel[assumption.origin] ?? assumption.origin, key: assumption.key, anchor: assumption.anchor, ...(assumption.evidence?.contract && assumption.evidence.disbursement ? {evidence: {contract: assumption.evidence.contract, disbursement: assumption.evidence.disbursement}} : {})});
  const baseOrigins: Origin[] = [
    {origin: "base pública", key: "position.grossDebt", anchor: input.position.components.grossDebt.anchor},
    {origin: "base pública", key: "position.cashAndEquivalents", anchor: input.position.components.cashAndEquivalents.anchor},
    {origin: "base pública", key: "position.financialInvestments", anchor: input.position.components.financialInvestments.anchor},
    {origin: "base pública", key: "position.derivativeLiabilities", anchor: input.position.components.derivativeLiabilities.anchor},
    {origin: "base pública", key: "position.derivativeAssets", anchor: input.position.components.derivativeAssets.anchor},
  ];
  /** The best origin the register offers for a role and period: lowest rank, then highest confidence, then key. */
  const pick = (role: Assumption["role"], period: string | null): Assumption | null => {
    const candidates = input.assumptions.filter((assumption) => assumption.role === role && (assumption.period === period || (period !== null && assumption.period === null && role !== "cfads")));
    const confidenceRank = {high: 0, medium: 1, low: 2};
    return [...candidates].sort((a, b) => originRank[a.origin] - originRank[b.origin] || confidenceRank[a.confidence] - confidenceRank[b.confidence] || compare(a.key, b.key))[0] ?? null;
  };
  const components = input.position.components;
  const deductibleCash = d(components.cashAndEquivalents.value).plus(components.financialInvestments.value);
  const views = aggregateDebtViews({rows: [{id: "gross_debt", principal: components.grossDebt.value, covenantIncluded: true}, {id: "derivative_liabilities", principal: components.derivativeLiabilities.value, covenantIncluded: true}], cash: deductibleCash.plus(components.derivativeAssets.value)});
  calculations.push({id: "financial.debt_views:contractual", scenario: "all", formula: "grossDebt + derivativeLiabilities - cashAndEquivalents - financialInvestments - derivativeAssets", operands: {grossDebt: components.grossDebt.value, derivativeLiabilities: components.derivativeLiabilities.value, cashAndEquivalents: components.cashAndEquivalents.value, financialInvestments: components.financialInvestments.value, derivativeAssets: components.derivativeAssets.value}, result: views.netFinancialDebt, unit: input.unit, origins: baseOrigins});

  const scenarios = input.scenarios.map((scenario): ScenarioOutput["scenarios"][number] => {
    const parameters: ScenarioOutput["scenarios"][number]["parameters"] = [];
    const uncovered: ScenarioOutput["scenarios"][number]["uncovered_terms"] = [];
    const blocks: string[] = [];
    const use = (role: Assumption["role"], period: string | null): Assumption | null => {
      const assumption = pick(role, period);
      if (assumption) { selectedKeys.add(assumption.key); parameters.push({role, period, key: assumption.key, value: out(d(assumption.value)), origin: assumption.origin, rationale: assumption.rationale, anchor: assumption.anchor, evidence: null}); }
      return assumption;
    };
    const originsOf = (...items: Array<Assumption | null>) => items.filter((item): item is Assumption => item !== null).map(originOf).sort((a, b) => compare(a.key, b.key));
    const rollover = scenario.rolloverAllowed ? use("rollover", null) : null;
    if (scenario.rolloverAllowed && !rollover) blocks.push("the scenario assumes rollover of maturing principal but no rollover assumption is registered with an origin; rollover is not assumed by default");
    const shock = scenario.usesRateShock ? use("rate_shock", null) : null;
    if (scenario.usesRateShock && !shock) blocks.push("the scenario declares a rate shock but none is registered; a shock of zero is not a shock");
    const haircut = scenario.usesEbitdaHaircut ? use("ebitda_haircut", null) : null;
    if (scenario.usesEbitdaHaircut && !haircut) blocks.push("the scenario declares an EBITDA haircut but none is registered; the haircut is not filled with zero");
    const cfadsHaircut = scenario.usesCfadsHaircut ? use("cfads_haircut", null) : null;
    if (scenario.usesCfadsHaircut && !cfadsHaircut) blocks.push("the scenario declares a CFADS haircut but none is registered; the EBITDA haircut is never applied to CFADS in its place");
    const newDebt = scenario.usesRefinancing ? use("new_debt", null) : null;
    const refinanced = scenario.usesRefinancing ? use("refinanced_debt", null) : null;
    if (scenario.usesRefinancing && (!newDebt || !refinanced)) blocks.push("a refinancing is new debt replacing old debt; both amounts must be registered, and a subtraction alone is not a refinancing");
    const caveatFor = (state: string) => {
      const used = parameters.map((parameter) => `${originLabel[parameter.origin] ?? parameter.origin} (${parameter.key}: ${parameter.rationale})`);
      return `Cenário ${scenario.label} (${state}), declarado a partir de ${used.join("; ") || "nenhum parâmetro próprio"}; não é guidance da companhia e não afirma o que a companhia fará; cada número acima carrega as premissas e âncoras de que depende.`;
    };
    const headroomNote = (leverage: string | null): string => {
      if (!input.covenant) return "no covenant limit received; no headroom";
      if (!leverage) return "no leverage measured; no headroom";
      const reasons: string[] = [];
      if (input.covenant.state !== "resolved") reasons.push(`the limit of ${input.covenant.instrument} is ${input.covenant.state}`);
      if (input.covenant.tier.applicability === "conditional") reasons.push(`the ${input.covenant.limit}x tier is conditional (${input.covenant.tier.condition})`);
      if (input.covenant.tier.applicability === "not_applicable") reasons.push(`the ${input.covenant.limit}x tier is not applicable (${input.covenant.tier.condition})`);
      if (input.covenant.comparability !== "comparable") reasons.push(`the covenant comparison is ${input.covenant.comparability}`);
      const forInstrument = input.position.ltmEbitda?.comparabilityByInstrument.find((entry) => entry.instrument === input.covenant!.instrument);
      if (input.position.ltmEbitda && !forInstrument) reasons.push(`the EBITDA carries no comparability reading for ${input.covenant.instrument}`);
      if (forInstrument && forInstrument.comparability !== "comparable") reasons.push(`the EBITDA is ${forInstrument.comparability} with the definition of ${input.covenant.instrument}${forInstrument.reasons.length > 0 ? ` (${forInstrument.reasons.join("; ")})` : ""}`);
      if (reasons.length === 0) return `headroom measured against the ${input.covenant.limit}x tier of ${input.covenant.instrument}, as a scenario reading before the measurement of ${input.covenant.measurement.nextDate}`;
      const arithmetic = input.covenant.direction === "maximum" ? d(input.covenant.limit).minus(leverage) : d(leverage).minus(input.covenant.limit);
      return `no headroom: ${reasons.join("; ")}. The arithmetic difference against ${input.covenant.limit}x is ${out(arithmetic)}x and is conditioned, not a headroom`;
    };
    if (blocks.length > 0) {
      for (const block of blocks) uncovered.push({id: `lever:${scenario.id}`, state: "insufficient_evidence", reason: block});
      return {id: scenario.id, label: scenario.label, state: "blocked", block_reasons: blocks, parameters, results: {pro_forma: {gross_debt: components.grossDebt.value, deductible_cash: out(deductibleCash), contractual_net_debt: views.netFinancialDebt, leverage: null, origins: baseOrigins}, headroom: null, headroom_note: "scenario blocked; nothing measured", interest: null, liquidity: null}, caveat: caveatFor("blocked"), uncovered_terms: uncovered};
    }

    // Pro forma through financial-core, on the contractual net debt.
    const ebitda = input.position.ltmEbitda;
    const ebitdaBase = ebitda ? d(ebitda.value).times(d(1).minus(haircut ? haircut.value : 0)) : null;
    const proForma = calculateProFormaPosition({grossDebt: components.grossDebt.value, unrestrictedCash: deductibleCash.toFixed(), newDebt: newDebt ? newDebt.value : "0", refinancedDebt: refinanced ? refinanced.value : "0", feesPaidFromCash: "0", cashContribution: "0"});
    const contractualNetDebt = d(proForma.grossDebt).plus(components.derivativeLiabilities.value).minus(components.derivativeAssets.value).minus(proForma.unrestrictedCash);
    // An EBITDA implied from a two-decimal reported index carries that precision: the leverage on it is shown to two decimals, as an approximation.
    const exactLeverage = ebitdaBase && ebitdaBase.gt(0) ? calculateLeverage(out(contractualNetDebt), out(ebitdaBase)).value : null;
    const approximate = ebitda?.basis === "implied_from_reported_index";
    const leverageValue = exactLeverage === null ? null : approximate ? d(exactLeverage).toDecimalPlaces(2).toFixed() : exactLeverage;
    const proFormaOrigins = [...baseOrigins, ...(ebitda ? [{origin: "base pública", key: "position.ltmEbitda", anchor: ebitda.anchor}] : []), ...originsOf(newDebt, refinanced, haircut)];
    calculations.push({id: "operation.pro_forma_position", scenario: scenario.id, formula: "grossDebt + newDebt - refinancedDebt ; contractual net debt with derivatives less deductible cash ; leverage = net debt / (EBITDA * (1 - ebitdaHaircut))", operands: {grossDebt: components.grossDebt.value, newDebt: newDebt ? newDebt.value : "0", refinancedDebt: refinanced ? refinanced.value : "0", ebitda: ebitdaBase ? out(ebitdaBase) : "insufficient_evidence", ebitdaHaircut: haircut ? haircut.value : "0"}, result: out(contractualNetDebt), unit: input.unit, origins: proFormaOrigins});
    if (!ebitda) uncovered.push({id: "leverage", state: "insufficient_evidence", reason: "no EBITDA with a definition in the base; leverage is not measured"});
    else if (ebitdaBase && ebitdaBase.lte(0)) uncovered.push({id: "leverage", state: "insufficient_evidence", reason: "the EBITDA after the haircut is zero or negative; leverage is not measured"});

    let headroom: ScenarioOutput["scenarios"][number]["results"]["headroom"] = null;
    const note = headroomNote(leverageValue);
    if (input.covenant && leverageValue && note.startsWith("headroom measured")) {
      const result = calculateCovenantHeadroom({actual: leverageValue, limit: input.covenant.limit, direction: input.covenant.direction});
      calculations.push({id: "structure.covenant_headroom", scenario: scenario.id, formula: input.covenant.direction === "maximum" ? "limit - leverage" : "leverage - limit", operands: {limit: input.covenant.limit, leverage: leverageValue}, result: result.absolute, unit: "x", origins: [...proFormaOrigins, {origin: "base pública", key: "covenant", anchor: input.covenant.anchor}]});
      headroom = {absolute: result.absolute, within_limit: result.passes, limit: input.covenant.limit, instrument: input.covenant.instrument, note};
    }

    let interest: ScenarioOutput["scenarios"][number]["results"]["interest"] = null;
    if (shock) {
      const shocked = applyRateShock({averageBalance: input.position.averageDebtBalance.value, baseRate: input.position.baseAnnualRate.value, shock: shock.value});
      const origins = [{origin: "base pública", key: "position.averageDebtBalance", anchor: input.position.averageDebtBalance.anchor}, {origin: "base pública", key: "position.baseAnnualRate", anchor: input.position.baseAnnualRate.anchor}, ...originsOf(shock)];
      calculations.push({id: "financial.rate_shock", scenario: scenario.id, formula: "averageBalance * (baseRate + shock) - averageBalance * baseRate", operands: {averageBalance: input.position.averageDebtBalance.value, baseRate: input.position.baseAnnualRate.value, shock: shock.value}, result: shocked.delta, unit: input.unit, origins});
      interest = {base: shocked.baseInterest, stressed: shocked.stressedInterest, delta: shocked.delta, origins};
    }

    // Liquidity: CFADS per period from the register (its own haircut, never the EBITDA's), contracted sources once in their period, rollover only under a registered assumption.
    const periodInputs = input.periods.map((period) => {
      const cfads = use("cfads", period.period);
      if (!cfads) uncovered.push({id: `cfads:${period.period}`, state: "insufficient_evidence", reason: `no CFADS registered for ${period.period}; the cover of that period is not measured and no figure is repeated from another period`});
      const sources = input.assumptions.filter((assumption) => assumption.role === "contracted_source" && assumption.period === period.period);
      for (const source of sources) { selectedKeys.add(source.key); parameters.push({role: "contracted_source", period: period.period, key: source.key, value: out(d(source.value)), origin: source.origin, rationale: source.rationale, anchor: source.anchor, evidence: source.evidence?.contract && source.evidence.disbursement ? {contract: source.evidence.contract, disbursement: source.evidence.disbursement} : null}); }
      const contracted = sources.reduce((sum, source) => sum.plus(source.value), d(0));
      const rolled = scenario.rolloverAllowed && rollover ? d(period.principal.value).times(rollover.value) : d(0);
      const used = cfads ? d(cfads.value).times(d(1).minus(cfadsHaircut ? cfadsHaircut.value : 0)) : null;
      const origins: Origin[] = [{origin: "base pública", key: `periods.${period.period}.principal`, anchor: period.principal.anchor}, ...(period.interest ? [{origin: "base pública", key: `periods.${period.period}.interest`, anchor: period.interest.anchor}] : []), ...originsOf(cfads, cfadsHaircut, ...sources, scenario.rolloverAllowed ? rollover : null)];
      return {period, cfads, used, contracted, rolled, origins};
    });
    // Each period's numbers rest on everything before them: the opening cash of the first, then every earlier period's inputs.
    const cashOrigins: Origin[] = [{origin: "base pública", key: "position.cashAndEquivalents", anchor: components.cashAndEquivalents.anchor}, {origin: "base pública", key: "position.financialInvestments", anchor: components.financialInvestments.anchor}];
    const cumulativeOrigins = periodInputs.map((_entry, index) => [...cashOrigins, ...periodInputs.slice(0, index + 1).flatMap((previous) => previous.origins)].filter((origin, position, all) => all.findIndex((other) => other.key === origin.key) === position));
    const measurable = periodInputs.every((entry) => entry.cfads !== null);
    let liquidity: ScenarioOutput["scenarios"][number]["results"]["liquidity"] = null;
    if (measurable) {
      // The shock delta is reported apart (above) and never spread over the periods: only the interest the ledger states enters the service.
      const rows = calculateLiquidityCoverage(periodInputs.map((entry, index) => ({period: entry.period.period, openingCash: index === 0 ? deductibleCash : d(0), cfads: entry.used!, contractedSources: entry.contracted.plus(entry.rolled), principal: entry.period.principal.value, interest: entry.period.interest ? entry.period.interest.value : 0})));
      rows.forEach((row, index) => {
        const entry = periodInputs[index]!;
        calculations.push({id: `financial.liquidity_coverage:${row.period}`, scenario: scenario.id, formula: `(openingCash + cfadsUsed + contractedSources + rolledPrincipal) / (principal${entry.period.interest ? " + interest" : ""})`, operands: {openingCash: row.openingCash, cfadsUsed: out(entry.used!), contractedSources: out(entry.contracted), rolledPrincipal: out(entry.rolled), debtService: row.debtService}, result: row.coverage ?? "n/a", unit: "x", origins: cumulativeOrigins[index]!});
      });
      const bases = periodInputs.map((entry) => (entry.period.interest ? "full_debt_service" as const : "principal_only" as const));
      liquidity = {basis: bases.every((basis) => basis === "full_debt_service") ? "full_debt_service" : bases.every((basis) => basis === "principal_only") ? "principal_only" : "mixed", rows: rows.map((row, index) => { const entry = periodInputs[index]!; return {period: row.period, basis: bases[index]!, principal: out(d(entry.period.principal.value)), interest: entry.period.interest ? out(d(entry.period.interest.value)) : null, cfads_declared: out(d(entry.cfads!.value)), cfads_used: out(entry.used!), cfads_haircut: cfadsHaircut ? cfadsHaircut.value : null, contracted_sources: out(entry.contracted), rolled_principal: out(entry.rolled), coverage: row.coverage, closing_cash: row.closingCash, deficit: row.deficit, origins: cumulativeOrigins[index]!}; })};
    }
    for (const period of input.periods) if (!period.interest) uncovered.push({id: `interest:${period.period}`, state: "insufficient_evidence", reason: `the ledger states no interest for ${period.period}; that period's cover is principal-only and the shock delta is reported apart, never spread over periods`});
    const state: "declared" | "partial" = uncovered.length > 0 ? "partial" : "declared";
    return {
      id: scenario.id, label: scenario.label, state, block_reasons: [], parameters,
      results: {
        pro_forma: {gross_debt: proForma.grossDebt, deductible_cash: proForma.unrestrictedCash, contractual_net_debt: out(contractualNetDebt), leverage: leverageValue && ebitda ? {value: leverageValue, precision: approximate ? "approximate_two_decimals" : "exact", precision_note: approximate ? `the EBITDA is implied from a reported index of two decimals; the leverage is about ${leverageValue}x, not a figure to eight decimals` : null, ebitda_definition: ebitda.definitionKey, ebitda_basis: ebitda.basis, comparability_by_instrument: ebitda.comparabilityByInstrument} : null, origins: proFormaOrigins},
        headroom, headroom_note: note, interest, liquidity,
      },
      caveat: caveatFor(state), uncovered_terms: uncovered,
    };
  });
  const register = input.assumptions.map((assumption) => ({key: assumption.key, role: assumption.role, period: assumption.period, value: out(d(assumption.value)), unit: assumption.unit, origin: assumption.origin, origin_rank: originRank[assumption.origin], rationale: assumption.rationale, as_of: assumption.asOf, anchor: assumption.anchor, evidence: assumption.evidence?.contract && assumption.evidence.disbursement ? {contract: assumption.evidence.contract, disbursement: assumption.evidence.disbursement} : null, confidence: assumption.confidence, selected: selectedKeys.has(assumption.key)}));
  const minimum = scenarios.filter((scenario) => ["base", "adverse", "no_rollover"].includes(scenario.id));
  const blockReasons = minimum.filter((scenario) => scenario.state === "blocked").map((scenario) => `${scenario.id}: ${scenario.block_reasons.join("; ")}`);
  const state: ScenarioOutput["state"] = blockReasons.length > 0 ? "blocked" : scenarios.some((scenario) => scenario.state === "partial") ? "partial" : "declared";
  const body = {schema_version: "method.declare-scenarios.v5" as const, reference_date: input.referenceDate, unit: input.unit, state, block_reasons: blockReasons, assumption_register: register, scenarios};
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
