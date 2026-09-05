import {describe, expect, it} from "vitest";

import {reconcileFinancialStatements, type ReconciliationInput} from "./reconcile-financial-statements";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const release = (page: number, table: string) => ({document: "ri_release_1t26.pdf", page, table});
const asOf = "2026-05-31";
const policy = (value: string) => ({value, policyKey: "policy.reconciliation.tolerance", policyVersion: "2026.09.05-v7"});
/** Camil 1T26: the dividend divergence (four amounts), three inventory presentations, the two net debt definitions, the roll-forwards and the interest bridge. R$ thousand. */
const camil = (): ReconciliationInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  tolerance: {working_capital: policy("1000"), net_debt: policy("1000"), interest: policy("2000")},
  pairedAccounts: [
    {id: "dividends", label: "Dividendos a pagar", family: "dividends", sources: [
      {source: "nota 18 nominal", value: "395000", definition: "valor nominal das onze parcelas remanescentes (a primeira, de 25.000, já paga; total aprovado 420.000)", components: ["dividends_declared", "nominal", "remaining_installments"], asOf, anchor: itr(46, "18e")},
      {source: "balanço (valor presente)", value: "338565", definition: "nominal menos ajuste a valor presente", components: ["dividends_declared", "present_value", "remaining_installments"], asOf, anchor: itr(46, "18e")},
      {source: "nota 25 contábil", value: "322498", definition: "valor contábil na tabela de instrumentos financeiros", components: ["dividends_declared", "carrying_amount"], asOf, anchor: itr(51, "25")},
      {source: "nota 25 valor justo", value: "420000", definition: "valor justo na tabela de instrumentos financeiros", components: ["dividends_declared", "fair_value"], asOf, anchor: itr(51, "25")},
    ]},
    {id: "inventories", label: "Estoques", family: "working_capital", sources: [
      {source: "nota 5", value: "3088478", definition: "estoques incluindo adiantamentos a fornecedores de 643.241", components: ["inventories", "advances_to_suppliers"], asOf, anchor: itr(21, "5")},
      {source: "release, capital de giro", value: "2445200", definition: "estoques sem adiantamentos a fornecedores", components: ["inventories"], asOf, anchor: release(12, "Capital de giro")},
      {source: "release, balanço gerencial", value: "2437100", definition: "estoques no balanço gerencial, com adiantamentos a produtores de 576.000 em linha própria", components: ["inventories_management_view"], asOf, anchor: release(14, "Balanço gerencial")},
    ], explanation: {fromSource: "release, capital de giro", toSource: "nota 5", adjustment: "643241", description: "adiantamentos a fornecedores incluídos na nota 5 e apresentados à parte no release", anchor: itr(21, "5")}},
    {id: "net_debt_release", label: "Dívida líquida (definição do release)", family: "net_debt", sources: [
      {source: "release", value: "4214400", definition: "dívida bruta menos caixa e aplicações, em R$ milhões arredondados", components: ["gross_debt", "cash", "investments"], asOf, anchor: release(11, "Endividamento e Caixa")},
      {source: "recalculado das notas", value: "4214377", definition: "5.670.186 menos 1.430.714 menos 25.095", components: ["gross_debt", "cash", "investments"], asOf, anchor: itr(40, "15")},
    ]},
    {id: "net_debt_release_vs_contractual", label: "Dívida líquida do release contra a contratual", family: "net_debt", sources: [
      {source: "release", value: "4214400", definition: "dívida bruta menos caixa e aplicações", components: ["gross_debt", "cash", "investments"], asOf, anchor: release(11, "Endividamento e Caixa")},
      {source: "contratual (nota 15)", value: "4228477", definition: "dívida bruta mais derivativos passivos menos derivativos ativos, caixa e aplicações", components: ["gross_debt", "derivative_liabilities", "derivative_assets", "cash", "investments"], asOf, anchor: itr(40, "15")},
    ]},
    {id: "leases", label: "Passivo de arrendamento", family: "leases", sources: [
      {source: "balanço", value: "276768", definition: "passivo de arrendamento circulante 67.399 mais não circulante 209.369, consolidado", components: ["lease_liabilities"], asOf, anchor: itr(12)},
    ]},
  ],
  // Consolidated at 31/05/2026: total assets 12.021.830; liabilities 3.630.260 current plus 5.402.463 non-current; equity 2.989.107 including non-controlling interests.
  balanceSheet: {assets: "12021830", liabilities: "9032723", equity: "2989107", anchor: itr(12)},
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
  interestBridge: {fromDebtMovement: {value: "172359", anchor: itr(40, "15")}, fromIncomeStatement: {value: "170548", anchor: itr(48, "22")}},
});
const by = (result: ReturnType<typeof reconcileFinancialStatements>, id: string) => result.reconciliations.find((entry) => entry.id === id)!;

