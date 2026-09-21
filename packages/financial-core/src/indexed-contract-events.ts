import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";

const D = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const number = z.string().regex(/^-?\d{1,30}(\.\d{1,24})?$/);
// Exact restart values may be much smaller than payment precision. Scientific notation
// preserves them compactly without introducing a hidden rounding event at a report cut.
const stateNumber = z.string().regex(/^-?\d{1,80}(\.\d{1,80})?(e[+-]?\d{1,5})?$/)
  .refine(x => {const v = new D(x); return v.isFinite() && v.sd() <= 80 && v.e >= -10000 && v.e < 40;});
const positive = number.refine(x => new D(x).gt(0));
const nonnegative = number.refine(x => new D(x).gte(0));
const id = z.string().trim().min(1).max(160);
const anchor = z.strictObject({sourceVersionId: z.uuid(), locator: id});
const layer = z.strictObject({decimals: z.number().int().min(2).max(24), mode: z.enum(["half_up", "truncate"])});
const point = z.strictObject({cycleId: id, elapsedUnits: z.number().int().nonnegative()});
const rate = z.discriminatedUnion("kind", [
  z.strictObject({kind: z.literal("effective_interval"), value: number, anchor}),
  z.strictObject({kind: z.literal("annual_effective"), value: number, elapsedUnits: z.number().int().nonnegative(), yearUnits: z.number().int().positive(), anchor}),
]);
export const indexedContractEventsInputSchema = z.strictObject({
  schemaVersion: z.literal("indexed-contract-events-input.v1"),
  currency: z.enum(["BRL", "USD"]),
  opening: z.strictObject({date: z.iso.date(), moment: z.literal("after_events"), principal: stateNumber.refine(x => new D(x).gte(0)),
    accruedInterest: stateNumber, accruedIndexation: stateNumber, appliedIndexLevel: stateNumber.refine(x => new D(x).gt(0)), point, anchor}),
  indexCycles: z.array(z.strictObject({id, start: z.iso.date(), end: z.iso.date(), totalUnits: z.number().int().positive(),
    variation: z.discriminatedUnion("kind", [
      z.strictObject({kind: z.literal("monthly_rate"), value: number}),
      z.strictObject({kind: z.literal("index_numbers"), previous: positive, current: positive}),
    ]), floor: z.enum(["none", "zero_variation"]), anchor})).min(1).max(1200),
  // These are contractual accrual boundaries, fixed independently of report requests.
  accruals: z.array(z.strictObject({date: z.iso.date(), point, interest: rate, anchor})).min(1).max(10000),
  conventions: z.strictObject({indexation: z.enum(["capitalized_principal", "cash_paid"]),
    accrualBoundaryConvention: z.literal("explicit_contractual_grid"),
    interestPrincipal: z.enum(["interval_opening", "at_interest_accrual"]),
    indexationPrincipal: z.enum(["interval_opening", "at_indexation"]),
    indexAccruedInterest: z.boolean(), compoundAccruedInterest: z.boolean(),
    unpaidIndexationAccrual: z.enum(["compound_with_index", "principal_only"]),
    indexationOrder: z.number().int().nonnegative(), interestOrder: z.number().int().nonnegative(),
    cashResidual: z.enum(["carry", "write_off"]),
    amortizationInterest: z.enum(["retain", "settle_proportionally"]),
    amortizationIndexation: z.enum(["retain", "settle_proportionally"]),
    factorRounding: layer, cashRounding: layer, anchor}),
  events: z.array(z.discriminatedUnion("kind", [
    z.strictObject({id, date: z.iso.date(), order: z.number().int().nonnegative(), kind: z.literal("coupon"), anchor}),
    z.strictObject({id, date: z.iso.date(), order: z.number().int().nonnegative(), kind: z.literal("index_settlement"), anchor}),
    z.strictObject({id, date: z.iso.date(), order: z.number().int().nonnegative(), kind: z.literal("amortization"),
      amount: nonnegative, basis: z.enum(["indexed_principal", "nominal_principal"]), anchor}),
  ])).max(10000),
  reportDates: z.array(z.iso.date()).max(10000),
});
export type IndexedContractEventsInput = z.infer<typeof indexedContractEventsInputSchema>;
const canonical = (x: unknown): string => Array.isArray(x) ? `[${x.map(canonical).join(",")}]`
  : x !== null && typeof x === "object" ? `{${Object.entries(x).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}` : JSON.stringify(x);
const hash = (x: unknown) => createHash("sha256").update(canonical(x)).digest("hex");

/** Explicit discrete accrual contract. Report requests never enter the financial state machine.
 * No market convention is inferred from the index, instrument name or presentation period. */
