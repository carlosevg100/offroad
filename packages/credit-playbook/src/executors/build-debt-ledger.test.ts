import {describe, expect, it} from "vitest";

import {buildDebtLedger, type DebtLedgerInput} from "./build-debt-ledger";

/** Camil, ITR 31/05/2026 and 28/02/2026, consolidated, R$ thousand (answer key sections 1, 3, 5 and 11.1). */
const itr = (page: number, note?: string, table?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {}), ...(table ? {table} : {})});
const trustee = (document: string, page: number) => ({document, page, table: "características das séries"});
const indenture = (document: string, clause: string, page: number) => ({document, clause, page});
const eco = {formalHolder: "Eco Securitizadora de Direitos Creditórios do Agronegócio S.A. (debenturista)", economicCreditors: "titulares dos CRA, que orientam a securitizadora em assembleia"};
type Row = DebtLedgerInput["rows"][number];
const loan = (id: string, instrument: string, balance: string, prior: string, currency: string): Row =>
  ({id, instrument, obligation: {kind: "loan", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency, anchors: {balance: itr(39, "15")}});
const deb = (id: string, issue: string, series: string, balance: string, prior: string, remuneration: Row["remuneration"], maturity: string, report: string, page: number, escritura: string, holderClause: string, holderPage: number): Row => ({
  id, instrument: `Debêntures ${issue}`, series, obligation: {kind: "debenture", disbursed: true, views: ["release", "contractual"]}, balance, priorBalance: prior, currency: "BRL",
  remuneration, maturity, guarantee: "quirografária", lender: issue === "11ª emissão" ? {formalHolder: "debenturistas (oferta pública)", economicCreditors: "debenturistas"} : eco,
  anchors: {balance: itr(39, "15"), remuneration: trustee(report, page), maturity: trustee(report, page), guarantee: itr(39, "15"), lender: indenture(escritura, holderClause, holderPage)},
});
const cdi = (spread: string): Row["remuneration"] => ({type: "spread_over_index", index: "CDI", spreadPercentPerYear: spread});
const pct = (percent: string): Row["remuneration"] => ({type: "percent_of_index", index: "CDI", percentOfIndex: percent});
const ipca = (spread: string): Row["remuneration"] => ({type: "spread_over_index", index: "IPCA", spreadPercentPerYear: spread});
const camil = (): DebtLedgerInput => ({
  referenceDate: "2026-05-31",
  priorDate: "2026-02-28",
  unit: "BRL thousand",
  source: "note",
  rows: [
    loan("loan-brl", "Capital de giro, moeda nacional", "1314412", "951593", "BRL"),
    loan("loan-usd", "Capital de giro, USD", "867244", "492857", "USD"),
    loan("loan-clp", "Capital de giro, CLP", "54180", "43397", "CLP"),
    loan("loan-pen", "Capital de giro, PEN", "181158", "199398", "PEN"),
    {id: "loan-costs", instrument: "Custo de transação (empréstimos)", obligation: {kind: "other", disbursed: true, views: ["release", "contractual"]}, balance: "-9099", priorBalance: "-1123", currency: "BRL", contra: true, anchors: {balance: itr(39, "15")}},
    deb("deb-11-1", "11ª emissão", "1ª", "151795", "157626", cdi("1.55"), "2028-10-30", "af_11a_emissao.pdf", 2, "escritura_11a_emissao.pdf", "4.1", 12),
    deb("deb-11-2", "11ª emissão", "2ª", "505984", "525419", cdi("1.55"), "2028-10-30", "af_11a_emissao.pdf", 2, "escritura_11a_emissao.pdf", "4.1", 12),
    deb("deb-13-1", "13ª emissão", "1ª", "306038", "316694", cdi("0.65"), "2028-11-16", "af_13a_emissao.pdf", 3, "escritura_13a_emissao.pdf", "1.1", 6),
    deb("deb-13-2", "13ª emissão", "2ª", "282357", "279335", ipca("6.3416"), "2030-11-18", "af_13a_emissao.pdf", 3, "escritura_13a_emissao.pdf", "1.1", 6),
    deb("deb-13-3", "13ª emissão", "3ª", "110321", "109185", ipca("6.5264"), "2033-11-16", "af_13a_emissao.pdf", 3, "escritura_13a_emissao.pdf", "1.1", 6),
    deb("deb-14-1", "14ª emissão", "1ª", "438918", "423854", pct("104"), "2029-06-15", "af_14a_emissao.pdf", 3, "escritura_14a_emissao.pdf", "1.1", 6),
    deb("deb-14-2", "14ª emissão", "2ª", "204059", "195876", ipca("6.8286"), "2031-06-16", "af_14a_emissao.pdf", 3, "escritura_14a_emissao.pdf", "1.1", 6),
    deb("deb-14-3", "14ª emissão", "3ª", "66024", "63457", ipca("6.9982"), "2034-06-15", "af_14a_emissao.pdf", 3, "escritura_14a_emissao.pdf", "1.1", 6),
    deb("deb-15-1", "15ª emissão", "1ª", "770123", "795649", pct("105"), "2030-11-18", "af_15a_emissao.pdf", 3, "escritura_15a_emissao.pdf", "1.1", 6),
    deb("deb-15-2", "15ª emissão", "2ª", "408703", "420902", {type: "fixed", ratePercentPerYear: "14.15"}, "2032-11-16", "af_15a_emissao.pdf", 3, "escritura_15a_emissao.pdf", "1.1", 6),
    deb("deb-15-3", "15ª emissão", "3ª", "50401", "50020", ipca("8.20"), "2032-11-16", "af_15a_emissao.pdf", 3, "escritura_15a_emissao.pdf", "1.1", 6),
    deb("deb-15-4", "15ª emissão", "4ª", "30793", "30591", ipca("8.70"), "2035-11-16", "af_15a_emissao.pdf", 3, "escritura_15a_emissao.pdf", "1.1", 6),
    {id: "deb-costs", instrument: "Custo de transação (debêntures)", obligation: {kind: "other", disbursed: true, views: ["release", "contractual"]}, balance: "-63225", priorBalance: "-66347", currency: "BRL", contra: true, anchors: {balance: itr(39, "15")}},
  ],
  balanceSheet: {current: "1229828", nonCurrent: "4440358", anchor: itr(12, undefined, "Balanço patrimonial consolidado, empréstimos, financiamentos e debêntures")},
  schedule: {periods: [
    {period: "2026/27", amount: "1229828"}, {period: "2027/28", amount: "776868"}, {period: "2028/29", amount: "1228475"},
    {period: "2029/30", amount: "694497"}, {period: "2030/31", amount: "994544"}, {period: "after 2031", amount: "809198"}, {period: "debenture costs", amount: "-63224"},
  ], anchor: itr(40, "15")},
  cash: {
    cashAndEquivalents: {value: "1430714", anchor: itr(20, "3")},
    financialInvestments: {value: "25095", anchor: itr(51, "25")},
    derivativeAssets: {value: "235", anchor: itr(51, "25")},
    derivativeLiabilities: {value: "14335", anchor: itr(51, "25")},
  },
  definitions: {
    release: {text: "dívida bruta menos caixa e aplicações financeiras", anchor: {document: "ri_release_1t26.pdf", page: 12, table: "Endividamento e Caixa"}},
    contractual: {text: "empréstimos, financiamentos e debêntures mais derivativos passivos, menos caixa e equivalentes, aplicações financeiras e derivativos ativos", anchor: itr(40, "15")},
  },
  releaseReportedNetDebt: {value: "4214400", anchor: {document: "ri_release_1t26.pdf", page: 12, table: "Endividamento e Caixa"}},
  tolerance: "0",
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

describe("build-debt-ledger executor", () => {
  it("gold: gross debt of both dates, reconciliation with the balance sheet page, both views with their definitions and sources", () => {
    const ledger = buildDebtLedger(camil());
    expect(ledger.state).toBe("complete");
    expect(ledger.grossDebt).toBe("5670186");
    expect(ledger.grossDebtPrior).toBe("4988383");
    expect(ledger.grossDebtBeforeContra).toBe("5742510");
    expect(ledger.reconciliation.state).toBe("reconciled");
    expect(ledger.reconciliation.anchor?.page).toBe(12);
    expect(ledger.schedule?.matchesGross).toBe(true);
    expect(ledger.netDebtViews.contractual?.value).toBe("4228477");
    expect(ledger.netDebtViews.contractual?.definitionSource).toEqual(itr(40, "15"));
    expect(ledger.netDebtViews.contractual?.componentAnchors.financialInvestments).toEqual(itr(51, "25"));
    expect(ledger.netDebtViews.release?.value).toBe("4214377");
    expect(ledger.netDebtViews.releaseReported?.differenceToRelease).toBe("23");
    expect(ledger.netDebtViews.releaseReported?.anchor.page).toBe(12);
    expect(ledger.byIndexer.find((entry) => entry.indexer === "IPCA")?.balance).toBe("743955");
    expect(ledger.byIndexer.find((entry) => entry.indexer === "unknown")?.balance).toBe("2416994");
    expect(ledger.byIndexer.find((entry) => entry.indexer === "fixed")?.balance).toBe("408703");
    const foreign = ledger.byCurrency.filter((entry) => entry.currency !== "BRL").reduce((sum, entry) => sum + Number(entry.balance), 0);
    expect(foreign).toBe(1102582);
    const sumShares = (entries: Array<{shareOfGrossBeforeContra: string}>) => entries.reduce((sum, entry) => sum + Number(entry.shareOfGrossBeforeContra), 0);
    expect(Math.abs(sumShares(ledger.byIndexer) - 1)).toBeLessThan(1e-6);
  });

  it("gold: remuneration is typed, the formal holder and the economic creditors are distinct, and every term carries its own anchor", () => {
    const ledger = buildDebtLedger(camil());
    const row = ledger.ledgerRows.find((entry) => entry.id === "deb-14-1")!;
    expect(row.remuneration).toEqual({type: "percent_of_index", index: "CDI", percentOfIndex: "104"});
    expect(row.lender?.formalHolder).toMatch(/Eco Securitizadora/);
    expect(row.lender?.economicCreditors).toMatch(/titulares dos CRA/);
    expect(row.anchors.remuneration?.document).toBe("af_14a_emissao.pdf");
    expect(row.anchors.lender?.document).toBe("escritura_14a_emissao.pdf");
    expect(row.anchors.guarantee).toEqual(itr(39, "15"));
  });

  it("names what the base does not support, field by field; loans lack remuneration, maturity, guarantee and holder; every row lacks the split", () => {
    const ledger = buildDebtLedger(camil());
    const loanFields = ledger.uncoveredTerms.filter((entry) => entry.rowId === "loan-usd").map((entry) => entry.field);
    expect(loanFields).toEqual(["remuneration", "maturity", "guarantee", "lender", "classification"]);
    expect(ledger.uncoveredTerms.find((entry) => entry.rowId === "loan-usd" && entry.field === "remuneration")?.reason).toMatch(/currency is not an indexer/);
    const debentureFields = new Set(ledger.uncoveredTerms.filter((entry) => entry.rowId.startsWith("deb-1")).map((entry) => entry.field));
    expect([...debentureFields]).toEqual(["classification"]);
  });

  it("refuses a term without an anchor, an empty string, a positive contra line, a duplicate id and a negative tolerance", () => {
    const unanchored = camil();
    (unanchored.rows[5] as Row).anchors = {balance: itr(39, "15")};
    expect(() => buildDebtLedger(unanchored)).toThrow(/without an anchor/);
    const empty = camil();
    (empty.rows[5] as Row).guarantee = " ";
    expect(() => buildDebtLedger(empty)).toThrow();
    const positiveContra = camil();
    (positiveContra.rows[4] as Row).balance = "9099";
    expect(() => buildDebtLedger(positiveContra)).toThrow(/must carry a negative balance/);
    const duplicate = camil();
    duplicate.rows.push({...(duplicate.rows[0] as Row)});
    expect(() => buildDebtLedger(duplicate)).toThrow(/duplicate row id/);
    const negative = camil();
    negative.tolerance = "-1";
    expect(() => buildDebtLedger(negative)).toThrow();
  });

  it("blocks a scale mutation, blocks silence, blocks contradictory no-debt evidence, and keeps an empty ledger only on evidence", () => {
    const mutated = camil();
    (mutated.rows[0] as Row).balance = "1314412000";
    expect(buildDebtLedger(mutated).state).toBe("blocked");
    const silent = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", source: "note", rows: []});
    expect(silent.state).toBe("blocked");
    expect(silent.blockReasons[0]).toMatch(/silence is not an empty ledger/);
    const contradictory = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", source: "note", rows: [], noDebtEvidence: itr(39, "15"), balanceSheet: {current: "10", nonCurrent: "0", anchor: itr(12)}});
    expect(contradictory.state).toBe("blocked");
    const proven = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", source: "note", rows: [], noDebtEvidence: itr(39, "15"), balanceSheet: {current: "0", nonCurrent: "0", anchor: itr(12)}});
    expect(proven.state).toBe("empty");
  });

  it("is incomplete, never complete, when a required output cannot be produced from the base", () => {
    const noSchedule = camil();
    delete noSchedule.schedule;
    expect(buildDebtLedger(noSchedule).state).toBe("incomplete");
    const noDefinition = camil();
    noDefinition.definitions = {release: noDefinition.definitions!.release};
    const result = buildDebtLedger(noDefinition);
    expect(result.state).toBe("incomplete");
    expect(result.netDebtViews.contractual).toBeNull();
    expect(result.incompleteReasons.some((reason) => /contractual definition/.test(reason))).toBe(true);
    expect(buildDebtLedger({...camil(), source: "release_only"}).ledgerRows).toHaveLength(0);
  });

  it("is consistent: twenty deterministic permutations of rows and periods keep both fingerprints", () => {
    const first = buildDebtLedger(camil());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.rows = permute(shuffled.rows, seed);
      shuffled.schedule = {...shuffled.schedule!, periods: permute(shuffled.schedule!.periods, seed * 7)};
      const again = buildDebtLedger(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
