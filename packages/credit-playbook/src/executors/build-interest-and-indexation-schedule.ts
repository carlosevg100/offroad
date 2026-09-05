import {createHash} from "node:crypto";

import {aggregateIndexedDebtSchedules, buildIndexedDebtSchedule, type IndexedDebtSchedule} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `build-interest-and-indexation-schedule`. Projects each series with
 * financial-core's indexed-debt engine, separating cash coupons from capitalized indexation, and
 * refuses to project a series whose terms or curve the base does not hold. A curve without a
 * registered source never enters; a series without a payment rule is projected under both
 * treatments and the difference is declared.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const rate = z.string().regex(/^-?\d+(\.\d+)?$/);
const anchorSchema = z.object({document: z.string().min(1), page: z.number().int().positive().optional(), note: z.string().optional(), clause: z.string().optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;

export const curveSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["IPCA", "CDI", "fixed"]),
  /** Effective rate per period for each period of the projection; the source and date are mandatory. */
  ratesByPeriod: z.record(z.string(), rate),
  source: z.object({title: z.string().min(1), url: z.string().optional(), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict(),
}).strict();

export const seriesInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  openingPrincipal: money,
  indexer: z.enum(["IPCA", "CDI", "fixed", "unknown"]),
  /** Coupon per period as a decimal rate (already converted to the period), or null when unknown. */
  couponRatePerPeriod: rate.nullable(),
  /** Whether indexation is paid in cash or capitalized; null when the indenture is not in the base. */
  indexationTreatment: z.enum(["cash_paid", "capitalized_principal"]).nullable(),
  couponTreatment: z.enum(["cash_paid", "capitalized_principal"]).default("cash_paid"),
  scheduledPrincipalByPeriod: z.record(z.string(), money).default({}),
  curveId: z.string().nullable(),
  anchors: z.object({balance: anchorSchema, terms: anchorSchema.optional()}).strict(),
}).strict();

export const interestScheduleInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().min(1),
  periods: z.array(z.string().min(1)).min(1),
  curves: z.array(curveSchema).default([]),
  series: z.array(seriesInputSchema).min(1),
  /** The finance expense of the last closed period, to bridge against; null when not in the base. */
  accountingInterestLastPeriod: z.object({value: money, period: z.string().min(1), anchor: anchorSchema}).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  for (const curve of input.curves) {
    if (ids.has(curve.id)) context.addIssue({code: "custom", path: ["curves"], message: `duplicate curve ${curve.id}`});
    ids.add(curve.id);
  }
});
export type InterestScheduleInput = z.input<typeof interestScheduleInputSchema>;

