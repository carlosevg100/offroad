import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {referenceDataRegistryVersion} from "../reference-data";
import {reconcileFinancialStatements, type ReconciliationInput} from "./reconcile-financial-statements";
import {itr, release, asOf, policy, source, million, camil, by} from "../cases/gc01/reconcile-financial-statements";

describe("reconcile-financial-statements executor (v9)", () => {
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
    // The amortizations are published in parentheses; the magnitude reading is declared per line and both values sit in the trace.
    expect(bridgeTrace.operands["amortizacao_principal:published"]).toBe("-1285146");
    expect(bridgeTrace.operands["amortizacao_principal:read"]).toBe("1285146");
    expect(bridgeTrace.operands["amortizacao_principal:sign"]).toBe("absolute");
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
    // The interest bridge of the gold is not comparable (juros against juros mais atualização monetária): the run is incomplete, and the open divergences stay listed.
    expect(result.state).toBe("incomplete");
    expect(result.incomplete_reasons.some((reason) => /interest bridge is not comparable/.test(reason))).toBe(true);
  });

  it("adversarial: a scale mutation breaks the roll-forward identity; a mutated source opens the pair; a reversed adjustment leaves a residual; a partial explanation never hides a third source", () => {
    const mutated = camil();
    mutated.debtBridge!.lines[0]!.published = "2046140000";
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
    // An explanation never bridges spans: a quarter against twelve months stays not comparable even with an adjustment that closes.
    const spansWithExplanation = reconcileFinancialStatements({referenceDate: asOf, unit: "BRL thousand", pairedAccounts: [{id: "v", label: "v", family: "ebitda", sources: [source("trimestre", "210000", "EBITDA do trimestre", "ebitda.q", ["ebitda"], anchor, anchor, 3), source("doze meses", "895864", "EBITDA dos últimos doze meses", "ebitda.ltm", ["ebitda"], anchor, anchor, 12)], explanations: [{fromSource: "trimestre", toSource: "doze meses", adjustment: "685864", description: "os outros três trimestres", anchor}]}]});
    expect(by(spansWithExplanation, "v").state).toBe("not_comparable");
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
    expect(reconcileFinancialStatements({...base, tolerance: {net_debt: {value: "0", policyKey: "policy.reconciliation.tolerance", policyVersion: referenceDataRegistryVersion}}}).state).toBe("incomplete");
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

  it("mutation: a declared magnitude compares as a magnitude, a reduction published negative is refused, a signed derivation is recomputed operand by operand, and a non-comparable interest bridge is an incomplete reason", () => {
    const base = camil();
    const contractual = base.pairedAccounts!.find((account) => account.sources.some((source) => source.definitionKey === "net_debt.contractual"))!;
    const source = contractual.sources.find((entry) => entry.definitionKey === "net_debt.contractual")!;
    const derivation = reconcileFinancialStatements(base).trace.calculations.find((calculation) => calculation.id === `financial.accounting_identity:${contractual.id}:${source.source}:derivation`);
    expect(derivation?.operands["derivativos passivos"]).toBe("14335");
    expect(derivation?.anchors["derivativos passivos"]).toEqual({document: "01_ITR_1T26_31mai2026.pdf", page: 12, note: "balanço patrimonial: instrumentos financeiros derivativos, passivo; também nota 25, p. 51"});
    expect(() => reconcileFinancialStatements({...base, pairedAccounts: base.pairedAccounts!.map((account) => (account.id === contractual.id ? {...account, sources: account.sources.map((entry) => (entry === source ? {...entry, derivation: {...entry.derivation!, operands: entry.derivation!.operands.map((operand) => (operand.label === "derivativos passivos" ? {...operand, sign: "-" as const} : operand))}} : entry))} : account))})).toThrow(/the derivation gives 4199807, not 4228477/);
    const leases = base.pairedAccounts!.find((account) => account.sources.length >= 2 && account.sources.every((entry) => !entry.derivation))!;
    const negated = {...base, pairedAccounts: base.pairedAccounts!.map((account) => (account.id === leases.id ? {...account, sources: account.sources.map((entry, index) => (index === 0 ? {...entry, value: `-${entry.value}`, sign: "absolute" as const} : entry))} : account))};
    const read = reconcileFinancialStatements(negated);
    expect(read.reconciliations.find((entry) => entry.id === leases.id)?.state).toBe(reconcileFinancialStatements(base).reconciliations.find((entry) => entry.id === leases.id)?.state);
    expect(read.trace.calculations.find((calculation) => calculation.id === `financial.accounting_identity:${leases.id}:sign`)?.operands[`${leases.sources[0]!.source}:read`]).toBe(leases.sources[0]!.value);
    const debtBridge = base.debtBridge;
    if (debtBridge) {
      const reduction = debtBridge.lines.find((line) => line.category === "amortizations" || line.category === "prepayments")!;
      expect(() => reconcileFinancialStatements({...base, debtBridge: {...debtBridge, lines: debtBridge.lines.map((line) => (line === reduction ? {...line, published: `-${line.published.replace(/^-/, "")}`, sign: "as_published" as const} : line))}})).toThrow(/would be added back by the bridge/);
    }
    if (base.interestBridge) {
      // The gold itself: the note's accrued interest counts interest and monetary variation, the income statement's line counts interest only.
      const mixed = reconcileFinancialStatements(base);
      expect(mixed.identities.find((identity) => identity.id === "interest_bridge")?.state).toBe("not_comparable");
      expect(mixed.incomplete_reasons.some((reason) => /interest bridge is not comparable/.test(reason))).toBe(true);
    }
  });
});
