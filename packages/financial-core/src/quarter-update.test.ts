import {describe, expect, it} from "vitest";
import {buildWeeklyCash} from "./weekly-cash";
import {measureCovenantHeadroom} from "./covenant-headroom";
import {updateAfterQuarterClose, type QuarterUpdateInput} from "./quarter-update";
import {auroraDearerInputs, auroraQuarterUpdate as base} from "./quarter-update.fixture";

const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
const withBridge = (lineId: string, edit: (c: QuarterUpdateInput["bridges"][number]["causes"]) => QuarterUpdateInput["bridges"][number]["causes"]): QuarterUpdateInput =>
  ({...base, bridges: base.bridges.map(b => b.lineId === lineId ? {...b, causes: edit(b.causes)} : b)});
describe("update after the quarter close", () => {
  const u = updateAfterQuarterClose(base);
  const policy = (m: string, h: "prior" | "updated") => u.covenant[h].measurements.find(x => x.id === m)!.tests.find(t => t.limitId === "politica")!.ebitdaHeadroom;
  it("bridges EBITDA and cash by cause, summing exactly to the deviations", () => {
    expect(u.bridges.map(b => [b.lineId, b.deviation, b.explained, b.residual])).toEqual([["ebitda", "-0.4", "-0.4", "0"], ["caixa", "-1.7", "-1.7", "0"]]);
    expect(u.gaps).toEqual([]);
    expect(u.propagation.filter(p => p.classification === "structural").map(p => [p.causeId, p.nature, p.until, p.streams, n(p.weeklyEffect, 2), p.fractionAhead, p.ebitdaAhead, p.cashAhead]))
      .toEqual([["trigo", "flow", "2026-12-31", ["insumos"], "-0.70", "1", "-0.6", "-0.6"], ["prazo-redes", "balance", "2026-12-31", ["recebimentos"], "-0.69", "0", "0", "0"]]);
  });
  it("carries the close into the weekly cash and moves the series only while the causes persist", () => {
    expect(u.weekly.carriedOpening).toEqual({prior: "41", deviation: "-1.7", updated: "39.3"});
    expect([u.weekly.tightest.prior.weekStart, n(u.weekly.tightest.prior.closing), n(u.weekly.tightest.prior.shortfallToMinimum)]).toEqual(["2026-12-21", "7.5", "7.5"]);
    expect([u.weekly.tightest.updated.weekStart, n(u.weekly.tightest.updated.closing, 2), n(u.weekly.tightest.updated.shortfallToMinimum, 2)]).toEqual(["2026-12-21", "4.39", "10.61"]);
    expect(n(u.weekly.closing.updated)).toBe("13.1");
    expect(u.action.fullLimit.map(f => [f.facilityId, f.amount, n(f.minimum.closing, 2), f.covers])).toEqual([["conta-garantida", "10", "14.39", false]]);
  });
  it("sizes the action within what is approved", () => {
    expect(u.action.steps.map(s => [s.facilityId, n(s.amount, 2), s.withinLimit, n(s.minimum.closing, 2), s.covers]))
      .toEqual([["programas-redes", "23.00", true, "10.39", false], ["conta-garantida", "4.61", true, "15.00", true]]);
    expect([u.action.withinApproved, u.action.covers]).toEqual([true, true]);
  });
  it("measures December again by the indenture and by the board's managerial definition, without absorbing the receivable days twice", () => {
    expect(u.covenant.measurements.map(m => [m.id, n(m.trailingEbitda.prior), n(m.trailingEbitda.updated), n(m.ratio.prior, 2), n(m.ratio.updated, 2)]))
      .toEqual([["dez26-base", "54.5", "53.5", "2.20", "2.29"], ["dez26-gerencial", "55.5", "54.5", "2.04", "2.12"]]);
    expect([n(policy("dez26-base", "prior")), n(policy("dez26-base", "updated"))]).toEqual(["6.2", "4.3"]);
    expect([n(policy("dez26-gerencial", "prior")), n(policy("dez26-gerencial", "updated"))]).toEqual(["10.2", "8.3"]);
    expect(u.covenant.measurementsNotUpdated).toEqual(["dez27-base"]);
  });
  it("keeps the oracle's second absorption of 2.1 only as a contrast", () => {
    // modelo_c54.py lowers December cash by the quarter's 1.7 and again by 2.1 of receivable days; the days are already inside the 1.7.
    const m = base.prior.covenant.measurements.find(x => x.id === "dez26-base")!;
    const oracle = measureCovenantHeadroom({...base.prior.covenant, readingDate: "2026-09-30", effects: [],
      measurements: [{...m, unrealizedEbitda: null, reportedEbitda: "53.5", cash: String(Number(m.cash) - 1.7 - 2.1)}]}).measurements[0]!;
    expect([n(oracle.ratio, 2), n(oracle.tests.find(t => t.limitId === "politica")!.ebitdaHeadroom)]).toEqual(["2.32", "3.7"]);
    expect(n(u.covenant.measurements[0]!.ratio.updated, 2)).not.toBe(n(oracle.ratio, 2));
  });
  it("keeps the prior versions exactly as the released kernels measure them", () => {
    const before = JSON.stringify(base.prior);
    const again = updateAfterQuarterClose(base);
    expect(JSON.stringify(base.prior)).toBe(before);
    expect(again.weekly.prior).toEqual(buildWeeklyCash(base.prior.weeklyCash));
    expect(again.covenant.prior).toEqual(measureCovenantHeadroom(base.prior.covenant));
  });
  it("updates only what reads a moved line and names what did not change", () => {
    expect(u.dependents.map(d => [d.id, d.status])).toEqual([["caixa-semanal", "updated"], ["covenant-dez26", "updated"], ["projecao-2026", "updated"],
      ["tabela-divida", "unchanged"], ["plano-2027", "unchanged"], ["linha-embalagem", "unchanged"], ["material-sondagem", "stale"]]);
    expect(u.dependents.every(d => d.sentToThirdParties === false)).toBe(true);
    expect(() => updateAfterQuarterClose({...base, dependents: base.dependents.map(d => d.id === "plano-2027" ? {...d, recomputedBy: "projection" as const} : d)})).toThrow("quarter_update_recomputes_unaffected");
    const missed = updateAfterQuarterClose({...base, dependents: base.dependents.map(d => d.id === "caixa-semanal" ? {...d, recomputedBy: null} : d)});
    expect(missed.gaps).toEqual([{item: "dependent.caixa-semanal", reason: "affected_not_recomputed"}]);
  });
  it("names an unexplained residual and never spreads it", () => {
    const r = updateAfterQuarterClose(withBridge("caixa", c => c.filter(x => x.id !== "impostos-outros")));
    expect(r.bridges.find(b => b.lineId === "caixa")!.residual).toBe("2.4");
    expect(r.gaps).toEqual([{item: "bridge.caixa", reason: "unexplained_residual"}]);
  });
  it("review r1: a structural cause with no weekly effect is a gap, and the covenant and projection still carry it", () => {
    const r = updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: []}});
    expect(r.gaps).toEqual([{item: "cause.trigo", reason: "structural_cause_not_in_weekly_cash"}, {item: "cause.prazo-redes", reason: "structural_cause_not_in_weekly_cash"}]);
    expect(n(r.covenant.measurements[0]!.trailingEbitda.updated)).toBe("53.5");
    const cheaper = base.weekly.updates.map(x => x.streamId === "insumos" ? {...x, amounts: x.amounts.map((a, k) => x.dates[k]! > "2026-09-30" ? "5.7" : a)} : x);
    expect(updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: cheaper}}).gaps).toEqual([{item: "cause.trigo", reason: "structural_cause_weekly_effect_inconsistent"}]);
  });
  it("review r1: effects are bounded by the persistence window", () => {
    const short = withBridge("ebitda", c => c.map(x => x.id === "trigo" ? {...x, until: "2026-10-03"} : x));
    expect(() => updateAfterQuarterClose(short)).toThrow("quarter_update_series_outside_persistence");
    const bounded = updateAfterQuarterClose({...short, weekly: {...short.weekly, updates: short.weekly.updates.map(x => x.streamId === "insumos" ? {...x, ...auroraDearerInputs("2026-10-03")} : x)}});
    const trigo = bounded.propagation.find(p => p.causeId === "trigo")!;
    expect([n(trigo.fractionAhead, 4), n(trigo.ebitdaAhead, 4), n(trigo.weeklyEffect, 3)]).toEqual(["0.0326", "-0.0196", "-0.058"]);
    expect(n(bounded.covenant.measurements[0]!.trailingEbitda.updated, 2)).toBe("54.08");
    // A series moved before the close is already in the actual.
    const early = base.weekly.updates.map(x => x.streamId === "insumos" ? {...x, amounts: x.amounts.map(() => "5.858")} : x);
    expect(() => updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: early}})).toThrow("quarter_update_series_outside_persistence");
  });
  it("asks the open diagnosis of a balance shift read by interpretation", () => {
    const r = updateAfterQuarterClose(withBridge("caixa", c => c.map(x => x.id === "prazo-redes" ? {...x, question: null} : x)));
    expect(r.gaps).toEqual([{item: "cause.prazo-redes", reason: "structural_cause_question_missing"}]);
    expect(() => updateAfterQuarterClose(withBridge("ebitda", c => c.map(x => x.id === "trigo" ? {...x, nature: "balance" as const} : x)))).toThrow("quarter_update_balance_cause_off_cash");
    expect(() => updateAfterQuarterClose(withBridge("ebitda", c => c.map(x => x.id === "volume" ? {...x, nature: "flow" as const} : x)))).toThrow("quarter_update_cause_nature");
  });
  it("refuses a calendar cause that moves the projection", () => {
    const moved = base.weekly.updates.map(x => x.streamId === "insumos" ? {...x, causeIds: ["estoque-trigo"]} : x);
    expect(() => updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: moved}})).toThrow("quarter_update_calendar_cause_propagated");
  });
  it("refuses malformed updates", () => {
    expect(() => updateAfterQuarterClose(withBridge("caixa", c => c.map(x => x.id === "ebitda-abaixo" ? {...x, amount: "-0.5"} : x)))).toThrow("quarter_update_linked_cause_mismatch");
    expect(() => updateAfterQuarterClose(withBridge("ebitda", c => c.map(x => x.id === "trigo" ? {...x, until: null} : x)))).toThrow("quarter_update_structural_cause_end");
    expect(() => updateAfterQuarterClose(withBridge("ebitda", c => c.map(x => x.id === "volume" ? {...x, until: "2026-12-31"} : x)))).toThrow("quarter_update_calendar_cause_with_end");
    const prior = base.prior.weeklyCash.streams.find(s => s.id === "insumos")!;
    expect(() => updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: base.weekly.updates.map(x => x.streamId === "insumos" ? {...x, dates: [...prior.dates], amounts: [...prior.amounts]} : x)}})).toThrow("quarter_update_stream_update_without_change");
    expect(() => updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: [...base.weekly.updates, {streamId: "inventado", causeIds: ["trigo"], dates: ["2026-10-01"], amounts: ["1"]}]}})).toThrow("quarter_update_unknown_stream");
    expect(() => updateAfterQuarterClose({...base, covenant: {measurementIds: ["dez27-base"]}})).toThrow("quarter_update_quarter_outside_test_period");
    expect(() => updateAfterQuarterClose({...base, bridges: base.bridges.filter(b => b.lineId !== "caixa")})).toThrow("quarter_update_carry_line_without_bridge");
    expect(() => updateAfterQuarterClose({...base, steps: [base.steps[1]!]})).toThrow("quarter_update_added_stream_unused");
    const over = updateAfterQuarterClose({...base, facilities: base.facilities.map(f => f.id === "conta-garantida" ? {...f, limit: "4"} : f)});
    expect([over.action.withinApproved, over.action.steps[1]!.withinLimit]).toEqual([false, false]);
  });
});
