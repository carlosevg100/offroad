import {z} from "zod";
import type {ReconciledFact, TracedCalculation} from "@offroad/reconciliation";

import type {CaseBrief} from "./brief";

export const semanticFindingReasonSchema = z.enum([
  "contradicts_support",
  "unsupported_inference",
  "overstates_certainty",
  "judgment_mislabeled_as_fact",
  "support_is_irrelevant",
  "review_missing",
]);

export const semanticClaimReviewSchema = z.object({
  claimId: z.string().min(1),
  verdict: z.enum(["supported", "blocked"]),
  reasons: z.array(semanticFindingReasonSchema).default([]),
  explanation: z.string().min(1).max(500),
});

export const semanticAuditSchema = z.object({
  reviews: z.array(semanticClaimReviewSchema),
});

export type SemanticFindingReason = z.infer<typeof semanticFindingReasonSchema>;
export type SemanticClaimReview = z.infer<typeof semanticClaimReviewSchema>;
export type SemanticAudit = z.infer<typeof semanticAuditSchema>;

export type NormalizedSemanticAudit = {
  status: "pass" | "blocked";
  accepted: string[];
  findings: Array<{claimId: string; reason: SemanticFindingReason; detail: string}>;
  reviews: SemanticClaimReview[];
};

export const SEMANTIC_AUDIT_SYSTEM = `You are the independent evidence reviewer for a private-credit case.

The case writer has already produced claims from a reconciled fact set. Your job is not to rewrite,
improve or complete the case. Review each material claim only against the support printed beside it.

Block a claim when it contradicts its support, draws a conclusion the support does not establish,
states an indicative or projected item as certain, labels an opinion as a fact, or cites support that
is unrelated to the sentence. A missing fact is not permission to infer it. Do not perform new
financial calculations. Do not use outside knowledge. Review every material claim exactly once.

Return only the required structured result. Never use an em dash.`;

/**
 * The verifier sees the claim and the exact reconciled values it cites, never the raw data room.
 * This prevents it from silently introducing a second interpretation of an uncited document.
 */
export function buildSemanticAuditInput(input: {
  brief: CaseBrief;
  facts: readonly ReconciledFact[];
  calculations: readonly TracedCalculation[];
}): string {
  const support = new Map<string, string>();
  for (const fact of input.facts) {
    support.set(fact.key.fieldPath, `${fact.value} | ${fact.accepted.informationClass} | ${fact.key.periodEnd ?? "sem período"}`);
    if (fact.key.periodEnd) support.set(`${fact.key.fieldPath}|${fact.key.periodEnd}`, `${fact.value} | ${fact.accepted.informationClass} | ${fact.key.periodEnd}`);
  }
  for (const calculation of input.calculations) {
    support.set(calculation.id, `${calculation.value} | cálculo determinístico | entradas: ${calculation.inputs.join(", ")}`);
  }

  const claims = input.brief.sections.flatMap((section) => section.claims
    .filter((claim) => claim.material)
    .map((claim) => ({
      claimId: claim.id,
      kind: claim.kind,
      text: claim.text,
      support: claim.supportIds.map((id) => ({id, value: support.get(id) ?? "SUPORTE NÃO ENCONTRADO"})),
    })));

  return JSON.stringify({claims}, null, 2);
}

/** Fail closed on missing, duplicated or unexpected reviews. */
export function normalizeSemanticAudit(brief: CaseBrief, raw: SemanticAudit): NormalizedSemanticAudit {
  const materialIds = brief.sections.flatMap((section) => section.claims.filter((claim) => claim.material).map((claim) => claim.id));
  const required = new Set(materialIds);
  const counts = new Map<string, number>();
  for (const review of raw.reviews) counts.set(review.claimId, (counts.get(review.claimId) ?? 0) + 1);

  const reviews: SemanticClaimReview[] = [];
  const findings: NormalizedSemanticAudit["findings"] = [];
  const accepted: string[] = [];

  for (const claimId of materialIds) {
    const matches = raw.reviews.filter((review) => review.claimId === claimId);
    if (matches.length !== 1) {
      findings.push({claimId, reason: "review_missing", detail: matches.length === 0 ? "revisão ausente" : "revisão duplicada"});
      continue;
    }
    const review = matches[0]!;
    reviews.push(review);
    if (review.verdict === "supported" && review.reasons.length === 0) accepted.push(claimId);
    else {
      const reasons = review.reasons.length > 0 ? review.reasons : ["unsupported_inference" as const];
      for (const reason of reasons) findings.push({claimId, reason, detail: review.explanation});
    }
  }

  for (const [claimId] of counts) {
    if (!required.has(claimId)) findings.push({claimId, reason: "review_missing", detail: "revisão inesperada para afirmação inexistente ou não material"});
  }

  return {status: findings.length === 0 ? "pass" : "blocked", accepted, findings, reviews};
}

/** Deterministic test helper. Production uses the independent audit_evidence model call. */
export function supportedSemanticAudit(brief: CaseBrief): SemanticAudit {
  return {
    reviews: brief.sections.flatMap((section) => section.claims
      .filter((claim) => claim.material)
      .map((claim) => ({
        claimId: claim.id,
        verdict: "supported" as const,
        reasons: [],
        explanation: "A afirmação está limitada ao suporte citado.",
      }))),
  };
}
