import {describe, expect, it} from "vitest";

import {reconcileFinancialStatements, type ReconciliationInput} from "./reconcile-financial-statements";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const release = (page: number, table: string) => ({document: "ri_release_1t26.pdf", page, table});
/** Camil 1T26: the dividend divergence (four amounts), three inventory presentations, the debt roll-forward and the release net debt. R$ thousand. */
const camil = (): ReconciliationInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  tolerance: {debt: "0", balance_sheet: "0", cash: "0", working_capital: "1000", dividends: "0", net_debt: "1000"},
  pairedAccounts: [
    {id: "dividends", label: "Dividendos a pagar", family: "dividends", sources: [
      {source: "nota 18 nominal", value: "395000", definition: "valor nominal das doze parcelas remanescentes", anchor: itr(46, "18e")},
      {source: "balanço (valor presente)", value: "338565", definition: "nominal menos ajuste a valor presente", anchor: itr(46, "18e")},
      {source: "nota 25 contábil", value: "322498", definition: "valor contábil na tabela de instrumentos financeiros", anchor: itr(51, "25")},
      {source: "nota 25 valor justo", value: "420000", definition: "valor justo na tabela de instrumentos financeiros", anchor: itr(51, "25")},
    ]},
    {id: "inventories", label: "Estoques", family: "working_capital", sources: [
      {source: "nota 5", value: "3088478", definition: "estoques incluindo adiantamentos a fornecedores de 643.241", anchor: itr(21, "5")},
      {source: "release, capital de giro", value: "2445200", definition: "estoques sem adiantamentos a fornecedores", anchor: release(12, "Capital de giro")},
    ], explanation: {adjustment: "643241", description: "adiantamentos a fornecedores incluídos na nota 5 e apresentados à parte no release", anchor: itr(21, "5")}},
    {id: "net_debt", label: "Dívida líquida (definição do release)", family: "net_debt", sources: [
      {source: "release", value: "4214400", definition: "dívida bruta menos caixa e aplicações, em R$ milhões arredondados", anchor: release(11, "Endividamento e Caixa")},
      {source: "recalculado das notas", value: "4214377", definition: "5.670.186 menos 1.430.714 menos 25.095", anchor: itr(40, "15")},
    ]},
  ],
  balanceSheet: null,
  debtBridge: {opening: "4988383", lines: [
    {id: "captacoes", label: "Captações", value: "2046140", category: "drawdowns"},
    {id: "juros_e_variacoes", label: "Juros e variações monetárias", value: "172359", category: "accruedInterest"},
    {id: "apropriacao_custos", label: "Apropriação de custos de transação", value: "-4741", category: "otherAdditions"},
    {id: "amortizacao_principal", label: "Amortização de principal", value: "1285146", category: "amortizations"},
    {id: "amortizacao_juros", label: "Amortização de juros", value: "229611", category: "amortizations"},
    {id: "variacao_cambial", label: "Variação cambial", value: "60", category: "foreignExchange"},
    {id: "ajuste_conversao", label: "Ajuste de conversão", value: "-17258", category: "foreignExchange"},
  ], closing: "5670186", anchor: itr(40, "15")},
  cashBridge: {opening: "1997608", netChange: "-566894", closing: "1430714", anchor: itr(20, "3")},
});

describe("reconcile-financial-statements executor", () => {
  it("gold: the debt roll-forward and the cash bridge close, the inventory difference is explained, and dividends stay an open divergence", () => {
    const result = reconcileFinancialStatements(camil());
    expect(result.identities.map((identity) => [identity.id, identity.holds])).toEqual([["debt_bridge", true], ["cash_bridge", true]]);
    const inventories = result.reconciliations.find((entry) => entry.id === "inventories")!;
    expect(inventories.state).toBe("explained");
    expect(inventories.explanation?.residual).toBe("37");
    const dividends = result.reconciliations.find((entry) => entry.id === "dividends")!;
    expect(dividends.state).toBe("open");
    expect(dividends.spread).toBe("97502");
    expect(result.openDivergences.map((entry) => entry.id)).toEqual(["dividends"]);
    expect(result.openDivergences[0]?.reason).toMatch(/no value chosen/);
    expect(result.reconciliations.find((entry) => entry.id === "net_debt")?.state).toBe("closes");
    expect(result.state).toBe("open_divergences");
  });

  it("adversarial: a scale mutation breaks the roll-forward identity and the state says so", () => {
    const mutated = camil();
    mutated.debtBridge!.lines[0]!.value = "2046140000";
    const result = reconcileFinancialStatements(mutated);
    expect(result.identities.find((identity) => identity.id === "debt_bridge")?.holds).toBe(false);
    expect(result.state).toBe("identity_failed");
  });

  it("adversarial: an explanation that does not bridge the difference leaves the account open with the residual", () => {
    const mutated = camil();
    mutated.pairedAccounts![1]!.explanation = {adjustment: "500000", description: "wrong adjustment", anchor: itr(21, "5")};
    const result = reconcileFinancialStatements(mutated);
    expect(result.reconciliations.find((entry) => entry.id === "inventories")?.state).toBe("open");
    expect(result.openDivergences.find((entry) => entry.id === "inventories")?.reason).toMatch(/residual of 143278/);
  });

  it("is consistent under twenty permutations of accounts, sources and bridge lines", () => {
    const first = reconcileFinancialStatements(camil());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.pairedAccounts = [...shuffled.pairedAccounts!].reverse();
      shuffled.pairedAccounts[0]!.sources = [...shuffled.pairedAccounts[0]!.sources].reverse();
      shuffled.debtBridge!.lines = [...shuffled.debtBridge!.lines].sort(() => (seed % 2 === 0 ? 1 : -1));
      const again = reconcileFinancialStatements(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
