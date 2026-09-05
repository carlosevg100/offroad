import {createHash} from "node:crypto";

import {businessDayAccrual, diPercentAccrual} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `build-interest-and-indexation-schedule` (v2, after the first independent
 * review). Projects each series period by period with the factors the indentures write: an annual
 * rate accrues exponentially over the period's business days of a 252-day year; a DI series compounds
 * the DI factor with the spread factor; a "p% of DI" series compounds p times the daily DI; an IPCA
 * series updates the nominal by the curve and accrues its spread on the updated nominal. Coupons are
 * paid in cash only in the period that holds a payment date; until then they accrue. Nothing is
 * assumed: a series without terms, payment dates or a matching curve is named as a gap; an
 * amortization schedule that is not in the base leaves the principal projection insufficient; a
 * curve dated elsewhere than the reference date is declared as an assumption. Every factor and
 * amount comes from financial-core or from a traced Decimal operation.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const rate = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const projectionPeriodSchema = z.object({
  id: nonEmpty,
  start: isoDate,
  end: isoDate,
  /** Business days of the period, from the calendar the base cites (holidays included). */
  businessDays: z.number().int().nonnegative(),
  anchor: anchorSchema,
}).strict();

export const curveSchema = z.object({
  id: nonEmpty,
  kind: z.enum(["CDI", "IPCA"]),
  /** Annual effective rate applying to each period, as a decimal; the source, its date and anchor are mandatory. */
  annualRateByPeriod: z.record(nonEmpty, rate),
  source: z.object({title: nonEmpty, url: z.string().optional(), asOf: isoDate, anchor: anchorSchema}).strict(),
}).strict();

export const seriesRemunerationSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("spread_over_index"), spreadPerYear: rate}).strict(),
  z.object({type: z.literal("percent_of_index"), percentOfIndex: nonNegative}).strict(),
  z.object({type: z.literal("fixed"), ratePerYear: rate}).strict(),
]);

export const seriesInputSchema = z.object({
  id: nonEmpty,
  label: nonEmpty,
  openingPrincipal: nonNegative,
  indexer: z.enum(["CDI", "IPCA", "fixed", "unknown"]),
  /** Null when the base does not state the remuneration; the series is then a named gap. */
  remuneration: seriesRemunerationSchema.nullable(),
  /** Coupon payment dates inside or beyond the projection; null when the base does not state them. */
  couponDates: z.array(isoDate).nullable(),
  /** Scheduled principal payments; null when the base has no amortization schedule for the series. */
  amortization: z.array(z.object({date: isoDate, amount: nonNegative}).strict()).nullable(),
  /** How indexation is treated; null when the indenture is not in the base (IPCA only). */
  indexationTreatment: z.enum(["capitalized_principal", "cash_paid"]).nullable(),
  curveId: nonEmpty.nullable(),
  anchors: z.object({balance: anchorSchema, terms: anchorSchema.nullable(), payments: anchorSchema.nullable(), amortization: anchorSchema.nullable()}).strict(),
}).strict();

export const interestScheduleInputSchema = z.object({
  referenceDate: isoDate,
  unit: unitSchema,
  periods: z.array(projectionPeriodSchema).min(1),
  curves: z.array(curveSchema).default([]),
  series: z.array(seriesInputSchema).min(1),
  /** The finance expense of the last closed period, to bridge against; null when not in the base. */
  accountingInterestLastPeriod: z.object({value: money, periodId: nonEmpty, anchor: anchorSchema}).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  const periodIds = new Set<string>();
  const sorted = [...input.periods].sort((a, b) => compare(a.start, b.start));
  sorted.forEach((period, index) => {
    if (periodIds.has(period.id)) context.addIssue({code: "custom", path: ["periods"], message: `duplicate period ${period.id}`});
    periodIds.add(period.id);
    if (period.end <= period.start) context.addIssue({code: "custom", path: ["periods", index], message: `period ${period.id} ends before it starts`});
    if (index > 0 && sorted[index - 1]!.end !== period.start) context.addIssue({code: "custom", path: ["periods", index], message: `period ${period.id} does not start where ${sorted[index - 1]!.id} ends`});
  });
  if (sorted[0] && sorted[0].start !== input.referenceDate) context.addIssue({code: "custom", path: ["periods", 0], message: "the first period must start at the reference date"});
  const curveIds = new Set<string>();
  for (const curve of input.curves) {
    if (curveIds.has(curve.id)) context.addIssue({code: "custom", path: ["curves"], message: `duplicate curve ${curve.id}`});
    curveIds.add(curve.id);
  }
  const seriesIds = new Set<string>();
  for (const series of input.series) {
    if (seriesIds.has(series.id)) context.addIssue({code: "custom", path: ["series"], message: `duplicate series ${series.id}`});
    seriesIds.add(series.id);
  }
});
export type InterestScheduleInput = z.input<typeof interestScheduleInputSchema>;