export function buildIndexedContractEvents(raw: unknown) {
  const input = indexedContractEventsInputSchema.parse(raw);
  const c = input.conventions;
  const rounded = (value: Decimal, rule: z.infer<typeof layer>) => value.toDecimalPlaces(rule.decimals,
    rule.mode === "truncate" ? Decimal.ROUND_DOWN : Decimal.ROUND_HALF_UP);
  const factor = (value: Decimal) => rounded(value, c.factorRounding);
  const cash = (value: Decimal) => rounded(value, c.cashRounding);
  const cycles = [...input.indexCycles].sort((a,b) => a.start.localeCompare(b.start));
  const ids = new Set<string>();
  const levels = new Map<string, {start: Decimal; ratio: Decimal; cycle: typeof cycles[number]}>();
  let full = new D(1);
  for (const [i, cycle] of cycles.entries()) {
    if (ids.has(cycle.id) || cycle.start >= cycle.end || (i > 0 && cycles[i-1]!.end !== cycle.start)) throw new Error("indexed_cycles_invalid");
    ids.add(cycle.id);
    let ratio = cycle.variation.kind === "monthly_rate" ? new D(cycle.variation.value).plus(1)
      : new D(cycle.variation.current).div(cycle.variation.previous);
    if (ratio.lte(0)) throw new Error("indexed_factor_nonpositive");
    if (cycle.floor === "zero_variation") ratio = D.max(ratio, 1);
    ratio = factor(ratio);
    if (ratio.lte(0)) throw new Error("indexed_factor_nonpositive");
    levels.set(cycle.id, {start: full, ratio, cycle});
    full = full.times(ratio);
    if (!full.isFinite() || full.lt("1e-24") || full.gt("1e24")) throw new Error("indexed_factor_out_of_bounds");
  }
  const levelAt = (date: string, p: z.infer<typeof point>) => {
    const entry = levels.get(p.cycleId);
    if (!entry || date < entry.cycle.start || date > entry.cycle.end || p.elapsedUnits > entry.cycle.totalUnits
      || (date === entry.cycle.start && p.elapsedUnits !== 0)
      || (date === entry.cycle.end && p.elapsedUnits !== entry.cycle.totalUnits)) throw new Error("indexed_point_uncovered");
    return entry.start.times(factor(entry.ratio.pow(new D(p.elapsedUnits).div(entry.cycle.totalUnits))));
  };
  let indexLevel = levelAt(input.opening.date, input.opening.point);
  if (!indexLevel.eq(input.opening.appliedIndexLevel)) throw new Error("indexed_opening_factor_mismatch");
  let principal = new D(input.opening.principal);
  let interest = new D(input.opening.accruedInterest);
  let indexClaim = new D(input.opening.accruedIndexation);
  if (c.indexation === "capitalized_principal" && !indexClaim.isZero()) throw new Error("indexed_opening_double_count");
  if (c.indexation === "cash_paid" && principal.plus(indexClaim).lt(0)) throw new Error("indexed_opening_invalid");
  const accruals = [...input.accruals].sort((a,b) => a.date.localeCompare(b.date));
  const dates = new Set(accruals.map(a => a.date));
  if (dates.size !== accruals.length || accruals[0]!.date <= input.opening.date) throw new Error("indexed_accrual_dates_invalid");
  if (new Set(input.reportDates).size !== input.reportDates.length || input.reportDates.some(date => !dates.has(date) && date !== input.opening.date)) throw new Error("indexed_report_point_missing");
  const events = [...input.events].sort((a,b) => a.date.localeCompare(b.date) || a.order-b.order);
  if (new Set(events.map(e=>e.id)).size !== events.length || new Set(events.map(e=>`${e.date}:${e.order}`)).size !== events.length
    || c.indexationOrder === c.interestOrder
    || events.some(e => !dates.has(e.date) || e.order === c.indexationOrder || e.order === c.interestOrder)) throw new Error("indexed_event_invalid");
  const eventsByDate = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByDate.get(event.date) ?? [];
    list.push(event); eventsByDate.set(event.date, list);
  }
  const snapshot = (date: string) => ({date, principal: principal.toString(), accruedInterest: interest.toString(),
    accruedIndexation: indexClaim.toString(), appliedIndexLevel: indexLevel.toString()});
  const states = [snapshot(input.opening.date)];
  const payments: {id: string; date: string; principal: string; interest: string; indexation: string;
    interestRoundingAdjustment: string; indexationRoundingAdjustment: string}[] = [];
  const trace: {date: string; kind: string; anchor: z.infer<typeof anchor>; operands: Record<string,string>; result: ReturnType<typeof snapshot>}[] = [];
  let previousPoint = input.opening.point;
  let previousDate = input.opening.date;
  for (const step of accruals) {
    if (step.point.cycleId === previousPoint.cycleId && step.point.elapsedUnits < previousPoint.elapsedUnits) throw new Error("indexed_calendar_reverses");
    const nextIndex = levelAt(step.date, step.point);
    const ratio = nextIndex.div(indexLevel);
    const rateBase = new D(step.interest.value).plus(1);
    if (rateBase.lte(0)) throw new Error("indexed_interest_factor_nonpositive");
    const interestFactor = factor(step.interest.kind === "effective_interval" ? rateBase
      : rateBase.pow(new D(step.interest.elapsedUnits).div(step.interest.yearUnits)));
    if (interestFactor.lte(0)) throw new Error("indexed_interest_factor_nonpositive");
    const intervalOpeningPrincipal = principal;
    const operations = [
      {kind: "index_accrual" as const, order: c.indexationOrder},
      {kind: "interest_accrual" as const, order: c.interestOrder},
      ...(eventsByDate.get(step.date) ?? []),
    ].sort((a,b) => a.order-b.order);
    for (const event of operations) {
      if (event.kind === "index_accrual") {
        const indexBase = c.indexationPrincipal === "interval_opening" ? intervalOpeningPrincipal : principal;
        if (c.indexation === "capitalized_principal") principal = principal.plus(indexBase.times(ratio.minus(1)));
        else indexClaim = indexClaim.plus(indexBase.plus(c.unpaidIndexationAccrual === "compound_with_index" ? indexClaim : 0).times(ratio.minus(1)));
        if (c.indexAccruedInterest) interest = interest.times(ratio);
        indexLevel = nextIndex;
        trace.push({date: step.date, kind: event.kind, anchor: step.anchor, operands: {from: previousDate, indexRatio: ratio.toString(), indexPrincipal: indexBase.toString(), order: String(event.order)}, result: snapshot(step.date)});
        continue;
      }
      if (event.kind === "interest_accrual") {
        const interestBase = c.interestPrincipal === "interval_opening" ? intervalOpeningPrincipal : principal;
        interest = interest.plus(interestBase.plus(c.compoundAccruedInterest ? interest : 0).times(interestFactor.minus(1)));
        trace.push({date: step.date, kind: event.kind, anchor: step.interest.anchor, operands: {from: previousDate, interestFactor: interestFactor.toString(),
          interestPrincipal: interestBase.toString(), order: String(event.order)}, result: snapshot(step.date)});
        continue;
      }
      let paidPrincipal = new D(0), paidInterest = new D(0), paidIndex = new D(0);
      let interestAdjustment = new D(0), indexAdjustment = new D(0);
      const settleInterest = (due: Decimal) => {
        paidInterest = cash(due); interestAdjustment = c.cashResidual === "write_off" ? due.minus(paidInterest) : new D(0);
        interest = interest.minus(paidInterest).minus(interestAdjustment);
      };
      const settleIndex = (due: Decimal) => {
        paidIndex = cash(due); indexAdjustment = c.cashResidual === "write_off" ? due.minus(paidIndex) : new D(0);
        indexClaim = indexClaim.minus(paidIndex).minus(indexAdjustment);
      };
      if (event.kind === "coupon") { settleInterest(interest); }
      else if (event.kind === "index_settlement") {
        if (c.indexation !== "cash_paid") throw new Error("indexed_settlement_wrong_treatment");
        settleIndex(indexClaim);
      } else {
        const expected = c.indexation === "capitalized_principal" ? "indexed_principal" : "nominal_principal";
        if (event.basis !== expected) throw new Error("indexed_amortization_basis_mismatch");
        paidPrincipal = new D(event.amount);
        if (!cash(paidPrincipal).eq(paidPrincipal)) throw new Error("indexed_payment_precision_mismatch");
        if (paidPrincipal.gt(principal)) throw new Error("indexed_amortization_exceeds_principal");
        const share = principal.isZero() ? new D(0) : paidPrincipal.div(principal);
        if (c.amortizationInterest === "settle_proportionally") settleInterest(interest.times(share));
        if (c.indexation === "cash_paid" && c.amortizationIndexation === "settle_proportionally") settleIndex(indexClaim.times(share));
        principal = principal.minus(paidPrincipal);
      }
      payments.push({id: event.id, date: event.date, principal: paidPrincipal.toString(), interest: paidInterest.toString(), indexation: paidIndex.toString(),
        interestRoundingAdjustment: interestAdjustment.toString(), indexationRoundingAdjustment: indexAdjustment.toString()});
      trace.push({date: event.date, kind: event.kind, anchor: event.anchor, operands: {id: event.id, order: String(event.order)}, result: snapshot(event.date)});
    }
    if ([principal, interest, indexClaim].some(v => !v.isFinite() || v.e < -10000 || v.e >= 40) || principal.lt(0)) throw new Error("indexed_state_out_of_bounds");
    states.push(snapshot(step.date)); previousPoint = step.point; previousDate = step.date;
  }
  const {reportDates: _reports, ...contract} = input;
  const reports = new Set(input.reportDates);
  const result = {schemaVersion: "indexed-contract-events.v1" as const,
    calculationConvention: "explicit_discrete_accrual_grid" as const, currency: input.currency,
    finalState: states[states.length-1]!, payments, trace,
    contractFingerprint: hash({...contract, indexCycles: cycles, accruals, events}), reports: states.filter(s=>reports.has(s.date)),
    grantsExecution: false as const, certifiesContractualCompliance: false as const};
  return {...result, fingerprint: hash(result)};
}
