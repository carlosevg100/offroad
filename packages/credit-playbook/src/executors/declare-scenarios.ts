import {createHash} from "node:crypto";

import {applyRateShock, calculateLiquidityCoverage, calculateProFormaPosition} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `declare-scenarios`. When management data is missing, the work goes on
 * with declared scenarios: every parameter carries its origin in a fixed order of preference,
 * every scenario carries the sentence that says what it is and is not, and a parameter without
 * an origin does not exist. The minimum set is base, adverse and no-rollover.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const rate = z.string().regex(/^-?\d+(\.\d+)?$/);
const anchorSchema = z.object({document: z.string().min(1), page: z.number().int().positive().optional(), note: z.string().optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;

export const parameterOriginSchema = z.enum(["authorized_management_data", "public_announcement", "company_history", "versioned_benchmark", "user_range"]);
const originRank: Record<z.infer<typeof parameterOriginSchema>, number> = {authorized_management_data: 0, public_announcement: 1, company_history: 2, versioned_benchmark: 3, user_range: 4};

export const assumptionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  value: money,
  unit: z.string().min(1),
  origin: parameterOriginSchema,
  /** The value the origin states; the rationale is how it became this parameter. */
  rationale: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  anchor: anchorSchema,
  confidence: z.enum(["high", "medium", "low"]),
}).strict();

export const scenarioInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().min(1),
  /** Registered assumptions; scenarios may only use keys that exist here. */
  assumptions: z.array(assumptionSchema).min(1),
  position: z.object({grossDebt: money, unrestrictedCash: money, ltmEbitdaProxy: z.object({value: money, basis: z.string().min(1)}).strict().nullable(), averageDebtBalance: money, baseAnnualRate: rate, anchor: anchorSchema}).strict(),
  /** Debt service by period from the ledger, for the liquidity cover. */
  periods: z.array(z.object({period: z.string().min(1), principal: money, interest: money, cfadsKey: z.string().regex(/^[a-z][a-z0-9_.-]*$/)}).strict()).min(1),
  scenarios: z.array(z.object({
    id: z.enum(["base", "adverse", "no_rollover"]).or(z.string().regex(/^[a-z][a-z0-9_-]*$/)),
    label: z.string().min(1),
    rateShockKey: z.string().regex(/^[a-z][a-z0-9_.-]*$/).nullable().default(null),
    ebitdaHaircutKey: z.string().regex(/^[a-z][a-z0-9_.-]*$/).nullable().default(null),
    newDebtKey: z.string().regex(/^[a-z][a-z0-9_.-]*$/).nullable().default(null),
    refinancedDebtKey: z.string().regex(/^[a-z][a-z0-9_.-]*$/).nullable().default(null),
    /** Whether contracted rollover sources count; false models the no-rollover case. */
    rolloverAllowed: z.boolean().default(true),
  }).strict()).min(1),
}).strict().superRefine((input, context) => {
  const keys = new Set(input.assumptions.map((assumption) => assumption.key));
  for (const [index, scenario] of input.scenarios.entries()) {
    for (const field of ["rateShockKey", "ebitdaHaircutKey", "newDebtKey", "refinancedDebtKey"] as const) {
      const key = scenario[field];
      if (key && !keys.has(key)) context.addIssue({code: "custom", path: ["scenarios", index, field], message: `assumption ${key} is not registered; a parameter without an origin does not exist`});
    }
  }
  for (const [index, period] of input.periods.entries()) {
    if (!keys.has(period.cfadsKey)) context.addIssue({code: "custom", path: ["periods", index, "cfadsKey"], message: `assumption ${period.cfadsKey} is not registered`});
  }
  const ids = new Set(input.scenarios.map((scenario) => scenario.id));
  for (const required of ["base", "adverse", "no_rollover"]) if (!ids.has(required)) context.addIssue({code: "custom", path: ["scenarios"], message: `the minimum set needs a ${required} scenario`});
});
export type ScenarioInput = z.input<typeof scenarioInputSchema>;

