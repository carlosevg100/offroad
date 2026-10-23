import Decimal from "decimal.js";

export const covenantHeadroomVersion = "2026.10.23-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

export type CovenantLimit = {id: string; label: string; kind: "contractual" | "board_policy"; maximumRatio: string; source: string};
/** One test of net debt over EBITDA at one date, in one scenario, under one written definition. */
export type CovenantMeasurement = {
  id: string; label: string; date: string; scenario: string;
  /** "test" is a measurement the contract or the policy is tested on; "contrast" shows a reading that is not the test. */
  role: "test" | "contrast";
  debt: string; cash: string;
  /** EBITDA of the trailing twelve months as reported, and what the definition adds or deducts from it. */
  reportedEbitda: string; adjustments: readonly {label: string; amount: string}[];
  /** The part of the definition's EBITDA not yet realized at the reading date (for the reverse test), null when all is realized. */
  unrealizedEbitda: string | null;
  limitIds: readonly string[];
};
export type CovenantHeadroomInput = {
  currency: string; readingDate: string;
  limits: readonly CovenantLimit[];
  measurements: readonly CovenantMeasurement[];
  /** Pairs of measurements whose difference is a named effect (for example, the season at the test date). */
  effects: readonly {id: string; label: string; measurementId: string; withoutEffectMeasurementId: string}[];
};

function date(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("covenant_invalid_date");
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("covenant_invalid_date");
}
function amount(value: string, signed = true) {
  if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,20})?$/.test(value)) throw new Error("covenant_invalid_amount");
  const v = new Exact(value); if (!signed && v.isNegative()) throw new Error("covenant_negative_amount");
  return v;
}
const text = (value: string, code: string) => {if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error(code); return value;};
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();

/** Net debt over EBITDA by the written definition, at each test date and scenario, against every
 * adopted limit: ratio, headroom in EBITDA and in net debt, and, while part of the period is still
 * ahead, how much of the unrealized EBITDA can be lost before each limit. The tightest limit is the
 * one with the least EBITDA headroom. A board policy is a second limit, never the contract. Nothing
 * is projected here: debt, cash and EBITDA at each date are the adopted ones. */
export function measureCovenantHeadroom(input: CovenantHeadroomInput) {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("covenant_invalid_currency");
  date(input.readingDate);
  if (!input.limits.length || input.limits.length > 8 || !input.measurements.length || input.measurements.length > 24) throw new Error("covenant_count");
  const limits = new Map<string, CovenantLimit & {max: Decimal}>();
  for (const l of input.limits) {
    if (!l.id.trim() || limits.has(l.id)) throw new Error("covenant_duplicate_limit");
    if (!["contractual", "board_policy"].includes(l.kind)) throw new Error("covenant_limit_kind");
    text(l.label, "covenant_label_required"); text(l.source, "covenant_source_required");
    const max = amount(l.maximumRatio, false); if (!max.gt(0)) throw new Error("covenant_limit_not_positive");
    limits.set(l.id, {...l, max});
  }
  const ids = new Set<string>();
  const measurements = input.measurements.map(m => {
    if (!m.id.trim() || ids.has(m.id)) throw new Error("covenant_duplicate_measurement");
    ids.add(m.id); date(m.date); text(m.label, "covenant_label_required"); text(m.scenario, "covenant_scenario_required");
    if (m.role !== "test" && m.role !== "contrast") throw new Error("covenant_measurement_role");
    if (m.adjustments.length > 16) throw new Error("covenant_adjustment_count");
    if (m.role === "test" && !m.limitIds.length) throw new Error("covenant_test_without_limit");
    if (new Set(m.limitIds).size !== m.limitIds.length || m.limitIds.some(id => !limits.has(id))) throw new Error("covenant_unknown_limit");
    const debt = amount(m.debt, false), cash = amount(m.cash), reported = amount(m.reportedEbitda);
    const adjustments = m.adjustments.map(a => ({label: text(a.label, "covenant_label_required"), amount: amount(a.amount)}));
    const ebitda = adjustments.reduce((s, a) => s.plus(a.amount), reported), net = debt.minus(cash);
    const unrealized = m.unrealizedEbitda === null ? null : amount(m.unrealizedEbitda);
    if (unrealized !== null && m.date <= input.readingDate) throw new Error("covenant_unrealized_after_test_date");
    const ratio = ebitda.gt(0) ? net.div(ebitda) : null;
    const tests = m.limitIds.map(id => {
      const l = limits.get(id)!;
      const ebitdaHeadroom = ebitda.minus(net.div(l.max)), debtHeadroom = l.max.mul(ebitda).minus(net);
      return {limitId: id, kind: l.kind, maximumRatio: out(l.max), breached: ratio === null ? true : ratio.gt(l.max),
        ebitdaHeadroom: out(ebitdaHeadroom), netDebtHeadroom: out(debtHeadroom),
        /** Share of the not-yet-realized EBITDA that can be lost before the limit; null when nothing is ahead. */
        unrealizedEbitdaLossToLimit: unrealized === null || !unrealized.gt(0) ? null : out(ebitdaHeadroom.div(unrealized))};
    });
    const tightest = tests.length ? tests.reduce((a, b) => new Exact(b.ebitdaHeadroom).lt(a.ebitdaHeadroom) ? b : a).limitId : null;
    return {id: m.id, label: m.label, date: m.date, scenario: m.scenario, role: m.role, debt: out(debt), cash: out(cash), netDebt: out(net),
      reportedEbitda: out(reported), adjustments: adjustments.map(a => ({label: a.label, amount: out(a.amount)})), ebitda: out(ebitda),
      ratio: ratio === null ? null : out(ratio), unrealizedEbitda: unrealized === null ? null : out(unrealized), tests, tightestLimitId: tightest};
  });
  const effects = input.effects.map(e => {
    text(e.label, "covenant_label_required");
    const a = measurements.find(m => m.id === e.measurementId), b = measurements.find(m => m.id === e.withoutEffectMeasurementId);
    if (!a || !b || a === b) throw new Error("covenant_unknown_effect_measurement");
    if (a.date !== b.date) throw new Error("covenant_effect_on_other_date");
    return {id: e.id, label: e.label, measurementId: a.id, withoutEffectMeasurementId: b.id,
      ratioEffect: a.ratio === null || b.ratio === null ? null : out(new Exact(a.ratio).minus(b.ratio)),
      netDebtEffect: out(new Exact(a.netDebt).minus(b.netDebt))};
  });
  const tested = measurements.filter(m => m.role === "test");
  const worst = tested.flatMap(m => m.tests.map(t => ({measurementId: m.id, ...t})))
    .reduce<null | {measurementId: string; limitId: string; ebitdaHeadroom: string}>((w, t) => w === null || new Exact(t.ebitdaHeadroom).lt(w.ebitdaHeadroom) ? t : w, null);
  return {schemaVersion: "covenant-headroom.v1" as const, version: covenantHeadroomVersion, currency: input.currency, readingDate: input.readingDate,
    limits: [...limits.values()].map(({max: _, ...l}) => l), measurements, effects,
    worst: worst === null ? null : {measurementId: worst.measurementId, limitId: worst.limitId, ebitdaHeadroom: worst.ebitdaHeadroom},
    anyBreach: tested.some(m => m.tests.some(t => t.breached))};
}
export type CovenantHeadroom = ReturnType<typeof measureCovenantHeadroom>;
