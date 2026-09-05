import {describe, expect, it} from "vitest";

import {declareScenarios, type ScenarioInput} from "./declare-scenarios";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
/** Camil without management data: parameters from history and announcements, R$ thousand. */
const camil = (): ScenarioInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  assumptions: [
    {key: "cfads.2026h2", value: "450000", unit: "BRL thousand", origin: "company_history", rationale: "metade do EBITDA implícito dos últimos doze meses (895.864) menos capex de manutenção pelo histórico do release", asOf: "2026-05-31", anchor: itr(40, "15"), confidence: "low"},
    {key: "cfads.2027h1", value: "450000", unit: "BRL thousand", origin: "company_history", rationale: "mesma base", asOf: "2026-05-31", anchor: itr(40, "15"), confidence: "low"},
    {key: "shock.rate.parallel", value: "0.02", unit: "ratio", origin: "versioned_benchmark", rationale: "choque paralelo de 200 pontos-base da política de cenários", asOf: "2026-09-04", anchor: {document: "reference-data", note: "scenario.interest_rate.parallel_shock"}, confidence: "medium"},
    {key: "haircut.ebitda.adverse", value: "0.15", unit: "ratio", origin: "versioned_benchmark", rationale: "queda de 15% no EBITDA da política de cenários", asOf: "2026-09-04", anchor: {document: "reference-data", note: "policy.seasonality.materiality"}, confidence: "medium"},
    {key: "refinancing.2026h2", value: "786000", unit: "BRL thousand", origin: "public_announcement", rationale: "notas comerciais de 251.000 e CPR de até 535.000 aprovadas em 18/05/2026, não desembolsadas", asOf: "2026-05-18", anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 1}, confidence: "low"},
  ],
  position: {grossDebt: "5670186", unrestrictedCash: "1430714", ltmEbitdaProxy: {value: "895864", basis: "EBITDA implícito no pro forma de 4,72x, derivado"}, averageDebtBalance: "5329284", baseAnnualRate: "0.14", anchor: itr(40, "15")},
  periods: [
    {period: "2026H2", principal: "614914", interest: "340000", cfadsKey: "cfads.2026h2"},
    {period: "2027H1", principal: "614914", interest: "340000", cfadsKey: "cfads.2027h1"},
  ],
  scenarios: [
    {id: "base", label: "Base", refinancedDebtKey: "refinancing.2026h2"},
    {id: "adverse", label: "Adverso", rateShockKey: "shock.rate.parallel", ebitdaHaircutKey: "haircut.ebitda.adverse", refinancedDebtKey: "refinancing.2026h2"},
    {id: "no_rollover", label: "Sem rolagem", refinancedDebtKey: "refinancing.2026h2", rolloverAllowed: false},
  ],
});

describe("declare-scenarios executor", () => {
  it("gold: every parameter carries its origin, and every scenario carries the sentence that says what it is not", () => {
    const result = declareScenarios(camil());
    expect(result.assumptionRegister.every((assumption) => assumption.origin && assumption.anchor)).toBe(true);
    expect(result.scenarios.map((scenario) => scenario.id)).toEqual(["adverse", "base", "no_rollover"]);
    for (const scenario of result.scenarios) expect(scenario.caveat).toMatch(/não é guidance da companhia/);
    const adverse = result.scenarios.find((scenario) => scenario.id === "adverse")!;
    expect(adverse.parameters.map((parameter) => parameter.role)).toContain("rate_shock");
    expect(adverse.results.interest?.delta).toBe("106585.68");
    expect(adverse.results.proForma.leverage).not.toBeNull();
    expect(Number(adverse.results.proForma.leverage)).toBeGreaterThan(Number(result.scenarios.find((scenario) => scenario.id === "base")!.results.proForma.leverage));
  });

  it("gold: the no-rollover scenario shows the deficit that contracted sources would hide", () => {
    const result = declareScenarios(camil());
    const base = result.scenarios.find((scenario) => scenario.id === "base")!;
    const noRollover = result.scenarios.find((scenario) => scenario.id === "no_rollover")!;
    expect(Number(noRollover.results.liquidity[1]?.closingCash)).toBeLessThan(Number(base.results.liquidity[1]?.closingCash));
  });

  it("refuses a parameter without an origin and an incomplete minimum set", () => {
    const missing = camil();
    missing.scenarios![0]!.rateShockKey = "shock.not.registered";
    expect(() => declareScenarios(missing)).toThrow(/parameter without an origin does not exist/);
    const incomplete = camil();
    incomplete.scenarios = incomplete.scenarios!.filter((scenario) => scenario.id !== "no_rollover");
    expect(() => declareScenarios(incomplete)).toThrow(/needs a no_rollover scenario/);
  });

  it("labels a user range as the user's, never as a fact", () => {
    const withRange = camil();
    withRange.assumptions!.push({key: "capex.user", value: "300000", unit: "BRL thousand", origin: "user_range", rationale: "faixa informada pelo usuário na conversa", asOf: "2026-09-04", anchor: {document: "conversation", note: "turno 2"}, confidence: "low"});
    withRange.scenarios!.find((scenario) => scenario.id === "base")!.newDebtKey = "capex.user";
    const result = declareScenarios(withRange);
    const base = result.scenarios.find((scenario) => scenario.id === "base")!;
    expect(base.caveat).toMatch(/faixa dada pelo usuário/);
    expect(result.assumptionRegister.find((assumption) => assumption.key === "capex.user")?.originRank).toBe(4);
  });

  it("is consistent under twenty permutations of assumptions, scenarios and periods", () => {
    const first = declareScenarios(camil());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.assumptions = seed % 2 ? [...shuffled.assumptions].reverse() : [...shuffled.assumptions.slice(2), ...shuffled.assumptions.slice(0, 2)];
      shuffled.scenarios = [...shuffled.scenarios].reverse();
      shuffled.periods = [...shuffled.periods].reverse();
      const again = declareScenarios(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
