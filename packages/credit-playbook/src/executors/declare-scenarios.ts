import {createHash} from "node:crypto";

import {aggregateDebtViews, applyRateShock, calculateLeverage, calculateLiquidityCoverage, calculateProFormaPosition} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `declare-scenarios` (v2, after the first independent review). When
 * management data is missing, the work goes on with declared scenarios: every parameter carries its
 * origin in a fixed order of preference and the executor itself picks, for each role, the best origin
 * the register offers; every scenario carries the sentence that says what it is and is not, and every
 * derived number carries the origins it rests on. A parameter without an origin does not exist; a
 * contracted source is used once, in its period; a refinancing is new debt replacing old debt, never
 * a subtraction; net debt follows the contractual components; the adverse scenario must shock
 * something and the no-rollover scenario must forbid rollover. Nothing is filled by default.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const key = z.string().regex(/^[a-z][a-z0-9_.-]*$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand", "ratio", "months"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const parameterOriginSchema = z.enum(["authorized_management_data", "public_announcement", "company_history", "versioned_benchmark", "user_range"]);
const originRank: Record<z.infer<typeof parameterOriginSchema>, number> = {authorized_management_data: 0, public_announcement: 1, company_history: 2, versioned_benchmark: 3, user_range: 4};
const originLabel: Record<string, string> = {authorized_management_data: "dado gerencial autorizado", public_announcement: "anúncio público", company_history: "histórico da companhia", versioned_benchmark: "benchmark versionado", user_range: "intervalo declarado pelo usuário"};

export const assumptionRoleSchema = z.enum(["cfads", "rate_shock", "ebitda_haircut", "new_debt", "refinanced_debt", "contracted_source", "rollover"]);

export const assumptionSchema = z.object({
  key,
  role: assumptionRoleSchema,
  /** The period the assumption applies to; null for a scalar that applies everywhere. */
  period: nonEmpty.nullable(),
  value: money,
  unit: unitSchema,
  origin: parameterOriginSchema,
  rationale: nonEmpty,
  asOf: isoDate,
  anchor: anchorSchema,
  confidence: z.enum(["high", "medium", "low"]),
  /** For a contracted source: the base must hold the contract and the disbursement, or the source is an approval, not a source. */
  evidence: z.object({contract: anchorSchema.nullable(), disbursement: anchorSchema.nullable()}).strict().nullable().default(null),
}).strict();

export const scenarioInputSchema = z.object({
  referenceDate: isoDate,
  unit: z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]),
  /** Registered assumptions; scenarios may only use keys that exist here, and the executor picks the best origin per role and period. */
  assumptions: z.array(assumptionSchema).min(1),
  position: z.object({
    /** Contractual net debt components at the reference date, each with its anchor. */
    components: z.object({
      grossDebt: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      derivativeLiabilities: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      derivativeAssets: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      cashAndEquivalents: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
      financialInvestments: z.object({value: nonNegative, anchor: anchorSchema}).strict(),
    }).strict(),
    /** The EBITDA the leverage is measured on, with the definition it follows and how it was derived. */
    ltmEbitda: z.object({value: nonNegative, definitionKey: nonEmpty, basis: z.enum(["company_opened", "implied_from_reported_index", "derived_proxy"]), anchor: anchorSchema}).strict().nullable(),
    averageDebtBalance: z.object({value: nonNegative, basis: nonEmpty, anchor: anchorSchema}).strict(),
    baseAnnualRate: z.object({value: nonNegative, basis: nonEmpty, anchor: anchorSchema}).strict(),
  }).strict(),
  /** Debt service by period from the ledger, for the liquidity cover. */
  periods: z.array(z.object({period: nonEmpty, principal: nonNegative, interest: nonNegative, anchor: anchorSchema}).strict()).min(1),
  scenarios: z.array(z.object({
    id: z.enum(["base", "adverse", "no_rollover"]).or(z.string().regex(/^[a-z][a-z0-9_-]*$/)),
    label: nonEmpty,
    /** Whether maturing principal is assumed rolled; the assumption itself must be registered under the role `rollover`. */
    rolloverAllowed: z.boolean(),
    usesRateShock: z.boolean().default(false),
    usesEbitdaHaircut: z.boolean().default(false),
    usesRefinancing: z.boolean().default(false),
  }).strict()).min(1),
}).strict().superRefine((input, context) => {
  const keys = new Set<string>();
  input.assumptions.forEach((assumption, index) => {
    if (keys.has(assumption.key)) context.addIssue({code: "custom", path: ["assumptions", index, "key"], message: `duplicate assumption ${assumption.key}`});
    keys.add(assumption.key);
    if (assumption.role === "contracted_source" && (!assumption.evidence || !assumption.evidence.contract || !assumption.evidence.disbursement)) context.addIssue({code: "custom", path: ["assumptions", index, "evidence"], message: `${assumption.key}: a contracted source needs its contract and its disbursement in the base; an approval is not a source`});
    if (assumption.role === "contracted_source" && assumption.period === null) context.addIssue({code: "custom", path: ["assumptions", index, "period"], message: `${assumption.key}: a contracted source belongs to one period and is used once`});
    if (assumption.role === "cfads" && assumption.period === null) context.addIssue({code: "custom", path: ["assumptions", index, "period"], message: `${assumption.key}: CFADS is declared per period`});
    if ((assumption.role === "rate_shock" || assumption.role === "ebitda_haircut") && assumption.unit !== "ratio") context.addIssue({code: "custom", path: ["assumptions", index, "unit"], message: `${assumption.key}: a shock or a haircut is a ratio`});
    if ((assumption.role === "cfads" || assumption.role === "new_debt" || assumption.role === "refinanced_debt" || assumption.role === "contracted_source") && assumption.unit !== input.unit) context.addIssue({code: "custom", path: ["assumptions", index, "unit"], message: `${assumption.key}: a monetary assumption must be in ${input.unit}`});
  });
  const periodIds = new Set<string>();
  input.periods.forEach((period, index) => {
    if (periodIds.has(period.period)) context.addIssue({code: "custom", path: ["periods", index], message: `duplicate period ${period.period}`});
    periodIds.add(period.period);
  });
  for (const assumption of input.assumptions) if (assumption.period !== null && !periodIds.has(assumption.period)) context.addIssue({code: "custom", path: ["assumptions"], message: `${assumption.key} names a period that is not projected`});
  const ids = new Set<string>();
  input.scenarios.forEach((scenario, index) => {
    if (ids.has(scenario.id)) context.addIssue({code: "custom", path: ["scenarios", index], message: `duplicate scenario ${scenario.id}`});
    ids.add(scenario.id);
    if (scenario.id === "adverse" && !scenario.usesRateShock && !scenario.usesEbitdaHaircut) context.addIssue({code: "custom", path: ["scenarios", index], message: "the adverse scenario must shock the rate or haircut the EBITDA; an adverse scenario with nothing adverse is a label"});
    if (scenario.id === "no_rollover" && scenario.rolloverAllowed) context.addIssue({code: "custom", path: ["scenarios", index], message: "the no-rollover scenario cannot allow rollover"});
  });
  for (const required of ["base", "adverse", "no_rollover"]) if (!ids.has(required)) context.addIssue({code: "custom", path: ["scenarios"], message: `the minimum set needs a ${required} scenario`});
});
export type ScenarioInput = z.input<typeof scenarioInputSchema>;

