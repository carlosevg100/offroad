import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const rolloutStateSchema = z.enum(["off", "shadow", "canary", "active", "paused"]);
export type RolloutState = z.infer<typeof rolloutStateSchema>;

export const cohortKindSchema = z.enum(["wave_1", "wave_2"]);
export type CohortKind = z.infer<typeof cohortKindSchema>;

export const cohortEvidenceSchema = z.object({
  cohortId: z.string().uuid(),
  kind: cohortKindSchema,
  realCaseIds: z.array(z.string().uuid()),
  completedComparisons: z.number().int().nonnegative(),
  criticalRegressions: z.number().int().nonnegative(),
  unresolvedWarnings: z.number().int().nonnegative(),
  accepted: z.boolean(),
});
export type CohortEvidence = z.infer<typeof cohortEvidenceSchema>;

export const promotionDecisionSchema = z.object({
  allowed: z.boolean(),
  from: rolloutStateSchema,
  to: rolloutStateSchema,
  reasons: z.array(z.string().min(1)),
  evidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PromotionDecision = z.infer<typeof promotionDecisionSchema>;

/**
 * A fail-closed rollout state machine. Synthetic fixtures and duplicate cases cannot satisfy a
 * cohort because callers must provide database-backed real case ids and this contract requires
 * ten distinct cases. Approval is separate from technical evidence and is mandatory for active.
 */
export function decidePromotion(input: {
  from: RolloutState;
  to: RolloutState;
  wave1?: CohortEvidence;
  wave2?: CohortEvidence;
  externalReleaseApproved?: boolean;
  operatingControlsApproved?: boolean;
}): PromotionDecision {
  const parsed = {
    from: rolloutStateSchema.parse(input.from),
    to: rolloutStateSchema.parse(input.to),
    wave1: input.wave1 ? cohortEvidenceSchema.parse(input.wave1) : undefined,
    wave2: input.wave2 ? cohortEvidenceSchema.parse(input.wave2) : undefined,
    externalReleaseApproved: input.externalReleaseApproved === true,
    operatingControlsApproved: input.operatingControlsApproved === true,
  };
  const reasons: string[] = [];

  if (parsed.to === "paused") return decision(parsed.from, parsed.to, reasons, parsed);
  if (!transitionAllowed(parsed.from, parsed.to)) reasons.push("rollout_transition_not_allowed");

  if (parsed.to === "canary") validateCohort(parsed.wave1, "wave_1", reasons);
  if (parsed.to === "active") {
    validateCohort(parsed.wave1, "wave_1", reasons);
    validateCohort(parsed.wave2, "wave_2", reasons);
    if (parsed.wave1 && parsed.wave2 && parsed.wave1.realCaseIds.some((id) => parsed.wave2!.realCaseIds.includes(id))) {
      reasons.push("cohort_cases_must_not_overlap");
    }
    if (!parsed.externalReleaseApproved) reasons.push("external_release_approval_required");
    if (!parsed.operatingControlsApproved) reasons.push("operating_controls_approval_required");
  }

  return decision(parsed.from, parsed.to, reasons, parsed);
}

function transitionAllowed(from: RolloutState, to: RolloutState): boolean {
  if (from === to) return true;
  if (to === "paused") return true;
  return (from === "off" && to === "shadow")
    || (from === "paused" && (to === "shadow" || to === "canary"))
    || (from === "shadow" && (to === "off" || to === "canary"))
    || (from === "canary" && (to === "shadow" || to === "active"))
    || (from === "active" && to === "canary");
}

function validateCohort(cohort: CohortEvidence | undefined, kind: CohortKind, reasons: string[]): void {
  if (!cohort) {
    reasons.push(`${kind}_required`);
    return;
  }
  if (cohort.kind !== kind) reasons.push(`${kind}_kind_mismatch`);
  const distinct = new Set(cohort.realCaseIds);
  if (distinct.size !== cohort.realCaseIds.length) reasons.push(`${kind}_contains_duplicate_cases`);
  if (distinct.size !== 10) reasons.push(`${kind}_requires_exactly_ten_real_cases`);
  if (cohort.completedComparisons < distinct.size) reasons.push(`${kind}_comparisons_incomplete`);
  if (cohort.criticalRegressions > 0) reasons.push(`${kind}_has_critical_regressions`);
  if (!cohort.accepted) reasons.push(`${kind}_not_accepted`);
}

function decision(from: RolloutState, to: RolloutState, reasons: string[], evidence: unknown): PromotionDecision {
  const payload = {allowed: reasons.length === 0, from, to, reasons};
  return promotionDecisionSchema.parse({...payload, evidenceFingerprint: fingerprintJson(evidence)});
}
