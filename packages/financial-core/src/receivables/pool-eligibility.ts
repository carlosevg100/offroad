import type {IsoDate} from "./contracts";
import {decimal, receivablesPoolKernelsVersion, type ReceivablesPoolKernelTrace} from "./pool-shared";
import {receivablesDaysBetween} from "./static-metrics";

/** Exclusion reasons, in the order the classification records them. Every reason a title fails stays on it. */
export const receivablesPoolEligibilityReasons = [
  "zero_balance", "defaulted", "past_due", "remaining_term", "seasoning",
  "not_assignable", "evidence_unverified", "anchor_unverified", "registration_missing",
  "registration_conflict", "encumbered", "disputed", "related_party", "sector_outside_policy",
] as const;
export type ReceivablesPoolEligibilityReason = typeof receivablesPoolEligibilityReasons[number];

/** The declared policy a title is tested against. Thresholds are inputs; the kernel supplies none. */
export type ReceivablesPoolEligibilityPolicy = {
  maxDaysPastDue: number;
  maxRemainingTermDays: number;
  minSeasoningDays: number;
  requireAssignable: boolean;
  requireEvidenceVerified: boolean;
  registrationRule: "required" | "required_when_applicable" | "not_required";
  excludeDisputed: boolean;
  excludeRelatedParties: boolean;
  excludeEncumbered: boolean;
  allowedDebtorSectors: readonly string[];
};

export type ReceivablesPoolEligibilityTitle = {
  outstandingBalance: string;
  defaultedBalance: string;
  originDate: IsoDate;
  dueDate: IsoDate;
  assignable: boolean;
  evidenceVerified: boolean;
  anchorVerified: boolean;
  registration: "registered" | "not_required" | "missing" | "conflict";
  encumbrance: "free" | "pledged" | "assigned" | "unknown";
  disputed: boolean;
  relatedParty: boolean;
  debtorSector: string;
};

export type ReceivablesPoolEligibilityClassification = {
  version: typeof receivablesPoolKernelsVersion;
  daysPastDue: number;
  seasoningDays: number;
  remainingTermDays: number;
  eligible: boolean;
  reasons: ReceivablesPoolEligibilityReason[];
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Tests one title against the declared policy at the reference date. Days are whole UTC calendar
 * days; negative distances (a title not yet due, or due after the reference date) count as zero.
 * A title with several defects keeps every reason; nothing is netted or compensated.
 */
export function classifyReceivablesPoolTitle(
  title: ReceivablesPoolEligibilityTitle,
  policy: ReceivablesPoolEligibilityPolicy,
  referenceDate: IsoDate,
): ReceivablesPoolEligibilityClassification {
  if (!Number.isInteger(policy.maxDaysPastDue) || policy.maxDaysPastDue < 0) throw new RangeError("maxDaysPastDue must be a non-negative integer");
  if (!Number.isInteger(policy.maxRemainingTermDays) || policy.maxRemainingTermDays <= 0) throw new RangeError("maxRemainingTermDays must be a positive integer");
  if (!Number.isInteger(policy.minSeasoningDays) || policy.minSeasoningDays < 0) throw new RangeError("minSeasoningDays must be a non-negative integer");
  const daysPastDue = Math.max(0, receivablesDaysBetween(title.dueDate, referenceDate));
  const seasoningDays = Math.max(0, receivablesDaysBetween(title.originDate, referenceDate));
  const remainingTermDays = Math.max(0, receivablesDaysBetween(referenceDate, title.dueDate));
  const reasons: ReceivablesPoolEligibilityReason[] = [];
  if (decimal(title.outstandingBalance).lte(0)) reasons.push("zero_balance");
  if (decimal(title.defaultedBalance).gt(0)) reasons.push("defaulted");
  if (daysPastDue > policy.maxDaysPastDue) reasons.push("past_due");
  if (remainingTermDays > policy.maxRemainingTermDays) reasons.push("remaining_term");
  if (seasoningDays < policy.minSeasoningDays) reasons.push("seasoning");
  if (policy.requireAssignable && !title.assignable) reasons.push("not_assignable");
  if (policy.requireEvidenceVerified && !title.evidenceVerified) reasons.push("evidence_unverified");
  if (!title.anchorVerified) reasons.push("anchor_unverified");
  if (policy.registrationRule !== "not_required" && title.registration === "missing") reasons.push("registration_missing");
  if (title.registration === "conflict") reasons.push("registration_conflict");
  if (policy.excludeEncumbered && title.encumbrance !== "free") reasons.push("encumbered");
  if (policy.excludeDisputed && title.disputed) reasons.push("disputed");
  if (policy.excludeRelatedParties && title.relatedParty) reasons.push("related_party");
  if (policy.allowedDebtorSectors.length > 0 && !policy.allowedDebtorSectors.includes(title.debtorSector)) reasons.push("sector_outside_policy");
  const eligible = reasons.length === 0;
  return {
    version: receivablesPoolKernelsVersion,
    daysPastDue,
    seasoningDays,
    remainingTermDays,
    eligible,
    reasons,
    trace: {
      id: "receivables.pool_eligibility",
      formula: "daysPastDue = max(0, referenceDate - dueDate); seasoningDays = max(0, referenceDate - originDate); remainingTermDays = max(0, dueDate - referenceDate); eligible when no policy test records a reason",
      operands: {
        referenceDate,
        dueDate: title.dueDate,
        originDate: title.originDate,
        daysPastDue: String(daysPastDue),
        seasoningDays: String(seasoningDays),
        remainingTermDays: String(remainingTermDays),
        maxDaysPastDue: String(policy.maxDaysPastDue),
        maxRemainingTermDays: String(policy.maxRemainingTermDays),
        minSeasoningDays: String(policy.minSeasoningDays),
      },
      result: eligible ? "eligible" : reasons.join(","),
    },
  };
}
