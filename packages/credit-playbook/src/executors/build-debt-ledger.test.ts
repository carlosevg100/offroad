import {describe, expect, it} from "vitest";

import {buildDebtLedger, type DebtLedgerInput} from "./build-debt-ledger";

/** Camil, ITR 31/05/2026, consolidated, R$ thousand (answer key sections 1, 3, 5 and 11.1). */
const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const af = (document: string) => ({document, note: "características das séries"});
const loan = (id: string, instrument: string, balance: string, currency: string): DebtLedgerInput["rows"][number] =>
  ({id, instrument, balance, currency, indexer: "unknown", spread: null, maturity: null, guarantee: null, lender: null, anchors: {balance: itr(39, "15")}});
const deb = (id: string, instrument: string, series: string, balance: string, indexer: "CDI" | "IPCA" | "fixed", spread: string, maturity: string, report: string): DebtLedgerInput["rows"][number] =>
  ({id, instrument, series, balance, currency: "BRL", indexer, spread, maturity, guarantee: "quirografária", lender: null, anchors: {balance: itr(39, "15"), terms: af(report)}});
const camil = (): DebtLedgerInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  source: "note",
  rows: [
    loan("loan-brl", "Capital de giro, moeda nacional", "1314412", "BRL"),
    loan("loan-usd", "Capital de giro, USD", "867244", "USD"),
    loan("loan-clp", "Capital de giro, CLP", "54180", "CLP"),
    loan("loan-pen", "Capital de giro, PEN", "181158", "PEN"),
    {id: "loan-costs", instrument: "Custo de transação (empréstimos)", balance: "-9099", currency: "BRL", indexer: "other", contra: true, anchors: {balance: itr(39, "15")}},
    deb("deb-11-1", "Debêntures 11ª emissão", "1ª", "151795", "CDI", "1.55", "2028-10-30", "af_11a_emissao.pdf"),
    deb("deb-11-2", "Debêntures 11ª emissão", "2ª", "505984", "CDI", "1.55", "2028-10-30", "af_11a_emissao.pdf"),
    deb("deb-13-1", "Debêntures 13ª emissão", "1ª", "306038", "CDI", "0.65", "2028-11-16", "af_13a_emissao.pdf"),
    deb("deb-13-2", "Debêntures 13ª emissão", "2ª", "282357", "IPCA", "6.3416", "2030-11-18", "af_13a_emissao.pdf"),
    deb("deb-13-3", "Debêntures 13ª emissão", "3ª", "110321", "IPCA", "6.5264", "2033-11-16", "af_13a_emissao.pdf"),
    deb("deb-14-1", "Debêntures 14ª emissão", "1ª", "438918", "CDI", "104% DI", "2029-06-15", "af_14a_emissao.pdf"),
    deb("deb-14-2", "Debêntures 14ª emissão", "2ª", "204059", "IPCA", "6.8286", "2031-06-16", "af_14a_emissao.pdf"),
    deb("deb-14-3", "Debêntures 14ª emissão", "3ª", "66024", "IPCA", "6.9982", "2034-06-15", "af_14a_emissao.pdf"),
    deb("deb-15-1", "Debêntures 15ª emissão", "1ª", "770123", "CDI", "105% DI", "2030-11-18", "af_15a_emissao.pdf"),
    deb("deb-15-2", "Debêntures 15ª emissão", "2ª", "408703", "fixed", "14.15", "2032-11-16", "af_15a_emissao.pdf"),
    deb("deb-15-3", "Debêntures 15ª emissão", "3ª", "50401", "IPCA", "8.20", "2032-11-16", "af_15a_emissao.pdf"),
    deb("deb-15-4", "Debêntures 15ª emissão", "4ª", "30793", "IPCA", "8.70", "2035-11-16", "af_15a_emissao.pdf"),
    {id: "deb-costs", instrument: "Custo de transação (debêntures)", balance: "-63225", currency: "BRL", indexer: "other", contra: true, anchors: {balance: itr(39, "15")}},
  ],
  balanceSheet: {current: "1229828", nonCurrent: "4440358", anchor: itr(39, "15")},
  schedule: [
    {period: "2026/27", amount: "1229828"}, {period: "2027/28", amount: "776868"}, {period: "2028/29", amount: "1228475"},
    {period: "2029/30", amount: "694497"}, {period: "2030/31", amount: "994544"}, {period: "after 2031", amount: "809198"}, {period: "debenture costs", amount: "-63224"},
  ],
  scheduleAnchor: itr(40, "15"),
  cash: {cashAndEquivalents: "1430714", financialInvestments: "25095", derivativeAssets: "235", derivativeLiabilities: "14335", anchors: {cash: itr(20, "3"), derivatives: itr(51, "25")}},
  releaseNetDebt: {value: "4214400", anchor: {document: "ri_release_1t26.pdf", page: 11, note: "tabela Endividamento e Caixa"}},
  contractualDefinitionAnchor: itr(40, "15"),
  tolerance: "0",
});