describe("reconcile-financial-statements executor (v2)", () => {
  it("gold: the roll-forwards close, the inventory difference is explained directionally, dividends stay open, and the two net debt definitions are not comparable", () => {
    const result = reconcileFinancialStatements(camil());
    expect(result.identities.map((identity) => [identity.id, identity.holds])).toEqual([["balance_sheet", true], ["debt_bridge", true], ["cash_bridge", true], ["interest_bridge", true]]);
    expect(result.identities.find((identity) => identity.id === "interest_bridge")?.difference).toBe("1811");
    const inventories = by(result, "inventories");
    expect(inventories.state).toBe("explained");
    expect(inventories.explanation?.residual).toBe("37");
    expect(inventories.values).toHaveLength(3);
    const dividends = by(result, "dividends");
    expect(dividends.state).toBe("not_comparable");
    expect(dividends.spread).toBe("97502");
    expect(by(result, "net_debt_release").state).toBe("closes");
    expect(by(result, "net_debt_release_vs_contractual").state).toBe("not_comparable");
    expect(by(result, "net_debt_release_vs_contractual").comparability.reasons[0]).toMatch(/different components/);
    expect(by(result, "leases").state).toBe("single_source");
    expect(result.uncovered_terms.map((term) => term.id)).toEqual(["leases"]);
    expect(result.open_divergences.map((entry) => entry.id)).toEqual(["dividends", "net_debt_release_vs_contractual"]);
    expect(result.open_divergences[0]?.reason).toMatch(/no value chosen/);
    expect(result.state).toBe("open_divergences");
    expect(result.trace.calculations.every((calculation) => calculation.unit === "BRL thousand")).toBe(true);
  });

  it("adversarial: a scale mutation breaks the roll-forward identity; a mutated source value opens the pair; a reversed adjustment leaves a residual", () => {
    const mutated = camil();
    mutated.debtBridge!.lines[0]!.value = "2046140000";
    expect(reconcileFinancialStatements(mutated).state).toBe("identity_failed");
    const valueMutation = camil();
    valueMutation.pairedAccounts![2]!.sources[1]!.value = "4213000";
    expect(by(reconcileFinancialStatements(valueMutation), "net_debt_release").state).toBe("open");
    const reversed = camil();
    reversed.pairedAccounts![1]!.explanation = {fromSource: "nota 5", toSource: "release, capital de giro", adjustment: "643241", description: "sentido trocado", anchor: itr(21, "5")};
    const result = reconcileFinancialStatements(reversed);
    expect(by(result, "inventories").state).toBe("open");
    expect(by(result, "inventories").explanation?.residual).toBe("-1286519");
    const wrong = camil();
    wrong.pairedAccounts![1]!.explanation = {fromSource: "release, capital de giro", toSource: "nota 5", adjustment: "500000", description: "wrong adjustment", anchor: itr(21, "5")};
    expect(result.open_divergences.find((entry) => entry.id === "inventories")?.reason).toMatch(/residual of -1286519/);
    expect(by(reconcileFinancialStatements(wrong), "inventories").explanation?.residual).toBe("143278");
  });

  it("adversarial: release debt used as contractual, dated-elsewhere sources and a quarterly figure against an annual one are not comparable", () => {
    const base = camil();
    const relabeled = reconcileFinancialStatements({...base, pairedAccounts: [{id: "x", label: "x", family: "net_debt", sources: [
      {source: "release", value: "4214400", definition: "release", components: ["gross_debt", "cash", "investments"], asOf, anchor: release(11, "t")},
      {source: "contratual", value: "4214400", definition: "rotulada como contratual, mas sem derivativos", components: ["gross_debt", "derivative_liabilities", "derivative_assets", "cash", "investments"], asOf, anchor: itr(40)},
    ]}]});
    expect(by(relabeled, "x").state).toBe("not_comparable");
    const dated = reconcileFinancialStatements({...base, pairedAccounts: [{id: "y", label: "y", family: "net_debt", sources: [
      {source: "a", value: "100", definition: "a", components: ["ebitda"], asOf: "2026-05-31", anchor: itr(4)},
      {source: "b", value: "100", definition: "b", components: ["ebitda"], asOf: "2026-02-28", anchor: itr(4)},
    ]}]});
    expect(by(dated, "y").state).toBe("not_comparable");
    expect(by(dated, "y").comparability.reasons[0]).toMatch(/dated differently/);
    const annualized = reconcileFinancialStatements({...base, pairedAccounts: [{id: "z", label: "z", family: "ebitda", sources: [
      {source: "trimestre anualizado", value: "840000", definition: "EBITDA do trimestre vezes quatro", components: ["ebitda", "quarter_annualized"], asOf, anchor: release(4, "t")},
      {source: "doze meses", value: "895864", definition: "EBITDA dos últimos doze meses", components: ["ebitda", "ltm"], asOf, anchor: itr(40)},
    ]}]});
    expect(by(annualized, "z").state).toBe("not_comparable");
  });

  it("refuses duplicates, an explanation naming an unknown source, a positive tolerance without policy, and blocks an empty base", () => {
    const base = camil();
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [...base.pairedAccounts!, base.pairedAccounts![0]!]})).toThrow(/duplicate account/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{...base.pairedAccounts![1]!, explanation: {...base.pairedAccounts![1]!.explanation!, fromSource: "nowhere"}}]})).toThrow(/names a source the account does not have/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "1000"}}})).toThrow(/needs policyKey and policyVersion/);
    expect(() => reconcileFinancialStatements({...base, unit: "R$ mil" as unknown as "BRL"})).toThrow();
    const empty = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand"});
    expect(empty.state).toBe("blocked");
    expect(empty.block_reasons[0]).toMatch(/nothing to reconcile/);
    const noBalance = reconcileFinancialStatements({...base, balanceSheet: null, pairedAccounts: [base.pairedAccounts![2]!]});
    expect(noBalance.state).toBe("incomplete");
    expect(noBalance.uncovered_terms.some((term) => term.id === "balance_sheet")).toBe(true);
  });

  it("is consistent under twenty distinct permutations of accounts, sources, bridge lines, components, tolerance keys and object keys, with the trace in the fingerprint", () => {
    const first = reconcileFinancialStatements(camil());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reorderKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.pairedAccounts = permute(shuffled.pairedAccounts!, seed).map((account) => ({...account, sources: permute(account.sources, seed + 1).map((source) => reorderKeys({...source, components: permute(source.components, seed + 2)}))}));
      shuffled.debtBridge = {...shuffled.debtBridge!, lines: permute(shuffled.debtBridge!.lines, seed + 3)};
      shuffled.tolerance = reorderKeys(shuffled.tolerance!);
      const again = reconcileFinancialStatements(seed % 2 ? reorderKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
