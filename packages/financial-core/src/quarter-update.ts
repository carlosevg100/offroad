import Decimal from "decimal.js";
import {measureCovenantHeadroom, type CovenantHeadroomInput, type CovenantMeasurement} from "./covenant-headroom";
import {buildWeeklyCash, type WeeklyCashInput, type WeeklyCashStream} from "./weekly-cash";

export const quarterUpdateVersion = "2026.10.26-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

export type QuarterUpdateLineUnit = "currency" | "days" | "ratio";
/** One line of the quarter as projected and as closed. */
export type QuarterUpdateLine = {id: string; label: string; unit: QuarterUpdateLineUnit; projected: string; actual: string};
/** A calendar cause is one-off in the quarter (it does not carry forward); a structural cause persists until a date. */
export type QuarterUpdateClassification = "calendar" | "structural";
export type QuarterUpdateCause = {
  id: string; label: string; amount: string; classification: QuarterUpdateClassification;
  /** The last day a structural cause is held to persist; null for a calendar cause. */
  until: string | null;
  /** A cause that is another line's deviation (EBITDA below plan inside the cash bridge) must equal it exactly. */
  equalsDeviationOf: string | null;
  /** The operating line that measures the cause (receivable days, an input price), when there is one. */
  driverLineId: string | null;
  /** Whether the classification is read from a document or is an interpretation the company may correct. */
  basis: "document" | "interpretation";
  /** A structural flow recurs each period (an input price without pass-through); a structural balance shift
   * (receivable days) lowers a balance once and keeps it lower, so it is carried once in the closed cash and
   * never absorbed again ahead. Null for a calendar cause. */
  nature: "flow" | "balance" | null;
  question: string | null;
};
export type QuarterUpdateBridge = {lineId: string; causes: readonly QuarterUpdateCause[]};
/** A stream of the prior weekly projection replaced by its updated series, attributed to structural causes. */
/** How the cause moves the series inside its window: every amount scaled by a factor (an input price), or every event
 * delayed by a number of days (receivable days). The adopted series must equal the transform of the prior one. */
export type QuarterUpdateTransform = {kind: "scale"; factor: string} | {kind: "delay"; days: number};
export type QuarterUpdateStreamUpdate = {streamId: string; causeIds: readonly string[]; transform: QuarterUpdateTransform; dates: readonly string[]; amounts: readonly string[]};
/** Tolerance per date between the adopted series and the transform of the prior one, in currency units. */
export const quarterUpdateSeriesTolerance = "0.000001";
/** An approved facility: the limit approved or contracted, and where the approval is written. */
export type QuarterUpdateFacility = {id: string; label: string; limit: string; source: string};
/** One step of the proposed action, in order: a fixed draw replacing planned streams, or a draw sized to what is still missing. */
export type QuarterUpdateStep =
  | {facilityId: string; mode: "fixed"; streamId: string; replacesStreamIds: readonly string[]}
  | {facilityId: string; mode: "residual"; date: string};
export type QuarterUpdateDependent = {id: string; label: string; kind: "analysis" | "plan" | "material";
  /** Lines of the close the item reads, over its own horizon. */
  reads: readonly string[]; horizonStart: string; horizonEnd: string;
  /** The result this packet computes that replaces it: "weekly_cash" (the informed case over the prior horizon),
   * "covenant:<measurement>" (one recomputed test, its definition and date) or "projection:<year>" (that year's EBITDA);
   * null when another method owns it. */
  recomputedBy: string | null;
  /** Its economic identity: the quantities it consumes, the definition and scenario they are measured on; its horizon is the period. */
  quantities: readonly string[]; definition: string | null; scenario: string | null;
  /** The method that must recompute it when this packet does not. */
  owner: string | null};
