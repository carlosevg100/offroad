import {createHash} from "node:crypto";

import {businessDayAccrual, diPercentAccrual} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `build-interest-and-indexation-schedule` (v4, after the third independent
 * review). Projects each series period by period with the factors its indenture writes: an annual
 * rate accrues exponentially over business days of a 252-day year; a DI series compounds the DI
 * factor with the spread factor; a "p% of DI" series compounds p times the daily DI; an IPCA series
 * updates its nominal at each anniversary by the monthly index of the lagged month and accrues the
 * spread on the updated nominal. A coupon is paid on its date: the accrual is split at the payment,
 * what accrued before is paid, what accrues after is carried. The opening principal is a nominal
 * (unit value times quantity, updated where the base holds the update); a ledger balance that
 * includes accrued interest and costs is not a principal and names a gap. The accrued remuneration
 * at the reference date comes from the base or the first coupon is declared incomplete. Rounding
 * follows what each indenture writes, layer by layer (DI factor, spread factor, their product, the
 * daily accumulation, the amount). The IPCA update between anniversaries is pro rata by business
 * days (dup/dut) when the base gives the counts, and declared as not projected otherwise. When the
 * base does not say whether the IPCA update is capitalized or paid, both treatments are projected as
 * scenarios. Nothing missing becomes zero: an absent amortization schedule leaves the principal
 * projection insufficient in every aggregate, and the projected total is compared to the ledger's
 * control so omitted series are named. The unit is anchored to the source that states it; coupon
 * positions inside a period must advance.
 */
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const rate = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/);
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
  /** The calendar the count comes from. */
  anchor: anchorSchema,
}).strict();

export const curveSchema = z.object({
  id: nonEmpty,
  kind: z.enum(["CDI", "IPCA"]),
  /** Annual effective rate per period as a decimal, or the daily rate the source publishes (annualized by the executor as (1 + daily)^252 - 1). One of the two. */
  annualRateByPeriod: z.record(nonEmpty, rate).nullable().default(null),
  dailyRateByPeriod: z.record(nonEmpty, rate).nullable().default(null),
  /** IPCA only: monthly variation by calendar month (YYYY-MM) as a decimal, for the anniversary updates. */
  monthlyRateByMonth: z.record(isoMonth, rate).nullable().default(null),
  source: z.object({title: nonEmpty, url: z.string().optional(), asOf: isoDate, anchor: anchorSchema}).strict(),
}).strict();

export const seriesRemunerationSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("spread_over_index"), spreadPerYear: rate}).strict(),
  z.object({type: z.literal("percent_of_index"), percentOfIndex: nonNegative}).strict(),
  z.object({type: z.literal("fixed"), ratePerYear: rate}).strict(),
]);

/** Rounding the indenture writes, layer by layer: the index factor, the spread factor, their product (Fator Juros), the daily accumulation and the amount. */
const layerSchema = z.object({decimals: z.number().int().min(2).max(16), mode: z.enum(["round", "truncate"])}).strict();
export const roundingSchema = z.object({
  indexFactor: layerSchema,
  spreadFactor: layerSchema,
  interestFactor: layerSchema,
  dailyAccumulation: layerSchema,
  amount: layerSchema,
  anchor: anchorSchema,
}).strict();

export const seriesInputSchema = z.object({
  id: nonEmpty,
  label: nonEmpty,
  /** The nominal at the reference date and where it comes from; a ledger balance including accrued interest is not a nominal. */
  openingPrincipal: z.object({value: nonNegative, basis: z.enum(["unit_value_x_quantity", "unit_value_x_quantity_updated", "trustee_report_nominal", "ledger_balance_including_accrued"]), anchor: anchorSchema}).strict(),
  /** Remuneration accrued at the reference date since the last payment; null when the base does not hold it. */
  openingAccrued: z.object({value: nonNegative, anchor: anchorSchema}).strict().nullable(),
  indexer: z.enum(["CDI", "IPCA", "fixed", "unknown"]),
  remuneration: seriesRemunerationSchema.nullable(),
  /** Coupon payment dates with the business days from the start of the period that holds them, from the calendar the base cites; positions inside a period must advance. */
  couponDates: z.array(z.object({date: isoDate, businessDaysFromPeriodStart: z.number().int().nonnegative()}).strict()).nullable(),
  /** Scheduled principal payments; null when the base has no amortization schedule for the series. */
  amortization: z.array(z.object({date: isoDate, amount: nonNegative}).strict()).nullable(),
  /** IPCA only: how the update is treated (capitalized or paid); null when the indenture is not in the base, in which case both are projected. */
  indexationTreatment: z.enum(["capitalized_principal", "cash_paid"]).nullable(),
  /** IPCA only: the anniversary day and the lag in months the indenture writes for the index number, and, per period, the business days elapsed since the last anniversary (dup) over the business days of that anniversary month (dut) for the pro rata at the period end; null when the base does not give the counts. */
  indexation: z.object({anniversaryDay: z.number().int().min(1).max(31), lagMonths: z.number().int().min(0).max(3), proRataByPeriod: z.record(nonEmpty, z.object({dup: z.number().int().nonnegative(), dut: z.number().int().positive()}).strict()).nullable(), anchor: anchorSchema}).strict().nullable(),
  rounding: roundingSchema.nullable(),
  curveId: nonEmpty.nullable(),
  anchors: z.object({balance: anchorSchema, terms: anchorSchema.nullable(), payments: anchorSchema.nullable(), amortization: anchorSchema.nullable()}).strict(),
}).strict();

