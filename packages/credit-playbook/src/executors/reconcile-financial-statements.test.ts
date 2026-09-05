import {describe, expect, it} from "vitest";

import {referenceDataRegistryVersion} from "../reference-data";
import {reconcileFinancialStatements, type ReconciliationInput} from "./reconcile-financial-statements";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const release = (page: number, table: string) => ({document: "ri_release_1t26.pdf", page, table});
const asOf = "2026-05-31";
const policy = (value: string) => ({value, policyKey: "policy.reconciliation.tolerance", policyVersion: referenceDataRegistryVersion});
type Source = ReconciliationInput["pairedAccounts"] extends Array<infer A> | undefined ? (A extends {sources: Array<infer S>} ? S : never) : never;
const source = (name: string, value: string, definition: string, definitionKey: string, components: string[], anchor: Source["anchor"], definitionAnchor: Source["anchor"] = anchor): Source => ({source: name, value, definition, definitionKey, definitionAnchor, components, asOf, anchor});
/** Camil 1T26: the dividend divergence (four amounts), the three inventory presentations plus the balance sheet, the two net debt definitions, the roll-forwards and the interest bridge. R$ thousand. */
const camil = (): ReconciliationInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  tolerance: {working_capital: policy("1000"), net_debt: policy("1000"), interest: policy("2000")},
  pairedAccounts: [
    {id: "dividends", label: "Dividendos a pagar", family: "dividends", sources: [
      source("nota 18 nominal", "395000", "valor nominal das onze parcelas remanescentes (a primeira, de 25.000, já paga; total aprovado 420.000)", "dividends.nominal_remaining", ["dividends_declared", "nominal", "remaining_installments"], itr(46, "18e")),
      source("balanço (valor presente)", "338565", "nominal menos ajuste a valor presente", "dividends.present_value", ["dividends_declared", "present_value", "remaining_installments"], itr(46, "18e")),
      source("nota 25 contábil", "322498", "valor contábil na tabela de instrumentos financeiros", "dividends.carrying_amount", ["dividends_declared", "carrying_amount"], itr(51, "25")),
      source("nota 25 valor justo", "420000", "valor justo na tabela de instrumentos financeiros", "dividends.fair_value", ["dividends_declared", "fair_value"], itr(51, "25")),
    ]},
    {id: "inventories", label: "Estoques", family: "working_capital", sources: [
      source("nota 5", "3088478", "estoques incluindo adiantamentos a fornecedores de 643.241", "inventories.note5", ["inventories", "advances_to_suppliers"], itr(21, "5")),
      source("release, capital de giro", "2445200", "estoques sem adiantamentos a fornecedores", "inventories.release_wc", ["inventories"], release(12, "Capital de giro")),
      source("release, balanço gerencial", "2437100", "estoques no balanço gerencial, com adiantamentos a produtores de 576.000 em linha própria", "inventories.release_management", ["inventories_management_view"], release(14, "Balanço gerencial")),
      source("balanço patrimonial, circulante", "3013060", "estoques no ativo circulante do balanço consolidado", "inventories.balance_sheet_current", ["inventories", "advances_to_producers"], itr(11)),
    ], explanations: [
      {fromSource: "release, capital de giro", toSource: "nota 5", adjustment: "643241", description: "adiantamentos a fornecedores incluídos na nota 5 e apresentados à parte no release", anchor: itr(21, "5")},
      {fromSource: "release, balanço gerencial", toSource: "balanço patrimonial, circulante", adjustment: "576000", description: "adiantamentos a produtores em linha própria do balanço gerencial, dentro dos estoques do balanço", anchor: release(14, "Balanço gerencial")},
    ]},
    {id: "net_debt_release", label: "Dívida líquida (definição do release)", family: "net_debt", sources: [
      source("release", "4214400", "dívida bruta menos caixa e aplicações, em R$ milhões arredondados", "net_debt.release", ["gross_debt", "cash", "investments"], release(11, "Endividamento e Caixa")),
      source("recalculado das notas", "4214377", "5.670.186 menos 1.430.714 menos 25.095", "net_debt.release", ["gross_debt", "cash", "investments"], itr(40, "15"), release(11, "Endividamento e Caixa")),
    ]},
    {id: "net_debt_release_vs_contractual", label: "Dívida líquida do release contra a contratual", family: "net_debt", sources: [
      source("release", "4214400", "dívida bruta menos caixa e aplicações", "net_debt.release", ["gross_debt", "cash", "investments"], release(11, "Endividamento e Caixa")),
      source("contratual (nota 15)", "4228477", "dívida bruta mais derivativos passivos menos derivativos ativos, caixa e aplicações", "net_debt.contractual", ["gross_debt", "derivative_liabilities", "derivative_assets", "cash", "investments"], itr(40, "15"), {document: "escritura_13a_emissao.pdf", clause: "1.1, Dívida Líquida", page: 7}),
    ]},
    {id: "leases", label: "Passivo de arrendamento", family: "leases", sources: [
      source("balanço", "276768", "passivo de arrendamento circulante 67.399 mais não circulante 209.369, consolidado", "leases.balance_sheet", ["lease_liabilities"], itr(12)),
    ]},
  ],
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
  cashBridge: {opening: {value: "1997608", anchor: itr(20, "3")}, netChange: {value: "-566894", anchor: itr(16, "demonstração dos fluxos de caixa consolidada")}, closing: {value: "1430714", anchor: itr(20, "3")}},
  interestBridge: {fromDebtMovement: {value: "172359", components: ["interest", "monetary_variation"], anchor: itr(40, "15")}, fromIncomeStatement: {value: "170548", components: ["interest"], anchor: itr(48, "22")}},
});
const by = (result: ReturnType<typeof reconcileFinancialStatements>, id: string) => result.reconciliations.find((entry) => entry.id === id)!;