type Calculation = {id: string; scenario: string; formula: string; operands: Record<string, string>; result: string; unit: string; origins: string[]};
type Assumption = z.infer<typeof assumptionSchema>;

export type ScenarioOutput = {
  schema_version: "method.declare-scenarios.v2";
  reference_date: string;
  unit: string;
  state: "declared" | "blocked";
  block_reasons: string[];
  assumption_register: Array<{key: string; role: string; period: string | null; value: string; unit: string; origin: string; origin_rank: number; rationale: string; as_of: string; anchor: Anchor; confidence: string; selected: boolean}>;
  scenarios: Array<{
    id: string; label: string;
    parameters: Array<{role: string; period: string | null; key: string; value: string; origin: string; anchor: Anchor}>;
    results: {
      pro_forma: {gross_debt: string; unrestricted_cash: string; contractual_net_debt: string; leverage: string | null; ebitda_basis: string | null; origins: string[]};
      interest: {base: string; stressed: string; delta: string; origins: string[]} | null;
      liquidity: Array<{period: string; cfads: string; contracted_sources: string; coverage: string | null; closing_cash: string; deficit: string; origins: string[]}>;
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
  return {...input, assumptions: [...input.assumptions].sort((a, b) => compare(a.key, b.key)), scenarios: [...input.scenarios].sort((a, b) => compare(a.id, b.id)), periods: [...input.periods].sort((a, b) => compare(a.period, b.period))};
}

export function declareScenarios(raw: ScenarioInput): ScenarioOutput {
  const input = canonical(scenarioInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const blockReasons: string[] = [];
  const selectedKeys = new Set<string>();
  /** The best origin the register offers for a role and period: lowest rank, then highest confidence, then key. */
  const pick = (role: Assumption["role"], period: string | null): Assumption | null => {
    const candidates = input.assumptions.filter((assumption) => assumption.role === role && (assumption.period === period || (period !== null && assumption.period === null)));
    const confidenceRank = {high: 0, medium: 1, low: 2};
    const best = [...candidates].sort((a, b) => originRank[a.origin] - originRank[b.origin] || confidenceRank[a.confidence] - confidenceRank[b.confidence] || compare(a.key, b.key))[0] ?? null;
    if (best) selectedKeys.add(best.key);
    return best;
  };
  const components = input.position.components;
  const views = aggregateDebtViews({rows: [{id: "gross_debt", principal: components.grossDebt.value, covenantIncluded: true}, {id: "derivative_liabilities", principal: components.derivativeLiabilities.value, covenantIncluded: true}], cash: d(components.cashAndEquivalents.value).plus(components.financialInvestments.value).plus(components.derivativeAssets.value)});
  const openingNetDebt = d(views.netFinancialDebt);
  calculations.push({id: "financial.debt_views:contractual", scenario: "all", formula: "grossDebt + derivativeLiabilities - cashAndEquivalents - financialInvestments - derivativeAssets", operands: {grossDebt: components.grossDebt.value, derivativeLiabilities: components.derivativeLiabilities.value, cashAndEquivalents: components.cashAndEquivalents.value, financialInvestments: components.financialInvestments.value, derivativeAssets: components.derivativeAssets.value}, result: views.netFinancialDebt, unit: input.unit, origins: ["base pública"]});

  const scenarios = input.scenarios.map((scenario): ScenarioOutput["scenarios"][number] => {
    const parameters: ScenarioOutput["scenarios"][number]["parameters"] = [];
    const uncovered: ScenarioOutput["scenarios"][number]["uncovered_terms"] = [];
    const use = (role: Assumption["role"], period: string | null): Assumption | null => {
      const assumption = pick(role, period);
      if (assumption) parameters.push({role, period, key: assumption.key, value: out(d(assumption.value)), origin: assumption.origin, anchor: assumption.anchor});
      return assumption;
    };
    const originsOf = (...items: Array<Assumption | null>) => [...new Set(items.filter((item): item is Assumption => item !== null).map((item) => originLabel[item.origin] ?? item.origin))].sort(compare);
    const rollover = use("rollover", null);
    if (scenario.rolloverAllowed && !rollover) uncovered.push({id: "rollover", state: "insufficient_evidence", reason: "the scenario assumes rollover of maturing principal but no rollover assumption is registered with an origin"});
    const shock = scenario.usesRateShock ? use("rate_shock", null) : null;
    if (scenario.usesRateShock && !shock) uncovered.push({id: "rate_shock", state: "insufficient_evidence", reason: "the scenario declares a rate shock but none is registered"});
    const haircut = scenario.usesEbitdaHaircut ? use("ebitda_haircut", null) : null;
    if (scenario.usesEbitdaHaircut && !haircut) uncovered.push({id: "ebitda_haircut", state: "insufficient_evidence", reason: "the scenario declares an EBITDA haircut but none is registered"});
    const newDebt = scenario.usesRefinancing ? use("new_debt", null) : null;
    const refinanced = scenario.usesRefinancing ? use("refinanced_debt", null) : null;
    if (scenario.usesRefinancing && (!newDebt || !refinanced)) uncovered.push({id: "refinancing", state: "insufficient_evidence", reason: "a refinancing is new debt replacing old debt; both amounts must be registered, and a subtraction alone is not a refinancing"});
    const refinancingValid = newDebt !== null && refinanced !== null;

    // Pro forma through financial-core, on the contractual net debt.
    const ebitdaBase = input.position.ltmEbitda ? d(input.position.ltmEbitda.value).times(d(1).minus(haircut ? haircut.value : 0)) : null;
    const proForma = calculateProFormaPosition({grossDebt: components.grossDebt.value, unrestrictedCash: d(components.cashAndEquivalents.value).plus(components.financialInvestments.value).toFixed(), newDebt: refinancingValid ? newDebt!.value : "0", refinancedDebt: refinancingValid ? refinanced!.value : "0", feesPaidFromCash: "0", cashContribution: "0"});
    const contractualNetDebt = d(proForma.grossDebt).plus(components.derivativeLiabilities.value).minus(components.derivativeAssets.value).minus(proForma.unrestrictedCash);
    const leverage = ebitdaBase && ebitdaBase.gt(0) ? calculateLeverage(out(contractualNetDebt), out(ebitdaBase)).value : null;
    const proFormaOrigins = ["base pública", ...originsOf(newDebt, refinanced, haircut)];
    calculations.push({id: "operation.pro_forma_position", scenario: scenario.id, formula: "grossDebt + newDebt - refinancedDebt ; contractual net debt with derivatives ; leverage = net debt / EBITDA (1 - haircut)", operands: {grossDebt: components.grossDebt.value, newDebt: refinancingValid ? newDebt!.value : "0", refinancedDebt: refinancingValid ? refinanced!.value : "0", ebitda: ebitdaBase ? out(ebitdaBase) : "insufficient_evidence", haircut: haircut ? haircut.value : "0"}, result: out(contractualNetDebt), unit: input.unit, origins: proFormaOrigins});
    if (!input.position.ltmEbitda) uncovered.push({id: "leverage", state: "insufficient_evidence", reason: "no EBITDA with a definition in the base; leverage is not measured"});

    let interest: ScenarioOutput["scenarios"][number]["results"]["interest"] = null;
    if (shock) {
      const shocked = applyRateShock({averageBalance: input.position.averageDebtBalance.value, baseRate: input.position.baseAnnualRate.value, shock: shock.value});
      calculations.push({id: "financial.rate_shock", scenario: scenario.id, formula: "averageBalance * (baseRate + shock) - averageBalance * baseRate", operands: {averageBalance: input.position.averageDebtBalance.value, baseRate: input.position.baseAnnualRate.value, shock: shock.value}, result: shocked.delta, unit: input.unit, origins: [input.position.averageDebtBalance.basis, ...originsOf(shock)]});
      interest = {base: shocked.baseInterest, stressed: shocked.stressedInterest, delta: shocked.delta, origins: [input.position.averageDebtBalance.basis, ...originsOf(shock)]};
    }

    // Liquidity: CFADS per period from the register, contracted sources used once in their own period, rollover only under a registered assumption.
    const periodInputs = input.periods.map((period) => {
      const cfads = use("cfads", period.period);
      if (!cfads) uncovered.push({id: `cfads:${period.period}`, state: "insufficient_evidence", reason: `no CFADS registered for ${period.period}; the cover of that period is not measured`});
      const sources = input.assumptions.filter((assumption) => assumption.role === "contracted_source" && assumption.period === period.period);
      for (const source of sources) { selectedKeys.add(source.key); parameters.push({role: "contracted_source", period: period.period, key: source.key, value: out(d(source.value)), origin: source.origin, anchor: source.anchor}); }
      const contracted = sources.reduce((sum, source) => sum.plus(source.value), d(0)).plus(scenario.rolloverAllowed && rollover ? d(period.principal).times(rollover.value) : 0);
      return {period, cfads, contracted, origins: originsOf(cfads, ...sources, scenario.rolloverAllowed ? rollover : null)};
    });
    const measurable = periodInputs.filter((entry) => entry.cfads !== null);
    const liquidity = measurable.length === input.periods.length
      ? calculateLiquidityCoverage(periodInputs.map((entry, index) => ({period: entry.period.period, openingCash: index === 0 ? d(components.cashAndEquivalents.value).plus(components.financialInvestments.value) : d(0), cfads: d(entry.cfads!.value).times(d(1).minus(haircut ? haircut.value : 0)), contractedSources: entry.contracted, principal: entry.period.principal, interest: d(entry.period.interest).plus(interest ? d(interest.delta).div(input.periods.length) : 0)})))
      : [];
    for (const row of liquidity) calculations.push({id: `financial.liquidity_coverage:${row.period}`, scenario: scenario.id, formula: "(openingCash + cfads + contractedSources) / (principal + interest)", operands: {openingCash: row.openingCash, sources: row.sources, debtService: row.debtService}, result: row.coverage ?? "n/a", unit: "x", origins: periodInputs.find((entry) => entry.period.period === row.period)!.origins});
    const origins = [...new Set(parameters.map((parameter) => originLabel[parameter.origin] ?? parameter.origin))].sort(compare);
    const caveat = `Cenário declarado a partir de ${origins.join(", ") || "nenhum parâmetro próprio"}; não é guidance da companhia e não afirma o que a companhia fará; cada número acima carrega as origens de que depende.`;
    return {
      id: scenario.id, label: scenario.label, parameters,
      results: {
        pro_forma: {gross_debt: proForma.grossDebt, unrestricted_cash: proForma.unrestrictedCash, contractual_net_debt: out(contractualNetDebt), leverage, ebitda_basis: input.position.ltmEbitda ? `${input.position.ltmEbitda.definitionKey} (${input.position.ltmEbitda.basis})` : null, origins: proFormaOrigins},
        interest,
        liquidity: liquidity.map((row) => ({period: row.period, cfads: periodInputs.find((entry) => entry.period.period === row.period)!.cfads!.value, contracted_sources: out(periodInputs.find((entry) => entry.period.period === row.period)!.contracted), coverage: row.coverage, closing_cash: row.closingCash, deficit: row.deficit, origins: periodInputs.find((entry) => entry.period.period === row.period)!.origins})),
      },
      caveat, uncovered_terms: uncovered,
    };
  });
  const register = input.assumptions.map((assumption) => ({key: assumption.key, role: assumption.role, period: assumption.period, value: out(d(assumption.value)), unit: assumption.unit, origin: assumption.origin, origin_rank: originRank[assumption.origin], rationale: assumption.rationale, as_of: assumption.asOf, anchor: assumption.anchor, confidence: assumption.confidence, selected: selectedKeys.has(assumption.key)}));
  const state: ScenarioOutput["state"] = blockReasons.length > 0 ? "blocked" : "declared";
  const body = {schema_version: "method.declare-scenarios.v2" as const, reference_date: input.referenceDate, unit: input.unit, state, block_reasons: blockReasons, assumption_register: register, scenarios};
  const inputFingerprint = fingerprint(input);
  void openingNetDebt;
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
