import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `diagnose-maturity-wall`. Reads the ledger's schedule, names the walls,
 * measures the cover of each period with the declared cash definition and generation, and keeps
 * unproven sources of payment out of the arithmetic. Contractual schedule and covenant scenario
 * are never added together.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const anchorSchema = z.object({document: z.string().min(1), page: z.number().int().positive().optional(), note: z.string().optional()}).strict();

export const maturityWallInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().min(1),
  grossDebt: money,
  periods: z.array(z.object({period: z.string().min(1), amount: money, priorAmount: money.nullable().default(null)}).strict()).min(1),
  scheduleAnchor: anchorSchema,
  cash: z.object({
    value: money,
    /** What the number means: the ledger never assumes day-zero liquidity from equivalents. */
    definition: z.enum(["accounting_equivalents_up_to_90_days", "day_zero_available", "contractual_net_debt_definition"]),
    anchor: anchorSchema,
  }).strict(),
  /** Last twelve months operating generation, when known; null keeps the cover cash-only. */
  operatingGeneration: z.object({value: money, basis: z.string().min(1), anchor: anchorSchema}).strict().nullable().default(null),
  /** Sources of payment mentioned in the file. Only contracted and disbursed ones count. */
  claimedSources: z.array(z.object({label: z.string().min(1), amount: money, proven: z.boolean(), anchor: anchorSchema}).strict()).default([]),
  /** Concentration above this share of gross debt in one period is a wall. Versioned policy; a default is a declared choice. */
  wallThresholdShare: money.default("0.20"),
}).strict();
export type MaturityWallInput = z.input<typeof maturityWallInputSchema>;

export type MaturityWallOutput = {
  schemaVersion: "method.diagnose-maturity-wall.v1";
  referenceDate: string;
  unit: string;
  walls: Array<{period: string; amount: string; shareOfGross: string; changeFromPrior: string | null; isWall: boolean}>;
  wallThresholdShare: string;
  coverage: {
    cashDefinition: string;
    cash: string;
    operatingGeneration: string | null;
    byPeriod: Array<{period: string; amount: string; coverByCash: string | null; coverByCashAndGeneration: string | null}>;
    caveat: string;
  };
  unprovenSources: Array<{label: string; amount: string; anchor: z.infer<typeof anchorSchema>}>;
  provenSources: Array<{label: string; amount: string; anchor: z.infer<typeof anchorSchema>}>;
  trace: {calculations: string[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function diagnoseMaturityWall(raw: MaturityWallInput): MaturityWallOutput {
  const input = maturityWallInputSchema.parse(raw);
  const gross = d(input.grossDebt);
  const threshold = d(input.wallThresholdShare);
  const walls = input.periods.map((period) => {
    const amount = d(period.amount);
    const share = gross.isZero() ? d(0) : amount.div(gross);
    return {
      period: period.period,
      amount: out(amount),
      shareOfGross: out(share),
      changeFromPrior: period.priorAmount === null ? null : out(amount.minus(period.priorAmount)),
      isWall: share.gte(threshold),
    };
  });
  const cash = d(input.cash.value);
  const generation = input.operatingGeneration ? d(input.operatingGeneration.value) : null;
  const byPeriod = input.periods.map((period) => {
    const amount = d(period.amount);
    const positive = amount.gt(0);
    return {
      period: period.period,
      amount: out(amount),
      coverByCash: positive ? out(cash.div(amount)) : null,
      coverByCashAndGeneration: positive && generation ? out(cash.plus(generation).div(amount)) : null,
    };
  });
  const caveat = input.cash.definition === "day_zero_available"
    ? "cash is stated as available on day zero"
    : input.cash.definition === "accounting_equivalents_up_to_90_days"
      ? "cash and equivalents are redeemable within up to 90 days under the accounting definition; this is not day-zero liquidity"
      : "cash follows the contractual net debt definition; availability for payment is not asserted";
  const body = {
    schemaVersion: "method.diagnose-maturity-wall.v1" as const,
    referenceDate: input.referenceDate,
    unit: input.unit,
    walls,
    wallThresholdShare: out(threshold),
    coverage: {cashDefinition: input.cash.definition, cash: out(cash), operatingGeneration: generation ? out(generation) : null, byPeriod, caveat},
    unprovenSources: input.claimedSources.filter((source) => !source.proven).map((source) => ({label: source.label, amount: out(d(source.amount)), anchor: source.anchor})),
    provenSources: input.claimedSources.filter((source) => source.proven).map((source) => ({label: source.label, amount: out(d(source.amount)), anchor: source.anchor})),
  };
  return {...body, trace: {calculations: ["financial.maturity_buckets", "financial.liquidity_coverage", "structure.maturity_concentration"], inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