type Calculation = {id: string; formula: string; operands: Record<string, string>; result: string; unit: string};
type Row = {
  period: string; opening_principal: string; indexation_factor: string; indexation_accrued: string; indexation_capitalized: string; indexation_paid: string;
  coupon_factor: string; coupon_accrued: string; coupon_paid: string; coupon_carried: string; principal_paid: string | null; closing_principal: string;
};

export type InterestScheduleOutput = {
  schema_version: "method.build-interest-and-indexation-schedule.v2";
  reference_date: string;
  unit: string;
  state: "complete" | "partial" | "blocked";
  block_reasons: string[];
  assumptions: string[];
  schedule_by_series: Array<{
    series_id: string; label: string; indexer: string; remuneration: string; curve: {id: string; asOf: string} | null;
    principal_projection: "scheduled" | "insufficient_evidence";
    rows: Row[];
    totals: {cash_interest: string; indexation_capitalized: string; principal_paid: string};
    anchors: {balance: Anchor; terms: Anchor | null; payments: Anchor | null; amortization: Anchor | null};
  }>;
  schedule_aggregate: {
    by_period: Array<{period: string; cash_interest: string; indexation_capitalized: string; principal_paid: string; closing_principal: string}>;
    by_indexer: Array<{indexer: string; cash_interest: string; indexation_capitalized: string; closing_principal: string; series: string[]}>;
    opening_principal_projected: string;
  } | null;
  accounting_bridge: {projected: string | null; accounting: string; difference: string | null; period: string; anchor: Anchor; state: "compared" | "insufficient_evidence"; reason: string | null} | null;
  uncovered_series: Array<{series_id: string; reason: string; state: "insufficient_evidence"}>;
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

function canonical(input: z.infer<typeof interestScheduleInputSchema>) {
  return {
    ...input,
    periods: [...input.periods].sort((a, b) => compare(a.start, b.start)),
    curves: [...input.curves].sort((a, b) => compare(a.id, b.id)),
    series: [...input.series].sort((a, b) => compare(a.id, b.id)).map((series) => ({...series, couponDates: series.couponDates ? [...series.couponDates].sort(compare) : null, amortization: series.amortization ? [...series.amortization].sort((a, b) => compare(a.date, b.date) || compare(a.amount, b.amount)) : null})),
  };
}

const describeRemuneration = (series: z.infer<typeof seriesInputSchema>) => {
  const remuneration = series.remuneration!;
  if (remuneration.type === "fixed") return `fixed ${remuneration.ratePerYear} per year`;
  if (remuneration.type === "percent_of_index") return `${remuneration.percentOfIndex} of ${series.indexer}`;
  return `${series.indexer} + ${remuneration.spreadPerYear} per year`;
};

export function buildInterestAndIndexationSchedule(raw: InterestScheduleInput): InterestScheduleOutput {
  const input = canonical(interestScheduleInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const curves = new Map(input.curves.map((curve) => [curve.id, curve]));
  const uncovered: InterestScheduleOutput["uncovered_series"] = [];
  const assumptions = new Set<string>();
  const blockReasons: string[] = [];
  const schedules: InterestScheduleOutput["schedule_by_series"] = [];
  const inPeriod = (date: string, period: {start: string; end: string}) => date > period.start && date <= period.end;

  for (const series of input.series) {
    if (series.indexer === "unknown" || series.remuneration === null) { uncovered.push({series_id: series.id, reason: `no source in the base states the indexer or the remuneration of ${series.label}`, state: "insufficient_evidence"}); continue; }
    if (!series.anchors.terms) { uncovered.push({series_id: series.id, reason: `the terms of ${series.label} carry no anchor; a term without a source is not a term`, state: "insufficient_evidence"}); continue; }
    if (series.couponDates === null || !series.anchors.payments) { uncovered.push({series_id: series.id, reason: `the payment dates of ${series.label} are not in the base; coupons cannot be placed in time`, state: "insufficient_evidence"}); continue; }
    if ((series.indexer === "CDI" && series.remuneration.type === "fixed") || (series.indexer === "fixed" && series.remuneration.type !== "fixed") || (series.indexer === "IPCA" && series.remuneration.type !== "spread_over_index")) {
      uncovered.push({series_id: series.id, reason: `the remuneration type of ${series.label} (${series.remuneration.type}) does not match its indexer (${series.indexer})`, state: "insufficient_evidence"}); continue;
    }
    const curve = series.curveId ? curves.get(series.curveId) ?? null : null;
    if (series.indexer !== "fixed") {
      if (!curve) { uncovered.push({series_id: series.id, reason: `no registered curve for the ${series.indexer} of ${series.label}; a curve without source and date does not enter`, state: "insufficient_evidence"}); continue; }
      if (curve.kind !== series.indexer) { uncovered.push({series_id: series.id, reason: `curve ${curve.id} is a ${curve.kind} curve and ${series.label} is indexed to ${series.indexer}`, state: "insufficient_evidence"}); continue; }
      if (input.periods.some((period) => curve.annualRateByPeriod[period.id] === undefined)) { uncovered.push({series_id: series.id, reason: `curve ${curve.id} does not cover every projected period`, state: "insufficient_evidence"}); continue; }
      if (curve.source.asOf !== input.referenceDate) assumptions.add(`curve ${curve.id} is dated ${curve.source.asOf}, not the reference date ${input.referenceDate}: the projection uses it as the base scenario and does not call it the curve of the reference date`);
      if (series.indexer === "IPCA") assumptions.add(`IPCA indexation is accrued pro rata by business days from the annual implied inflation of the curve, without the monthly lag of the indenture (declared approximation)`);
    }
    if (series.indexer === "IPCA" && series.indexationTreatment === null) { uncovered.push({series_id: series.id, reason: `the indenture's treatment of the IPCA update (capitalized or paid) is not in the base for ${series.label}`, state: "insufficient_evidence"}); continue; }
    const principalProjection: "scheduled" | "insufficient_evidence" = series.amortization && series.anchors.amortization ? "scheduled" : "insufficient_evidence";

    let principal = d(series.openingPrincipal);
    let carried = d(0);
    let cashInterest = d(0);
    let capitalized = d(0);
    let principalPaid = d(0);
    const rows: Row[] = [];
    for (const period of input.periods) {
      const opening = principal;
      // 1. Indexation of the nominal (IPCA only), from the curve's annual rate over the period's business days.
      let indexationFactor = d(0);
      if (series.indexer === "IPCA") {
        const accrual = businessDayAccrual(curve!.annualRateByPeriod[period.id]!, period.businessDays);
        indexationFactor = d(accrual.value);
        record({id: `financial.business_day_accrual:${series.id}:${period.id}:indexation`, formula: "(1 + annualRate)^(businessDays/252) - 1", operands: {annualRate: curve!.annualRateByPeriod[period.id]!, businessDays: String(period.businessDays)}, result: accrual.value}, "x");
      }
      const indexationAccrued = principal.times(indexationFactor);
      const indexationCapitalized = series.indexationTreatment === "cash_paid" ? d(0) : indexationAccrued;
      const indexationPaid = series.indexationTreatment === "cash_paid" ? indexationAccrued : d(0);
      principal = principal.plus(indexationCapitalized);
      // 2. Coupon accrual on the updated nominal plus what is already accrued (the factors compound until the payment date).
      let couponFactor: Decimal;
      const remuneration = series.remuneration;
      if (remuneration.type === "fixed") {
        const accrual = businessDayAccrual(remuneration.ratePerYear, period.businessDays);
        couponFactor = d(accrual.value);
        record({id: `financial.business_day_accrual:${series.id}:${period.id}:coupon`, formula: "(1 + ratePerYear)^(businessDays/252) - 1", operands: {ratePerYear: remuneration.ratePerYear, businessDays: String(period.businessDays)}, result: accrual.value}, "x");
      } else if (remuneration.type === "percent_of_index") {
        const accrual = diPercentAccrual(curve!.annualRateByPeriod[period.id]!, remuneration.percentOfIndex, period.businessDays);
        couponFactor = d(accrual.value);
        record({id: `financial.di_percent_accrual:${series.id}:${period.id}`, formula: "(1 + ((1 + DI)^(1/252) - 1) * p)^businessDays - 1", operands: {annualDi: curve!.annualRateByPeriod[period.id]!, percentOfIndex: remuneration.percentOfIndex, businessDays: String(period.businessDays)}, result: accrual.value}, "x");
      } else if (series.indexer === "CDI") {
        const di = businessDayAccrual(curve!.annualRateByPeriod[period.id]!, period.businessDays);
        const spread = businessDayAccrual(remuneration.spreadPerYear, period.businessDays);
        couponFactor = d(di.value).plus(1).times(d(spread.value).plus(1)).minus(1);
        record({id: `financial.di_spread_factor:${series.id}:${period.id}`, formula: "(1 + fatorDI) * (1 + fatorSpread) - 1", operands: {fatorDI: di.value, fatorSpread: spread.value, annualDi: curve!.annualRateByPeriod[period.id]!, spreadPerYear: remuneration.spreadPerYear, businessDays: String(period.businessDays)}, result: out(couponFactor)}, "x");
      } else {
        const spread = businessDayAccrual(remuneration.spreadPerYear, period.businessDays);
        couponFactor = d(spread.value);
        record({id: `financial.business_day_accrual:${series.id}:${period.id}:coupon`, formula: "(1 + spreadPerYear)^(businessDays/252) - 1", operands: {spreadPerYear: remuneration.spreadPerYear, businessDays: String(period.businessDays)}, result: spread.value}, "x");
      }
      const couponAccrued = principal.plus(carried).times(couponFactor);
      carried = carried.plus(couponAccrued);
      // 3. Cash only on a payment date inside the period.
      const pays = series.couponDates.some((date) => inPeriod(date, period));
      const couponPaid = pays ? carried.plus(indexationPaid) : indexationPaid;
      if (pays) carried = d(0);
      // 4. Scheduled principal on its dates, when the base holds the schedule.
      let paid: Decimal | null = null;
      if (principalProjection === "scheduled") {
        paid = series.amortization!.filter((entry) => inPeriod(entry.date, period)).reduce((sum, entry) => sum.plus(entry.amount), d(0));
        if (paid.gt(principal)) paid = principal;
        principal = principal.minus(paid);
      }
      record({id: `financial.indexed_debt_schedule:${series.id}:${period.id}`, formula: "closing = opening + indexationCapitalized - principalPaid ; couponPaid = carried accrual on a payment date", operands: {opening: out(opening), indexationCapitalized: out(indexationCapitalized), couponAccrued: out(couponAccrued), couponPaid: out(couponPaid), principalPaid: paid ? out(paid) : "insufficient_evidence"}, result: out(principal)});
      cashInterest = cashInterest.plus(couponPaid);
      capitalized = capitalized.plus(indexationCapitalized);
      principalPaid = principalPaid.plus(paid ?? 0);
      rows.push({period: period.id, opening_principal: out(opening), indexation_factor: out(indexationFactor), indexation_accrued: out(indexationAccrued), indexation_capitalized: out(indexationCapitalized), indexation_paid: out(indexationPaid), coupon_factor: out(couponFactor), coupon_accrued: out(couponAccrued), coupon_paid: out(couponPaid), coupon_carried: out(carried), principal_paid: paid ? out(paid) : null, closing_principal: out(principal)});
    }
    schedules.push({series_id: series.id, label: series.label, indexer: series.indexer, remuneration: describeRemuneration(series), curve: curve ? {id: curve.id, asOf: curve.source.asOf} : null, principal_projection: principalProjection, rows, totals: {cash_interest: out(cashInterest), indexation_capitalized: out(capitalized), principal_paid: out(principalPaid)}, anchors: series.anchors});
  }

  let aggregate: InterestScheduleOutput["schedule_aggregate"] = null;
  if (schedules.length > 0) {
    const sumRows = (predicate: (schedule: InterestScheduleOutput["schedule_by_series"][number]) => boolean, key: keyof Row, period?: string) => out(schedules.filter(predicate).reduce((total, schedule) => total.plus(schedule.rows.filter((row) => !period || row.period === period).reduce((sum, row) => sum.plus(row[key] ?? 0), d(0))), d(0)));
    const last = (predicate: (schedule: InterestScheduleOutput["schedule_by_series"][number]) => boolean, period?: string) => out(schedules.filter(predicate).reduce((total, schedule) => total.plus((period ? schedule.rows.find((row) => row.period === period) : schedule.rows[schedule.rows.length - 1])?.closing_principal ?? 0), d(0)));
    aggregate = {
      by_period: input.periods.map((period) => ({period: period.id, cash_interest: sumRows(() => true, "coupon_paid", period.id), indexation_capitalized: sumRows(() => true, "indexation_capitalized", period.id), principal_paid: sumRows(() => true, "principal_paid", period.id), closing_principal: last(() => true, period.id)})),
      by_indexer: [...new Set(schedules.map((schedule) => schedule.indexer))].sort(compare).map((indexer) => ({indexer, cash_interest: sumRows((schedule) => schedule.indexer === indexer, "coupon_paid"), indexation_capitalized: sumRows((schedule) => schedule.indexer === indexer, "indexation_capitalized"), closing_principal: last((schedule) => schedule.indexer === indexer), series: schedules.filter((schedule) => schedule.indexer === indexer).map((schedule) => schedule.series_id)})),
      opening_principal_projected: out(schedules.reduce((sum, schedule) => sum.plus(schedule.rows[0]?.opening_principal ?? 0), d(0))),
    };
    record({id: "financial.indexed_debt_aggregation", formula: "sum over series by period and by indexer", operands: {series: String(schedules.length)}, result: aggregate.opening_principal_projected});
  } else {
    blockReasons.push("no series could be projected: every series lacks terms, payment dates or a matching curve");
  }

  let bridge: InterestScheduleOutput["accounting_bridge"] = null;
  if (input.accountingInterestLastPeriod) {
    const period = input.accountingInterestLastPeriod.periodId;
    const projectedRow = aggregate?.by_period.find((row) => row.period === period) ?? null;
    const reasons: string[] = [];
    if (!projectedRow) reasons.push(`period ${period} is not in the projection`);
    if (uncovered.length > 0) reasons.push(`${uncovered.length} series are not projected, so the projected expense is incomplete`);
    if (reasons.length === 0 && projectedRow) {
      const projected = d(projectedRow.cash_interest).plus(projectedRow.indexation_capitalized);
      const difference = projected.minus(input.accountingInterestLastPeriod.value);
      record({id: "financial.interest_expense_bridge", formula: "projected cash interest + capitalized indexation - accounting expense", operands: {projected: out(projected), accounting: input.accountingInterestLastPeriod.value}, result: out(difference)});
      bridge = {projected: out(projected), accounting: out(d(input.accountingInterestLastPeriod.value)), difference: out(difference), period, anchor: input.accountingInterestLastPeriod.anchor, state: "compared", reason: null};
    } else {
      bridge = {projected: null, accounting: out(d(input.accountingInterestLastPeriod.value)), difference: null, period, anchor: input.accountingInterestLastPeriod.anchor, state: "insufficient_evidence", reason: reasons.join("; ")};
    }
  }

  const state: InterestScheduleOutput["state"] = blockReasons.length > 0 ? "blocked" : uncovered.length > 0 || schedules.some((schedule) => schedule.principal_projection === "insufficient_evidence") ? "partial" : "complete";
  const body = {
    schema_version: "method.build-interest-and-indexation-schedule.v2" as const, reference_date: input.referenceDate, unit: input.unit, state, block_reasons: blockReasons,
    assumptions: [...assumptions].sort(compare), schedule_by_series: schedules, schedule_aggregate: aggregate, accounting_bridge: bridge, uncovered_series: uncovered,
  };
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint({...body, calculations})}};
}
