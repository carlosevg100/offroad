import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {declareScenarios, type ScenarioInput} from "./declare-scenarios";

const d = (value: Decimal.Value) => new Decimal(value);
const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const user = (note?: string) => ({document: "declaracao_do_usuario.md", ...(note ? {note} : {})});
const asOf = "2026-05-31";
const documents: ScenarioInput["documents"] = [
  {name: "01_ITR_1T26_31mai2026.pdf", kind: "itr"}, {name: "declaracao_do_usuario.md", kind: "user"}, {name: "reference-data.ts", kind: "benchmark"},
  {name: "gc02-gabarito-rascunho.md", kind: "other"}, {name: "escritura_13a_emissao.pdf", kind: "indenture"}, {name: "ca_notas_comerciais_2026-05-27.pdf", kind: "announcement"},
  {name: "contrato_hipotetico.pdf", kind: "contract"}, {name: "extrato_hipotetico.pdf", kind: "disbursement_proof"}, {name: "orcamento_gerencial_hipotetico.xlsx", kind: "management"},
];
/**
 * Camil without management data, R$ thousand: CFADS is a declared range per window of the ledger's
 * schedule (the base holds no cash generation for debt service), rollover is a declared assumption
 * from the company's history, the approved operations are not sources, interest per period is not
 * in the base (the cover is principal-only), and the covenant limit is not resolved.
 */
const camil = (): ScenarioInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  unitAnchor: itr(39, "nota 15, valores em R$ mil"),
  documents,
  assumptions: [
    {key: "cfads.2026-27.range", role: "cfads", period: "2026/27", value: "200000", unit: "BRL thousand", origin: "user_range", rationale: "intervalo declarado para testar capacidade; a base pública não traz geração de caixa para o serviço da dívida", asOf, anchor: user("intervalo, não estimativa da companhia"), confidence: "low"},
    {key: "cfads.2027-28.range", role: "cfads", period: "2027/28", value: "200000", unit: "BRL thousand", origin: "user_range", rationale: "mesmo intervalo, declarado para a segunda janela", asOf, anchor: user(), confidence: "low"},
    {key: "shock.rate.parallel", role: "rate_shock", period: null, value: "0.02", unit: "ratio", origin: "versioned_benchmark", rationale: "choque paralelo de 200 pontos-base do parâmetro scenario.interest_rate.parallel_shock (draft)", asOf: "2026-09-05", anchor: {document: "reference-data.ts", note: "scenario.interest_rate.parallel_shock"}, confidence: "medium"},
    {key: "haircut.ebitda.adverse", role: "ebitda_haircut", period: null, value: "0.15", unit: "ratio", origin: "user_range", rationale: "queda de 15% no EBITDA, intervalo declarado", asOf, anchor: user(), confidence: "low"},
    {key: "haircut.cfads.adverse", role: "cfads_haircut", period: null, value: "0.10", unit: "ratio", origin: "user_range", rationale: "queda de 10% na geração de caixa, declarada à parte do EBITDA", asOf, anchor: user(), confidence: "low"},
    {key: "rollover.bank_lines", role: "rollover", period: null, value: "1", unit: "ratio", origin: "company_history", rationale: "a companhia rolou as linhas bancárias nos exercícios recentes (captações e liquidações da DFC)", asOf, anchor: itr(16, "demonstração dos fluxos de caixa"), confidence: "medium"},
  ],
  position: {
    perimeter: "consolidated",
    components: {grossDebt: {value: "5670186", anchor: itr(39, "15")}, derivativeLiabilities: {value: "14335", anchor: itr(51, "25")}, derivativeAssets: {value: "235", anchor: itr(51, "25")}, cashAndEquivalents: {value: "1430714", anchor: itr(20, "3")}, financialInvestments: {value: "25095", anchor: itr(11)}},
    ltmEbitda: {value: "895864", months: 12, definitionKey: "ebitda.covenant_ltm", basis: "implied_from_reported_index", comparability: "conditional", comparabilityReasons: ["a companhia não abre o EBITDA; o valor é implícito de 4,72x sobre 4.228.477", "a 11ª carrega ajuste pro forma de aquisições que o índice reportado não mostra"], anchor: itr(40, "15: 4.228.477 / 4,72, derivado")},
    averageDebtBalance: {value: "5329284.5", basis: "média simples dos saldos de 28/02/2026 e 31/05/2026", anchor: itr(39, "15")},
    baseAnnualRate: {value: "0.1246", basis: "serviço base do caso 02 sobre a dívida bruta", anchor: {document: "gc02-gabarito-rascunho.md", note: "seção 3"}},
  },
  covenant: {instrument: "13ª emissão", limit: "4.00", direction: "maximum", tier: {applicable: false, condition: "4,00x depois da quitação ordinária dos CRA de referência; até a prova, 3,50x"}, state: "insufficient_evidence", comparability: "conditional", measurement: {frequency: "annual", nextDate: "2027-02-28"}, anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII)", page: 54}},
  periods: [
    {period: "2026/27", endsAt: "2027-05-31", principal: {value: "1229828", anchor: itr(40, "15, cronograma")}, interest: null},
    {period: "2027/28", endsAt: "2028-05-31", principal: {value: "776868", anchor: itr(40, "15, cronograma")}, interest: null},
  ],
  scenarios: [
    {id: "base", label: "Base", rolloverAllowed: true},
    {id: "adverse", label: "Adverso", rolloverAllowed: true, usesRateShock: true, usesEbitdaHaircut: true, usesCfadsHaircut: true},
    {id: "no_rollover", label: "Sem rolagem", rolloverAllowed: false},
  ],
});
const by = (result: ReturnType<typeof declareScenarios>, id: string) => result.scenarios.find((scenario) => scenario.id === id)!;