/** Deterministic permutation, different at every step, so consistency is proven beyond one reversal. */
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
  it("reproduces the case 01 answer key: gross debt, reconciliation, contractual and release views", () => {
    const ledger = buildDebtLedger(camil());
    expect(ledger.state).toBe("complete");
    expect(ledger.grossDebt).toBe("5670186");
    expect(ledger.grossDebtBeforeContra).toBe("5742510");
    expect(ledger.reconciliation.state).toBe("reconciled");
    expect(ledger.schedule?.matchesGross).toBe(true);
    expect(ledger.netDebtViews.contractual?.value).toBe("4228477");
    expect(ledger.netDebtViews.contractual?.definitionSource).toEqual(itr(40, "15"));
    expect(ledger.netDebtViews.contractual?.componentAnchors.derivativeLiabilities).toEqual(itr(51, "25"));
    expect(ledger.netDebtViews.releaseDefinitionRecalculated?.value).toBe("4214377");
    expect(ledger.netDebtViews.releaseReported?.value).toBe("4214400");
    expect(ledger.netDebtViews.releaseReported?.differenceToRecalculated).toBe("23");
    expect(ledger.byIndexer.find((entry) => entry.indexer === "IPCA")?.balance).toBe("743955");
    expect(ledger.byIndexer.find((entry) => entry.indexer === "unknown")?.balance).toBe("2416994");
    const foreign = ledger.byCurrency.filter((entry) => entry.currency !== "BRL").reduce((sum, entry) => sum + Number(entry.balance), 0);
    expect(foreign).toBe(1102582);
    expect(ledger.schedule?.periods[0]?.shareOfGross.startsWith("0.2168")).toBe(true);
  });

  it("keeps concentration shares internally consistent: they sum to one over gross debt before contra lines", () => {
    const ledger = buildDebtLedger(camil());
    const sumShares = (entries: Array<{shareOfGrossBeforeContra: string}>) => entries.reduce((sum, entry) => sum + Number(entry.shareOfGrossBeforeContra), 0);
    expect(Math.abs(sumShares(ledger.byIndexer) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(sumShares(ledger.byCurrency) - 1)).toBeLessThan(1e-6);
  });

  it("names what the base does not support, field by field, with the reason", () => {
    const ledger = buildDebtLedger(camil());
    const loanTerms = ledger.uncoveredTerms.filter((entry) => entry.rowId === "loan-usd").map((entry) => entry.field);
    expect(loanTerms).toEqual(["indexer", "spread", "maturity", "guarantee", "lender"]);
    expect(ledger.uncoveredTerms.find((entry) => entry.rowId === "loan-usd" && entry.field === "indexer")?.reason).toMatch(/no source in the base states the indexer/);
    const debentureFields = new Set(ledger.uncoveredTerms.filter((entry) => entry.rowId.startsWith("deb-")).map((entry) => entry.field));
    expect([...debentureFields]).toEqual(["lender"]);
    expect(ledger.uncoveredTerms.every((entry) => entry.state === "insufficient_evidence")).toBe(true);
  });

  it("blocks the ledger when a scale mutation breaks the reconciliation, and says so", () => {
    const mutated = camil();
    mutated.rows[0]!.balance = "1314412000";
    const ledger = buildDebtLedger(mutated);
    expect(ledger.state).toBe("blocked");
    expect(ledger.blockReasons[0]).toMatch(/differs from the balance sheet/);
    expect(ledger.schedule?.matchesGross).toBe(false);
  });

  it("refuses a negative tolerance and a row without a balance anchor", () => {
    const negative = camil();
    negative.tolerance = "-1";
    expect(() => buildDebtLedger(negative)).toThrow();
    const unanchored = camil();
    (unanchored.rows[0] as {anchors: unknown}).anchors = {};
    expect(() => buildDebtLedger(unanchored)).toThrow();
  });

  it("produces no rows from a release alone, and an empty ledger only on evidence", () => {
    const releaseOnly = buildDebtLedger({...camil(), source: "release_only"});
    expect(releaseOnly.state).toBe("incomplete");
    expect(releaseOnly.ledgerRows).toHaveLength(0);
    expect(releaseOnly.blockReasons[0]).toMatch(/only a release/);
    const silent = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", source: "note", rows: []});
    expect(silent.state).toBe("empty");
    expect(silent.blockReasons[0]).toMatch(/no evidence that the company has no onerous debt/);
    const proven = buildDebtLedger({referenceDate: "2026-05-31", unit: "BRL thousand", source: "note", rows: [], noDebtEvidence: itr(39, "15")});
    expect(proven.state).toBe("empty");
    expect(proven.blockReasons).toHaveLength(0);
  });

  it("is consistent: twenty deterministic permutations of rows and schedule keep both fingerprints", () => {
    const first = buildDebtLedger(camil());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.rows = permute(shuffled.rows, seed);
      shuffled.schedule = permute(shuffled.schedule!, seed * 7);
      const again = buildDebtLedger(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
