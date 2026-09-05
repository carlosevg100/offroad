import {describe, expect, it} from "vitest";

import {declareScenarios, type ScenarioInput} from "./declare-scenarios";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const asOf = "2026-05-31";
/** Camil without management data: CFADS is a declared range (the base holds no cash generation), rollover is a declared assumption, the approved operations are not sources. R$ thousand. */
const camil = (): ScenarioInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  assumptions: [
    {key: "cfads.2026h2.range", role: "cfads", period: "2026H2", value: "300000", unit: "BRL thousand", origin: "user_range", rationale: "intervalo declarado para testar capacidade; a base pública não traz geração de caixa para o serviço da dívida", asOf, anchor: {document: "declaracao_do_usuario.md", note: "intervalo, não estimativa da companhia"}, confidence: "low"},
    {key: "cfads.2027h1.range", role: "cfads", period: "2027H1", value: "300000", unit: "BRL thousand", origin: "user_range", rationale: "mesmo intervalo", asOf, anchor: {document: "declaracao_do_usuario.md"}, confidence: "low"},
    {key: "shock.rate.parallel", role: "rate_shock", period: null, value: "0.02", unit: "ratio", origin: "versioned_benchmark", rationale: "choque paralelo de 200 pontos-base do parâmetro scenario.interest_rate.parallel_shock (draft)", asOf: "2026-09-05", anchor: {document: "reference-data.ts", note: "scenario.interest_rate.parallel_shock"}, confidence: "medium"},
    {key: "haircut.ebitda.adverse", role: "ebitda_haircut", period: null, value: "0.15", unit: "ratio", origin: "user_range", rationale: "queda de 15% no EBITDA, intervalo declarado", asOf, anchor: {document: "declaracao_do_usuario.md"}, confidence: "low"},
    {key: "rollover.bank_lines", role: "rollover", period: null, value: "1", unit: "ratio", origin: "company_history", rationale: "a companhia rolou as linhas bancárias nos exercícios recentes (captações e liquidações da DFC)", asOf, anchor: itr(16, "demonstração dos fluxos de caixa"), confidence: "medium"},
  ],
  position: {
    components: {grossDebt: {value: "5670186", anchor: itr(39, "15")}, derivativeLiabilities: {value: "14335", anchor: itr(51, "25")}, derivativeAssets: {value: "235", anchor: itr(51, "25")}, cashAndEquivalents: {value: "1430714", anchor: itr(20, "3")}, financialInvestments: {value: "25095", anchor: itr(11)}},
    ltmEbitda: {value: "895864", definitionKey: "ebitda.covenant_ltm", basis: "implied_from_reported_index", anchor: itr(40, "15: 4.228.477 / 4,72, derivado")},
    averageDebtBalance: {value: "5329284.5", basis: "média simples dos saldos de 28/02/2026 e 31/05/2026", anchor: itr(39, "15")},
    baseAnnualRate: {value: "0.1246", basis: "serviço base do caso 02 sobre a dívida bruta", anchor: {document: "gc02-gabarito-rascunho.md", note: "seção 3"}},
  },
  periods: [
    {period: "2026H2", principal: "614914", interest: "340000", anchor: itr(40, "15, cronograma; juros do caso 02, hipótese")},
    {period: "2027H1", principal: "614914", interest: "340000", anchor: itr(40, "15")},
  ],
  scenarios: [
    {id: "base", label: "Base", rolloverAllowed: true},
    {id: "adverse", label: "Adverso", rolloverAllowed: true, usesRateShock: true, usesEbitdaHaircut: true},
    {id: "no_rollover", label: "Sem rolagem", rolloverAllowed: false},
  ],
});
const by = (result: ReturnType<typeof declareScenarios>, id: string) => result.scenarios.find((scenario) => scenario.id === id)!;