describe("declare-scenarios executor (v3)", () => {
  it("gold: net debt follows the contractual components, leverage carries the EBITDA's comparability, no headroom against an inapplicable unresolved tier, and every number carries origins with anchors", () => {
    const result = declareScenarios(camil());
    expect(result.schema_version).toBe("method.declare-scenarios.v3");
    expect(result.state).toBe("partial");
    for (const scenario of result.scenarios) {
      expect(scenario.caveat).toMatch(/não é guidance da companhia/);
      expect(scenario.results.pro_forma.contractual_net_debt).toBe("4228477");
      expect(scenario.results.pro_forma.deductible_cash).toBe("1455809");
      expect(scenario.results.pro_forma.origins.map((origin) => origin.key)).toEqual(expect.arrayContaining(["position.grossDebt", "position.cashAndEquivalents", "position.ltmEbitda"]));
      expect(scenario.results.headroom).toBeNull();
      expect(scenario.results.headroom_note).toMatch(/no headroom: the limit of 13ª emissão is insufficient_evidence; the 4.00x tier is not applicable/);
      expect(scenario.uncovered_terms.some((term) => term.id === "interest")).toBe(true);
    }
    const base = by(result, "base");
    expect(base.results.pro_forma.leverage?.value).toBe(d("4228477").div("895864").toDecimalPlaces(8).toFixed());
    expect(base.results.pro_forma.leverage?.comparability).toBe("conditional");
    expect(base.results.headroom_note).toMatch(/arithmetic difference against 4.00x is -0.71999879x and is conditioned/);
    expect(base.parameters.map((parameter) => parameter.role)).toEqual(["rollover", "cfads", "cfads"]);
    expect(base.caveat).toMatch(/histórico da companhia \(rollover.bank_lines: a companhia rolou as linhas bancárias/);
    expect(base.results.liquidity?.basis).toBe("principal_only");
    expect(base.results.liquidity?.rows[0]?.origins.map((origin) => origin.key)).toEqual(["periods.2026/27.principal", "cfads.2026-27.range", "rollover.bank_lines"]);
    expect(result.assumption_register.filter((entry) => entry.selected).map((entry) => entry.key)).toEqual(["cfads.2026-27.range", "cfads.2027-28.range", "haircut.cfads.adverse", "haircut.ebitda.adverse", "rollover.bank_lines", "shock.rate.parallel"]);
  });

  it("gold: the adverse scenario shocks the rate, haircuts the EBITDA and the CFADS separately; the no-rollover scenario shows the deficit that rollover hides", () => {
    const result = declareScenarios(camil());
    const adverse = by(result, "adverse");
    expect(adverse.results.interest?.delta).toBe("106585.69");
    expect(adverse.results.pro_forma.leverage?.value).toBe(d("4228477").div(d("895864").times("0.85")).toDecimalPlaces(8).toFixed());
    expect(adverse.results.liquidity?.rows[0]?.cfads_declared).toBe("200000");
    expect(adverse.results.liquidity?.rows[0]?.cfads_used).toBe("180000");
    expect(adverse.results.liquidity?.rows[0]?.cfads_haircut).toBe("0.10");
    const base = by(result, "base");
    expect(base.results.liquidity?.rows[0]?.cfads_used).toBe("200000");
    expect(base.results.liquidity?.rows.every((row) => row.deficit === "0")).toBe(true);
    expect(base.results.liquidity?.rows[1]?.rolled_principal).toBe("776868");
    const noRollover = by(result, "no_rollover");
    expect(noRollover.results.liquidity?.rows.every((row) => row.rolled_principal === "0" && row.contracted_sources === "0")).toBe(true);
    // 1.455.809 + 200.000 - 1.229.828 = 425.981 carried; 425.981 + 200.000 against 776.868 leaves 150.887 uncovered.
    expect(noRollover.results.liquidity?.rows[0]?.deficit).toBe("0");
    expect(noRollover.results.liquidity?.rows[1]?.deficit).toBe("150887");
    expect(noRollover.parameters.some((parameter) => parameter.role === "rollover")).toBe(false);
  });

  it("blocks a scenario whose lever has no registered assumption instead of filling zero, and blocks the run when a minimum scenario is blocked", () => {
    const base = camil();
    const noHaircut = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.role !== "ebitda_haircut")});
    expect(by(noHaircut, "adverse").state).toBe("blocked");
    expect(by(noHaircut, "adverse").block_reasons[0]).toMatch(/EBITDA haircut but none is registered; the haircut is not filled with zero/);
    expect(by(noHaircut, "adverse").results.pro_forma.leverage).toBeNull();
    expect(noHaircut.state).toBe("blocked");
    expect(noHaircut.block_reasons[0]).toMatch(/^adverse:/);
    const noRolloverAssumption = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.role !== "rollover")});
    expect(by(noRolloverAssumption, "base").state).toBe("blocked");
    expect(by(noRolloverAssumption, "no_rollover").state).toBe("partial");
    const halfRefinancing = declareScenarios({...base, assumptions: [...base.assumptions, {key: "refi.new", role: "new_debt", period: null, value: "300000", unit: "BRL thousand", origin: "user_range", rationale: "nova dívida declarada", asOf, anchor: user(), confidence: "low"}], scenarios: [...base.scenarios, {id: "refi", label: "Refinanciamento", rolloverAllowed: false, usesRefinancing: true}]});
    expect(by(halfRefinancing, "refi").state).toBe("blocked");
    expect(halfRefinancing.state).toBe("partial");
  });

  it("never repeats CFADS across periods: a period without its own CFADS leaves the cover unmeasured", () => {
    const base = camil();
    const result = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.key !== "cfads.2027-28.range")});
    expect(by(result, "base").results.liquidity).toBeNull();
    expect(by(result, "base").uncovered_terms.some((term) => term.id === "cfads:2027/28" && /no figure is repeated from another period/.test(term.reason))).toBe(true);
    expect(by(result, "base").state).toBe("partial");
  });

  it("measures headroom only against an applicable, resolved and comparable limit with a comparable EBITDA", () => {
    const base = camil();
    const resolved: ScenarioInput = {...base, covenant: {...base.covenant!, state: "resolved", comparability: "comparable", tier: {applicable: true, condition: "quitação ordinária dos CRA provada (hipótese de teste)"}}, position: {...base.position, ltmEbitda: {...base.position.ltmEbitda!, comparability: "comparable", comparabilityReasons: []}}};
    const result = declareScenarios(resolved);
    expect(by(result, "base").results.headroom?.absolute).toBe(d("4").minus(d("4228477").div("895864").toDecimalPlaces(8)).toDecimalPlaces(8).toFixed());
    expect(by(result, "base").results.headroom?.within_limit).toBe(false);
    expect(by(result, "base").results.headroom?.note).toMatch(/scenario reading before the measurement of 2027-02-28/);
    const inapplicable = declareScenarios({...resolved, covenant: {...resolved.covenant!, tier: {applicable: false, condition: "degrau posterior"}}});
    expect(by(inapplicable, "base").results.headroom).toBeNull();
    const conditionalEbitda = declareScenarios({...resolved, position: {...resolved.position, ltmEbitda: {...resolved.position.ltmEbitda!, comparability: "conditional"}}});
    expect(by(conditionalEbitda, "base").results.headroom_note).toMatch(/the EBITDA is conditional with the covenant definition/);
  });

  it("refuses an origin on a document of the wrong class, an announcement posing as a contracted source, a relabelled scale, an annualized quarterly EBITDA, out-of-range ratios and negative money", () => {
    const base = camil();
    const disguised = {...base, assumptions: base.assumptions.map((assumption) => assumption.key === "rollover.bank_lines" ? {...assumption, origin: "authorized_management_data" as const} : assumption)};
    expect(() => declareScenarios(disguised)).toThrow(/cannot rest on a itr document; it needs management/);
    const announcement = {...base, assumptions: [...base.assumptions, {key: "source.notas", role: "contracted_source" as const, period: "2026/27", value: "251000", unit: "BRL thousand" as const, origin: "public_announcement" as const, rationale: "notas comerciais aprovadas", asOf, anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, confidence: "medium" as const, evidence: {contract: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, disbursement: null}}]};
    expect(() => declareScenarios(announcement)).toThrow(/needs its contract and its disbursement/);
    const contracted = {...base, assumptions: [...base.assumptions, {key: "source.notas", role: "contracted_source" as const, period: "2026/27", value: "251000", unit: "BRL thousand" as const, origin: "public_announcement" as const, rationale: "notas comerciais contratadas e desembolsadas (hipótese)", asOf, anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, confidence: "medium" as const, evidence: {contract: {document: "contrato_hipotetico.pdf"}, disbursement: {document: "extrato_hipotetico.pdf"}}}]};
    expect(by(declareScenarios(contracted), "no_rollover").results.liquidity?.rows[0]?.contracted_sources).toBe("251000");
    expect(() => declareScenarios({...base, unit: "BRL million"})).toThrow(/does not name the unit BRL million/);
    expect(() => declareScenarios({...base, position: {...base.position, ltmEbitda: {...base.position.ltmEbitda!, months: 3 as unknown as 12}}})).toThrow();
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.role === "ebitda_haircut" ? {...assumption, value: "1.5"} : assumption)})).toThrow(/lies between 0 and 1/);
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.role === "cfads" ? {...assumption, value: "-1"} : assumption)})).toThrow();
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.role === "cfads" ? {...assumption, anchor: {document: "inventado.pdf"}} : assumption)})).toThrow(/not a document of the base/);
    expect(() => declareScenarios({...base, covenant: {...base.covenant!, measurement: {frequency: "annual", nextDate: "2026-02-28"}}})).toThrow(/next measurement date must follow/);
  });

  it("is consistent under twenty permutations of assumptions, documents, periods, scenarios, reasons and key order", () => {
    const first = declareScenarios(camil());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = camil();
      const shuffled: ScenarioInput = {...base, assumptions: permute(base.assumptions, seed), documents: permute(base.documents, seed + 1), periods: permute(base.periods, seed + 2), scenarios: permute(base.scenarios, seed + 3), position: {...base.position, ltmEbitda: {...base.position.ltmEbitda!, comparabilityReasons: permute(base.position.ltmEbitda!.comparabilityReasons!, seed + 4)}}};
      const again = declareScenarios(seed % 2 ? reversedKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(declareScenarios(camil()) as unknown as Record<string, unknown>, "scenarios/declare-scenarios.md")).toEqual([]);
  });
});
