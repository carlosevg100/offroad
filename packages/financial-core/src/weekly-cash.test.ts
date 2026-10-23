import {describe, expect, it} from "vitest";
import {buildWeeklyCash} from "./weekly-cash";
import {auroraWeeklyCash} from "./weekly-cash.fixture";

const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
describe("weekly cash", () => {
  const w = buildWeeklyCash(auroraWeeklyCash);
  const c = (id: string) => w.cases.find(x => x.id === id)!;
  it("finds the tightest week and the weeks under the minimum, as the oracle", () => {
    expect([c("linha-17").minimum.weekStart, n(c("linha-17").minimum.closing), n(c("linha-17").closing)]).toEqual(["2026-12-21", "7.5", "16.1"]);
    expect(c("linha-17").weeksBelowMinimum).toEqual(["2026-12-14", "2026-12-21"]);
    expect(c("linha-17").rows.find(r => r.weekStart === "2026-12-14")!.largestOutflows.map(o => o.label))
      .toEqual(["Debênture 2021, amortização", "Fornecedores de insumos", "Debênture 2021, juros semestrais"]);
  });
  it("reproduces every case of the ficha", () => {
    expect(w.cases.map(x => [x.id, n(x.minimum.closing), x.minimum.weekStart, n(x.closing), x.weeksBelowMinimum.length])).toEqual([
      ["linha-17", "7.5", "2026-12-21", "16.1", 2], ["sem-linha", "-9.5", "2026-12-21", "-0.9", 3], ["conta-garantida", "15.5", "2026-12-21", "24.1", 0],
      ["antecipacao", "15.5", "2026-12-21", "24.1", 0], ["linha-25", "15.5", "2026-12-21", "24.1", 0], ["safra-30", "2.5", "2026-12-21", "11.1", 3],
      ["safra-adiada", "12.0", "2026-12-21", "18.4", 2]]);
  });
  it("lists what falls due by 31 December and reconciles with the projection", () => {
    const debt = w.calendar.filter(x => x.category === "debt" && x.date === "2026-12-15").map(x => [x.label, x.amount]);
    expect(debt).toEqual([["CCB Bradesco, juros trimestrais", "1.7"], ["Debênture 2021, amortização", "15"], ["Debênture 2021, juros semestrais", "5.1"], ["Finame (principal e juros)", "0.8"]]);
    expect(w.calendar.some(x => x.label.startsWith("13º"))).toBe(true);
    expect(w.reconciliation).toMatchObject({projection: "16"});
    expect(Math.abs(Number(w.reconciliation!.difference))).toBeLessThan(0.2);
  });
  it("costs each action for the time it is in use and flags the draw open at the covenant test", () => {
    expect(w.actions.map(a => [a.id, n(a.cost, 2)])).toEqual([["conta-garantida", "0.12"], ["antecipacao", "0.25"], ["linha-25", "0.87"]]);
    expect(w.actions[0]!.covenantEffect).toEqual({grossDebt: "8", cash: "8", netDebt: "0"});
  });
  it("refuses malformed weeks", () => {
    expect(() => buildWeeklyCash({...auroraWeeklyCash, firstMonday: "2026-09-15"})).toThrow("weekly_cash_week_must_start_monday");
    expect(() => buildWeeklyCash({...auroraWeeklyCash, cases: auroraWeeklyCash.cases.map(x => ({...x, role: "informed" as const}))})).toThrow("weekly_cash_one_informed_case");
    expect(() => buildWeeklyCash({...auroraWeeklyCash, weeks: 4})).toThrow("weekly_cash_event_outside_horizon");
    expect(() => buildWeeklyCash({...auroraWeeklyCash, actions: [{...auroraWeeklyCash.actions[0]!, streamId: "folha"}]})).toThrow("weekly_cash_action_stream");
  });
});
