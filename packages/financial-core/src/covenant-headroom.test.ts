import {describe, expect, it} from "vitest";
import {measureCovenantHeadroom, type CovenantHeadroomInput} from "./covenant-headroom";

// Aurora Alimentos, reading in September 2026 (ficha C12, synthetic). BRL millions; the figures at each
// date are the C32 quarterly plan 7 as the oracle computes them (modelo_c12.py / resultados.json).
const lease = [{label: "Pagamentos de arrendamento (escritura exclui IFRS 16)", amount: "-3"}];
const m = (id: string, date: string, scenario: string, cash: string, reported: string, extra: Partial<CovenantHeadroomInput["measurements"][number]> = {}) =>
  ({id, label: id, date, scenario, role: "test" as const, debt: date === "2026-12-31" ? "128.66666666666666" : "120", cash, reportedEbitda: reported,
    adjustments: lease, unrealizedEbitda: null, limitIds: ["aditamento", "politica"], ...extra});
export const auroraCovenants: CovenantHeadroomInput = {
  currency: "BRL", readingDate: "2026-09-15",
  limits: [
    {id: "aditamento", label: "Dívida líquida / EBITDA até 3,0x (1º aditamento)", kind: "contractual", status: "in_force", maximumRatio: "3", source: "1º aditamento cl. 3", testDates: ["2026-12-31", "2027-12-31"]},
    {id: "politica", label: "Política do conselho: até 2,5x", kind: "board_policy", status: "in_force", maximumRatio: "2.5", source: "Ata do conselho de março", testDates: ["2026-12-31", "2027-12-31"]},
    {id: "original", label: "Escritura original sem o aditamento: 2,75x (superada)", kind: "contractual", status: "superseded", maximumRatio: "2.75", source: "Escritura cl. 7.1", testDates: []},
  ],
  measurements: [
    m("dez26-base", "2026-12-31", "base", "15.457201858477745", "54.5", {unrealizedEbitda: "26"}),
    m("dez26-adverso", "2026-12-31", "adverse", "14.071201858477744", "52.4"),
    m("dez26-safra-30", "2026-12-31", "safra_30", "10.457201858477745", "54.5"),
    m("dez26-sem-safra", "2026-12-31", "sem_safra", "40.457201858477745", "54.5", {role: "contrast", limitIds: []}),
    m("dez27-base", "2027-12-31", "base", "20.678602481016846", "56.6"),
    m("dez27-adverso", "2027-12-31", "adverse", "13.056494375841874", "48.11"),
    {id: "junho-gerencial", label: "Dívida de junho e EBITDA gerencial", date: "2026-06-30", scenario: "gerencial", role: "contrast", debt: "130", cash: "35",
      reportedEbitda: "55", adjustments: [], unrealizedEbitda: null, limitIds: []},
    m("dez26-escritura-original", "2026-12-31", "base", "15.457201858477745", "54.5", {role: "contrast", limitIds: ["original"]}),
  ],
  effects: [{id: "safra", label: "Safra na data de apuração", measurementId: "dez26-base", withoutEffectMeasurementId: "dez26-sem-safra"}],
};
const n = (v: string | null | undefined, p = 2) => Number(v).toFixed(p);

describe("covenant headroom", () => {
  const r = measureCovenantHeadroom(auroraCovenants);
  const at = (id: string) => r.measurements.find(x => x.id === id)!;
  const test = (id: string, limit: string) => at(id).tests.find(t => t.limitId === limit)!;
  it("measures December by the indenture definition with headroom in EBITDA and debt", () => {
    expect([n(at("dez26-base").netDebt, 1), n(at("dez26-base").ebitda, 1), n(at("dez26-base").ratio)]).toEqual(["113.2", "51.5", "2.20"]);
    expect([n(test("dez26-base", "aditamento").ebitdaHeadroom), n(test("dez26-base", "aditamento").netDebtHeadroom)]).toEqual(["13.76", "41.29"]);
    expect(n(test("dez26-base", "politica").ebitdaHeadroom)).toBe("6.22");
    expect(at("dez26-base").tightestLimitId).toBe("politica");
  });
  it("reverse-tests the unrealized second half against each limit", () => {
    expect(n(test("dez26-base", "aditamento").unrealizedEbitdaLossToLimit, 3)).toBe("0.529");
    expect(n(test("dez26-base", "politica").unrealizedEbitdaLossToLimit, 3)).toBe("0.239");
  });
  it("reads the adverse case, a larger season and 2027", () => {
    expect(n(at("dez26-adverso").ratio)).toBe("2.32");
    expect([n(at("dez26-safra-30").ratio), n(test("dez26-safra-30", "politica").ebitdaHeadroom, 1)]).toEqual(["2.30", "4.2"]);
    expect([n(at("dez27-base").ratio), n(at("dez27-adverso").ratio), n(test("dez27-adverso", "politica").ebitdaHeadroom)]).toEqual(["1.85", "2.37", "2.33"]);
    expect(r.worst).toMatchObject({measurementId: "dez27-adverso", limitId: "politica"});
    expect(r.anyBreach).toBe(false);
  });
  it("names the seasonal effect and keeps wrong readings as contrasts", () => {
    expect(n(r.effects[0]!.ratioEffect, 1)).toBe("0.5");
    expect(n(at("junho-gerencial").ratio)).toBe("1.73");
    expect(n(test("dez26-escritura-original", "original").ebitdaHeadroom)).toBe("10.33");
  });
  it("refuses malformed tests", () => {
    expect(() => measureCovenantHeadroom({...auroraCovenants, measurements: [{...auroraCovenants.measurements[0]!, limitIds: ["inexistente"]}]})).toThrow("covenant_unknown_limit");
    expect(() => measureCovenantHeadroom({...auroraCovenants, measurements: [{...auroraCovenants.measurements[0]!, limitIds: []}]})).toThrow("covenant_test_without_limit");
    expect(() => measureCovenantHeadroom({...auroraCovenants, readingDate: "2027-01-10"})).toThrow("covenant_unrealized_after_test_date");
    const swap = (id: string, patch: object) => ({...auroraCovenants, measurements: auroraCovenants.measurements.map(x => x.id === id ? {...x, ...patch} : x)});
    expect(() => measureCovenantHeadroom(swap("junho-gerencial", {role: "test", limitIds: ["aditamento"]}))).toThrow("covenant_test_off_the_test_date");
    expect(() => measureCovenantHeadroom(swap("dez26-escritura-original", {role: "test"}))).toThrow("covenant_superseded_limit_in_test");
    expect(() => measureCovenantHeadroom({...auroraCovenants, measurements: auroraCovenants.measurements.map(x => ({...x, limitIds: x.limitIds.filter(id => id !== "politica")}))})).toThrow("covenant_limit_in_force_not_tested");
    expect(() => measureCovenantHeadroom({...auroraCovenants, limits: [{...auroraCovenants.limits[0]!, maximumRatio: "0"}, ...auroraCovenants.limits.slice(1)]})).toThrow("covenant_limit_not_positive");
    const zero = measureCovenantHeadroom({...auroraCovenants, measurements: [{...auroraCovenants.measurements[0]!, reportedEbitda: "3"}], effects: []});
    expect(zero.measurements[0]!.ratio).toBeNull();
    expect(zero.anyBreach).toBe(true);
  });
});
