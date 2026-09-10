import Decimal from "decimal.js";

import {decimal, full, ONE, receivablesPoolKernelsVersion, requireNonNegative, requireUnitInterval, safeRatio, sum, type ReceivablesPoolKernelTrace} from "./pool-shared";

export type ReceivablesPoolCashReceipt = {
  id: string;
  amount: string;
  receivableId: string | null;
  debtorId: string | null;
  linkedAccount: boolean;
  duplicateOf: string | null;
  anchorVerified: boolean;
};

export type ReceivablesPoolReconciliationLine = {
  left: string;
  right: string;
  difference: string;
  /** Absolute difference over the larger of |right| and one, so a zero ledger cannot divide by zero. */
  differenceShare: string;
  tolerance: string;
  status: "tied" | "outside_tolerance";
};

export type ReceivablesPoolReconciliation = {
  version: typeof receivablesPoolKernelsVersion;
  /** Title balances of the tape against the accounting gross receivables balance. */
  tapeToAccounting: ReceivablesPoolReconciliationLine;
  /** Collections recorded on the titles against the collections the accounting reports. */
  tapeCollectionsToAccounting: ReceivablesPoolReconciliationLine;
  /** Reported collections against the cash actually received, duplicates excluded. */
  collectionsToCash: ReceivablesPoolReconciliationLine;
  cashControls: {
    grossCashReceipts: string;
    validCashReceipts: string;
    mappedCash: string;
    linkedAccountCash: string;
    /** Mapped cash over valid cash (floored at one); the caller decides how a zero-cash period counts. */
    mappedShare: string;
    linkedAccountShare: string;
    duplicateReceiptIds: string[];
    unanchoredReceiptIds: string[];
    unknownMappingReceiptIds: string[];
    excludedDuplicateCash: string;
  };
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Ties the tape to the accounting control, the tape collections to the reported collections and
 * the reported collections to cash, keeping every difference above tolerance visible. Receipts
 * named as duplicates are excluded from cash before any comparison; a receipt whose title is
 * unknown or whose debtor differs from the tape is an unknown mapping and never counts as mapped.
 */
export function reconcileReceivablesPoolLedgers(input: {
  tapeOutstanding: string;
  accountingGrossBalance: string;
  tapeCollections: string;
  reportedCollections: string;
  receipts: readonly ReceivablesPoolCashReceipt[];
  titles: readonly {id: string; debtorId: string}[];
  maximumAccountingMismatchShare: string;
  maximumCashMismatchShare: string;
}): ReceivablesPoolReconciliation {
  const tape = requireNonNegative("tapeOutstanding", input.tapeOutstanding);
  const accounting = requireNonNegative("accountingGrossBalance", input.accountingGrossBalance);
  const tapeCollections = requireNonNegative("tapeCollections", input.tapeCollections);
  const reportedCollections = requireNonNegative("reportedCollections", input.reportedCollections);
  const accountingTolerance = requireUnitInterval("maximumAccountingMismatchShare", input.maximumAccountingMismatchShare);
  const cashTolerance = requireUnitInterval("maximumCashMismatchShare", input.maximumCashMismatchShare);
  for (const receipt of input.receipts) requireNonNegative(`amount of receipt ${receipt.id}`, receipt.amount);

  const validReceipts = input.receipts.filter((receipt) => receipt.duplicateOf === null);
  const cash = sum(validReceipts.map((receipt) => receipt.amount));
  const grossCash = sum(input.receipts.map((receipt) => receipt.amount));
  const titleById = new Map(input.titles.map((title) => [title.id, title]));
  const unknownMappingReceiptIds = validReceipts.filter((receipt) => {
    if (receipt.receivableId === null || receipt.debtorId === null) return false;
    const title = titleById.get(receipt.receivableId);
    return title === undefined || title.debtorId !== receipt.debtorId;
  }).map((receipt) => receipt.id);
  const unknownMapping = new Set(unknownMappingReceiptIds);
  const mappedCash = sum(validReceipts.filter((receipt) => receipt.receivableId !== null && receipt.debtorId !== null && !unknownMapping.has(receipt.id)).map((receipt) => receipt.amount));
  const linkedCash = sum(validReceipts.filter((receipt) => receipt.linkedAccount).map((receipt) => receipt.amount));

  const line = (left: Decimal, right: Decimal, tolerance: Decimal): ReceivablesPoolReconciliationLine => {
    const difference = left.minus(right).abs();
    const differenceShare = safeRatio(difference, Decimal.max(right.abs(), ONE));
    return {
      left: full(left), right: full(right), difference: full(difference), differenceShare: full(differenceShare),
      tolerance: full(tolerance), status: differenceShare.lte(tolerance) ? "tied" : "outside_tolerance",
    };
  };
  const tapeToAccounting = line(tape, accounting, accountingTolerance);
  const tapeCollectionsToAccounting = line(tapeCollections, reportedCollections, cashTolerance);
  const collectionsToCash = line(cash, reportedCollections, cashTolerance);
  return {
    version: receivablesPoolKernelsVersion,
    tapeToAccounting,
    tapeCollectionsToAccounting,
    collectionsToCash,
    cashControls: {
      grossCashReceipts: full(grossCash),
      validCashReceipts: full(cash),
      mappedCash: full(mappedCash),
      linkedAccountCash: full(linkedCash),
      mappedShare: full(safeRatio(mappedCash, Decimal.max(cash, ONE))),
      linkedAccountShare: full(safeRatio(linkedCash, Decimal.max(cash, ONE))),
      duplicateReceiptIds: input.receipts.filter((receipt) => receipt.duplicateOf !== null).map((receipt) => receipt.id),
      unanchoredReceiptIds: input.receipts.filter((receipt) => !receipt.anchorVerified).map((receipt) => receipt.id),
      unknownMappingReceiptIds,
      excludedDuplicateCash: full(grossCash.minus(cash)),
    },
    trace: {
      id: "receivables.pool_reconciliation",
      formula: "difference = |left - right|; differenceShare = difference / max(|right|, 1); tied when differenceShare <= tolerance; cash excludes receipts named as duplicates; mappedShare = mappedCash / max(cash, 1)",
      operands: {
        tapeOutstanding: full(tape),
        accountingGrossBalance: full(accounting),
        tapeCollections: full(tapeCollections),
        reportedCollections: full(reportedCollections),
        validCashReceipts: full(cash),
        grossCashReceipts: full(grossCash),
        receipts: String(input.receipts.length),
        maximumAccountingMismatchShare: full(decimal(accountingTolerance)),
        maximumCashMismatchShare: full(decimal(cashTolerance)),
      },
      result: [tapeToAccounting.status, tapeCollectionsToAccounting.status, collectionsToCash.status].join(","),
    },
  };
}