describe("declare-scenarios executor (v2)", () => {
  it("gold: net debt follows the contractual components, every scenario carries its caveat and per-number origins, and the register marks what was selected", () => {
    const result = declareScenarios(camil());
    expect(result.state).toBe("declared");
    for (const scenario of result.scenarios) {
      expect(scenario.caveat).toMatch(/não é guidance da companhia/);
      expect(scenario.results.pro_forma.contractual_net_debt).toBe("4228477");
      expect(scenario.results.pro_forma.origins).toContain("base pública");
    }
    expect(Number(by(result, "base").results.pro_forma.leverage)).toBeCloseTo(4.72, 2);
    expect(by(result, "base").results.pro_forma.ebitda_basis).toBe("ebitda.covenant_ltm (implied_from_reported_index)");
    expect(by(result, "base").parameters.map((parameter) => parameter.role)).toEqual(["rollover", "cfads", "cfads"]);
    expect(by(result, "base").results.liquidity[0]?.origins).toEqual(["histórico da companhia", "intervalo declarado pelo usuário"]);
    expect(result.assumption_register.filter((entry) => entry.selected).map((entry) => entry.key)).toEqual(["cfads.2026h2.range", "cfads.2027h1.range", "haircut.ebitda.adverse", "rollover.bank_lines", "shock.rate.parallel"]);
  });

  it("gold: the adverse scenario shocks the rate and haircuts the EBITDA; the no-rollover scenario shows the deficit that rollover hides", () => {
    const result = declareScenarios(camil());
    const adverse = by(result, "adverse");
    expect(adverse.results.interest?.delta).toBe("106585.69");
    expect(Number(adverse.results.pro_forma.leverage)).toBeCloseTo(5.55, 2);
    const noRollover = by(result, "no_rollover");
    expect(noRollover.results.liquidity.every((row) => row.contracted_sources === "0")).toBe(true);
    expect(Number(noRollover.results.liquidity[1]?.closing_cash)).toBeLessThan(Number(by(result, "base").results.liquidity[1]?.closing_cash));
    expect(by(result, "base").results.liquidity[1]?.deficit).toBe("0");
    expect(by(result, "base").results.liquidity[0]?.contracted_sources).toBe("614914");
  });

  it("picks the best origin per role and period, never the caller's favourite", () => {
    const base = camil();
    const better = declareScenarios({...base, assumptions: [...base.assumptions, {key: "cfads.2026h2.mgmt", role: "cfads", period: "2026H2", value: "420000", unit: "BRL thousand", origin: "authorized_management_data", rationale: "orçamento autorizado", asOf, anchor: {document: "orcamento_hipotetico.xlsx"}, confidence: "high"}]});
    expect(by(better, "base").parameters.find((parameter) => parameter.role === "cfads" && parameter.period === "2026H2")?.key).toBe("cfads.2026h2.mgmt");
    expect(better.assumption_register.find((entry) => entry.key === "cfads.2026h2.range")?.selected).toBe(false);
  });

  it("uses a contracted source once, in its period, and models a refinancing as new debt replacing old debt", () => {
    const base = camil();
    const contracted = declareScenarios({...base, assumptions: [...base.assumptions,
      {key: "source.notes.2026", role: "contracted_source", period: "2026H2", value: "251000", unit: "BRL thousand", origin: "authorized_management_data", rationale: "notas comerciais contratadas e desembolsadas (hipótese)", asOf, anchor: {document: "hipotetico_contrato.pdf"}, confidence: "high", evidence: {contract: {document: "hipotetico_contrato.pdf"}, disbursement: {document: "hipotetico_extrato.pdf"}}},
      {key: "refi.new", role: "new_debt", period: null, value: "786000", unit: "BRL thousand", origin: "user_range", rationale: "nova dívida hipotética", asOf, anchor: {document: "declaracao_do_usuario.md"}, confidence: "low"},
      {key: "refi.old", role: "refinanced_debt", period: null, value: "786000", unit: "BRL thousand", origin: "user_range", rationale: "dívida substituída", asOf, anchor: {document: "declaracao_do_usuario.md"}, confidence: "low"},
    ], scenarios: [...base.scenarios, {id: "refi", label: "Refinanciamento", rolloverAllowed: true, usesRefinancing: true}]});
    expect(by(contracted, "base").results.liquidity[0]?.contracted_sources).toBe("865914");
    expect(by(contracted, "base").results.liquidity[1]?.contracted_sources).toBe("614914");
    expect(by(contracted, "refi").results.pro_forma.gross_debt).toBe("5670186");
    expect(by(contracted, "refi").results.pro_forma.contractual_net_debt).toBe("4228477");
    expect(() => declareScenarios({...base, assumptions: [...base.assumptions, {key: "approval.notes", role: "contracted_source", period: "2026H2", value: "251000", unit: "BRL thousand", origin: "public_announcement", rationale: "aprovada em ata, não contratada", asOf, anchor: {document: "ca_notas_comerciais_2026-05-27.pdf"}, confidence: "medium"}]})).toThrow(/an approval is not a source/);
    const halfRefi = declareScenarios({...base, assumptions: [...base.assumptions, {key: "refi.old", role: "refinanced_debt", period: null, value: "786000", unit: "BRL thousand", origin: "user_range", rationale: "só a subtração", asOf, anchor: {document: "x"}, confidence: "low"}], scenarios: [...base.scenarios, {id: "half", label: "Só subtração", rolloverAllowed: true, usesRefinancing: true}]});
    expect(by(halfRefi, "half").uncovered_terms.some((term) => term.id === "refinancing")).toBe(true);
    expect(by(halfRefi, "half").results.pro_forma.gross_debt).toBe("5670186");
  });

  it("refuses an adverse scenario with nothing adverse, a no-rollover scenario that allows rollover, duplicate keys, wrong units and a period that is not projected", () => {
    const base = camil();
    expect(() => declareScenarios({...base, scenarios: base.scenarios.map((scenario) => scenario.id === "adverse" ? {...scenario, usesRateShock: false, usesEbitdaHaircut: false} : scenario)})).toThrow(/nothing adverse/);
    expect(() => declareScenarios({...base, scenarios: base.scenarios.map((scenario) => scenario.id === "no_rollover" ? {...scenario, rolloverAllowed: true} : scenario)})).toThrow(/cannot allow rollover/);
    expect(() => declareScenarios({...base, assumptions: [...base.assumptions, base.assumptions[0]!]})).toThrow(/duplicate assumption/);
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.key === "shock.rate.parallel" ? {...assumption, unit: "BRL thousand" as const} : assumption)})).toThrow(/is a ratio/);
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.key === "cfads.2026h2.range" ? {...assumption, unit: "BRL million" as const} : assumption)})).toThrow(/must be in BRL thousand/);
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.key === "cfads.2026h2.range" ? {...assumption, period: "2030H1"} : assumption)})).toThrow(/not projected/);
    const noCfads = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.role !== "cfads")});
    expect(by(noCfads, "base").results.liquidity).toHaveLength(0);
    expect(by(noCfads, "base").uncovered_terms.map((term) => term.id)).toEqual(["cfads:2026H2", "cfads:2027H1"]);
    const noRollover = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.role !== "rollover")});
    expect(by(noRollover, "base").uncovered_terms.some((term) => term.id === "rollover")).toBe(true);
  });

  it("is consistent under twenty permutations of assumptions, scenarios, periods and object keys, with the trace in the fingerprint", () => {
    const first = declareScenarios(camil());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reorderKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = camil();
      const shuffled: ScenarioInput = {...base, assumptions: permute(base.assumptions, seed).map(reorderKeys), scenarios: permute(base.scenarios, seed + 1), periods: permute(base.periods, seed + 2)};
      const again = declareScenarios(seed % 2 ? reorderKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
      expect(again).toEqual(first);
    }
  });
});
