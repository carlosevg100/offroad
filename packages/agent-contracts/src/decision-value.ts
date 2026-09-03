import {z} from "zod";

export const decisionValueKindSchema = z.enum([
  "non_obvious_insight_found",
  "material_error_avoided",
  "structure_changed",
  "pitch_improved",
  "time_saved",
  "mandate_supported",
  "execution_path_improved",
  "better_capital_provider_identified",
]);
export type DecisionValueKind = z.infer<typeof decisionValueKindSchema>;

/**
 * Product value is recorded as an observation, not asserted by the model. Estimated outcomes stay
 * visibly separate from user-confirmed or externally observed outcomes.
 */
export const decisionValueObservationSchema = z.object({
  schemaVersion: z.literal("dcm-decision-value.v1"),
  kind: decisionValueKindSchema,
  description: z.string().trim().min(5).max(1_000),
  measurement: z.object({
    basis: z.enum(["user_confirmed", "externally_observed", "measured_by_system", "estimated"]),
    baseline: z.string().trim().min(1).max(500).nullable().default(null),
    result: z.string().trim().min(1).max(500),
    unit: z.string().trim().min(1).max(80).nullable().default(null),
  }),
  evidenceRefs: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
  attributionConfidence: z.enum(["low", "medium", "high"]),
  recordedAt: z.iso.datetime(),
});
export type DecisionValueObservation = z.infer<typeof decisionValueObservationSchema>;

export const domainSurvivalCriterionSchema = z.enum([
  "coverage_completeness",
  "evidence_traceability",
  "deterministic_reconciliation",
  "domain_specific_depth",
  "non_obvious_insight",
  "alternative_discrimination",
  "structure_term_completeness",
  "market_match_discrimination",
  "decision_impact",
]);

export const domainSurvivalCheckSchema = z.object({
  criterion: domainSurvivalCriterionSchema,
  required: z.boolean(),
  status: z.enum(["passed", "failed", "not_applicable"]),
  evidenceRefs: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  rationale: z.string().trim().min(5).max(1_000),
}).superRefine((check, context) => {
  if (check.required && check.status === "not_applicable") {
    context.addIssue({code: "custom", path: ["status"], message: "a required survival criterion cannot be not applicable"});
  }
  if (check.status === "passed" && check.evidenceRefs.length === 0) {
    context.addIssue({code: "custom", path: ["evidenceRefs"], message: "a passed survival criterion requires evidence"});
  }
});
export type DomainSurvivalCheck = z.infer<typeof domainSurvivalCheckSchema>;

export const domainSurvivalAssessmentSchema = z.object({
  schemaVersion: z.literal("dcm-domain-survival-assessment.v1"),
  baseline: z.literal("best_available_generalist_model"),
  checks: z.array(domainSurvivalCheckSchema).min(1),
  valueObservations: z.array(decisionValueObservationSchema).max(100).default([]),
  survives: z.boolean(),
  failureReasons: z.array(z.string()).default([]),
});
export type DomainSurvivalAssessment = z.infer<typeof domainSurvivalAssessmentSchema>;

export function assessDomainSurvival(input: {
  checks: readonly DomainSurvivalCheck[];
  valueObservations?: readonly DecisionValueObservation[];
}): DomainSurvivalAssessment {
  const checks = input.checks.map((check) => domainSurvivalCheckSchema.parse(check));
  const criteria = checks.map((check) => check.criterion);
  if (new Set(criteria).size !== criteria.length) throw new Error("survival criteria must be unique");
  const requiredFailures = checks.filter((check) => check.required && check.status !== "passed");
  const observations = [...(input.valueObservations ?? [])].map((observation) => decisionValueObservationSchema.parse(observation));
  const supportedValue = observations.some((observation) =>
    observation.measurement.basis !== "estimated" && observation.attributionConfidence !== "low"
  );
  const failureReasons = [
    ...requiredFailures.map((check) => `required criterion failed: ${check.criterion}`),
    ...(supportedValue ? [] : ["no materially supported decision-value observation"]),
  ];
  return domainSurvivalAssessmentSchema.parse({
    schemaVersion: "dcm-domain-survival-assessment.v1",
    baseline: "best_available_generalist_model",
    checks,
    valueObservations: observations,
    survives: failureReasons.length === 0,
    failureReasons,
  });
}
