import {describe, expect, it} from "vitest";

import {reconcileReceivablesPoolLedgers, type ReceivablesPoolCashReceipt} from "./pool-reconciliation";

const titles = [{id: "REC-1", debtorId: "D-1"}, {id: "REC-2", debtorId: "D-2"}, {id: "REC-3", debtorId: "D-3"}];
const receipt = (id: string, amount: string, overrides: Partial<ReceivablesPoolCashReceipt> = {}): ReceivablesPoolCashReceipt => ({
  id, amount, receivableId: `REC-${id.slice(-1)}`, debtorId: `D-${id.slice(-1)}`, linkedAccount: true, duplicateOf: null, anchorVerified: true, ...overrides,
});
const tied = {
  tapeOutstanding: "6000000", accountingGrossBalance: "6000000.00", tapeCollections: "600000", reportedCollections: "600000.00",
  receipts: [receipt("CASH-1", "200000"), receipt("CASH-2", "200000"), receipt("CASH-3", "200000")], titles,
  maximumAccountingMismatchShare: "0.01", maximumCashMismatchShare: "0.01",
};

describe("receivables pool reconciliation kernel", () => {
  it("ties the tape, the collections and the cash when every ledger agrees", () => {
    const result = reconcileReceivablesPoolLedgers(tied);
    expect(result.tapeToAccounting).toEqual({left: "6000000", right: "6000000", difference: "0", differenceShare: "0", tolerance: "0.01", status: "tied"});
    expect(result.tapeCollectionsToAccounting).toMatchObject({difference: "0", status: "tied"});
    expect(result.collectionsToCash).toMatchObject({left: "600000", right: "600000", status: "tied"});
    expect(result.cashControls).toEqual({
      grossCashReceipts: "600000", validCashReceipts: "600000", mappedCash: "600000", linkedAccountCash: "600000",
      mappedShare: "1", linkedAccountShare: "1", duplicateReceiptIds: [], unanchoredReceiptIds: [], unknownMappingReceiptIds: [], excludedDuplicateCash: "0",
    });
    expect(result.trace).toMatchObject({id: "receivables.pool_reconciliation", result: "tied,tied,tied"});
  });

  it("keeps an accounting difference above tolerance visible with its relative share", () => {
    const result = reconcileReceivablesPoolLedgers({...tied, accountingGrossBalance: "5000000"});
    expect(result.tapeToAccounting).toMatchObject({difference: "1000000", differenceShare: "0.2", status: "outside_tolerance"});
    expect(reconcileReceivablesPoolLedgers({...tied, accountingGrossBalance: "5930000"}).tapeToAccounting.status).toBe("outside_tolerance");
    const withinTolerance = reconcileReceivablesPoolLedgers({...tied, accountingGrossBalance: "5960000"}).tapeToAccounting;
    expect(withinTolerance.differenceShare.startsWith("0.006711409395973154362416107382550335570")).toBe(true);
    expect(withinTolerance.status).toBe("tied");
  });

  it("excludes receipts named as duplicates from cash before comparing and reports the excluded amount", () => {
    const result = reconcileReceivablesPoolLedgers({...tied, receipts: [...tied.receipts, receipt("CASH-9", "200000", {receivableId: "REC-1", debtorId: "D-1", duplicateOf: "CASH-1"})]});
    expect(result.cashControls).toMatchObject({grossCashReceipts: "800000", validCashReceipts: "600000", excludedDuplicateCash: "200000", duplicateReceiptIds: ["CASH-9"]});
    expect(result.collectionsToCash.status).toBe("tied");
  });

  it("never counts a receipt whose title is unknown or whose debtor differs as mapped cash", () => {
    const result = reconcileReceivablesPoolLedgers({...tied, receipts: [
      receipt("CASH-1", "200000", {receivableId: "REC-UNKNOWN"}),
      receipt("CASH-2", "200000", {debtorId: "D-9"}),
      receipt("CASH-3", "200000", {receivableId: null, debtorId: null, linkedAccount: false, anchorVerified: false}),
    ]});
    expect(result.cashControls).toMatchObject({
      unknownMappingReceiptIds: ["CASH-1", "CASH-2"], mappedCash: "0", mappedShare: "0",
      linkedAccountCash: "400000", unanchoredReceiptIds: ["CASH-3"],
    });
    expect(result.cashControls.linkedAccountShare.startsWith("0.666666666666666666666666666666666666666")).toBe(true);
  });

  it("floors the share denominators at one so an empty cash ledger yields zero shares, not an error", () => {
    const result = reconcileReceivablesPoolLedgers({...tied, receipts: [], reportedCollections: "0", tapeCollections: "0"});
    expect(result.cashControls).toMatchObject({validCashReceipts: "0", mappedShare: "0", linkedAccountShare: "0"});
    expect(result.collectionsToCash).toMatchObject({difference: "0", differenceShare: "0", status: "tied"});
    const smallLedger = reconcileReceivablesPoolLedgers({...tied, receipts: [receipt("CASH-1", "0.5")], reportedCollections: "0", tapeCollections: "0"});
    expect(smallLedger.collectionsToCash).toMatchObject({difference: "0.5", differenceShare: "0.5", status: "outside_tolerance"});
  });

  it("refuses negative amounts and tolerances outside the unit interval", () => {
    expect(() => reconcileReceivablesPoolLedgers({...tied, tapeOutstanding: "-1"})).toThrow(RangeError);
    expect(() => reconcileReceivablesPoolLedgers({...tied, receipts: [receipt("CASH-1", "-1")]})).toThrow(RangeError);
    expect(() => reconcileReceivablesPoolLedgers({...tied, maximumCashMismatchShare: "2"})).toThrow(RangeError);
  });
});