export type InterestScheduleOutput = {
  schemaVersion: "method.build-interest-and-indexation-schedule.v1";
  referenceDate: string;
  unit: string;
  state: "complete" | "partial" | "blocked";
  scheduleBySeries: Array<{
    seriesId: string; label: string; indexer: string; treatment: string; curveSource: {title: string; asOf: string} | null;
    rows: IndexedDebtSchedule["rows"]; totals: {cashDebtService: string; financeExpense: string; indexationCapitalized: string; couponCapitalized: string};
    variant: "as_contracted" | "if_capitalized" | "if_cash_paid";
    anchors: {balance: Anchor; terms: Anchor | null};
  }>;
  scheduleAggregate: {byPeriod: Array<{period: string; cashDebtService: string; financeExpense: string; indexationCapitalized: string; closingPrincipal: string}>; openingPrincipalProjected: string} | null;
  accountingBridge: {projected: string; accounting: string; difference: string; period: string; anchor: Anchor; state: "compared" | "insufficient_evidence"} | null;
  uncoveredSeries: Array<{seriesId: string; reason: string; state: "insufficient_evidence"}>;
  trace: {calculations: Array<{id: string; series: string; note: string}>; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function canonical(input: z.infer<typeof interestScheduleInputSchema>) {
  return {...input, curves: [...input.curves].sort((a, b) => a.id.localeCompare(b.id)), series: [...input.series].sort((a, b) => a.id.localeCompare(b.id))};
}

export function buildInterestAndIndexationSchedule(raw: InterestScheduleInput): InterestScheduleOutput {
  const input = canonical(interestScheduleInputSchema.parse(raw));
  const curves = new Map(input.curves.map((curve) => [curve.id, curve]));
  const calculations: InterestScheduleOutput["trace"]["calculations"] = [];
  const uncovered: InterestScheduleOutput["uncoveredSeries"] = [];
  const schedules: InterestScheduleOutput["scheduleBySeries"] = [];
  const coreSchedules: IndexedDebtSchedule[] = [];

  for (const series of input.series) {
    if (series.indexer === "unknown" || series.couponRatePerPeriod === null) {
      uncovered.push({seriesId: series.id, reason: `no source in the base states the indexer or the coupon of ${series.label}`, state: "insufficient_evidence"});
      continue;
    }
    const curve = series.curveId ? curves.get(series.curveId) ?? null : null;
    if (series.indexer !== "fixed" && !curve) {
      uncovered.push({seriesId: series.id, reason: `no registered curve for the ${series.indexer} indexation of ${series.label}; a curve without source and date does not enter`, state: "insufficient_evidence"});
      continue;
    }
    if (curve && input.periods.some((period) => curve.ratesByPeriod[period] === undefined)) {
      uncovered.push({seriesId: series.id, reason: `curve ${curve.id} does not cover every projected period`, state: "insufficient_evidence"});
      continue;
    }
    const treatments: Array<{treatment: "cash_paid" | "capitalized_principal"; variant: InterestScheduleOutput["scheduleBySeries"][number]["variant"]}> = series.indexer === "fixed"
      ? [{treatment: "cash_paid", variant: "as_contracted"}]
      : series.indexationTreatment
        ? [{treatment: series.indexationTreatment, variant: "as_contracted"}]
        : [{treatment: "capitalized_principal", variant: "if_capitalized"}, {treatment: "cash_paid", variant: "if_cash_paid"}];
    for (const {treatment, variant} of treatments) {
      const schedule = buildIndexedDebtSchedule({
        instrumentId: variant === "as_contracted" ? series.id : `${series.id}:${variant}`,
        openingPrincipal: series.openingPrincipal,
        indexer: series.indexer === "fixed" ? "none" : series.indexer,
        indexationTreatment: series.indexer === "fixed" ? "not_applicable" : treatment,
        couponTreatment: series.couponTreatment,
        couponBase: "indexed_principal",
        periods: input.periods.map((period) => ({
          period,
          indexationRate: series.indexer === "fixed" ? "0" : curve!.ratesByPeriod[period]!,
          couponRate: series.couponRatePerPeriod!,
          scheduledPrincipal: series.scheduledPrincipalByPeriod[period] ?? "0",
        })),
      });
      calculations.push({id: "financial.indexed_debt_schedule", series: schedule.instrumentId, note: `${series.indexer} ${treatment}, coupon ${series.couponRatePerPeriod} per period, curve ${curve?.id ?? "none"}`});
      if (variant !== "if_cash_paid") coreSchedules.push(schedule);
      schedules.push({
        seriesId: series.id, label: series.label, indexer: series.indexer, treatment, curveSource: curve ? {title: curve.source.title, asOf: curve.source.asOf} : null,
        rows: schedule.rows,
        totals: {cashDebtService: schedule.totalCashDebtService, financeExpense: schedule.totalFinanceExpense, indexationCapitalized: schedule.totalIndexationCapitalized, couponCapitalized: schedule.totalCouponCapitalized},
        variant, anchors: {balance: series.anchors.balance, terms: series.anchors.terms ?? null},
      });
    }
  }

  let scheduleAggregate: InterestScheduleOutput["scheduleAggregate"] = null;
  if (coreSchedules.length > 0) {
    const aggregate = aggregateIndexedDebtSchedules(coreSchedules) as unknown as {byPeriod?: Array<Record<string, string>>; rows?: Array<Record<string, string>>};
    calculations.push({id: "financial.indexed_debt_aggregation", series: "all", note: `${coreSchedules.length} schedules aggregated`});
    const rowsByPeriod = (aggregate.byPeriod ?? aggregate.rows ?? []) as Array<Record<string, string>>;
    const opening = coreSchedules.reduce((sum, schedule) => sum.plus(schedule.rows[0]?.openingPrincipal ?? 0), d(0));
    scheduleAggregate = {
      byPeriod: input.periods.map((period) => {
        const row = rowsByPeriod.find((entry) => entry.period === period);
        const sum = (key: keyof IndexedDebtSchedule["rows"][number]) => out(coreSchedules.reduce((total, schedule) => total.plus(schedule.rows.find((entry) => entry.period === period)?.[key] ?? 0), d(0)));
        return {period, cashDebtService: row?.cashDebtService ?? sum("cashDebtService"), financeExpense: row?.financeExpense ?? sum("financeExpense"), indexationCapitalized: row?.indexationCapitalized ?? sum("indexationCapitalized"), closingPrincipal: row?.closingPrincipal ?? sum("closingPrincipal")};
      }),
      openingPrincipalProjected: out(opening),
    };
  }

  let accountingBridge: InterestScheduleOutput["accountingBridge"] = null;
  if (input.accountingInterestLastPeriod) {
    const projected = scheduleAggregate?.byPeriod.find((row) => row.period === input.accountingInterestLastPeriod!.period)?.financeExpense ?? null;
    const complete = uncovered.length === 0 && projected !== null;
    accountingBridge = {
      projected: projected ?? "0",
      accounting: out(d(input.accountingInterestLastPeriod.value)),
      difference: projected ? out(d(projected).minus(input.accountingInterestLastPeriod.value)) : "0",
      period: input.accountingInterestLastPeriod.period,
      anchor: input.accountingInterestLastPeriod.anchor,
      state: complete ? "compared" : "insufficient_evidence",
    };
    if (complete) calculations.push({id: "financial.interest_expense_bridge", series: "all", note: "projected finance expense against the accounting expense of the last closed period"});
  }

  const state: InterestScheduleOutput["state"] = schedules.length === 0 ? "blocked" : uncovered.length > 0 ? "partial" : "complete";
  const body = {schemaVersion: "method.build-interest-and-indexation-schedule.v1" as const, referenceDate: input.referenceDate, unit: input.unit, state, scheduleBySeries: schedules, scheduleAggregate, accountingBridge, uncoveredSeries: uncovered};
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