/** The quantities each result of this packet produces; lines read as drivers are inputs, never products. */
export const quarterUpdateProducedQuantities = {weekly_cash: ["cash_balance_by_week"], covenant: ["covenant_ratio", "covenant_headroom"], projection: ["annual_ebitda"]} as const;
export type QuarterUpdateInput = {
  currency: string; quarterStart: string; quarterEnd: string;
  lines: readonly QuarterUpdateLine[];
  bridges: readonly QuarterUpdateBridge[];
  /** The closed lines whose deviation carries into the projection: cash into the opening balance and the cash at the test, EBITDA into the trailing twelve months. */
  carry: {cashLineId: string; ebitdaLineId: string};
  /** The prior versions exactly as adopted; they are measured again as they stand and never overwritten. */
  prior: {weeklyCash: WeeklyCashInput; covenant: CovenantHeadroomInput};
  weekly: {updates: readonly QuarterUpdateStreamUpdate[]; added: readonly WeeklyCashStream[]};
  /** The test measurements the close updates (one per definition read: indenture, the board's managerial); the first leads.
   * What each structural cause still does to them is derived here from its own amount and persistence, never adopted. */
  covenant: {measurementIds: readonly string[]};
  facilities: readonly QuarterUpdateFacility[];
  steps: readonly QuarterUpdateStep[];
  dependents: readonly QuarterUpdateDependent[];
};