const UNIT_WORDS: Record<z.infer<typeof unitSchema>, RegExp> = {"BRL": /\b(R\$|reais|BRL)\b(?!\s*(mil|milh))/i, "BRL thousand": /\b(mil|thousand)\b/i, "BRL million": /\b(milh[õo]es|million)\b/i, "USD": /\bUSD\b(?!\s*(mil|thousand))/i, "USD thousand": /\bUSD\b.*\b(mil|thousand)\b/i};

export const interestScheduleInputSchema = z.object({
  referenceDate: isoDate,
  unit: unitSchema,
  /** Where the source states the unit; its note must name it, so a relabelled scale is refused. */
  unitAnchor: anchorSchema.extend({note: nonEmpty}),
  periods: z.array(projectionPeriodSchema).min(1),
  curves: z.array(curveSchema).default([]),
  series: z.array(seriesInputSchema).min(1),
  /** The ledger's control: the series it holds and their nominal total, so omitted series are named and the projection's coverage is measured. */
  ledgerControl: z.object({seriesIds: z.array(nonEmpty), grossDebt: nonNegative, anchor: anchorSchema}).strict().nullable().default(null),
  /** The finance expense of the last closed period, to bridge against; null when not in the base. */
  accountingInterestLastPeriod: z.object({value: z.string().regex(/^-?\d+(\.\d+)?$/), periodId: nonEmpty, anchor: anchorSchema}).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  if (!UNIT_WORDS[input.unit].test(input.unitAnchor.note)) context.addIssue({code: "custom", path: ["unitAnchor"], message: `the unit anchor's note does not name the unit ${input.unit}; a relabelled scale is refused`});
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
  input.curves.forEach((curve, index) => {
    if (curveIds.has(curve.id)) context.addIssue({code: "custom", path: ["curves"], message: `duplicate curve ${curve.id}`});
    curveIds.add(curve.id);
    if ((curve.annualRateByPeriod === null) === (curve.dailyRateByPeriod === null)) context.addIssue({code: "custom", path: ["curves", index], message: `curve ${curve.id} must carry exactly one of annualRateByPeriod and dailyRateByPeriod`});
    if (curve.kind !== "IPCA" && curve.monthlyRateByMonth !== null) context.addIssue({code: "custom", path: ["curves", index], message: `curve ${curve.id} is not IPCA and carries monthly index variations`});
  });
  const seriesIds = new Set<string>();
  input.series.forEach((series, index) => {
    if (seriesIds.has(series.id)) context.addIssue({code: "custom", path: ["series"], message: `duplicate series ${series.id}`});
    seriesIds.add(series.id);
    const dates = new Set<string>();
    const lastPosition = new Map<string, number>();
    for (const coupon of [...(series.couponDates ?? [])].sort((a, b) => compare(a.date, b.date))) {
      if (dates.has(coupon.date)) context.addIssue({code: "custom", path: ["series", index, "couponDates"], message: `${series.id}: coupon date ${coupon.date} listed twice`});
      dates.add(coupon.date);
      const period = sorted.find((entry) => coupon.date > entry.start && coupon.date <= entry.end);
      if (period && coupon.businessDaysFromPeriodStart > period.businessDays) context.addIssue({code: "custom", path: ["series", index, "couponDates"], message: `${series.id}: coupon ${coupon.date} claims ${coupon.businessDaysFromPeriodStart} business days inside ${period.id}, which has ${period.businessDays}`});
      if (period) {
        const previous = lastPosition.get(period.id);
        if (previous !== undefined && coupon.businessDaysFromPeriodStart <= previous) context.addIssue({code: "custom", path: ["series", index, "couponDates"], message: `${series.id}: coupon ${coupon.date} sits at ${coupon.businessDaysFromPeriodStart} business days, not after the previous coupon of ${period.id} at ${previous}; positions inside a period must advance`});
        lastPosition.set(period.id, coupon.businessDaysFromPeriodStart);
      }
    }
    if (series.indexation?.proRataByPeriod) for (const [periodId, counts] of Object.entries(series.indexation.proRataByPeriod)) { if (!periodIds.has(periodId)) context.addIssue({code: "custom", path: ["series", index, "indexation"], message: `${series.id}: pro rata names a period that is not projected: ${periodId}`}); if (counts.dup > counts.dut) context.addIssue({code: "custom", path: ["series", index, "indexation"], message: `${series.id}: dup ${counts.dup} exceeds dut ${counts.dut} in ${periodId}`}); }
    if (series.indexer !== "IPCA" && (series.indexationTreatment !== null || series.indexation !== null)) context.addIssue({code: "custom", path: ["series", index], message: `${series.id}: indexation fields belong to IPCA series only`});
  });
});
export type InterestScheduleInput = z.input<typeof interestScheduleInputSchema>;

