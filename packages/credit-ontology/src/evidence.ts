import {z} from "zod";

/**
 * Information class of a piece of evidence — who produced it and under which
 * assurance level. Mirrors the `intake_field_candidates.information_class`
 * check constraint so the ontology and the schema never drift.
 */
export const informationClassSchema = z.enum([
  "audited",
  "reviewed",
  "accounting",
  "bank_statement",
  "management",
  "projection",
  "company_document",
  "calculated",
]);
export type InformationClass = z.infer<typeof informationClassSchema>;

/**
 * Evidence rank 1 (strongest) … 7 (weakest). `calculated` values inherit the
 * worst rank among their inputs, so they have no rank of their own here.
 */
export const evidenceRankByClass: Record<Exclude<InformationClass, "calculated">, number> = {
  audited: 1,
  reviewed: 2,
  accounting: 3,
  bank_statement: 4,
  management: 5,
  projection: 6,
  company_document: 7,
};

export const minimumEvidenceRank = 1;
export const maximumEvidenceRank = 7;

export function evidenceRankFor(informationClass: InformationClass, inputRanks: number[] = []): number {
  if (informationClass === "calculated") {
    if (inputRanks.length === 0) return maximumEvidenceRank;
    return Math.max(...inputRanks.map(clampRank));
  }
  return evidenceRankByClass[informationClass];
}

function clampRank(rank: number): number {
  if (!Number.isFinite(rank)) return maximumEvidenceRank;
  return Math.min(maximumEvidenceRank, Math.max(minimumEvidenceRank, Math.round(rank)));
}

/**
 * Deterministic precedence proposal between two evidence classes for the same
 * fact. Returns which side the policy *proposes* as winner; the product never
 * applies it silently — a human resolves the exception (Blueprint §14.2, A4).
 */
export function proposePrecedence(left: InformationClass, right: InformationClass): "left" | "right" | "tie" {
  const leftRank = evidenceRankFor(left);
  const rightRank = evidenceRankFor(right);
  if (leftRank === rightRank) return "tie";
  return leftRank < rightRank ? "left" : "right";
}