function date(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("quarter_update_invalid_date");
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("quarter_update_invalid_date");
  return value;
}
const shift = (value: string, days: number) => new Date(new Date(`${value}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
function amount(value: string) {
  if (typeof value !== "string" || !/^-?\d{1,24}(?:\.\d{1,20})?$/.test(value)) throw new Error("quarter_update_invalid_amount");
  return new Exact(value);
}
const text = (value: string, code: string) => {if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error(code); return value;};
const key = (value: string) => {if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(value)) throw new Error("quarter_update_invalid_id"); return value;};
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const overlaps = (a0: string, a1: string, b0: string, b1: string) => a0 <= b1 && b0 <= a1;
const sum = (values: Decimal[]) => values.reduce((s, v) => s.plus(v), new Exact(0));
const dayCount = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
export type QuarterUpdateGapReason = "unexplained_residual" | "structural_cause_not_in_weekly_cash" | "structural_cause_weekly_effect_inconsistent"
  | "structural_cause_series_not_matching_factor" | "structural_cause_question_missing" | "affected_not_recomputed";

/** What the quarter changed and what it changes ahead. Actual against projected line by line; each
 * bridged deviation explained by causes that must sum to it exactly, the unexplained residual named
 * and never spread; each cause one-off or structural until a date. The closed cash and EBITDA carry
 * into the prior projection once, and only the structural causes move it further, inside their
 * persistence window: a flow runs at its quarterly amount for the days it persists until the test, a
 * balance shift (receivable days) is carried once and never absorbed again, and each one must move the
 * weekly cash the same way or it is a named gap. The weekly cash and the covenant tests (one per
 * definition read) are measured again by their released kernels on the prior version plus what
 * changed, with the prior version kept beside the update. The action is sized within the approved
 * facilities: fixed draws first, then the residual draw the weeks still need. Every dependent
 * analysis, plan or material is updated, unchanged or stale by what it reads, never redone. */
export function updateAfterQuarterClose(input: QuarterUpdateInput) {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("quarter_update_invalid_currency");
  const qs = date(input.quarterStart), qe = date(input.quarterEnd);
  if (qs >= qe) throw new Error("quarter_update_invalid_quarter");
  const priorWeekly = input.prior.weeklyCash, priorCovenant = input.prior.covenant;
  if (priorWeekly.currency !== input.currency || priorCovenant.currency !== input.currency) throw new Error("quarter_update_currency_mismatch");
  if (!input.lines.length || input.lines.length > 24 || input.bridges.length > 8 || input.dependents.length > 16 || input.steps.length > 4 || input.facilities.length > 8) throw new Error("quarter_update_count");

  const lines = new Map<string, QuarterUpdateLine & {deviation: Decimal}>();
  for (const l of input.lines) {
    key(l.id); if (lines.has(l.id)) throw new Error("quarter_update_duplicate_line");
    text(l.label, "quarter_update_label_required");
    if (!["currency", "days", "ratio"].includes(l.unit)) throw new Error("quarter_update_line_unit");
    lines.set(l.id, {...l, deviation: amount(l.actual).minus(amount(l.projected))});
  }
  const line = (id: string) => {const l = lines.get(id); if (!l) throw new Error("quarter_update_unknown_line"); return l;};
  const {cashLineId, ebitdaLineId} = input.carry;
  if (cashLineId === ebitdaLineId || line(cashLineId).unit !== "currency" || line(ebitdaLineId).unit !== "currency") throw new Error("quarter_update_carry_lines");

  // Bridges: causes sum to the deviation exactly; what does not is a residual named on the line.
  const causes = new Map<string, QuarterUpdateCause & {lineId: string; value: Decimal}>();
  const gaps: {item: string; reason: QuarterUpdateGapReason}[] = [];
  if (new Set(input.bridges.map(b => b.lineId)).size !== input.bridges.length) throw new Error("quarter_update_duplicate_bridge");
  if (![cashLineId, ebitdaLineId].every(id => input.bridges.some(b => b.lineId === id))) throw new Error("quarter_update_carry_line_without_bridge");
  const bridges = input.bridges.map(b => {
    const l = line(b.lineId);
    if (l.unit !== "currency") throw new Error("quarter_update_bridge_unit");
    if (!b.causes.length || b.causes.length > 12) throw new Error("quarter_update_bridge_causes");
    const rows = b.causes.map(c => {
      key(c.id); if (causes.has(c.id)) throw new Error("quarter_update_duplicate_cause");
      text(c.label, "quarter_update_label_required");
      if (c.classification === "calendar") {
        if (c.until !== null) throw new Error("quarter_update_calendar_cause_with_end");
        if (c.nature !== null) throw new Error("quarter_update_cause_nature");
      } else if (c.classification === "structural") {
        if (c.until === null || date(c.until) <= qe) throw new Error("quarter_update_structural_cause_end");
        if (c.nature !== "flow" && c.nature !== "balance") throw new Error("quarter_update_cause_nature");
        // Only the carried lines move the projection; a balance shift is a cash balance.
        if (b.lineId !== cashLineId && b.lineId !== ebitdaLineId) throw new Error("quarter_update_structural_cause_off_carry");
        if (c.nature === "balance" && b.lineId !== cashLineId) throw new Error("quarter_update_balance_cause_off_cash");
      } else throw new Error("quarter_update_classification");
      if (c.basis !== "document" && c.basis !== "interpretation") throw new Error("quarter_update_cause_basis");
      if (c.question !== null) text(c.question, "quarter_update_question_required");
      if (c.driverLineId !== null) line(c.driverLineId);
      const value = amount(c.amount);
      if (c.equalsDeviationOf !== null) {
        if (c.equalsDeviationOf === b.lineId) throw new Error("quarter_update_linked_cause_mismatch");
        if (!value.eq(line(c.equalsDeviationOf).deviation)) throw new Error("quarter_update_linked_cause_mismatch");
      }
      causes.set(c.id, {...c, lineId: b.lineId, value});
      // A balance shift read by interpretation leaves its diagnosis open (agreed terms or late payment): the question is part of the answer.
      if (c.classification === "structural" && c.nature === "balance" && c.basis === "interpretation" && c.question === null) gaps.push({item: `cause.${c.id}`, reason: "structural_cause_question_missing"});
      return {id: c.id, label: c.label, amount: out(value), classification: c.classification, until: c.until, nature: c.nature, basis: c.basis, question: c.question,
        equalsDeviationOf: c.equalsDeviationOf, driverLineId: c.driverLineId};
    });
    const explained = sum(b.causes.map(c => causes.get(c.id)!.value)), residual = l.deviation.minus(explained);
    if (!residual.isZero()) gaps.push({item: `bridge.${b.lineId}`, reason: "unexplained_residual"});
    return {lineId: b.lineId, label: l.label, projected: l.projected, actual: l.actual, deviation: out(l.deviation), causes: rows, explained: out(explained), residual: out(residual)};
  });
  const structural = (id: string) => {
    const c = causes.get(id); if (!c) throw new Error("quarter_update_unknown_cause");
    if (c.classification !== "structural") throw new Error("quarter_update_calendar_cause_propagated");
    return c;
  };

  // Weekly cash: the prior version as adopted, and the update built on it.
  const weeklyEnd = shift(priorWeekly.firstMonday, priorWeekly.weeks * 7 - 1);
  if (priorWeekly.firstMonday > qe || weeklyEnd <= qe) throw new Error("quarter_update_projection_outside_close");
  const informed = priorWeekly.cases.find(c => c.role === "informed");
  if (!informed) throw new Error("quarter_update_prior_without_informed_case");
  const priorStreams = new Map(priorWeekly.streams.map(s => [s.id, s]));
  const inWeekly = new Map<string, {streams: string[]; effect: Decimal; matches: boolean}>();
  const byDate = (dates: readonly string[], amounts: readonly string[]) => {
    const m = new Map<string, Decimal>(); dates.forEach((d, n) => m.set(d, (m.get(d) ?? new Exact(0)).plus(amount(amounts[n]!)))); return m;
  };
  if (new Set(input.weekly.updates.map(u => u.streamId)).size !== input.weekly.updates.length) throw new Error("quarter_update_duplicate_stream_update");
  const updated = new Map(priorStreams);
  for (const u of input.weekly.updates) {
    const prior = priorStreams.get(u.streamId);
    if (!prior) throw new Error("quarter_update_unknown_stream");
    if (!u.causeIds.length || new Set(u.causeIds).size !== u.causeIds.length) throw new Error("quarter_update_stream_update_without_cause");
    // Each series change belongs to one cause and is bounded by that cause's own window; a shared attribution proves neither.
    if (u.causeIds.length !== 1) throw new Error("quarter_update_series_shared_by_causes");
    // Only a series of the scenario actually used can carry a cause into the weekly cash.
    if (!informed.streamIds.includes(u.streamId)) throw new Error("quarter_update_series_outside_scenario");
    const named = u.causeIds.map(structural);
    if (!u.dates.length || u.dates.length !== u.amounts.length) throw new Error("quarter_update_stream_series");
    u.dates.forEach(date); u.amounts.forEach(amount);
    const same = u.dates.length === prior.dates.length && u.dates.every((d, n) => d === prior.dates[n] && amount(u.amounts[n]!).eq(amount(prior.amounts[n]!)));
    if (same) throw new Error("quarter_update_stream_update_without_change");
    // A series moves only while its causes persist: before the close the actual already holds it, after the end the cause is gone.
    const until = named[0]!.until!;
    const before = byDate(prior.dates, prior.amounts), after = byDate(u.dates, u.amounts);
    for (const d of new Set([...before.keys(), ...after.keys()])) {
      const change = (after.get(d) ?? new Exact(0)).minus(before.get(d) ?? new Exact(0));
      if (!change.isZero() && (d <= qe || d > until)) throw new Error("quarter_update_series_outside_persistence");
    }
    // The adopted series must be the cause's own transform of the prior series, inside the window, within the tolerance.
    const inside = (d: string) => d > qe && d <= until, expected = new Map([...before].filter(([d]) => !inside(d)));
    if (u.transform.kind === "scale") {
      const factor = amount(u.transform.factor); if (!factor.gt(0)) throw new Error("quarter_update_transform");
      for (const [d, v] of before) if (inside(d)) expected.set(d, v.mul(factor));
    } else if (u.transform.kind === "delay") {
      if (!Number.isInteger(u.transform.days) || u.transform.days === 0 || Math.abs(u.transform.days) > 366) throw new Error("quarter_update_transform");
      for (const [d, v] of before) {const to = shift(d, u.transform.days); if (inside(to)) expected.set(to, (expected.get(to) ?? new Exact(0)).plus(v));}
    } else throw new Error("quarter_update_transform");
    const tolerance = new Exact(quarterUpdateSeriesTolerance);
    // The effect is the transform's own, never the adopted noise: an identity transform moves nothing.
    let effect = new Exact(0);
    for (const d of new Set([...expected.keys(), ...before.keys()])) {
      const change = (expected.get(d) ?? new Exact(0)).minus(before.get(d) ?? new Exact(0));
      effect = effect.plus(prior.direction === "inflow" ? change : change.neg());
    }
    let matches = [...new Set([...expected.keys(), ...after.keys()])].every(d => (after.get(d) ?? new Exact(0)).minus(expected.get(d) ?? new Exact(0)).abs().lte(tolerance));
    // A delay measured by a line in days must be that line's deviation.
    const driver = named[0]!.driverLineId === null ? null : line(named[0]!.driverLineId);
    if (u.transform.kind === "delay" && driver?.unit === "days" && !driver.deviation.eq(u.transform.days)) matches = false;
    for (const c of named) {const w = inWeekly.get(c.id) ?? {streams: [], effect: new Exact(0), matches: true};
      inWeekly.set(c.id, {streams: [...w.streams, u.streamId], effect: w.effect.plus(effect), matches: w.matches && matches});}
    updated.set(u.streamId, {...prior, dates: [...u.dates], amounts: [...u.amounts]});
  }
  const added = new Set<string>();
  for (const s of input.weekly.added) {
    key(s.id); if (updated.has(s.id)) throw new Error("quarter_update_duplicate_stream");
    // Added streams are draws on approved facilities; their cost is the weekly cash method's, not this one's.
    if (s.category !== "operating" || s.direction !== "inflow" || s.obligation !== null) throw new Error("quarter_update_added_stream_kind");
    updated.set(s.id, {...s, dates: [...s.dates], amounts: [...s.amounts]}); added.add(s.id);
  }
  const cashDeviation = line(cashLineId).deviation, ebitdaDeviation = line(ebitdaLineId).deviation;
  const openingUpdated = amount(priorWeekly.openingCash).plus(cashDeviation);
  const baseStreams = [...informed.streamIds];
  const facilities = new Map<string, QuarterUpdateFacility & {cap: Decimal}>();
  for (const f of input.facilities) {
    key(f.id); if (facilities.has(f.id)) throw new Error("quarter_update_duplicate_facility");
    text(f.label, "quarter_update_label_required"); text(f.source, "quarter_update_source_required");
    const cap = amount(f.limit); if (!cap.gt(0)) throw new Error("quarter_update_facility_limit");
    facilities.set(f.id, {...f, cap});
  }
  const weeklyInput = (extra: WeeklyCashStream[], cases: WeeklyCashInput["cases"]): WeeklyCashInput => ({
    ...priorWeekly, openingCash: out(openingUpdated), streams: [...updated.values(), ...extra], cases, actions: [],
    // The prior projection's closing is what this update replaces; it is not a reconciliation target any more.
    projectionClosing: null});
  const run = (streamIds: readonly string[], extra: WeeklyCashStream[] = []) =>
    buildWeeklyCash(weeklyInput(extra, [{id: "caso", label: "caso", role: "informed", streamIds}])).cases[0]!;
  const drawStream = (id: string, label: string, day: string, value: Decimal): WeeklyCashStream =>
    ({id, label, category: "operating", direction: "inflow", obligation: null, dates: [date(day)], amounts: [out(value)]});

  // Steps of the action, each a case of the same updated basis.
  const usedFacilities = new Set<string>(), extra: WeeklyCashStream[] = [];
  let current = [...baseStreams];
  const cases: {id: string; label: string; role: "informed" | "alternative"; streamIds: string[]}[] = [{id: "atualizado", label: "Projeção atualizada pelo fechamento", role: "informed", streamIds: [...baseStreams]}];
  const fullLimit: {facilityId: string; caseId: string; amount: string}[] = [];
  const steps = input.steps.map((s, n) => {
    const f = facilities.get(s.facilityId);
    if (!f || usedFacilities.has(s.facilityId)) throw new Error("quarter_update_step_facility");
    usedFacilities.add(s.facilityId);
    let drawn: Decimal;
    if (s.mode === "fixed") {
      const stream = updated.get(s.streamId);
      if (!stream || !added.has(s.streamId) || current.includes(s.streamId)) throw new Error("quarter_update_step_stream");
      if (new Set(s.replacesStreamIds).size !== s.replacesStreamIds.length || s.replacesStreamIds.some(id => !current.includes(id) || updated.get(id)!.direction !== "inflow")) throw new Error("quarter_update_step_replacement");
      drawn = sum(stream.amounts.map(amount));
      current = [...current.filter(id => !s.replacesStreamIds.includes(id)), s.streamId];
    } else if (s.mode === "residual") {
      date(s.date); if (s.date < priorWeekly.firstMonday || s.date > weeklyEnd) throw new Error("quarter_update_step_date");
      const id = `saque-${s.facilityId}`, limitId = `limite-${s.facilityId}`;
      if (updated.has(id) || updated.has(limitId)) throw new Error("quarter_update_duplicate_stream");
      // What the case still lacks to the minimum, drawn on the facility's date; the full limit is shown beside it.
      drawn = amount(run(current, extra).shortfallToMinimum);
      const full = drawStream(limitId, `${f.label}: limite inteiro`, s.date, f.cap);
      extra.push(full);
      cases.push({id: `limite-${s.facilityId}`, label: `${f.label}: limite inteiro sobre a projeção atualizada`, role: "alternative", streamIds: [...baseStreams, limitId]});
      fullLimit.push({facilityId: f.id, caseId: `limite-${s.facilityId}`, amount: out(f.cap)});
      if (drawn.gt(0)) {extra.push(drawStream(id, f.label, s.date, drawn)); current = [...current, id];}
    } else throw new Error("quarter_update_step_mode");
    cases.push({id: `passo-${n + 1}`, label: `Passo ${n + 1}: ${f.label}`, role: "alternative", streamIds: [...current]});
    return {facilityId: f.id, mode: s.mode, amount: out(drawn), limit: out(f.cap), withinLimit: drawn.lte(f.cap), caseId: `passo-${n + 1}`, source: f.source};
  });
  for (const id of added) if (!input.steps.some(s => s.mode === "fixed" && s.streamId === id)) throw new Error("quarter_update_added_stream_unused");
  if (cases.length > 8) throw new Error("quarter_update_count");
  const weeklyPrior = buildWeeklyCash(priorWeekly);
  const weeklyUpdated = buildWeeklyCash(weeklyInput(extra, cases));
  const at = (id: string) => weeklyUpdated.cases.find(c => c.id === id)!;
  const priorInformed = weeklyPrior.cases.find(c => c.role === "informed")!, informedNow = at("atualizado");
  const stepRows = steps.map(s => ({...s, minimum: at(s.caseId).minimum, covers: at(s.caseId).weeksBelowMinimum.length === 0}));
  const last = stepRows[stepRows.length - 1];

  // Covenant: the prior tests as they stand, and the same tests with the close carried and the structural causes ahead.
  const ids = input.covenant.measurementIds;
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("quarter_update_unknown_measurement");
  const targets = ids.map(id => {
    const m = priorCovenant.measurements.find(x => x.id === id);
    if (!m || m.role !== "test") throw new Error("quarter_update_unknown_measurement");
    // The closed quarter must sit inside the twelve months the test reads.
    if (m.date < qe || qs <= `${Number(m.date.slice(0, 4)) - 1}${m.date.slice(4)}`) throw new Error("quarter_update_quarter_outside_test_period");
    return m;
  });
  const quarterDays = dayCount(qs, qe);
  const structuralCauses = [...causes.values()].filter(c => c.classification === "structural");
  /** Each structural flow still runs at its quarterly amount for the days it persists until the test date; a balance shift is carried once. */
  const ahead = (m: CovenantMeasurement) => structuralCauses.map(c => {
    const end = c.until! < m.date ? c.until! : m.date, fraction = c.nature === "flow" ? new Exact(dayCount(shift(qe, 1), end)).div(quarterDays) : new Exact(0);
    const flow = c.value.mul(fraction);
    return {causeId: c.id, nature: c.nature!, fraction: out(fraction), ebitda: out(c.lineId === ebitdaLineId ? flow : new Exact(0)), cash: out(flow)};
  });
  const updatedMeasurements = targets.map(m => {
    const e = ahead(m);
    const measurement: CovenantMeasurement = {...m, scenario: `${m.scenario}_atualizado`, label: `${m.label} (atualizado pelo fechamento de ${qe})`,
      reportedEbitda: out(amount(m.reportedEbitda).plus(ebitdaDeviation).plus(sum(e.map(x => amount(x.ebitda))))),
      cash: out(amount(m.cash).plus(cashDeviation).plus(sum(e.map(x => amount(x.cash))))),
      // The reverse test belonged to the prior reading date; it is not carried into the update.
      unrealizedEbitda: null};
    return {measurement, effects: e};
  });
  const readingDate = priorCovenant.readingDate > qe ? priorCovenant.readingDate : qe;
  const covenantPrior = measureCovenantHeadroom(priorCovenant);
  const covenantUpdated = measureCovenantHeadroom({...priorCovenant, readingDate, measurements: updatedMeasurements.map(u => u.measurement), effects: []});
  const lead = updatedMeasurements[0]!.effects;

  // A structural cause reaches every recomputation: the projection and the covenant by derivation, the weekly cash by a series it moves the same way.
  for (const c of structuralCauses) {
    const w = inWeekly.get(c.id);
    if (!w) gaps.push({item: `cause.${c.id}`, reason: "structural_cause_not_in_weekly_cash"});
    else if (w.effect.abs().lte(quarterUpdateSeriesTolerance) || w.effect.isNegative() !== c.value.isNegative()) gaps.push({item: `cause.${c.id}`, reason: "structural_cause_weekly_effect_inconsistent"});
    else if (!w.matches) gaps.push({item: `cause.${c.id}`, reason: "structural_cause_series_not_matching_factor"});
  }
  const weeklyReasons: QuarterUpdateGapReason[] = ["structural_cause_not_in_weekly_cash", "structural_cause_weekly_effect_inconsistent", "structural_cause_series_not_matching_factor"];
  const weeklyPropagated = structuralCauses.every(c => !gaps.some(g => g.item === `cause.${c.id}` && weeklyReasons.includes(g.reason)));

  // Dependents: affected by what they read over their horizon, never recomputed when nothing they read moved.
  // The only results this packet computes, each identified: the weekly cash of the informed case over the prior horizon,
  // each recomputed covenant test (limit, definition, scenario, date) and the EBITDA of the projection year.
  const yearBefore = (d: string) => shift(`${Number(d.slice(0, 4)) - 1}${d.slice(4)}`, 1);
  const leadDate = targets[0]!.date;
  type Result = {kind: "weekly_cash" | "covenant" | "projection"; id: string; start: string; end: string; scenario: string; definition: string | null; produces: readonly string[]; propagated: boolean};
  const results = new Map<string, Result>([
    ["weekly_cash", {kind: "weekly_cash", id: "weekly_cash", start: priorWeekly.firstMonday, end: weeklyEnd, scenario: informed.id, definition: null,
      produces: quarterUpdateProducedQuantities.weekly_cash, propagated: weeklyPropagated}],
    ...targets.map(m => [`covenant:${m.id}`, {kind: "covenant" as const, id: m.id, start: yearBefore(m.date), end: m.date, scenario: m.scenario, definition: m.label,
      produces: quarterUpdateProducedQuantities.covenant, propagated: true}] as [string, Result]),
    // The projection year exists only when the leading test closes a calendar year; its EBITDA is the reported one.
    ...leadDate.endsWith("-12-31") ? [[`projection:${leadDate.slice(0, 4)}`, {kind: "projection" as const, id: leadDate.slice(0, 4), start: `${leadDate.slice(0, 4)}-01-01`, end: leadDate,
      scenario: targets[0]!.scenario, definition: null, produces: quarterUpdateProducedQuantities.projection, propagated: true}] as [string, Result]] : [],
  ]);
  const forwardUntil = (lineId: string) => [...causes.values()].filter(c => c.classification === "structural" && (c.lineId === lineId || c.driverLineId === lineId))
    .reduce<string | null>((u, c) => u === null || c.until! > u ? c.until! : u, null);
  if (new Set(input.dependents.map(d => d.id)).size !== input.dependents.length) throw new Error("quarter_update_duplicate_dependent");
  const dependents = input.dependents.map(d => {
    key(d.id); text(d.label, "quarter_update_label_required");
    if (!["analysis", "plan", "material"].includes(d.kind)) throw new Error("quarter_update_dependent_kind");
    if (d.recomputedBy !== null && !/^(weekly_cash|covenant:[a-z0-9][a-z0-9_-]{0,39}|projection:[1-9]\d{3})$/.test(d.recomputedBy)) throw new Error("quarter_update_dependent_recomputation");
    if (d.owner !== null) text(d.owner, "quarter_update_owner_required");
    if (d.quantities.length > 8 || d.quantities.some(q => !/^[a-z][a-z0-9_]{0,59}$/.test(q))) throw new Error("quarter_update_dependent_quantities");
    if (date(d.horizonStart) > date(d.horizonEnd) || d.reads.length > 24) throw new Error("quarter_update_dependent_horizon");
    const moved = d.reads.filter(id => {
      const l = line(id), until = forwardUntil(id);
      return (!l.deviation.isZero() && overlaps(qs, qe, d.horizonStart, d.horizonEnd)) || (until !== null && overlaps(shift(qe, 1), until, d.horizonStart, d.horizonEnd));
    });
    const supersededByClose = d.kind === "material" && d.horizonEnd < qe && d.reads.some(id => !line(id).deviation.isZero());
    if (!moved.length && d.recomputedBy !== null) throw new Error("quarter_update_recomputes_unaffected");
    // Bound only to the very result: every quantity it consumes produced by it, same definition, scenario and period.
    const bound = d.recomputedBy === null ? null : results.get(d.recomputedBy) ?? null;
    const binding = d.recomputedBy === null ? "none" as const
      : bound !== null && d.quantities.length > 0 && d.quantities.every(q => bound.produces.includes(q)) && d.definition === bound.definition && d.scenario === bound.scenario
        && d.horizonStart === bound.start && d.horizonEnd === bound.end ? "matched" as const : "mismatched" as const;
    const status = !moved.length ? (supersededByClose ? "stale" as const : "unchanged" as const)
      : binding === "matched" && bound!.propagated ? "updated" as const : "affected_not_recomputed" as const;
    // A result this packet computes whose propagation is missing is a gap; anything owned elsewhere is information for its owner.
    if (status === "affected_not_recomputed" && binding === "matched") gaps.push({item: `dependent.${d.id}`, reason: "affected_not_recomputed"});
    return {id: d.id, label: d.label, kind: d.kind, status, movedBy: moved, recomputedBy: d.recomputedBy,
      binding, result: binding === "matched" ? {kind: bound!.kind, id: bound!.id, start: bound!.start, end: bound!.end, scenario: bound!.scenario, definition: bound!.definition, produces: [...bound!.produces]} : null,
      owner: binding === "matched" ? null : d.owner,
      /** A stale material is offered again with the closed figures; it is never sent from here. */
      sentToThirdParties: false as const};
  });

  return {schemaVersion: "quarter-update.v1" as const, version: quarterUpdateVersion, currency: input.currency, quarterStart: qs, quarterEnd: qe,
    lines: [...lines.values()].map(l => ({id: l.id, label: l.label, unit: l.unit, projected: l.projected, actual: l.actual, deviation: out(l.deviation)})),
    bridges,
    propagation: [...causes.values()].map(c => {
      const e = lead.find(x => x.causeId === c.id), w = inWeekly.get(c.id);
      return {causeId: c.id, classification: c.classification, nature: c.nature, until: c.until, streams: w?.streams ?? [],
        weeklyEffect: w ? out(w.effect) : null, fractionAhead: e?.fraction ?? null, ebitdaAhead: e?.ebitda ?? null, cashAhead: e?.cash ?? null};
    }),
    weekly: {prior: weeklyPrior, updated: weeklyUpdated,
      carriedOpening: {prior: out(amount(priorWeekly.openingCash)), deviation: out(cashDeviation), updated: out(openingUpdated)},
      tightest: {prior: {...priorInformed.minimum, shortfallToMinimum: priorInformed.shortfallToMinimum},
        updated: {...informedNow.minimum, shortfallToMinimum: informedNow.shortfallToMinimum}},
      closing: {prior: priorInformed.closing, updated: informedNow.closing}},
    action: {steps: stepRows, fullLimit: fullLimit.map(f => ({...f, minimum: at(f.caseId).minimum, covers: at(f.caseId).weeksBelowMinimum.length === 0})),
      withinApproved: stepRows.every(s => s.withinLimit), covers: last ? last.covers : null},
    covenant: {measurementIds: [...ids], prior: covenantPrior, updated: covenantUpdated,
      carried: {ebitda: out(ebitdaDeviation), cash: out(cashDeviation)},
      measurements: updatedMeasurements.map(u => {
        const before = covenantPrior.measurements.find(m => m.id === u.measurement.id)!, now = covenantUpdated.measurements.find(m => m.id === u.measurement.id)!;
        return {id: now.id, label: before.label, scenario: before.scenario, effects: u.effects,
          trailingEbitda: {prior: before.reportedEbitda, updated: now.reportedEbitda}, ratio: {prior: before.ratio, updated: now.ratio}};
      }),
      measurementsNotUpdated: priorCovenant.measurements.filter(m => !ids.includes(m.id)).map(m => m.id),
      effectsNotUpdated: priorCovenant.effects.map(e => e.id)},
    dependents, gaps};
}
export type QuarterUpdate = ReturnType<typeof updateAfterQuarterClose>;
