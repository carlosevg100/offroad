import {describe, expect, it} from "vitest";
import {buildWeeklyCash} from "./weekly-cash";
import {measureCovenantHeadroom} from "./covenant-headroom";
import {updateAfterQuarterClose, type QuarterUpdateInput} from "./quarter-update";
import {auroraQuarterUpdate as base} from "./quarter-update.fixture";

const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
const withBridge = (lineId: string, edit: (c: QuarterUpdateInput["bridges"][number]["causes"]) => QuarterUpdateInput["bridges"][number]["causes"]): QuarterUpdateInput =>
  ({...base, bridges: base.bridges.map(b => b.lineId === lineId ? {...b, causes: edit(b.causes)} : b)});
describe("update after the quarter close", () => {
  const u = updateAfterQuarterClose(base);
  it("bridges EBITDA and cash by cause, summing exactly to the deviations", () => {
    expect(u.bridges.map(b => [b.lineId, b.deviation, b.explained, b.residual])).toEqual([["ebitda", "-0.4", "-0.4", "0"], ["caixa", "-1.7", "-1.7", "0"]]);
    expect(u.gaps).toEqual([]);
    expect(u.propagation.filter(p => p.classification === "structural").map(p => [p.causeId, p.until, p.streams, p.covenant]))
      .toEqual([["trigo", "2026-12-31", ["insumos"], true], ["prazo-redes", "2026-12-31", ["recebimentos"], true]]);
  });
  it("carries the close into the weekly cash and finds December as the oracle", () => {
    expect(u.weekly.carriedOpening).toEqual({prior: "41", deviation: "-1.7", updated: "39.3"});
    expect([u.weekly.tightest.prior.weekStart, n(u.weekly.tightest.prior.closing), n(u.weekly.tightest.prior.shortfallToMinimum)]).toEqual(["2026-12-21", "7.5", "7.5"]);
    expect([u.weekly.tightest.updated.weekStart, n(u.weekly.tightest.updated.closing), n(u.weekly.tightest.updated.shortfallToMinimum)]).toEqual(["2026-12-21", "4.2", "10.8"]);
    expect(n(u.weekly.closing.updated)).toBe("12.9");
    expect(u.action.fullLimit.map(f => [f.facilityId, f.amount, n(f.minimum.closing), f.covers])).toEqual([["conta-garantida", "10", "14.2", false]]);
  });
  it("sizes the action within what is approved", () => {
    expect(u.action.steps.map(s => [s.facilityId, n(s.amount), s.withinLimit, n(s.minimum.closing), s.covers]))
      .toEqual([["programas-redes", "23.0", true, "10.2", false], ["conta-garantida", "4.8", true, "15.0", true]]);
    expect([u.action.withinApproved, u.action.covers]).toEqual([true, true]);
  });
  it("measures the December covenant again on the prior test", () => {
    expect([n(u.covenant.trailingEbitda.prior), n(u.covenant.trailingEbitda.updated)]).toEqual(["54.5", "53.5"]);
    expect([n(u.covenant.ratio.prior, 2), n(u.covenant.ratio.updated, 2)]).toEqual(["2.20", "2.32"]);
    const now = u.covenant.updated.measurements[0]!;
    expect([n(now.netDebt), n(now.ebitda), n(now.tests.find(t => t.limitId === "politica")!.ebitdaHeadroom)]).toEqual(["117.0", "50.5", "3.7"]);
    expect(n(u.covenant.prior.measurements[0]!.tests.find(t => t.limitId === "politica")!.ebitdaHeadroom)).toBe("6.2");
    expect(u.covenant.measurementsNotUpdated).toEqual(["dez27-base"]);
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
  it("refuses a booked structural cause that moves nothing, or a calendar cause that moves the projection", () => {
    const r = updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: base.weekly.updates.filter(x => x.streamId !== "insumos")},
      covenant: {...base.covenant, effects: base.covenant.effects.filter(e => e.causeId !== "trigo")}});
    expect(r.gaps).toEqual([{item: "cause.trigo", reason: "structural_cause_not_propagated"}]);
    expect(() => updateAfterQuarterClose({...base, covenant: {...base.covenant, effects: [...base.covenant.effects, {causeId: "estoque-trigo", ebitda: "0", cash: "1.6"}]}})).toThrow("quarter_update_calendar_cause_propagated");
  });
  it("refuses malformed updates", () => {
    expect(() => updateAfterQuarterClose(withBridge("caixa", c => c.map(x => x.id === "ebitda-abaixo" ? {...x, amount: "-0.5"} : x)))).toThrow("quarter_update_linked_cause_mismatch");
    expect(() => updateAfterQuarterClose(withBridge("ebitda", c => c.map(x => x.id === "trigo" ? {...x, until: null} : x)))).toThrow("quarter_update_structural_cause_end");
    expect(() => updateAfterQuarterClose(withBridge("ebitda", c => c.map(x => x.id === "volume" ? {...x, until: "2026-12-31"} : x)))).toThrow("quarter_update_calendar_cause_with_end");
    const prior = base.prior.weeklyCash.streams.find(s => s.id === "insumos")!;
    expect(() => updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: base.weekly.updates.map(x => x.streamId === "insumos" ? {...x, amounts: [...prior.amounts]} : x)}})).toThrow("quarter_update_stream_update_without_change");
    expect(() => updateAfterQuarterClose({...base, weekly: {...base.weekly, updates: [...base.weekly.updates, {streamId: "inventado", causeIds: ["trigo"], dates: ["2026-10-01"], amounts: ["1"]}]}})).toThrow("quarter_update_unknown_stream");
    expect(() => updateAfterQuarterClose({...base, covenant: {...base.covenant, measurementId: "dez27-base"}})).toThrow("quarter_update_quarter_outside_test_period");
    expect(() => updateAfterQuarterClose({...base, bridges: base.bridges.filter(b => b.lineId !== "caixa")})).toThrow("quarter_update_carry_line_without_bridge");
    expect(() => updateAfterQuarterClose({...base, steps: [base.steps[1]!]})).toThrow("quarter_update_added_stream_unused");
    const over = updateAfterQuarterClose({...base, facilities: base.facilities.map(f => f.id === "conta-garantida" ? {...f, limit: "4"} : f)});
    expect([over.action.withinApproved, over.action.steps[1]!.withinLimit]).toEqual([false, false]);
  });
});
