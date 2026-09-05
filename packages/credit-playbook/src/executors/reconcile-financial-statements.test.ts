import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {referenceDataRegistryVersion} from "../reference-data";
import {reconcileFinancialStatements, type ReconciliationInput} from "./reconcile-financial-statements";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const release = (page: number, table: string) => ({document: "ri_release_1t26.pdf", page, table});
const asOf = "2026-05-31";
const policy = (value: string) => ({value, policyKey: "policy.reconciliation.tolerance", policyVersion: referenceDataRegistryVersion});
type Source = ReconciliationInput["pairedAccounts"] extends Array<infer A> | undefined ? (A extends {sources: Array<infer S>} ? S : never) : never;
const source = (name: string, value: string, definition: string, definitionKey: string, components: string[], anchor: Source["anchor"], definitionAnchor: Source["anchor"] = anchor, periodMonths = 0): Source => ({source: name, value, definition, definitionKey, definitionAnchor, components, asOf, anchor, periodMonths});
/** A release figure published in R$ million with one decimal, converted to R$ thousand with its rounding band recorded. */
const million = (statedValue: string) => ({stated: {value: statedValue, unit: "BRL million" as const, decimals: 1}});
/** Camil 1T26: the dividend divergence (four amounts), the three inventory presentations plus the balance sheet, the two net debt definitions, the roll-forwards and the interest bridge. R$ thousand. */
const camil = (): ReconciliationInput => ({
  referenceDate: asOf,
  unit: "BRL thousand",
  tolerance: {working_capital: policy("1000"), net_debt: policy("1000"), interest: policy("2000")},
  pairedAccounts: [
    {id: "dividends", label: "Dividendos a pagar", family: "dividends", sources: [
      {...source("nota 18 nominal", "395000", "dividendos declarados: valor nominal das onze parcelas remanescentes na nota 18(e), depois da primeira parcela de 25.000 já paga", "dividends.nominal_remaining", ["dividends_declared", "nominal", "remaining_installments"], itr(46, "18e, parcelas remanescentes")), derivation: {formula: "difference", operands: [{label: "dividendos aprovados", value: "420000", anchor: itr(46, "18e, total aprovado")}, {label: "primeira parcela paga", value: "25000", anchor: itr(46, "18e, parcela paga")}]}},
      {...source("balanço (valor presente)", "338565", "dividendos declarados: valor contábil consolidado, nominal menos ajuste a valor presente", "dividends.carrying_amount", ["dividends_declared", "carrying_amount"], itr(46, "18e")), derivation: {formula: "difference", operands: [{label: "nominal remanescente", value: "395000", anchor: itr(46, "18e")}, {label: "ajuste a valor presente", value: "56435", anchor: itr(46, "18e, ajuste a valor presente")}]}},
      source("nota 25 contábil", "322498", "dividendos declarados: valor contábil consolidado na tabela de instrumentos financeiros", "dividends.carrying_amount", ["dividends_declared", "carrying_amount"], itr(51, "25")),
      source("nota 25 valor justo", "420000", "dividendos declarados: valor justo na tabela de instrumentos financeiros", "dividends.fair_value", ["dividends_declared", "fair_value"], itr(51, "25")),
    ]},
    {id: "inventories", label: "Estoques", family: "working_capital", sources: [
      source("nota 5", "3088478", "estoques incluindo adiantamentos a fornecedores de 643.241", "inventories.note5", ["inventories", "advances_to_suppliers"], itr(21, "5")),
      {...source("release, capital de giro", "2445200", "estoques sem adiantamentos a fornecedores", "inventories.release_wc", ["inventories"], release(13, "Capital de giro")), ...million("2445.2")},
      {...source("release, balanço gerencial", "2437100", "estoques no balanço gerencial, sem os adiantamentos a produtores de 576.000, que ficam em linha própria", "inventories.release_management", ["inventories_management_view"], release(15, "Balanço gerencial")), ...million("2437.1")},
      source("balanço patrimonial, circulante", "3013060", "estoques no ativo circulante do balanço consolidado, incluindo os adiantamentos a produtores", "inventories.balance_sheet_current", ["inventories", "advances_to_producers"], itr(11)),
    ], explanations: [
      {fromSource: "release, capital de giro", toSource: "nota 5", adjustment: "643241", description: "adiantamentos a fornecedores incluídos na nota 5 e apresentados à parte no release", anchor: itr(21, "5")},
      {fromSource: "release, balanço gerencial", toSource: "balanço patrimonial, circulante", adjustment: "576000", description: "adiantamentos a produtores em linha própria do balanço gerencial, dentro dos estoques do balanço", anchor: release(15, "Balanço gerencial")},
      {fromSource: "nota 5", toSource: "balanço patrimonial, circulante", adjustment: "-75418", description: "parcela não circulante dos estoques e adiantamentos da nota 5 fora do ativo circulante (3.088.478 - 75.418 = 3.013.060)", anchor: itr(21, "5, abertura circulante e não circulante")},
    ]},
    {id: "net_debt_release", label: "Dívida líquida (definição do release)", family: "net_debt", sources: [
      {...source("release", "4214400", "dívida bruta menos caixa e aplicações, em R$ milhões arredondados", "net_debt.release", ["gross_debt", "cash", "investments"], release(12, "Endividamento e Caixa")), ...million("4214.4")},
      {...source("recalculado das notas", "4214377", "dívida bruta da nota 15 menos caixa e equivalentes da nota 3 menos aplicações financeiras do balanço", "net_debt.release", ["gross_debt", "cash", "investments"], itr(40, "15"), release(12, "Endividamento e Caixa")), derivation: {formula: "difference", operands: [{label: "dívida bruta", value: "5670186", anchor: itr(39, "15")}, {label: "caixa e equivalentes", value: "1430714", anchor: itr(20, "3")}, {label: "aplicações financeiras", value: "25095", anchor: itr(11)}]}},
    ]},
    {id: "net_debt_release_vs_contractual", label: "Dívida líquida do release contra a contratual", family: "net_debt", sources: [
      {...source("release", "4214400", "dívida bruta menos caixa e aplicações", "net_debt.release", ["gross_debt", "cash", "investments"], release(12, "Endividamento e Caixa")), ...million("4214.4")},
      {...source("contratual (nota 15)", "4228477", "dívida bruta mais derivativos passivos menos derivativos ativos, caixa e aplicações financeiras", "net_debt.contractual", ["gross_debt", "derivative_liabilities", "derivative_assets", "cash", "investments"], itr(40, "15"), {document: "escritura_13a_emissao.pdf", clause: "1.1, Dívida Líquida", page: 7}), derivation: {formula: "difference", operands: [{label: "dívida bruta mais derivativos passivos", value: "5684521", anchor: itr(40, "15: 5.670.186 + 14.335")}, {label: "derivativos ativos", value: "235", anchor: itr(51, "25")}, {label: "caixa e equivalentes", value: "1430714", anchor: itr(20, "3")}, {label: "aplicações financeiras", value: "25095", anchor: itr(11)}]}},
    ]},
    {id: "leases", label: "Passivo de arrendamento", family: "leases", sources: [
      source("balanço", "276768", "passivo de arrendamento circulante 67.399 mais não circulante 209.369, consolidado", "leases.balance_sheet", ["lease_liabilities"], itr(12)),
    ]},
  ],
  balanceSheet: {assets: {value: "12021830", anchor: itr(11)}, liabilities: {value: "9032723", anchor: itr(12)}, equity: {value: "2989107", anchor: itr(12)}},
  debtBridge: {opening: {value: "4988383", anchor: itr(40, "15, saldo em 28/02/2026")}, lines: [
    {id: "captacoes", label: "Captações", value: "2046140", category: "drawdowns", anchor: itr(40, "15, captações")},
    {id: "juros_e_variacoes", label: "Juros e variações monetárias", value: "172359", category: "accruedInterest", anchor: itr(40, "15, juros e variações monetárias")},
    {id: "apropriacao_custos", label: "Apropriação de custos de transação", value: "-4741", category: "otherAdditions", anchor: itr(40, "15, apropriação de custos")},
    {id: "amortizacao_principal", label: "Amortização de principal", value: "1285146", category: "amortizations", anchor: itr(40, "15, amortização de principal (publicada entre parênteses, lida como magnitude da redução)")},
    {id: "amortizacao_juros", label: "Amortização de juros", value: "229611", category: "amortizations", anchor: itr(40, "15, amortização de juros (publicada entre parênteses)")},
    {id: "variacao_cambial", label: "Variação cambial", value: "60", category: "foreignExchange", anchor: itr(40, "15, variação cambial")},
    {id: "ajuste_conversao", label: "Ajuste de conversão", value: "-17258", category: "foreignExchange", anchor: itr(40, "15, ajuste de conversão")},
  ], closing: {value: "5670186", anchor: itr(40, "15, saldo em 31/05/2026")}, anchor: itr(40, "15")},
  cashBridge: {opening: {value: "1997608", anchor: itr(20, "3")}, netChange: {value: "-566894", anchor: itr(16, "demonstração dos fluxos de caixa consolidada")}, closing: {value: "1430714", anchor: itr(20, "3")}},
  interestBridge: {fromDebtMovement: {value: "172359", sign: "as_published", components: ["interest", "monetary_variation"], anchor: itr(40, "15")}, fromIncomeStatement: {value: "-170548", sign: "absolute", components: ["interest"], anchor: itr(48, "22, despesa publicada entre parênteses")}},
});
const by = (result: ReturnType<typeof reconcileFinancialStatements>, id: string) => result.reconciliations.find((entry) => entry.id === id)!;