type Calculation = {id: string; formula: string; operands: Record<string, string>; result: string; unit: string};
type Row = {
  period: string; opening_principal: string; indexation_factor: string; indexation_accrued: string; indexation_capitalized: string; indexation_paid: string;
  coupon_factor: string; coupon_accrued: string; coupon_paid: string; coupon_carried: string; principal_paid: string | null; closing_principal: string; calendar_anchor: Anchor;
};
type Totals = {cash_interest: string; cash_indexation: string; indexation_capitalized: string; principal_paid: string | null};
type SeriesSchedule = {
  series_id: string; label: string; indexer: string; remuneration: string;
  opening_principal: {value: string; basis: string; anchor: Anchor};
  opening_accrued: {value: string; anchor: Anchor} | null;
  first_coupon_complete: boolean;
  curve: {id: string; asOf: string; title: string; anchor: Anchor} | null;
  rounding: {indexFactor: {decimals: number; mode: string}; spreadFactor: {decimals: number; mode: string}; interestFactor: {decimals: number; mode: string}; dailyAccumulation: {decimals: number; mode: string}; amount: {decimals: number; mode: string}; anchor: Anchor} | null;
  principal_projection: "scheduled" | "insufficient_evidence";
  treatment: "capitalized_principal" | "cash_paid" | "not_indexed";
  /** Present only when the base does not say how the IPCA update is treated: both projections, side by side. */
  treatment_scenarios: Array<{treatment: "capitalized_principal" | "cash_paid"; rows: Row[]; totals: Totals}> | null;
  rows: Row[];
  totals: Totals;
  anchors: {balance: Anchor; terms: Anchor | null; payments: Anchor | null; amortization: Anchor | null; indexation: Anchor | null};
};

export type InterestScheduleOutput = {
  schema_version: "method.build-interest-and-indexation-schedule.v4";
  reference_date: string;
  unit: string;
  state: "complete" | "partial" | "blocked";
  block_reasons: string[];
  assumptions: string[];
  schedule_by_series: SeriesSchedule[];
  schedule_aggregate: {
    by_period: Array<{period: string; cash_interest: string; cash_indexation: string; indexation_capitalized: string; principal_paid: string | null; closing_principal: string | null}>;
    by_indexer: Array<{indexer: string; cash_interest: string; cash_indexation: string; indexation_capitalized: string; closing_principal: string | null; series: string[]}>;
    opening_principal_projected: string;
    principal_projection_complete: boolean;
    treatment_scenarios_pending: string[];
  } | null;
  ledger_coverage: {projected: string; ledger: string; share: string; series_omitted: string[]; anchor: Anchor} | null;
  accounting_bridge: {projected: string | null; accounting: string; difference: string | null; period: string; anchor: Anchor; state: "compared" | "insufficient_evidence"; reason: string | null} | null;
  uncovered_series: Array<{series_id: string; reason: string; state: "insufficient_evidence"}>;
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
const sortRecord = <T,>(record: Record<string, T> | null) => (record ? Object.fromEntries(Object.entries(record).sort(([a], [b]) => compare(a, b))) : null);

function canonical(input: z.infer<typeof interestScheduleInputSchema>) {
  return {
    ...input,
    periods: [...input.periods].sort((a, b) => compare(a.start, b.start)),
    curves: [...input.curves].sort((a, b) => compare(a.id, b.id)).map((curve) => ({...curve, annualRateByPeriod: sortRecord(curve.annualRateByPeriod), dailyRateByPeriod: sortRecord(curve.dailyRateByPeriod), monthlyRateByMonth: sortRecord(curve.monthlyRateByMonth)})),
    series: [...input.series].sort((a, b) => compare(a.id, b.id)).map((series) => ({...series, couponDates: series.couponDates ? [...series.couponDates].sort((a, b) => compare(a.date, b.date)) : null, amortization: series.amortization ? [...series.amortization].sort((a, b) => compare(a.date, b.date) || compare(a.amount, b.amount)) : null, indexation: series.indexation ? {...series.indexation, proRataByPeriod: sortRecord(series.indexation.proRataByPeriod)} : null})),
    ledgerControl: input.ledgerControl ? {...input.ledgerControl, seriesIds: [...input.ledgerControl.seriesIds].sort(compare)} : null,
  };
}

const describeRemuneration = (series: z.infer<typeof seriesInputSchema>) => {
  const remuneration = series.remuneration!;
  if (remuneration.type === "fixed") return `fixed ${remuneration.ratePerYear} per year`;
  if (remuneration.type === "percent_of_index") return `${remuneration.percentOfIndex} of ${series.indexer}`;
  return `${series.indexer} + ${remuneration.spreadPerYear} per year`;
};
const addMonths = (isoMonth: string, months: number) => { const [year, month] = isoMonth.split("-").map(Number) as [number, number]; const index = year * 12 + (month - 1) + months; return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`; };
/** Anniversary dates strictly after `start` and up to `end`, on the series' anniversary day (month-end clipped). */
function anniversaries(start: string, end: string, day: number): string[] {
  const dates: string[] = [];
  let month = start.slice(0, 7);
  for (let guard = 0; guard < 120; guard += 1) {
    const [year, monthNumber] = month.split("-").map(Number) as [number, number];
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const date = `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
    if (date > end) break;
    if (date > start) dates.push(date);
    month = addMonths(month, 1);
  }
  return dates;
}