describe("reconcile-financial-statements executor (v3)", () => {
  it("gold: the roll-forwards close, the inventory presentations connect in two groups that do not meet, dividends stay open, and the two net debt definitions are not comparable", () => {
    const result = reconcileFinancialStatements(camil());
    expect(result.identities.map((identity) => [identity.id, identity.state])).toEqual([["balance_sheet", "holds"], ["debt_bridge", "holds"], ["cash_bridge", "holds"], ["interest_bridge", "not_comparable"]]);
    expect(result.identities.find((identity) => identity.id === "interest_bridge")?.difference).toBe("1811");
    expect(result.uncovered_terms.find((term) => term.id === "interest_bridge")?.reason).toMatch(/monetary_variation/);
    const inventories = by(result, "inventories");
    expect(inventories.explanations.map((explanation) => [explanation.residual, explanation.holds])).toEqual([["-40", true], ["37", true]]);
    expect(inventories.state).toBe("open");
    expect(inventories.explanation_groups).toEqual([["balanço patrimonial, circulante", "release, balanço gerencial"], ["nota 5", "release, capital de giro"]]);
    expect(inventories.unexplained_sources).toHaveLength(4);
    const dividends = by(result, "dividends");
    expect(dividends.state).toBe("not_comparable");
    expect(dividends.spread).toBe("97502");
    expect(by(result, "net_debt_release").state).toBe("closes");
    expect(by(result, "net_debt_release_vs_contractual").state).toBe("not_comparable");
    expect(by(result, "net_debt_release_vs_contractual").comparability.reasons[0]).toMatch(/different definitions/);
    expect(by(result, "leases").state).toBe("single_source");
    expect(result.open_divergences.map((entry) => entry.id)).toEqual(["dividends", "inventories", "net_debt_release_vs_contractual"]);
    expect(result.open_divergences.find((entry) => entry.id === "inventories")?.values).toHaveLength(4);
    expect(result.state).toBe("open_divergences");
  });

  it("adversarial: a scale mutation breaks the roll-forward identity; a mutated source opens the pair; a reversed adjustment leaves a residual; a partial explanation never hides a third source", () => {
    const mutated = camil();
    mutated.debtBridge!.lines[0]!.value = "2046140000";
    expect(reconcileFinancialStatements(mutated).state).toBe("identity_failed");
    const valueMutation = camil();
    valueMutation.pairedAccounts![2]!.sources[1]!.value = "4213000";
    expect(by(reconcileFinancialStatements(valueMutation), "net_debt_release").state).toBe("open");
    const reversed = camil();
    reversed.pairedAccounts![1]!.explanations = [{fromSource: "nota 5", toSource: "release, capital de giro", adjustment: "643241", description: "sentido trocado", anchor: itr(21, "5")}];
    const result = reconcileFinancialStatements(reversed);
    expect(by(result, "inventories").explanations[0]?.residual).toBe("-1286519");
    expect(by(result, "inventories").explanations[0]?.holds).toBe(false);
    const anchor = itr(1);
    const three = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "t", label: "t", family: "x", sources: [source("A", "100", "a", "k", ["c"], anchor), source("B", "90", "b", "k", ["c"], anchor), source("C", "80", "c", "k", ["c"], anchor)], explanations: [{fromSource: "B", toSource: "A", adjustment: "10", description: "b para a", anchor}]}]});
    expect(by(three, "t").state).toBe("open");
    expect(by(three, "t").explanation_groups).toEqual([["A", "B"], ["C"]]);
    expect(by(three, "t").unexplained_sources).toEqual(["A", "B", "C"]);
    expect(three.open_divergences[0]?.values.map((value) => value.source)).toContain("C");
  });

  it("adversarial: different definition keys, dated-elsewhere sources and a quarterly figure against an annual one are not comparable", () => {
    const anchor = itr(4);
    const keys = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "x", label: "x", family: "net_debt", sources: [source("release", "4214400", "release", "net_debt.release", ["gross_debt", "cash", "investments"], anchor), source("contratual", "4214400", "rotulada como contratual", "net_debt.contractual", ["gross_debt", "cash", "investments"], anchor)]}]});
    expect(by(keys, "x").state).toBe("not_comparable");
    expect(by(keys, "x").comparability.reasons[0]).toMatch(/different definitions/);
    const dated = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "y", label: "y", family: "ebitda", sources: [source("a", "100", "a", "e", ["ebitda"], anchor), {...source("b", "100", "b", "e", ["ebitda"], anchor), asOf: "2026-02-28"}]}]});
    expect(by(dated, "y").comparability.reasons[0]).toMatch(/dated differently/);
    const annualized = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "z", label: "z", family: "ebitda", sources: [source("trimestre anualizado", "840000", "EBITDA do trimestre vezes quatro", "ebitda.annualized", ["ebitda", "quarter_annualized"], anchor), source("doze meses", "895864", "EBITDA dos últimos doze meses", "ebitda.ltm", ["ebitda", "ltm"], anchor)]}]});
    expect(by(annualized, "z").state).toBe("not_comparable");
  });

  it("refuses duplicates, an explanation naming an unknown source, a tolerance without a registered policy at its current version, and blocks an empty base", () => {
    const base = camil();
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [...base.pairedAccounts!, base.pairedAccounts![0]!]})).toThrow(/duplicate account/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{...base.pairedAccounts![2]!, sources: [base.pairedAccounts![2]!.sources[0]!, base.pairedAccounts![2]!.sources[0]!]}]})).toThrow(/duplicate source/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{...base.pairedAccounts![1]!, explanations: [{...base.pairedAccounts![1]!.explanations![0]!, fromSource: "nowhere"}]}]})).toThrow(/names a source the account does not have/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "1000"}}})).toThrow(/needs policyKey and policyVersion/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "1000", policyKey: "policy.does.not.exist", policyVersion: "1"}}})).toThrow(/not in the reference-data registry/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "1000", policyKey: "policy.reconciliation.tolerance", policyVersion: "2020.01.01-v1"}}})).toThrow(/is at version/);
    expect(() => reconcileFinancialStatements({...base, unit: "R$ mil" as unknown as "BRL"})).toThrow();
    const empty = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand"});
    expect(empty.state).toBe("blocked");
    const noBridges = reconcileFinancialStatements({...base, balanceSheet: null, cashBridge: null, debtBridge: null, interestBridge: null, pairedAccounts: [base.pairedAccounts![2]!]});
    expect(noBridges.state).toBe("incomplete");
    expect(noBridges.uncovered_terms.map((term) => term.id)).toEqual(["balance_sheet", "debt_bridge", "cash_bridge", "interest_bridge"]);
  });

  it("is consistent under twenty distinct permutations of accounts, sources, explanations, bridge lines, components, tolerance keys and object keys, with the trace in the fingerprint", () => {
    const first = reconcileFinancialStatements(camil());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reorderKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.pairedAccounts = permute(shuffled.pairedAccounts!, seed).map((account) => ({...account, sources: permute(account.sources, seed + 1).map((entry) => reorderKeys({...entry, components: permute(entry.components, seed + 2)})), explanations: account.explanations ? permute(account.explanations, seed + 4) : undefined}));
      shuffled.debtBridge = {...shuffled.debtBridge!, lines: permute(shuffled.debtBridge!.lines, seed + 3)};
      shuffled.tolerance = reorderKeys(shuffled.tolerance!);
      const again = reconcileFinancialStatements(seed % 2 ? reorderKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