describe("reconcile-financial-statements executor (v7)", () => {
  it("gold: the roll-forwards close, the four inventory presentations connect through the stated bridges, the two carrying amounts of dividends stay open inside a non-comparable account, and the two net debt definitions are not comparable", () => {
    const result = reconcileFinancialStatements(camil());
    expect(result.identities.map((identity) => [identity.id, identity.state])).toEqual([["balance_sheet", "holds"], ["debt_bridge", "holds"], ["cash_bridge", "holds"], ["interest_bridge", "not_comparable"]]);
    expect(result.identities.find((identity) => identity.id === "interest_bridge")?.difference).toBe("1811");
    // The income statement prints the expense in parentheses; the magnitude reading is declared and traced.
    const interestTrace = result.trace.calculations.find((calculation) => calculation.id === "financial.interest_expense_bridge")!;
    expect(interestTrace.operands.fromIncomeStatementPublished).toBe("-170548");
    expect(interestTrace.operands.fromIncomeStatementRead).toBe("170548");
    expect(interestTrace.operands.fromIncomeStatementSign).toBe("absolute");
    const bridgeTrace = result.trace.calculations.find((calculation) => calculation.id === "financial.debt_balance_bridge")!;
    expect(bridgeTrace.anchors.captacoes).toEqual(itr(40, "15, captações"));
    expect(bridgeTrace.anchors.opening).toEqual(itr(40, "15, saldo em 28/02/2026"));
    // Release figures enter with their published scale and a rounding half band of 50 thousand; the recomputed net debt closes within the tolerance, not "exactly".
    expect(by(result, "net_debt_release").values.find((value) => value.source === "release")?.stated).toEqual({value: "4214.4", unit: "BRL million", decimals: 1, roundingHalfBand: "50"});
    expect(by(result, "net_debt_release").rounding_half_band).toBe("50");
    // The spread of 23 fits the release's rounding of 50: the pair closes by the published rounding, not by the policy tolerance.
    expect(by(result, "net_debt_release").closes_within).toBe("published_rounding");
    expect(by(result, "net_debt_release").comparable_subsets).toEqual([]);
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.accounting_identity:dividends:balanço (valor presente):derivation")?.operands["ajuste a valor presente"]).toBe("56435");
    expect(Object.keys(result.identities.find((identity) => identity.id === "balance_sheet")!.anchors)).toEqual(["assets", "liabilities", "equity"]);
    expect(result.identities.find((identity) => identity.id === "cash_bridge")?.anchors.netChange?.page).toBe(16);
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.accounting_identity:net_debt_release:recalculado das notas:derivation")?.operands["dívida bruta"]).toBe("5670186");
    expect(result.uncovered_terms.find((term) => term.id === "interest_bridge")?.reason).toMatch(/monetary_variation/);
    const inventories = by(result, "inventories");
    expect(inventories.explanations.map((explanation) => [explanation.fromSource, explanation.residual, explanation.holds])).toEqual([["nota 5", "0", true], ["release, balanço gerencial", "-40", true], ["release, capital de giro", "37", true]]);
    expect(inventories.state).toBe("explained");
    expect(inventories.explanation_groups).toEqual([["balanço patrimonial, circulante", "nota 5", "release, balanço gerencial", "release, capital de giro"]]);
    expect(inventories.unexplained_sources).toHaveLength(0);
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.accounting_identity:inventories:explanation:nota 5->balanço patrimonial, circulante")?.anchors.adjustment).toEqual(itr(21, "5, abertura circulante e não circulante"));
    const dividends = by(result, "dividends");
    expect(dividends.state).toBe("not_comparable");
    expect(dividends.spread).toBe("97502");
    // The two carrying amounts share definition, components and date: compared among themselves, they differ by 16.067 and stay open.
    expect(dividends.comparable_subsets).toEqual([{definitionKey: "dividends.carrying_amount", components: ["carrying_amount", "dividends_declared"], asOf, sources: ["balanço (valor presente)", "nota 25 contábil"], spread: "16067", state: "open"}]);
    expect(by(result, "net_debt_release").state).toBe("closes");
    expect(by(result, "net_debt_release_vs_contractual").state).toBe("not_comparable");
    expect(by(result, "net_debt_release_vs_contractual").comparability.reasons[0]).toMatch(/different definitions/);
    expect(by(result, "leases").state).toBe("single_source");
    expect(result.open_divergences.map((entry) => entry.id)).toEqual(["dividends", "net_debt_release_vs_contractual", "dividends:dividends.carrying_amount"]);
    expect(result.open_divergences.find((entry) => entry.id === "dividends")?.reason).toMatch(/among themselves, balanço \(valor presente\) and nota 25 contábil \(dividends.carrying_amount\) differ by 16067 and stay open/);
    expect(result.open_divergences.find((entry) => entry.id === "dividends:dividends.carrying_amount")?.values.map((value) => value.value)).toEqual(["338565", "322498"]);
    expect(result.state).toBe("open_divergences");
  });

  it("adversarial: a scale mutation breaks the roll-forward identity; a mutated source opens the pair; a reversed adjustment leaves a residual; a partial explanation never hides a third source", () => {
    const mutated = camil();
    mutated.debtBridge!.lines[0]!.value = "2046140000";
    expect(reconcileFinancialStatements(mutated).state).toBe("identity_failed");
    const valueMutation = camil();
    valueMutation.pairedAccounts![2]!.sources[1]!.value = "4213000";
    valueMutation.pairedAccounts![2]!.sources[1]!.derivation = null;
    expect(by(reconcileFinancialStatements(valueMutation), "net_debt_release").state).toBe("open");
    const reversed = camil();
    reversed.pairedAccounts![1]!.explanations = [{fromSource: "nota 5", toSource: "release, capital de giro", adjustment: "643241", description: "sentido trocado", anchor: itr(21, "5")}];
    const result = reconcileFinancialStatements(reversed);
    expect(by(result, "inventories").explanations[0]?.residual).toBe("-1286519");
    expect(by(result, "inventories").explanations[0]?.holds).toBe(false);
    const anchor = itr(1);
    const three = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "t", label: "t", family: "x", sources: [source("A", "100", "caixa a", "k", ["cash"], anchor), source("B", "90", "caixa b", "k", ["cash"], anchor), source("C", "80", "caixa c", "k", ["cash"], anchor)], explanations: [{fromSource: "B", toSource: "A", adjustment: "10", description: "b para a", anchor}]}]});
    expect(by(three, "t").state).toBe("open");
    expect(by(three, "t").explanation_groups).toEqual([["A", "B"], ["C"]]);
    expect(by(three, "t").unexplained_sources).toEqual(["A", "B", "C"]);
    expect(three.open_divergences[0]?.values.map((value) => value.source)).toContain("C");
  });

  it("adversarial: different definition keys, dated-elsewhere sources and a quarterly figure against an annual one are not comparable", () => {
    const anchor = itr(4);
    const keys = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "x", label: "x", family: "net_debt", sources: [source("release", "4214400", "dívida bruta menos caixa e aplicações", "net_debt.release", ["gross_debt", "cash", "investments"], anchor), source("contratual", "4214400", "dívida bruta menos caixa e aplicações, rotulada como contratual", "net_debt.contractual", ["gross_debt", "cash", "investments"], anchor)]}]});
    expect(by(keys, "x").state).toBe("not_comparable");
    expect(by(keys, "x").comparability.reasons[0]).toMatch(/different definitions/);
    const dated = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "y", label: "y", family: "ebitda", sources: [source("a", "100", "ebitda a", "e", ["ebitda"], anchor), {...source("b", "100", "ebitda b", "e", ["ebitda"], anchor), asOf: "2026-02-28"}]}]});
    expect(by(dated, "y").comparability.reasons[0]).toMatch(/dated differently/);
    const annualized = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "z", label: "z", family: "ebitda", sources: [source("trimestre anualizado", "840000", "EBITDA do trimestre vezes quatro", "ebitda.annualized", ["ebitda", "quarter_annualized"], anchor), source("doze meses", "895864", "EBITDA dos últimos doze meses", "ebitda.ltm", ["ebitda", "ltm"], anchor)]}]});
    // A subset only forms among sources that state the same thing: two definitions never compare among themselves.
    expect(by(annualized, "z").comparable_subsets).toEqual([]);
    expect(by(annualized, "z").state).toBe("not_comparable");
    // A quarter relabelled with the twelve-month key and components still covers three months: the span decides, not the label.
    const relabelled = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "w", label: "w", family: "ebitda", sources: [source("trimestre rotulado", "840000", "EBITDA dos últimos doze meses", "ebitda.ltm", ["ebitda", "ltm"], anchor, anchor, 3), source("doze meses", "895864", "EBITDA dos últimos doze meses", "ebitda.ltm", ["ebitda", "ltm"], anchor, anchor, 12)]}]});
    expect(by(relabelled, "w").state).toBe("not_comparable");
    expect(by(relabelled, "w").comparability.reasons[0]).toMatch(/cover different spans/);
  });

  it("refuses duplicates, an explanation naming an unknown source, a tolerance without a registered policy at its current version, and blocks an empty base", () => {
    const base = camil();
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [...base.pairedAccounts!, base.pairedAccounts![0]!]})).toThrow(/duplicate account/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{...base.pairedAccounts![2]!, sources: [base.pairedAccounts![2]!.sources[0]!, base.pairedAccounts![2]!.sources[0]!]}]})).toThrow(/duplicate source/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{...base.pairedAccounts![1]!, explanations: [{...base.pairedAccounts![1]!.explanations![0]!, fromSource: "nowhere"}]}]})).toThrow(/names a source the account does not have/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "1000"}}})).toThrow(/needs policyKey and policyVersion/);
    // Policy metadata is checked even at zero: a fake policy never reaches the output as provenance.
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "0", policyKey: "fake.policy", policyVersion: "fake.version"}}})).toThrow(/not in the reference-data registry/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "0", policyKey: "policy.reconciliation.tolerance"}}})).toThrow(/both policyKey and policyVersion, or neither/);
    expect(reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "0", policyKey: "policy.reconciliation.tolerance", policyVersion: referenceDataRegistryVersion}}}).state).toBe("open_divergences");
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{id: "fake", label: "fake", family: "x", sources: [source("a", "1", "algo", "k", ["fake_component"], itr(1)), source("b", "1", "algo", "k", ["fake_component"], itr(1))]}]})).toThrow(/unknown component tag fake_component/);
    expect(() => reconcileFinancialStatements({...base, interestBridge: {...base.interestBridge!, fromDebtMovement: {...base.interestBridge!.fromDebtMovement, components: ["interest", "made_up"]}}})).toThrow(/unknown component tag made_up in the interest bridge/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "1000", policyKey: "policy.does.not.exist", policyVersion: "1"}}})).toThrow(/not in the reference-data registry/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "1000", policyKey: "policy.reconciliation.tolerance", policyVersion: "2020.01.01-v1"}}})).toThrow(/is at version/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {net_debt: policy("5000")}})).toThrow(/states 1000, not 5000/);
    expect(() => reconcileFinancialStatements({...base, tolerance: {contingencies: policy("1000")}})).toThrow(/states no tolerance for this family/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{...base.pairedAccounts![1]!, explanations: [base.pairedAccounts![1]!.explanations![0]!, base.pairedAccounts![1]!.explanations![0]!]}]})).toThrow(/one adjustment per pair/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{id: "tag", label: "tag", family: "net_debt", sources: [source("a", "1", "texto sem os componentes", "k", ["gross_debt", "cash"], itr(1)), source("b", "1", "texto sem os componentes", "k", ["gross_debt", "cash"], itr(1))]}]})).toThrow(/never names the component/);
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: [{...base.pairedAccounts![2]!, sources: [base.pairedAccounts![2]!.sources[0]!, {...base.pairedAccounts![2]!.sources[1]!, derivation: {formula: "difference", operands: [{label: "a", value: "10", anchor: itr(1)}, {label: "b", value: "1", anchor: itr(1)}]}}]}]})).toThrow(/the derivation gives 9/);
    expect(() => reconcileFinancialStatements({...base, unit: "R$ mil" as unknown as "BRL"})).toThrow();
    const empty = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand"});
    expect(empty.state).toBe("blocked");
    expect(empty.uncovered_terms.map((term) => term.id)).toEqual(["balance_sheet", "debt_bridge", "cash_bridge", "interest_bridge"]);
    const noBridges = reconcileFinancialStatements({...base, balanceSheet: null, cashBridge: null, debtBridge: null, interestBridge: null, pairedAccounts: [base.pairedAccounts![2]!]});
    expect(noBridges.state).toBe("incomplete");
    const incompleteWithDivergence = reconcileFinancialStatements({...base, balanceSheet: null});
    expect(incompleteWithDivergence.state).toBe("incomplete");
    expect(incompleteWithDivergence.open_divergences.length).toBeGreaterThan(0);
    const comparableFailingBridge = reconcileFinancialStatements({...base, interestBridge: {fromDebtMovement: {value: "100000", components: ["interest"], anchor: itr(40)}, fromIncomeStatement: {value: "90000", components: ["interest"], anchor: itr(48)}}});
    expect(comparableFailingBridge.state).toBe("identity_failed");
    const datedWithExplanation = reconcileFinancialStatements({...base, pairedAccounts: [{id: "d", label: "d", family: "ebitda", sources: [source("a", "100", "ebitda", "e", ["ebitda"], itr(4)), {...source("b", "90", "ebitda", "e", ["ebitda"], itr(4)), asOf: "2026-02-28"}], explanations: [{fromSource: "b", toSource: "a", adjustment: "10", description: "liga as duas", anchor: itr(4)}]}]});
    const reversedComponents = reconcileFinancialStatements({...base, interestBridge: {...base.interestBridge!, fromDebtMovement: {...base.interestBridge!.fromDebtMovement, components: ["monetary_variation", "interest"]}}});
    expect(reversedComponents.trace.inputFingerprint).toBe(reconcileFinancialStatements(base).trace.inputFingerprint);
    expect(reversedComponents.trace.outputFingerprint).toBe(reconcileFinancialStatements(base).trace.outputFingerprint);
    expect(by(datedWithExplanation, "d").state).toBe("not_comparable");
    expect(noBridges.uncovered_terms.map((term) => term.id)).toEqual(["balance_sheet", "debt_bridge", "cash_bridge", "interest_bridge"]);
  });

  it("is consistent under twenty distinct permutations of accounts, sources, explanations, bridge lines, components, tolerance keys and object keys, with the trace in the fingerprint", () => {
    const first = reconcileFinancialStatements(camil());
    expect(first.trace.outputFingerprint).not.toBe(reconcileFinancialStatements({...camil(), pairedAccounts: camil().pairedAccounts!.map((account) => ({...account, explanations: account.explanations?.map((explanation) => ({...explanation, description: `${explanation.description} (outra)`}))}))}).trace.outputFingerprint);
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
      expect(again).toEqual(first);
    }
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(reconcileFinancialStatements(camil()) as unknown as Record<string, unknown>, "financial/reconcile-financial-statements.md")).toEqual([]);
  });

  it("closes within the published rounding when the spread is inside the coarser rounding band and no tolerance policy applies, and refuses a stated value that does not convert", () => {
    const anchor = itr(4);
    const within = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "r", label: "r", family: "x", sources: [{...source("release", "4214400", "dívida bruta menos caixa e aplicações", "k", ["gross_debt", "cash", "investments"], anchor), stated: {value: "4214.4", unit: "BRL million", decimals: 1}}, source("notas", "4214377", "dívida bruta menos caixa e aplicações", "k", ["gross_debt", "cash", "investments"], anchor)]}]});
    expect(by(within, "r").state).toBe("closes");
    expect(by(within, "r").closes_within).toBe("published_rounding");
    expect(by(within, "r").spread).toBe("23");
    // A pair that closes as a whole leaves no open subset and no divergence behind.
    expect(by(within, "r").comparable_subsets).toEqual([]);
    expect(within.open_divergences).toEqual([]);
    // Without the bridges the run is incomplete, never closes as a whole; the pair itself closes.
    expect(within.state).toBe("incomplete");
    const beyond = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "r", label: "r", family: "x", sources: [{...source("release", "4214400", "dívida bruta menos caixa e aplicações", "k", ["gross_debt", "cash", "investments"], anchor), stated: {value: "4214.4", unit: "BRL million", decimals: 1}}, source("notas", "4214300", "dívida bruta menos caixa e aplicações", "k", ["gross_debt", "cash", "investments"], anchor)]}]});
    expect(by(beyond, "r").state).toBe("open");
    expect(() => reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "r", label: "r", family: "x", sources: [{...source("release", "4214400", "dívida bruta menos caixa e aplicações", "k", ["gross_debt", "cash", "investments"], anchor), stated: {value: "4214.5", unit: "BRL million", decimals: 1}}, source("notas", "4214377", "dívida bruta menos caixa e aplicações", "k", ["gross_debt", "cash", "investments"], anchor)]}]})).toThrow(/converts to 4214500 BRL thousand, not 4214400/);
  });
});
