import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {buildDebtLedger, parseDefinition, stableStringify, type DebtLedgerInput} from "./build-debt-ledger";

/** Camil, ITR 31/05/2026 and 28/02/2026, consolidated, R$ thousand (answer key sections 1, 3, 5, 11.1 and 13.5). */
const itr = (page: number, note?: string, table?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {}), ...(table ? {table} : {})});
const trustee = (document: string, page: number) => ({document, page, table: "características das séries"});
type Row = DebtLedgerInput["rows"][number];
/** Foreign bank lines: the ITR states that the parent guarantees the debts of its foreign subsidiaries (note 15, p. 40); the domestic line has no source for its guarantee. */
const loan = (id: string, instrument: string, balance: string, prior: string, currency: string): Row => currency === "BRL"
  ? {id, instrument, obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency, anchors: {balance: itr(39, "15")}}
  : {id, instrument, obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency, guarantee: "garantia da controladora sobre as dívidas das controladas no exterior (sem individualização por contrato)", anchors: {balance: itr(39, "15"), guarantee: itr(40, "15: a controladora é garantidora das dívidas de suas controladas no exterior")}};
const contra = (id: string, instrument: string, balance: string, prior: string): Row => ({id, instrument, balance, priorBalance: prior, currency: "BRL", contra: true, anchors: {balance: itr(39, "15")}});
/** The securitizadora holds the debentures formally (indenture preamble) and votes as the CRA holders instruct (securitization term). */
const eco = (escritura: string, craTerm: {document: string; clause: string; page?: number}) => ({
  lender: {formalHolder: "Eco Securitizadora de Direitos Creditórios do Agronegócio S.A. (debenturista)", economicCreditors: "titulares dos CRA, que orientam a securitizadora em assembleia"},
  anchors: {lenderFormalHolder: {document: escritura, clause: "preâmbulo, considerando D", page: 3}, lenderEconomicCreditors: craTerm},
});
/** The 11th's covering report puts the maturity on page 1 and the remuneration on page 2. */
const publicHolders = (escritura: string) => ({
  lender: {formalHolder: "debenturistas (oferta pública), representados pelo agente fiduciário", economicCreditors: "debenturistas"},
  anchors: {lenderFormalHolder: {document: escritura, clause: "preâmbulo", page: 1}, lenderEconomicCreditors: {document: escritura, clause: "preâmbulo", page: 1}},
});
const deb = (id: string, issue: string, series: string, balance: string, prior: string, remuneration: Row["remuneration"], maturity: string, report: string, page: number, holder: ReturnType<typeof eco>, maturityPage = page): Row => ({
  id, instrument: `Debêntures ${issue}`, series, obligation: {kind: "debenture", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency: "BRL",
  remuneration, maturity, guarantee: "quirografária", lender: holder.lender,
  anchors: {balance: itr(39, "15"), remuneration: trustee(report, page), maturity: trustee(report, maturityPage), guarantee: itr(39, "15"), ...holder.anchors},
});
const cdi = (spread: string): Row["remuneration"] => ({type: "spread_over_index", index: "CDI", spreadPercentPerYear: spread});
const pct = (percent: string): Row["remuneration"] => ({type: "percent_of_index", index: "CDI", percentOfIndex: percent});
const ipca = (spread: string): Row["remuneration"] => ({type: "spread_over_index", index: "IPCA", spreadPercentPerYear: spread});
const h11 = publicHolders("escritura_11a_emissao.pdf");
const h13 = eco("escritura_13a_emissao.pdf", {document: "cra_292_termo_securitizacao.pdf", clause: "17.8.8: a securitizadora convoca os titulares dos CRA para orientar o exercício dos direitos nas debêntures"});
const h14 = eco("escritura_14a_emissao.pdf", {document: "escritura_14a_emissao.pdf", clause: "7.26.5: a securitizadora convoca assembleia especial de titulares de CRA e delibera conforme a orientação", page: 55});
const h15 = eco("escritura_15a_emissao.pdf", {document: "escritura_15a_emissao.pdf", clause: "7.26.5: a securitizadora convoca assembleia especial de titulares de CRA e delibera conforme a orientação", page: 56});
const camil = (): DebtLedgerInput => ({
  referenceDate: "2026-05-31",
  priorDate: "2026-02-28",
  unit: "BRL thousand",
  unitAnchor: itr(11, "cabeçalho das demonstrações: em milhares de reais"),
  source: "note",
  rows: [
    loan("loan-brl", "Capital de giro, moeda nacional", "1314412", "951593", "BRL"),
    loan("loan-usd", "Capital de giro, USD", "867244", "492857", "USD"),
    loan("loan-clp", "Capital de giro, CLP", "54180", "43397", "CLP"),
    loan("loan-pen", "Capital de giro, PEN", "181158", "199398", "PEN"),
    contra("loan-costs", "Custo de transação (empréstimos)", "-9099", "-1123"),
    deb("deb-11-1", "11ª emissão", "1ª", "151795", "157626", cdi("1.55"), "2028-10-30", "af_11a_emissao.pdf", 2, h11, 1),
    deb("deb-11-2", "11ª emissão", "2ª", "505984", "525419", cdi("1.55"), "2028-10-30", "af_11a_emissao.pdf", 2, h11, 1),
    deb("deb-13-1", "13ª emissão", "1ª", "306038", "316694", cdi("0.65"), "2028-11-16", "af_13a_emissao.pdf", 2, h13),
    deb("deb-13-2", "13ª emissão", "2ª", "282357", "279335", ipca("6.3416"), "2030-11-18", "af_13a_emissao.pdf", 3, h13),
    deb("deb-13-3", "13ª emissão", "3ª", "110321", "109185", ipca("6.5264"), "2033-11-16", "af_13a_emissao.pdf", 4, h13),
    deb("deb-14-1", "14ª emissão", "1ª", "438918", "423854", pct("104"), "2029-06-15", "af_14a_emissao.pdf", 2, h14),
    deb("deb-14-2", "14ª emissão", "2ª", "204059", "195876", ipca("6.8286"), "2031-06-16", "af_14a_emissao.pdf", 3, h14),
    deb("deb-14-3", "14ª emissão", "3ª", "66024", "63457", ipca("6.9982"), "2034-06-15", "af_14a_emissao.pdf", 4, h14),
    deb("deb-15-1", "15ª emissão", "1ª", "770123", "795649", pct("105"), "2030-11-18", "af_15a_emissao.pdf", 2, h15),
    deb("deb-15-2", "15ª emissão", "2ª", "408703", "420902", {type: "fixed", ratePercentPerYear: "14.15"}, "2032-11-16", "af_15a_emissao.pdf", 3, h15),
    deb("deb-15-3", "15ª emissão", "3ª", "50401", "50020", ipca("8.20"), "2032-11-16", "af_15a_emissao.pdf", 4, h15),
    deb("deb-15-4", "15ª emissão", "4ª", "30793", "30591", ipca("8.70"), "2035-11-16", "af_15a_emissao.pdf", 5, h15),
    contra("deb-costs", "Custo de transação (debêntures)", "-63225", "-66347"),
  ],
  balanceSheet: {current: "1229828", nonCurrent: "4440358", anchor: itr(12, undefined, "Balanço patrimonial consolidado, empréstimos, financiamentos e debêntures")},
  schedule: {periods: [
    {period: "2026/27", amount: "1229828", endsAt: "2027-05-31"}, {period: "2027/28", amount: "776868", endsAt: "2028-05-31"}, {period: "2028/29", amount: "1228475", endsAt: "2029-05-31"},
    {period: "2029/30", amount: "694497", endsAt: "2030-05-31"}, {period: "2030/31", amount: "994544", endsAt: "2031-05-31"}, {period: "after 2031", amount: "809198", endsAt: null}, {period: "debenture costs", amount: "-63224", endsAt: null},
  ], anchor: itr(40, "15")},
  cash: {
    cashAndEquivalents: {value: "1430714", anchor: itr(20, "3")},
    financialInvestments: {value: "25095", anchor: itr(11, undefined, "Balanço patrimonial consolidado, aplicações financeiras")},
    derivativeAssets: {value: "235", anchor: itr(51, "25")},
    derivativeLiabilities: {value: "14335", anchor: itr(51, "25")},
  },
  definitions: {
    // The release states no prose definition: the labeled rows of its table are the definition, and the method says a labeled table counts as one.
    release: {text: "Dívida bruta (-) Caixa e aplicações financeiras = Dívida líquida (linhas rotuladas da tabela Endividamento e Caixa)", anchor: {document: "ri_release_1t26.pdf", page: 12, table: "Endividamento e Caixa"}},
    contractual: {text: "somatória da rubrica de empréstimos, financiamentos e debêntures no passivo circulante e não circulante, mais a rubrica de operações com derivativos do passivo circulante e não circulante em seu balanço patrimonial, bem como qualquer outra rubrica que se refira à dívida onerosa da Emissora que venha a ser criada, menos a soma (a) da rubrica de disponibilidades (caixa e equivalentes à caixa) com (b) as aplicações financeiras (circulante e não circulante), com (c) operações com derivativos do ativo circulante e não circulante em seu balanço patrimonial, com base em valores extraídos do balanço patrimonial consolidado da Emissora", anchor: {document: "escritura_13a_emissao.pdf", clause: "1.1, Dívida Líquida", page: 7}},
  },
  releaseReportedNetDebt: {value: "4214400", anchor: {document: "ri_release_1t26.pdf", page: 12, table: "Endividamento e Caixa"}},
});

/** Deterministic permutation, different at every step. */
const permute = <T>(items: T[], seed: number): T[] => {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
};
const sumShares = (entries: Array<{shareOfGrossBeforeContra: string}>) => entries.reduce((sum, entry) => sum + Number(entry.shareOfGrossBeforeContra), 0);

describe("build-debt-ledger executor (v10)", () => {
  it("gold: gross debt of both dates, total reconciliation, first period against current liabilities, both views with their definitions and per-operand anchors", () => {
    const ledger = buildDebtLedger(camil());
    expect(ledger.state).toBe("complete");
    expect(ledger.gross_debt).toBe("5670186");
    expect(ledger.gross_debt_prior).toBe("4988383");
    expect(ledger.gross_debt_before_contra).toBe("5742510");
    expect(ledger.reconciliation.total.state).toBe("reconciled");
    expect(ledger.reconciliation.split.state).toBe("not_possible");
    expect(ledger.reconciliation.anchor?.page).toBe(12);
    expect(ledger.schedule?.matchesGross).toBe(true);
    expect(ledger.schedule?.currentPeriod).toEqual({period: "2026/27", amount: "1229828", balanceSheetCurrent: "1229828", difference: "0", matches: true});
    expect(ledger.net_debt_views.contractual?.value).toBe("4228477");
    expect(ledger.net_debt_views.contractual?.residualAssumedZero).toBe(true);
    expect(ledger.net_debt_views.contractual?.definitionSource).toEqual({document: "escritura_13a_emissao.pdf", clause: "1.1, Dívida Líquida", page: 7});
    expect(ledger.net_debt_views.contractual?.componentAnchors.financialInvestments?.page).toBe(11);
    expect(ledger.net_debt_views.release?.value).toBe("4214377");
    expect(ledger.net_debt_views.release?.residualAssumedZero).toBe(false);
    expect(ledger.net_debt_views.releaseReported?.differenceToRelease).toBe("23");
    expect(ledger.by_indexer.find((entry) => entry.indexer === "IPCA")?.balance).toBe("743955");
    expect(ledger.by_indexer.find((entry) => entry.indexer === "unknown")?.balance).toBe("2416994");
    expect(ledger.by_indexer.find((entry) => entry.indexer === "fixed")?.balance).toBe("408703");
    const foreign = ledger.by_currency.filter((entry) => entry.currency !== "BRL").reduce((sum, entry) => sum + Number(entry.balance), 0);
    expect(foreign).toBe(1102582);
    expect(Math.abs(sumShares(ledger.by_indexer) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(sumShares(ledger.by_currency) - 1)).toBeLessThan(1e-6);
    // The answer key's percentages divide by the gross debt of the note: 13,1% IPCA and 19,4% foreign currency.
    expect(ledger.by_indexer.find((entry) => entry.indexer === "IPCA")?.shareOfReportedGrossDebt.startsWith("0.1312")).toBe(true);
    const foreignShare = ledger.by_currency.filter((entry) => entry.currency !== "BRL").reduce((sum, entry) => sum + Number(entry.shareOfReportedGrossDebt), 0);
    expect(foreignShare).toBeCloseTo(0.1944, 3);
  });

  it("gold: the trace lists the operands of every number: each row in the total, each group, the reported difference", () => {
    const ledger = buildDebtLedger(camil());
    const ids = ledger.trace.calculations.map((calculation) => calculation.id);
    expect(ledger.trace.calculations.find((calculation) => calculation.id === "financial.debt_ledger_balance")?.operands["deb-15-1"]).toBe("770123");
    expect(ids).toContain("financial.debt_ledger_group:indexer:IPCA");
    expect(ids).toContain("financial.debt_ledger_group:currency:USD");
    expect(ids).toContain("financial.debt_views:release:reported_difference");
    expect(ids).toContain("financial.maturity_buckets:current");
    const ipcaGroup = ledger.by_indexer.find((entry) => entry.indexer === "IPCA")!;
    expect(ledger.trace.calculations.find((calculation) => calculation.id === "financial.debt_ledger_group:indexer:IPCA")?.result).toBe(`${ipcaGroup.balance};${ipcaGroup.shareOfGrossBeforeContra};${ipcaGroup.shareOfReportedGrossDebt}`);
    expect(Number(ipcaGroup.shareOfGrossBeforeContra) * 5742510).toBeCloseTo(743955, 0);
  });

  it("gold: remuneration is typed, the formal holder and the economic creditors carry their own anchors, terms point at the right pages", () => {
    const ledger = buildDebtLedger(camil());
    const row = ledger.ledger_rows.find((entry) => entry.id === "deb-14-3")!;
    expect(row.remuneration).toEqual({type: "spread_over_index", index: "IPCA", spreadPercentPerYear: "6.9982"});
    expect(row.lender?.formalHolder).toMatch(/Eco Securitizadora/);
    expect(row.anchors.lenderFormalHolder).toEqual({document: "escritura_14a_emissao.pdf", clause: "preâmbulo, considerando D", page: 3});
    expect(row.anchors.lenderEconomicCreditors).toEqual({document: "escritura_14a_emissao.pdf", clause: "7.26.5: a securitizadora convoca assembleia especial de titulares de CRA e delibera conforme a orientação", page: 55});
    expect(row.anchors.remuneration?.page).toBe(4);
    expect(ledger.ledger_rows.find((entry) => entry.id === "deb-15-4")!.anchors.maturity?.page).toBe(5);
    expect(ledger.ledger_rows.find((entry) => entry.id === "deb-11-1")!.anchors.lenderFormalHolder?.clause).toBe("preâmbulo");
    expect(ledger.ledger_rows.find((entry) => entry.id === "deb-11-1")!.anchors.maturity?.page).toBe(1);
    expect(ledger.ledger_rows.find((entry) => entry.id === "deb-11-1")!.anchors.remuneration?.page).toBe(2);
    expect(ledger.ledger_rows.find((entry) => entry.id === "loan-usd")!.anchors.guarantee?.page).toBe(40);
    expect(ledger.ledger_rows.find((entry) => entry.id === "deb-13-1")!.anchors.lenderEconomicCreditors?.clause).toMatch(/^17\.8\.8/);
    expect(ledger.ledger_rows.find((entry) => entry.id === "loan-costs")!.obligation).toBeNull();
  });

  it("names what the base does not support, field by field, with the two facts of a lender apart", () => {
    const ledger = buildDebtLedger(camil());
    const loanFields = ledger.uncovered_terms.filter((entry) => entry.rowId === "loan-usd").map((entry) => entry.field);
    expect(loanFields).toEqual(["remuneration", "maturity", "lender_formal_holder", "lender_economic_creditors", "classification"]);
    expect(ledger.uncovered_terms.filter((entry) => entry.rowId === "loan-brl").map((entry) => entry.field)).toContain("guarantee");
    expect(ledger.uncovered_terms.find((entry) => entry.rowId === "loan-usd" && entry.field === "remuneration")?.reason).toMatch(/currency is not an indexer/);
    const debentureFields = new Set(ledger.uncovered_terms.filter((entry) => entry.rowId.startsWith("deb-1")).map((entry) => entry.field));
    expect([...debentureFields]).toEqual(["classification"]);
    const half = camil();
    (half.rows[7] as Row).lender = {formalHolder: "Eco Securitizadora", economicCreditors: null};
    expect(buildDebtLedger(half).uncovered_terms.some((entry) => entry.rowId === "deb-13-1" && entry.field === "lender_economic_creditors")).toBe(true);
  });

  it("refuses a term without an anchor, a lender fact without its anchor, an obligation on a contra line, an undisbursed row, a lease without inclusion anchor, a duplicate id and a tolerance without policy", () => {
    const unanchored = camil();
    (unanchored.rows[5] as Row).anchors = {balance: itr(39, "15")};
    expect(() => buildDebtLedger(unanchored)).toThrow(/without an anchor/);
    const halfAnchored = camil();
    delete (halfAnchored.rows[7] as Row).anchors.lenderEconomicCreditors;
    expect(() => buildDebtLedger(halfAnchored)).toThrow(/economic creditors of deb-13-1 are stated without an anchor/);
    const contraObligation = camil();
    (contraObligation.rows[4] as Row).obligation = {kind: "other", disbursed: true, views: ["release"]};
    expect(() => buildDebtLedger(contraObligation)).toThrow(/not an obligation to a lender/);
    const authorizedOnly = camil();
    authorizedOnly.rows.push({id: "notes-2026", instrument: "Notas comerciais (autorizadas)", obligation: {kind: "commercial_note", disbursed: false as unknown as true, views: ["release"]}, balance: "251000", currency: "BRL", anchors: {balance: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 1}}});
    expect(() => buildDebtLedger(authorizedOnly)).toThrow();
    const lease = camil();
    lease.rows.push({id: "lease-1", instrument: "Arrendamentos", obligation: {kind: "lease", disbursed: true, views: ["contractual"]}, balance: "1", currency: "BRL", anchors: {balance: itr(12)}});
    expect(() => buildDebtLedger(lease)).toThrow(/without the anchor that includes it/);
    const otherOnly = camil();
    otherOnly.rows.push({id: "other-1", instrument: "Outra obrigação só contratual", obligation: {kind: "other", disbursed: true, views: ["contractual"]}, balance: "1", currency: "BRL", anchors: {balance: itr(12)}});
    expect(() => buildDebtLedger(otherOnly)).toThrow(/without the anchor that includes it/);
    const positiveContra = camil();
    (positiveContra.rows[4] as Row).balance = "9099";
    expect(() => buildDebtLedger(positiveContra)).toThrow(/must carry a negative balance/);
    const duplicate = camil();
    duplicate.rows.push({...(duplicate.rows[0] as Row)});
    expect(() => buildDebtLedger(duplicate)).toThrow(/duplicate row id/);
    expect(() => buildDebtLedger({...camil(), tolerance: {value: "-1"}})).toThrow();
    const positivePriorContra = camil();
    (positivePriorContra.rows[4] as Row).priorBalance = "1123";
    expect(() => buildDebtLedger(positivePriorContra)).toThrow(/cannot carry a positive prior balance/);
    const negativePriorLoan = camil();
    (negativePriorLoan.rows[0] as Row).priorBalance = "-951593";
    expect(() => buildDebtLedger(negativePriorLoan)).toThrow(/negative prior balance/);
    expect(() => buildDebtLedger({...camil(), unitAnchor: undefined as unknown as {document: string}})).toThrow();
    const relabeled = buildDebtLedger({...camil(), unit: "BRL million"});
    expect(relabeled.unit).toBe("BRL million");
    expect(relabeled.trace.outputFingerprint).not.toBe(buildDebtLedger(camil()).trace.outputFingerprint);
    expect(() => buildDebtLedger({...camil(), tolerance: {value: "1000000"}})).toThrow(/needs policyKey and policyVersion/);
  });

  it("blocks a definition that contradicts the formula, a scale mutation, silence, no-debt evidence next to rows, and keeps an empty ledger only on hypothetical evidence", () => {
    const contradicting = camil();
    contradicting.definitions = {...contradicting.definitions, contractual: {text: "empréstimos e debêntures menos caixa", anchor: itr(40, "15")}};
    const blocked = buildDebtLedger(contradicting);
    expect(blocked.state).toBe("blocked");
    expect(blocked.block_reasons[0]).toMatch(/does not deduct financial investments|does not add derivative liabilities|whole debt base/);
    expect(blocked.net_debt_views.contractual).toBeNull();
    const mutated = camil();
    (mutated.rows[0] as Row).balance = "1314412000";
    expect(buildDebtLedger(mutated).state).toBe("blocked");
    const silent = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows: []});
    expect(silent.state).toBe("blocked");
    expect(silent.block_reasons[0]).toMatch(/silence is not an empty ledger/);
    const rowsAndNoDebt = buildDebtLedger({...camil(), noDebtEvidence: {document: "hipotetico_sem_divida.pdf", note: "hipótese sintética, não Camil"}});
    expect(rowsAndNoDebt.block_reasons.some((reason) => /claims no onerous debt and the note carries rows/.test(reason))).toBe(true);
    const synthetic = {document: "hipotetico_sem_divida.pdf", page: 1, note: "hipótese sintética: companhia sem dívida onerosa, não Camil"};
    const contradictory = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows: [], noDebtEvidence: synthetic, balanceSheet: {current: "10", nonCurrent: "0", anchor: synthetic}});
    expect(contradictory.state).toBe("blocked");
    const proven = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows: [], noDebtEvidence: synthetic, balanceSheet: {current: "0", nonCurrent: "0", anchor: synthetic}});
    expect(proven.state).toBe("empty");
    const unproven = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows: [], noDebtEvidence: synthetic});
    expect(unproven.state).toBe("blocked");
    expect(unproven.block_reasons.some((reason) => /no balance sheet proves a zero balance/.test(reason))).toBe(true);
  });

  it("hypothetical: reconciles current and non-current apart when the rows carry the split, and catches a compensating swap", () => {
    const anchor = {document: "hipotetico_split.pdf", page: 1, note: "hipótese sintética, não Camil"};
    const rows: DebtLedgerInput["rows"] = [
      {id: "a", instrument: "A", obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance: "100", currency: "BRL", classification: {current: "40", nonCurrent: "60"}, anchors: {balance: anchor, classification: anchor}},
      {id: "b", instrument: "B", obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance: "50", currency: "BRL", classification: {current: "10", nonCurrent: "40"}, anchors: {balance: anchor, classification: anchor}},
    ];
    const inconsistentRows: DebtLedgerInput["rows"] = [{...rows[0]!, classification: {current: "50", nonCurrent: "100"}}, {...rows[1]!, classification: {current: "50", nonCurrent: "0"}}];
    expect(() => buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows: inconsistentRows, balanceSheet: {current: "100", nonCurrent: "100", anchor}})).toThrow(/does not add up to its balance/);
    // A contra line carries a signed split and reconciles with the rest.
    const withContra: DebtLedgerInput["rows"] = [...rows, {id: "costs", instrument: "Custos de transação", balance: "-10", currency: "BRL", contra: true, classification: {current: "-4", nonCurrent: "-6"}, anchors: {balance: anchor, classification: anchor}}];
    const contraSplit = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows: withContra, balanceSheet: {current: "46", nonCurrent: "94", anchor}});
    expect(contraSplit.reconciliation.split.state).toBe("reconciled");
    expect(() => buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows: [...rows, {id: "costs", instrument: "Custos", balance: "-10", currency: "BRL", contra: true, classification: {current: "4", nonCurrent: "-14"}, anchors: {balance: anchor, classification: anchor}}]})).toThrow(/positive part/);
    const good = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows, balanceSheet: {current: "50", nonCurrent: "100", anchor}});
    expect(good.reconciliation.split).toEqual({state: "reconciled", currentDifference: "0", nonCurrentDifference: "0", reason: null});
    const swapped = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows, balanceSheet: {current: "60", nonCurrent: "90", anchor}});
    expect(swapped.reconciliation.total.state).toBe("reconciled");
    expect(swapped.reconciliation.split.state).toBe("difference");
    expect(swapped.state).toBe("blocked");
    expect(swapped.block_reasons[0]).toMatch(/compensating error/);
  });

  it("catches a compensating error between the first period of the schedule and a later one, whatever the labels say", () => {
    const moved = camil();
    moved.schedule = {...moved.schedule!, periods: moved.schedule!.periods.map((period) => period.period === "2026/27" ? {...period, amount: "1129828"} : period.period === "2027/28" ? {...period, amount: "876868"} : period)};
    const result = buildDebtLedger(moved);
    expect(result.schedule?.matchesGross).toBe(true);
    expect(result.schedule?.currentPeriod?.matches).toBe(false);
    expect(result.state).toBe("blocked");
    // A label cannot elect the current period: the earliest end date within twelve months decides.
    const relabeled = camil();
    relabeled.schedule = {...relabeled.schedule!, periods: [{period: "zero", amount: "0", endsAt: "2026-06-30"}, ...relabeled.schedule!.periods.map((period) => period.period === "2026/27" ? {...period, period: "labelled current", amount: "1229828"} : period)]};
    const relabeledResult = buildDebtLedger(relabeled);
    expect(relabeledResult.schedule?.currentPeriod?.period).toBe("zero");
    expect(relabeledResult.state).toBe("blocked");
    const undated = camil();
    undated.schedule = {...undated.schedule!, periods: undated.schedule!.periods.map((period) => ({...period, endsAt: null}))};
    expect(buildDebtLedger(undated).state).toBe("incomplete");
  });

  it("parses a definition into what it adds and what it deducts, and refuses texts that contradict the formula", () => {
    expect(parseDefinition("dívida bruta menos caixa e aplicações financeiras")).toEqual({added: "divida bruta ", deducted: " caixa e aplicacoes financeiras"});
    expect(parseDefinition("empréstimos mais derivativos passivos, less cash").deducted).toBe(" cash");
    const mutations: Array<[string, RegExp]> = [
      ["dívida bruta mais caixa e aplicações financeiras", /never deducts anything/],
      ["caixa e aplicações menos dívida bruta", /adds no debt line|adds cash/],
      ["empréstimos e debêntures menos fornecedores", /does not deduct cash|not debt nor cash|whole debt base/],
      ["empréstimos, financiamentos e debêntures mais derivativos menos caixa e aplicações", /release definition mentions derivatives/],
      ["dívida bruta mais fornecedores menos caixa e aplicações", /not debt nor cash/],
      ["debêntures menos caixa e aplicações", /whole debt base/],
      ["empréstimos, financiamentos e debêntures menos fornecedores", /does not deduct cash|not debt nor cash/],
      ["dívida bruta menos caixa, aplicações e dívida subordinada", /deducts a debt operand/],
      ["empréstimos e financiamentos menos caixa e aplicações", /whole debt base/],
    ];
    for (const [text, expected] of mutations) {
      const mutated = camil();
      mutated.definitions = {...mutated.definitions, release: {text, anchor: {document: "ri_release_1t26.pdf", page: 12}}};
      const result = buildDebtLedger(mutated);
      expect(result.state, text).toBe("blocked");
      expect(result.block_reasons.join(" | "), text).toMatch(expected);
    }
    const contractual = camil();
    contractual.definitions = {...contractual.definitions, contractual: {text: "empréstimos, financiamentos e debêntures mais derivativos passivos menos caixa e aplicações", anchor: itr(40)}};
    expect(buildDebtLedger(contractual).block_reasons[0]).toMatch(/does not deduct derivative assets/);
    const swappedPolarity = camil();
    swappedPolarity.definitions = {...swappedPolarity.definitions, contractual: {text: "empréstimos, financiamentos e debêntures mais operações com derivativos do ativo menos caixa, aplicações financeiras e operações com derivativos do passivo", anchor: itr(40)}};
    expect(buildDebtLedger(swappedPolarity).block_reasons[0]).toMatch(/adds derivative assets|deducts derivative liabilities|does not add derivative liabilities/);
    const noDebtBase = camil();
    noDebtBase.definitions = {...noDebtBase.definitions, contractual: {text: "qualquer outra dívida onerosa mais operações com derivativos do passivo menos caixa, aplicações financeiras e operações com derivativos do ativo", anchor: itr(40)}};
    expect(buildDebtLedger(noDebtBase).block_reasons[0]).toMatch(/adds no debt line|whole debt base/);
    const noInvestments = camil();
    noInvestments.definitions = {...noInvestments.definitions, release: {text: "dívida bruta menos caixa", anchor: {document: "ri_release_1t26.pdf", page: 12}}};
    expect(buildDebtLedger(noInvestments).block_reasons[0]).toMatch(/does not deduct financial investments/);
  });

  it("blocks a row kept out of a view whose definition counts its kind, and refuses impossible dates and negative splits", () => {
    const tampered = camil();
    (tampered.rows[0] as Row).obligation = {kind: "loan", disbursed: true, views: ["release"]};
    const result = buildDebtLedger(tampered);
    expect(result.state).toBe("blocked");
    expect(result.block_reasons.some((reason) => /counts loan rows, yet loan-brl is kept out of that view/.test(reason))).toBe(true);
    const badDate = camil();
    (badDate.rows[5] as Row).maturity = "2028-02-30";
    expect(() => buildDebtLedger(badDate)).toThrow(/not a calendar date/);
    const negativeSplit = camil();
    (negativeSplit.rows[0] as Row).classification = {current: "-1", nonCurrent: "1314413"};
    (negativeSplit.rows[0] as Row).anchors = {balance: itr(39, "15"), classification: itr(39, "15")};
    expect(() => buildDebtLedger(negativeSplit)).toThrow(/negative part on an obligation/);
    const contradictoryWithoutCash = camil();
    delete contradictoryWithoutCash.cash;
    contradictoryWithoutCash.definitions = {...contradictoryWithoutCash.definitions, release: {text: "dívida bruta mais caixa e aplicações financeiras", anchor: {document: "ri_release_1t26.pdf", page: 12}}};
    const blockedAnyway = buildDebtLedger(contradictoryWithoutCash);
    expect(blockedAnyway.state).toBe("blocked");
    expect(blockedAnyway.block_reasons[0]).toMatch(/never deducts anything/);
  });

  it("keeps a contractual-only inclusion out of the identity with the balance sheet, and names an absent cash component instead of failing", () => {
    const anchor = {document: "hipotetico_lease.pdf", page: 1, note: "hipótese sintética, não Camil"};
    const rows: DebtLedgerInput["rows"] = [
      {id: "loan", instrument: "Empréstimo", obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance: "100", currency: "BRL", anchors: {balance: anchor}},
      {id: "lease", instrument: "Arrendamento incluído pela escritura", obligation: {kind: "lease", disbursed: true, views: ["contractual"]}, balance: "10", currency: "BRL", anchors: {balance: anchor, viewInclusion: {document: "escritura_hipotetica.pdf", clause: "1.1", page: 7}}},
    ];
    const cash = {cashAndEquivalents: {value: "20", anchor}, financialInvestments: {value: "5", anchor}, derivativeAssets: {value: "0", anchor}, derivativeLiabilities: {value: "0", anchor}};
    const definitions = {release: {text: "dívida bruta menos caixa e aplicações financeiras", anchor}, contractual: {text: "empréstimos, financiamentos e debêntures mais arrendamentos, mais operações com derivativos do passivo, menos caixa, aplicações financeiras e operações com derivativos do ativo", anchor}};
    const result = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows, balanceSheet: {current: "40", nonCurrent: "60", anchor}, schedule: {periods: [{period: "y1", amount: "40", endsAt: "2027-05-31"}, {period: "y2", amount: "60", endsAt: "2028-05-31"}], anchor}, cash, definitions});
    expect(result.gross_debt).toBe("110");
    expect(result.gross_debt_reported).toBe("100");
    expect(result.by_indexer[0]?.shareOfReportedGrossDebt).toBe("1.1");
    expect(result.reconciliation.total.state).toBe("reconciled");
    expect(result.contractual_only_inclusions).toEqual([{rowId: "lease", balance: "10", anchor: {document: "escritura_hipotetica.pdf", clause: "1.1", page: 7}}]);
    expect(result.net_debt_views.release?.value).toBe("75");
    expect(result.net_debt_views.contractual?.value).toBe("85");
    expect(result.state).toBe("complete");
    const partial = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows, balanceSheet: {current: "40", nonCurrent: "60", anchor}, schedule: {periods: [{period: "y1", amount: "40", endsAt: "2027-05-31"}, {period: "y2", amount: "60", endsAt: "2028-05-31"}], anchor}, cash: {...cash, derivativeAssets: null}, definitions});
    expect(partial.state).toBe("incomplete");
    expect(partial.net_debt_views.release?.value).toBe("75");
    expect(partial.net_debt_views.contractual).toBeNull();
    expect(partial.incomplete_reasons.some((reason) => reason.includes("derivativeAssets absent"))).toBe(true);
    const past = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", unitAnchor: itr(11, "em milhares de reais"), source: "note", rows, balanceSheet: {current: "40", nonCurrent: "60", anchor}, schedule: {periods: [{period: "y0", amount: "0", endsAt: "2025-05-31"}, {period: "y1", amount: "40", endsAt: "2027-05-31"}, {period: "y2", amount: "60", endsAt: "2028-05-31"}], anchor}, cash, definitions});
    expect(past.state).toBe("blocked");
    expect(past.block_reasons[0]).toMatch(/ended on or before the reference date/);
  });

  it("is incomplete, never complete, when a required output cannot be produced from the base; release only blocks", () => {
    const noSchedule = camil();
    delete noSchedule.schedule;
    expect(buildDebtLedger(noSchedule).state).toBe("incomplete");
    const noDefinition = camil();
    noDefinition.definitions = {release: noDefinition.definitions!.release};
    const result = buildDebtLedger(noDefinition);
    expect(result.state).toBe("incomplete");
    expect(result.net_debt_views.contractual).toBeNull();
    expect(result.incomplete_reasons.some((reason) => /contractual definition/.test(reason))).toBe(true);
    const releaseOnly = buildDebtLedger({...camil(), source: "release_only"});
    expect(releaseOnly.ledger_rows).toHaveLength(0);
    expect(releaseOnly.state).toBe("blocked");
  });

  it("is consistent: twenty deterministic permutations of rows, periods, nested views and object keys keep both fingerprints", () => {
    const first = buildDebtLedger(camil());
    const reorderKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.rows = permute(shuffled.rows, seed).map((row) => reorderKeys(row.obligation ? {...row, obligation: {...row.obligation, views: [...row.obligation.views].reverse()}, anchors: reorderKeys(row.anchors)} : row));
      shuffled.schedule = {...shuffled.schedule!, periods: permute(shuffled.schedule!.periods, seed * 7)};
      const again = buildDebtLedger(seed % 2 ? reorderKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
      expect(again).toEqual(first);
    }
    expect(stableStringify({b: 1, a: {d: [2, {z: 1, y: 2}], c: 3}})).toBe(stableStringify({a: {c: 3, d: [2, {y: 2, z: 1}]}, b: 1}));
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(buildDebtLedger(camil()) as unknown as Record<string, unknown>, "financial/build-debt-ledger.md")).toEqual([]);
  });

  it("mutation: a 29 February reference date ends its twelve-month horizon on 28 February, so a period ending 1 March is not the current one", () => {
    const base = camil();
    const leap: DebtLedgerInput = {...base, referenceDate: "2024-02-29", priorDate: "2023-11-30", rows: base.rows.map((row) => ({...row, priorBalance: null})), schedule: {...base.schedule!, periods: base.schedule!.periods.map((period) => (period.endsAt === null ? period : {...period, endsAt: period.endsAt.replace(/^2027-05-31$/, "2025-03-01").replace(/^20(28|29|30|31)-05-31$/, "20$1-03-01")}))}};
    const result = buildDebtLedger(leap);
    expect(result.schedule?.currentPeriod).toBeNull();
    expect(result.incomplete_reasons.some((reason) => /no period ends within twelve months/.test(reason))).toBe(true);
    const within: DebtLedgerInput = {...leap, schedule: {...leap.schedule!, periods: leap.schedule!.periods.map((period) => (period.endsAt === "2025-03-01" ? {...period, endsAt: "2025-02-28"} : period))}};
    expect(buildDebtLedger(within).schedule?.currentPeriod?.period).toBe("2026/27");
  });

  it("refuses empty strings, duplicate periods and reports every gap of a row at once", () => {
    const base = camil();
    expect(() => buildDebtLedger({...base, unit: "" as unknown as "BRL"})).toThrow();
    expect(() => buildDebtLedger({...base, rows: base.rows.map((row, index) => (index === 0 ? {...row, instrument: ""} : row))})).toThrow();
    expect(() => buildDebtLedger({...base, schedule: {...base.schedule!, periods: [...base.schedule!.periods, {...base.schedule!.periods[0]!}]}})).toThrow(/duplicate period/);
    const bare = buildDebtLedger({...base, rows: base.rows.map((row) => (row.contra ? row : {...row, remuneration: null, maturity: null, guarantee: null, classification: null}))});
    const first = bare.ledger_rows.find((row) => !row.contra)!;
    expect(bare.uncovered_terms.filter((term) => term.rowId === first.id).map((term) => term.field)).toEqual(expect.arrayContaining(["remuneration", "maturity", "guarantee", "classification"]));
  });
});