export type ScenarioOutput = {
  schemaVersion: "method.declare-scenarios.v1";
  referenceDate: string;
  unit: string;
  assumptionRegister: Array<{key: string; value: string; unit: string; origin: string; originRank: number; rationale: string; asOf: string; anchor: Anchor; confidence: string}>;
  scenarios: Array<{
    id: string; label: string;
    parameters: Array<{role: string; key: string; value: string; origin: string}>;
    results: {proForma: {grossDebt: string; unrestrictedCash: string; netDebt: string; leverage: string | null}; interest: {base: string; stressed: string; delta: string} | null; liquidity: Array<{period: string; coverage: string | null; closingCash: string; deficit: string}>};
    caveat: string;
  }>;
  trace: {calculations: Array<{id: string; scenario: string; operands: Record<string, string>; result: string}>; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const originLabel: Record<string, string> = {
  authorized_management_data: "dado gerencial autorizado", public_announcement: "anúncio público", company_history: "histórico da companhia", versioned_benchmark: "benchmark versionado", user_range: "faixa dada pelo usuário",
};

function canonical(input: z.infer<typeof scenarioInputSchema>) {
  return {...input, assumptions: [...input.assumptions].sort((a, b) => a.key.localeCompare(b.key)), scenarios: [...input.scenarios].sort((a, b) => a.id.localeCompare(b.id)), periods: [...input.periods].sort((a, b) => a.period.localeCompare(b.period))};
}

export function declareScenarios(raw: ScenarioInput): ScenarioOutput {
  const input = canonical(scenarioInputSchema.parse(raw));
  const byKey = new Map(input.assumptions.map((assumption) => [assumption.key, assumption]));
  const calculations: ScenarioOutput["trace"]["calculations"] = [];
  const register = input.assumptions.map((assumption) => ({key: assumption.key, value: out(d(assumption.value)), unit: assumption.unit, origin: assumption.origin, originRank: originRank[assumption.origin], rationale: assumption.rationale, asOf: assumption.asOf, anchor: assumption.anchor, confidence: assumption.confidence}));

  const scenarios = input.scenarios.map((scenario) => {
    const parameters: ScenarioOutput["scenarios"][number]["parameters"] = [];
    const use = (role: string, key: string | null): Decimal | null => {
      if (!key) return null;
      const assumption = byKey.get(key)!;
      parameters.push({role, key, value: out(d(assumption.value)), origin: assumption.origin});
      return d(assumption.value);
    };
    const shock = use("rate_shock", scenario.rateShockKey);
    const haircut = use("ebitda_haircut", scenario.ebitdaHaircutKey);
    const newDebt = use("new_debt", scenario.newDebtKey) ?? d(0);
    const refinanced = use("refinanced_debt", scenario.refinancedDebtKey) ?? d(0);
    const ebitda = input.position.ltmEbitdaProxy ? d(input.position.ltmEbitdaProxy.value).mul(d(1).minus(haircut ?? 0)) : null;
    const proForma = calculateProFormaPosition({grossDebt: input.position.grossDebt, unrestrictedCash: input.position.unrestrictedCash, newDebt: out(newDebt), refinancedDebt: out(refinanced), feesPaidFromCash: "0", cashContribution: "0", ...(ebitda ? {adjustedEbitda: out(ebitda)} : {})});
    calculations.push({id: "operation.pro_forma_position", scenario: scenario.id, operands: {grossDebt: input.position.grossDebt, newDebt: out(newDebt), refinancedDebt: out(refinanced), ebitda: ebitda ? out(ebitda) : "n/a"}, result: proForma.netDebt});
    let interest: ScenarioOutput["scenarios"][number]["results"]["interest"] = null;
    if (shock !== null) {
      const shocked = applyRateShock({averageBalance: input.position.averageDebtBalance, baseRate: input.position.baseAnnualRate, shock: out(shock)});
      calculations.push({id: "financial.rate_shock", scenario: scenario.id, operands: {averageBalance: input.position.averageDebtBalance, baseRate: input.position.baseAnnualRate, shock: out(shock)}, result: shocked.delta});
      interest = {base: shocked.baseInterest, stressed: shocked.stressedInterest, delta: shocked.delta};
    }
    const liquidity = calculateLiquidityCoverage(input.periods.map((period, index) => {
      const cfads = use(`cfads:${period.period}`, period.cfadsKey)!.mul(d(1).minus(haircut ?? 0));
      const interestAdjusted = d(period.interest).plus(interest ? d(interest.delta).div(input.periods.length) : 0);
      return {period: period.period, openingCash: index === 0 ? out(d(input.position.unrestrictedCash)) : "0", cfads: out(cfads), contractedSources: scenario.rolloverAllowed ? out(refinanced) : "0", principal: period.principal, interest: out(interestAdjusted)};
    }));
    calculations.push({id: "financial.liquidity_coverage", scenario: scenario.id, operands: {periods: String(input.periods.length), rollover: String(scenario.rolloverAllowed)}, result: liquidity[liquidity.length - 1]?.closingCash ?? "0"});
    const origins = [...new Set(parameters.map((parameter) => originLabel[parameter.origin] ?? parameter.origin))];
    const caveat = `Cenário declarado a partir de ${origins.join(", ") || "nenhum parâmetro próprio"}; não é guidance da companhia e não afirma o que a companhia fará.`;
    return {
      id: scenario.id, label: scenario.label, parameters,
      results: {proForma, interest, liquidity: liquidity.map((row) => ({period: row.period, coverage: row.coverage, closingCash: row.closingCash, deficit: row.deficit}))},
      caveat,
    };
  });
  const body = {schemaVersion: "method.declare-scenarios.v1" as const, referenceDate: input.referenceDate, unit: input.unit, assumptionRegister: register, scenarios};
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
