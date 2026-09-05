import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `estimate-exit-cost-by-series`. For each series an alternative wants to
 * retire on a date: is the exit permitted on that date, by which mechanism, under which premium
 * formula, and what does it cost with the quotes the base holds. A make-whole without its
 * reference quote is not estimated; it is named as insufficient evidence.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const rate = z.string().regex(/^-?\d+(\.\d+)?$/);
const anchorSchema = z.object({document: z.string().min(1), clause: z.string().optional(), page: z.number().int().positive().optional()}).strict();

export const exitRuleSchema = z.discriminatedUnion("mechanism", [
  z.object({
    mechanism: z.literal("flat_premium_pro_rata"),
    /** Premium per year, in percent, applied pro rata over the business days remaining to maturity (base 252). */
    premiumPerYearPercent: rate,
    businessDaysRemaining: z.number().int().nonnegative(),
    availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  z.object({
    mechanism: z.literal("make_whole"),
    referenceRate: z.enum(["NTN-B (ANBIMA indicative, nearest duration)", "B3 Pre x DI curve (nearest vertex to remaining duration)"]),
    /** Present value of the remaining flows at the reference quote, when the quote of the date is in the base; null otherwise. */
    presentValueAtReference: money.nullable(),
    accruedValue: money,
    availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  z.object({
    mechanism: z.literal("redemption_offer"),
    /** Premium set in the offer notice; negotiated, never below zero; null until an offer exists. */
    premiumPercent: rate.nullable(),
    requiresFullAdherence: z.boolean(),
    availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }).strict(),
]);

export const exitCostInputSchema = z.object({
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().min(1),
  series: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    principal: money,
    accruedInterest: money.default("0"),
    rule: exitRuleSchema,
    anchor: anchorSchema,
  }).strict()).min(1),
}).strict();
export type ExitCostInput = z.input<typeof exitCostInputSchema>;

export type ExitCostOutput = {
  schemaVersion: "method.estimate-exit-cost-by-series.v1";
  exitDate: string;
  unit: string;
  exitCosts: Array<{
    seriesId: string;
    label: string;
    permittedOnDate: boolean;
    availableFrom: string | null;
    mechanism: string;
    premium: string | null;
    totalPayable: string | null;
    state: "estimated" | "insufficient_evidence" | "not_permitted";
    reason: string | null;
    anchor: z.infer<typeof anchorSchema>;
  }>;
  totals: {estimatedPremium: string; estimatedPayable: string; seriesEstimated: number; seriesBlocked: number};
  trace: {calculations: string[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function estimateExitCostBySeries(raw: ExitCostInput): ExitCostOutput {
  const input = exitCostInputSchema.parse(raw);
  const exitCosts = [...input.series].sort((a, b) => a.id.localeCompare(b.id)).map((series) => {
    const rule = series.rule;
    const base = d(series.principal).plus(series.accruedInterest);
    const availableFrom = rule.mechanism === "redemption_offer" ? rule.availableFrom : rule.availableFrom;
    const permitted = availableFrom === null ? true : input.exitDate >= availableFrom;
    const common = {seriesId: series.id, label: series.label, permittedOnDate: permitted, availableFrom, mechanism: rule.mechanism, anchor: series.anchor};
    if (!permitted) return {...common, premium: null, totalPayable: null, state: "not_permitted" as const, reason: `exit is only permitted from ${availableFrom}`};
    if (rule.mechanism === "flat_premium_pro_rata") {
      const premium = base.mul(d(rule.premiumPerYearPercent).div(100)).mul(d(rule.businessDaysRemaining).div(252));
      return {...common, premium: out(premium), totalPayable: out(base.plus(premium)), state: "estimated" as const, reason: null};
    }
    if (rule.mechanism === "make_whole") {
      if (rule.presentValueAtReference === null) return {...common, premium: null, totalPayable: null, state: "insufficient_evidence" as const, reason: `make-whole needs the ${rule.referenceRate} quote of the exit date, which the base does not hold`};
      const accrued = d(rule.accruedValue);
      const present = d(rule.presentValueAtReference);
      const payable = Decimal.max(accrued, present);
      return {...common, premium: out(payable.minus(accrued)), totalPayable: out(payable), state: "estimated" as const, reason: null};
    }
    if (rule.premiumPercent === null) return {...common, premium: null, totalPayable: null, state: "insufficient_evidence" as const, reason: `redemption offer premium is negotiated in the notice${rule.requiresFullAdherence ? " and requires adherence of all holders" : ""}; no offer exists in the base`};
    const premium = base.mul(d(rule.premiumPercent).div(100));
    return {...common, premium: out(premium), totalPayable: out(base.plus(premium)), state: "estimated" as const, reason: rule.requiresFullAdherence ? "requires adherence of all holders of the series" : null};
  });
  const estimated = exitCosts.filter((entry) => entry.state === "estimated");
  const body = {
    schemaVersion: "method.estimate-exit-cost-by-series.v1" as const,
    exitDate: input.exitDate,
    unit: input.unit,
    exitCosts,
    totals: {
      estimatedPremium: out(estimated.reduce((sum, entry) => sum.plus(entry.premium ?? 0), d(0))),
      estimatedPayable: out(estimated.reduce((sum, entry) => sum.plus(entry.totalPayable ?? 0), d(0))),
      seriesEstimated: estimated.length,
      seriesBlocked: exitCosts.length - estimated.length,
    },
  };
  return {...body, trace: {calculations: ["structure.debt_service_schedule", "financial.weighted_average_life"], inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