export function buildInterestAndIndexationSchedule(raw: InterestScheduleInput): InterestScheduleOutput {
  const input = canonical(interestScheduleInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">, unit: string = input.unit) => calculations.push({...calculation, unit});
  const curves = new Map(input.curves.map((curve) => [curve.id, curve]));
  const uncovered: InterestScheduleOutput["uncovered_series"] = [];
  const assumptions = new Set<string>();
  const blockReasons: string[] = [];
  const schedules: SeriesSchedule[] = [];

  /** Annual rate of a curve for a period: as published, or annualized from the daily rate the source publishes. */
  const annualRate = (curve: z.infer<typeof curveSchema>, periodId: string): string | null => {
    if (curve.annualRateByPeriod) return curve.annualRateByPeriod[periodId] ?? null;
    const daily = curve.dailyRateByPeriod?.[periodId];
    if (daily === undefined) return null;
    const annual = d(daily).plus(1).pow(252).minus(1);
    record({id: `financial.daily_rate_annualized:${curve.id}:${periodId}`, formula: "(1 + dailyRate)^252 - 1", operands: {dailyRate: daily}, result: out(annual)}, "x");
    return out(annual);
  };

  for (const series of input.series) {
    if (series.openingPrincipal.basis === "ledger_balance_including_accrued") { uncovered.push({series_id: series.id, reason: `the opening figure of ${series.label} is a ledger balance that includes accrued interest, monetary variation and transaction costs; the nominal (unit value times quantity, updated where indexed) is not in the base`, state: "insufficient_evidence"}); continue; }
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
      if (series.indexer === "CDI" && input.periods.some((period) => annualRate(curve, period.id) === null)) { uncovered.push({series_id: series.id, reason: `curve ${curve.id} does not cover every projected period`, state: "insufficient_evidence"}); continue; }
      if (curve.source.asOf !== input.referenceDate) assumptions.add(`curve ${curve.id} is dated ${curve.source.asOf}, not the reference date ${input.referenceDate}: the projection uses it as the base scenario and does not call it the curve of the reference date`);
    }
    if (series.indexer === "IPCA") {
      if (!series.indexation) { uncovered.push({series_id: series.id, reason: `the anniversary day and the index lag of ${series.label} are not in the base; the monthly update cannot be placed`, state: "insufficient_evidence"}); continue; }
      if (!curve!.monthlyRateByMonth) { uncovered.push({series_id: series.id, reason: `curve ${curve!.id} carries no monthly index variations; the IPCA update of ${series.label} needs them`, state: "insufficient_evidence"}); continue; }
      const needed = input.periods.flatMap((period) => anniversaries(period.start, period.end, series.indexation!.anniversaryDay)).map((date) => addMonths(date.slice(0, 7), -series.indexation!.lagMonths));
      const missing = needed.filter((month) => curve!.monthlyRateByMonth![month] === undefined);
      if (missing.length > 0) { uncovered.push({series_id: series.id, reason: `curve ${curve!.id} lacks the monthly variation of ${[...new Set(missing)].join(", ")} that the anniversaries of ${series.label} need`, state: "insufficient_evidence"}); continue; }
      if (!series.indexation.proRataByPeriod) assumptions.add(`${series.id}: IPCA updates are applied at each anniversary with the monthly variation of the lagged month; the pro rata between the last anniversary and the period end (dup/dut) is not projected because the base gives no business-day counts (declared approximation)`);
      else if (input.periods.some((period) => series.indexation!.proRataByPeriod![period.id] === undefined)) { uncovered.push({series_id: series.id, reason: `the pro rata counts (dup/dut) of ${series.label} are missing for ${input.periods.filter((period) => series.indexation!.proRataByPeriod![period.id] === undefined).map((period) => period.id).join(", ")}`, state: "insufficient_evidence"}); continue; }
      if (series.indexationTreatment === null) assumptions.add(`${series.id}: the base does not say whether the IPCA update is capitalized or paid; both treatments are projected as scenarios and neither is chosen`);
    }
    if (!series.openingAccrued) assumptions.add(`${series.id}: the remuneration accrued at ${input.referenceDate} is not in the base; the first coupon is declared incomplete and carries only what accrues from the reference date`);
    const principalProjection: "scheduled" | "insufficient_evidence" = series.amortization && series.anchors.amortization ? "scheduled" : "insufficient_evidence";
    const rounding = series.rounding;
    const layer = (value: Decimal, which: "indexFactor" | "spreadFactor" | "interestFactor" | "dailyAccumulation" | "amount") => (rounding ? value.toDecimalPlaces(rounding[which].decimals, rounding[which].mode === "truncate" ? Decimal.ROUND_DOWN : Decimal.ROUND_HALF_UP) : value.toDecimalPlaces(8));
    const roundFactor = (value: Decimal) => layer(value, "interestFactor");
    const roundAmount = (value: Decimal) => layer(value, "amount");
    if (!rounding) assumptions.add(`${series.id}: the indenture's rounding of factors and amounts is not in the base; eight decimals, rounded, are used at every layer (declared)`);

    const couponFactorFor = (businessDays: number, periodId: string, label: string): Decimal => {
      const remuneration = series.remuneration!;
      if (businessDays === 0) return d(0);
      if (remuneration.type === "fixed") {
        const accrual = businessDayAccrual(remuneration.ratePerYear, businessDays);
        record({id: `financial.business_day_accrual:${series.id}:${periodId}:${label}`, formula: "(1 + ratePerYear)^(businessDays/252) - 1", operands: {ratePerYear: remuneration.ratePerYear, businessDays: String(businessDays)}, result: accrual.value}, "x");
        return layer(layer(d(accrual.value), "spreadFactor"), "interestFactor");
      }
      if (remuneration.type === "percent_of_index") {
        const di = annualRate(curve!, periodId)!;
        const accrual = diPercentAccrual(di, remuneration.percentOfIndex, businessDays);
        record({id: `financial.di_percent_accrual:${series.id}:${periodId}:${label}`, formula: "(1 + ((1 + DI)^(1/252) - 1) * p)^businessDays - 1, daily accumulation at the indenture's layer", operands: {annualDi: di, percentOfIndex: remuneration.percentOfIndex, businessDays: String(businessDays)}, result: accrual.value}, "x");
        return layer(layer(d(accrual.value), "dailyAccumulation"), "interestFactor");
      }
      if (series.indexer === "CDI") {
        const di = annualRate(curve!, periodId)!;
        const fatorDi = layer(d(businessDayAccrual(di, businessDays).value), "indexFactor");
        const fatorSpread = layer(d(businessDayAccrual(remuneration.spreadPerYear, businessDays).value), "spreadFactor");
        const factor = layer(fatorDi.plus(1).times(fatorSpread.plus(1)).minus(1), "interestFactor");
        record({id: `financial.di_spread_factor:${series.id}:${periodId}:${label}`, formula: "(1 + fatorDI) * (1 + fatorSpread) - 1, each factor at the indenture's layer", operands: {fatorDI: out(fatorDi), fatorSpread: out(fatorSpread), annualDi: di, spreadPerYear: remuneration.spreadPerYear, businessDays: String(businessDays)}, result: out(factor)}, "x");
        return factor;
      }
      const spread = businessDayAccrual(remuneration.spreadPerYear, businessDays);
      record({id: `financial.business_day_accrual:${series.id}:${periodId}:${label}`, formula: "(1 + spreadPerYear)^(businessDays/252) - 1", operands: {spreadPerYear: remuneration.spreadPerYear, businessDays: String(businessDays)}, result: spread.value}, "x");
      return layer(layer(d(spread.value), "spreadFactor"), "interestFactor");
    };

    /** The IPCA update factor of a period, computed and recorded once whatever the number of treatment scenarios. */
    const indexationFactors = new Map<string, Decimal>();
    const indexationFactorFor = (period: z.infer<typeof projectionPeriodSchema>): Decimal => {
      if (series.indexer !== "IPCA") return d(0);
      const cached = indexationFactors.get(period.id);
      if (cached) return cached;
      let factor = d(1);
      for (const date of anniversaries(period.start, period.end, series.indexation!.anniversaryDay)) {
        const month = addMonths(date.slice(0, 7), -series.indexation!.lagMonths);
        const monthly = curve!.monthlyRateByMonth![month]!;
        factor = factor.times(d(monthly).plus(1));
        record({id: `financial.ipca_anniversary_update:${series.id}:${period.id}:${date}`, formula: "factor * (1 + monthlyVariation[lagged month])", operands: {anniversary: date, laggedMonth: month, monthlyVariation: monthly}, result: out(factor)}, "x");
      }
      const proRata = series.indexation!.proRataByPeriod?.[period.id];
      if (proRata && proRata.dup > 0) {
        // Between the last anniversary and the period end, the indenture applies the next month's variation pro rata by business days: (1 + variation)^(dup/dut).
        const nextMonth = addMonths(period.end.slice(0, 7), -series.indexation!.lagMonths);
        const monthly = curve!.monthlyRateByMonth![nextMonth] ?? curve!.monthlyRateByMonth![addMonths(nextMonth, -1)]!;
        const partial = d(monthly).plus(1).pow(d(proRata.dup).div(proRata.dut));
        factor = factor.times(partial);
        record({id: `financial.ipca_pro_rata:${series.id}:${period.id}`, formula: "(1 + monthlyVariation)^(dup/dut) at the period end", operands: {dup: String(proRata.dup), dut: String(proRata.dut), monthlyVariation: monthly, month: nextMonth}, result: out(partial)}, "x");
      }
      const rounded = layer(factor.minus(1), "indexFactor");
      indexationFactors.set(period.id, rounded);
      return rounded;
    };

    const project = (treatment: "capitalized_principal" | "cash_paid" | "not_indexed"): {rows: Row[]; totals: Totals} => {
      let principal = d(series.openingPrincipal.value);
      let carried = series.openingAccrued ? d(series.openingAccrued.value) : d(0);
      let cashInterest = d(0);
      let cashIndexation = d(0);
      let capitalized = d(0);
      let principalPaid: Decimal | null = principalProjection === "scheduled" ? d(0) : null;
      const rows: Row[] = [];
      for (const period of input.periods) {
        const opening = principal;
        // 1. IPCA: the nominal is updated at each anniversary inside the period by the monthly variation of the lagged month.
        const indexationFactor = indexationFactorFor(period);
        const indexationAccrued = roundAmount(principal.times(indexationFactor));
        const indexationCapitalized = treatment === "capitalized_principal" ? indexationAccrued : d(0);
        const indexationPaid = treatment === "cash_paid" ? indexationAccrued : d(0);
        principal = principal.plus(indexationCapitalized);
        // 2. Coupon accrual split at each payment date inside the period: what accrued before the date is paid, what accrues after is carried.
        const payments = series.couponDates!.filter((coupon) => coupon.date > period.start && coupon.date <= period.end);
        let daysUsed = 0;
        let couponAccrued = d(0);
        let couponPaid = d(0);
        let periodFactor = d(1);
        for (const [index, coupon] of payments.entries()) {
          const days = coupon.businessDaysFromPeriodStart - daysUsed;
          const factor = couponFactorFor(Math.max(days, 0), period.id, `to-${coupon.date}`);
          const accrued = roundAmount(principal.plus(carried).times(factor));
          couponAccrued = couponAccrued.plus(accrued);
          carried = carried.plus(accrued);
          couponPaid = couponPaid.plus(carried);
          record({id: `financial.coupon_payment:${series.id}:${period.id}:${coupon.date}`, formula: "paid = carried + (principal + carried) * factor(businessDays to the payment date)", operands: {date: coupon.date, businessDays: String(Math.max(days, 0)), factor: out(factor), carriedBefore: out(carried.minus(accrued)), principal: out(principal)}, result: out(carried)});
          carried = d(0);
          daysUsed = coupon.businessDaysFromPeriodStart;
          periodFactor = periodFactor.times(factor.plus(1));
          if (index === payments.length - 1) {
            const rest = couponFactorFor(period.businessDays - daysUsed, period.id, `after-${coupon.date}`);
            const accruedAfter = roundAmount(principal.times(rest));
            couponAccrued = couponAccrued.plus(accruedAfter);
            carried = carried.plus(accruedAfter);
            periodFactor = periodFactor.times(rest.plus(1));
          }
        }
        if (payments.length === 0) {
          const factor = couponFactorFor(period.businessDays, period.id, "coupon");
          const accrued = roundAmount(principal.plus(carried).times(factor));
          couponAccrued = accrued;
          carried = carried.plus(accrued);
          periodFactor = factor.plus(1);
        }
        // 3. Scheduled principal on its dates, when the base holds the schedule; never zero when it does not.
        let paid: Decimal | null = null;
        if (principalProjection === "scheduled") {
          paid = series.amortization!.filter((entry) => entry.date > period.start && entry.date <= period.end).reduce((sum, entry) => sum.plus(entry.amount), d(0));
          if (paid.gt(principal)) paid = principal;
          principal = principal.minus(paid);
          principalPaid = principalPaid!.plus(paid);
        }
        record({id: `financial.indexed_debt_schedule:${series.id}:${period.id}:${treatment}`, formula: "closing = opening + indexationCapitalized - principalPaid ; couponPaid = accrual to each payment date ; couponCarried = accrual after the last payment", operands: {opening: out(opening), indexationCapitalized: out(indexationCapitalized), indexationPaid: out(indexationPaid), couponAccrued: out(couponAccrued), couponPaid: out(couponPaid), principalPaid: paid ? out(paid) : "insufficient_evidence", periodFactor: out(periodFactor.minus(1))}, result: out(principal)});
        cashInterest = cashInterest.plus(couponPaid);
        cashIndexation = cashIndexation.plus(indexationPaid);
        capitalized = capitalized.plus(indexationCapitalized);
        rows.push({period: period.id, opening_principal: out(opening), indexation_factor: out(indexationFactor), indexation_accrued: out(indexationAccrued), indexation_capitalized: out(indexationCapitalized), indexation_paid: out(indexationPaid), coupon_factor: out(periodFactor.minus(1)), coupon_accrued: out(couponAccrued), coupon_paid: out(couponPaid), coupon_carried: out(carried), principal_paid: paid ? out(paid) : null, closing_principal: out(principal), calendar_anchor: period.anchor});
      }
      return {rows, totals: {cash_interest: out(cashInterest), cash_indexation: out(cashIndexation), indexation_capitalized: out(capitalized), principal_paid: principalPaid ? out(principalPaid) : null}};
    };

    const treatment: SeriesSchedule["treatment"] = series.indexer !== "IPCA" ? "not_indexed" : series.indexationTreatment ?? "capitalized_principal";
    const scenarios = series.indexer === "IPCA" && series.indexationTreatment === null ? (["capitalized_principal", "cash_paid"] as const).map((entry) => ({treatment: entry, ...project(entry)})) : null;
    const main = scenarios ? scenarios[0]! : project(treatment);
    schedules.push({
      series_id: series.id, label: series.label, indexer: series.indexer, remuneration: describeRemuneration(series),
      opening_principal: {value: out(d(series.openingPrincipal.value)), basis: series.openingPrincipal.basis, anchor: series.openingPrincipal.anchor},
      opening_accrued: series.openingAccrued ? {value: out(d(series.openingAccrued.value)), anchor: series.openingAccrued.anchor} : null,
      first_coupon_complete: series.openingAccrued !== null,
      curve: curve ? {id: curve.id, asOf: curve.source.asOf, title: curve.source.title, anchor: curve.source.anchor} : null,
      rounding: rounding ? {indexFactor: rounding.indexFactor, spreadFactor: rounding.spreadFactor, interestFactor: rounding.interestFactor, dailyAccumulation: rounding.dailyAccumulation, amount: rounding.amount, anchor: rounding.anchor} : null,
      principal_projection: principalProjection,
      treatment: scenarios ? "capitalized_principal" : treatment,
      treatment_scenarios: scenarios ? scenarios.map((scenario) => ({treatment: scenario.treatment, rows: scenario.rows, totals: scenario.totals})) : null,
      rows: main.rows, totals: main.totals,
      anchors: {...series.anchors, indexation: series.indexation?.anchor ?? null},
    });
  }

  let aggregate: InterestScheduleOutput["schedule_aggregate"] = null;
  if (schedules.length > 0) {
    const complete = schedules.every((schedule) => schedule.principal_projection === "scheduled");
    const pending = schedules.filter((schedule) => schedule.treatment_scenarios !== null).map((schedule) => schedule.series_id);
    const sum = (subset: SeriesSchedule[], key: "coupon_paid" | "indexation_paid" | "indexation_capitalized" | "principal_paid", period?: string) => out(subset.reduce((total, schedule) => total.plus(schedule.rows.filter((row) => !period || row.period === period).reduce((inner, row) => inner.plus(row[key] ?? 0), d(0))), d(0)));
    const closing = (subset: SeriesSchedule[], period?: string) => (subset.every((schedule) => schedule.principal_projection === "scheduled") ? out(subset.reduce((total, schedule) => total.plus((period ? schedule.rows.find((row) => row.period === period) : schedule.rows[schedule.rows.length - 1])?.closing_principal ?? 0), d(0))) : null);
    aggregate = {
      by_period: input.periods.map((period) => ({period: period.id, cash_interest: sum(schedules, "coupon_paid", period.id), cash_indexation: sum(schedules, "indexation_paid", period.id), indexation_capitalized: sum(schedules, "indexation_capitalized", period.id), principal_paid: complete ? sum(schedules, "principal_paid", period.id) : null, closing_principal: closing(schedules, period.id)})),
      by_indexer: [...new Set(schedules.map((schedule) => schedule.indexer))].sort(compare).map((indexer) => { const subset = schedules.filter((schedule) => schedule.indexer === indexer); return {indexer, cash_interest: sum(subset, "coupon_paid"), cash_indexation: sum(subset, "indexation_paid"), indexation_capitalized: sum(subset, "indexation_capitalized"), closing_principal: closing(subset), series: subset.map((schedule) => schedule.series_id)}; }),
      opening_principal_projected: out(schedules.reduce((total, schedule) => total.plus(schedule.opening_principal.value), d(0))),
      principal_projection_complete: complete,
      treatment_scenarios_pending: pending,
    };
    record({id: "financial.indexed_debt_aggregation", formula: "sum over series by period and by indexer; principal and closing balances only when every series has a schedule", operands: {series: String(schedules.length), principalProjectionComplete: String(complete)}, result: aggregate.opening_principal_projected});
  } else {
    blockReasons.push("no series could be projected: every series lacks a nominal, terms, payment dates or a matching curve");
  }

  let ledgerCoverage: InterestScheduleOutput["ledger_coverage"] = null;
  if (input.ledgerControl) {
    const projected = d(aggregate?.opening_principal_projected ?? 0);
    const share = d(input.ledgerControl.grossDebt).gt(0) ? projected.div(input.ledgerControl.grossDebt) : d(0);
    const known = new Set(input.series.map((series) => series.id));
    const omitted = input.ledgerControl.seriesIds.filter((id) => !known.has(id));
    record({id: "financial.ledger_coverage", formula: "opening principal projected / ledger gross debt", operands: {projected: out(projected), ledger: input.ledgerControl.grossDebt, seriesOmitted: String(omitted.length)}, result: out(share)}, "x");
    ledgerCoverage = {projected: out(projected), ledger: out(d(input.ledgerControl.grossDebt)), share: out(share), series_omitted: omitted, anchor: input.ledgerControl.anchor};
    for (const id of omitted) uncovered.push({series_id: id, reason: `the ledger holds ${id} and the projection received no series for it`, state: "insufficient_evidence"});
  }

  let bridge: InterestScheduleOutput["accounting_bridge"] = null;
  if (input.accountingInterestLastPeriod) {
    const period = input.accountingInterestLastPeriod.periodId;
    const projectedRow = aggregate?.by_period.find((row) => row.period === period) ?? null;
    const reasons: string[] = [];
    if (!projectedRow) reasons.push(`period ${period} is not in the projection`);
    if (uncovered.length > 0) reasons.push(`${uncovered.length} series are not projected, so the projected expense is incomplete`);
    if (aggregate && aggregate.treatment_scenarios_pending.length > 0) reasons.push(`the IPCA treatment of ${aggregate.treatment_scenarios_pending.join(", ")} is not settled`);
    if (reasons.length === 0 && projectedRow) {
      const projected = d(projectedRow.cash_interest).plus(projectedRow.cash_indexation).plus(projectedRow.indexation_capitalized);
      const difference = projected.minus(input.accountingInterestLastPeriod.value);
      record({id: "financial.interest_expense_bridge", formula: "projected cash interest + cash indexation + capitalized indexation - accounting expense", operands: {projected: out(projected), accounting: input.accountingInterestLastPeriod.value}, result: out(difference)});
      bridge = {projected: out(projected), accounting: out(d(input.accountingInterestLastPeriod.value)), difference: out(difference), period, anchor: input.accountingInterestLastPeriod.anchor, state: "compared", reason: null};
    } else {
      bridge = {projected: null, accounting: out(d(input.accountingInterestLastPeriod.value)), difference: null, period, anchor: input.accountingInterestLastPeriod.anchor, state: "insufficient_evidence", reason: reasons.join("; ")};
    }
  }

  uncovered.sort((a, b) => compare(a.series_id, b.series_id));
  const state: InterestScheduleOutput["state"] = blockReasons.length > 0 ? "blocked" : uncovered.length > 0 || schedules.some((schedule) => schedule.principal_projection === "insufficient_evidence" || schedule.treatment_scenarios !== null || !schedule.first_coupon_complete) ? "partial" : "complete";
  const body = {
    schema_version: "method.build-interest-and-indexation-schedule.v4" as const, reference_date: input.referenceDate, unit: input.unit, state, block_reasons: blockReasons,
    assumptions: [...assumptions].sort(compare), schedule_by_series: schedules, schedule_aggregate: aggregate, ledger_coverage: ledgerCoverage, accounting_bridge: bridge, uncovered_series: uncovered,
  };
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
