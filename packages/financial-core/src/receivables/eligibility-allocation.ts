import Decimal from "decimal.js";

import type {AssertionProvenance, ReceivablesUniverse} from "./contracts";

export const receivablesEligibilityAllocationVersion = "2026.08.27-v1";

export type ReceivableEligibilityDisposition = "eligible" | "conditional" | "ineligible" | "not_evaluated";

export type ReceivableEligibilityClassification = {
  receivableId: string;
  disposition: ReceivableEligibilityDisposition;
  reason: string;
  provenance: AssertionProvenance;
};

export type ReceivablesEligibilityAllocation = {
  version: typeof receivablesEligibilityAllocationVersion;
  denominator: "open_receivables_value";
  denominatorValue: string;
  amounts: Record<ReceivableEligibilityDisposition, string>;
  shares: Record<ReceivableEligibilityDisposition, string | null>;
  titleCounts: Record<ReceivableEligibilityDisposition, number>;
  classifications: readonly ReceivableEligibilityClassification[];
  provenance: {
    datasetHash: string;
    universeId: string;
    reportingDate: string;
    inclusions: readonly string[];
    exclusions: readonly string[];
  };
};

const dispositions: readonly ReceivableEligibilityDisposition[] = ["eligible", "conditional", "ineligible", "not_evaluated"];
const canonical = (value: Decimal) => value.toDecimalPlaces(8).toFixed();

/**
 * Aggregates externally classified title-level decisions. Legal and policy logic deliberately
 * stays outside financial-core; this function only enforces a complete, exclusive denominator.
 */
export function calculateReceivablesEligibilityAllocation(input: {
  universe: ReceivablesUniverse;
  datasetHash: string;
  classifications: readonly ReceivableEligibilityClassification[];
}): ReceivablesEligibilityAllocation {
  const openTitles = input.universe.receivables.filter((title) => title.status === "open");
  const openIds = new Set(openTitles.map((title) => title.id));
  const byId = new Map<string, ReceivableEligibilityClassification>();
  for (const classification of input.classifications) {
    if (!openIds.has(classification.receivableId)) throw new RangeError(`classification is not for an open receivable: ${classification.receivableId}`);
    if (byId.has(classification.receivableId)) throw new RangeError(`duplicate eligibility classification: ${classification.receivableId}`);
    if (classification.provenance.kind === "estimated" && classification.disposition === "ineligible") {
      throw new Error(`estimated provenance cannot create a hard ineligibility: ${classification.receivableId}`);
    }
    byId.set(classification.receivableId, classification);
  }
  const missing = openTitles.filter((title) => !byId.has(title.id)).map((title) => title.id).sort();
  if (missing.length > 0) throw new RangeError(`missing eligibility classifications: ${missing.join(",")}`);

  const amounts = Object.fromEntries(dispositions.map((item) => [item, new Decimal(0)])) as Record<ReceivableEligibilityDisposition, Decimal>;
  const titleCounts = Object.fromEntries(dispositions.map((item) => [item, 0])) as Record<ReceivableEligibilityDisposition, number>;
  for (const title of openTitles) {
    const classification = byId.get(title.id)!;
    amounts[classification.disposition] = amounts[classification.disposition].plus(title.openValue);
    titleCounts[classification.disposition] += 1;
  }
  const denominator = openTitles.reduce((sum, title) => sum.plus(title.openValue), new Decimal(0));
  const serializedAmounts = Object.fromEntries(dispositions.map((item) => [item, canonical(amounts[item])])) as Record<ReceivableEligibilityDisposition, string>;
  const shares = Object.fromEntries(dispositions.map((item) => [item, denominator.eq(0) ? null : canonical(amounts[item].div(denominator))])) as Record<ReceivableEligibilityDisposition, string | null>;

  const allocated = dispositions.reduce((sum, item) => sum.plus(amounts[item]), new Decimal(0));
  if (!allocated.eq(denominator)) throw new Error("eligibility allocation does not reconcile to the open portfolio");

  return {
    version: receivablesEligibilityAllocationVersion,
    denominator: "open_receivables_value",
    denominatorValue: canonical(denominator),
    amounts: serializedAmounts,
    shares,
    titleCounts,
    classifications: openTitles.map((title) => byId.get(title.id)!),
    provenance: {
      datasetHash: input.datasetHash,
      universeId: input.universe.id,
      reportingDate: input.universe.dates.reportingDate,
      inclusions: ["open receivables present in the canonical universe"],
      exclusions: ["settled, cancelled, repurchased and written-off receivables"],
    },
  };
}
