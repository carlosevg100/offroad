import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const failureClassSchema = z.enum(["explosive", "slow", "false_victory"]);
export type FailureClass = z.infer<typeof failureClassSchema>;

export const capabilityStageSchema = z.enum(["represent", "analyze", "recommend", "structure", "external_release"]);
export type CapabilityStage = z.infer<typeof capabilityStageSchema>;

export const capabilityMaturitySchema = z.enum(["unsupported", "specified", "implemented", "tested", "production"]);
export type CapabilityMaturity = z.infer<typeof capabilityMaturitySchema>;

export const requestedUseSchema = z.enum(["preliminary", "internal_decision", "external_material", "external_action"]);
export type RequestedUse = z.infer<typeof requestedUseSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const dateTimeSchema = z.string().datetime({offset: true});

export const capabilityEvidenceSchema = z.object({
  procedureVersion: z.string().min(1).nullable(),
  implementationFingerprint: sha256Schema.nullable(),
  ownerId: z.string().min(1).nullable(),
  goldCasesRequired: z.number().int().positive(),
  goldCasesPassed: z.number().int().nonnegative(),
  adversarialCasesRequired: z.number().int().positive(),
  adversarialCasesPassed: z.number().int().nonnegative(),
  realCaseIds: z.array(z.string().min(1)),
  realCaseEvidenceSource: z.literal("controlled_execution_ledger").nullable(),
  criticalRegressions: z.number().int().nonnegative(),
  openCriticalFindings: z.number().int().nonnegative(),
  evaluatedAt: dateTimeSchema,
  validThrough: dateTimeSchema,
});
export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>;

export const capabilityAccreditationSchema = z.object({
  scopeId: z.string().min(1),
  stage: capabilityStageSchema,
  claimedMaturity: capabilityMaturitySchema,
  evidence: capabilityEvidenceSchema,
});
export type CapabilityAccreditation = z.infer<typeof capabilityAccreditationSchema>;

export const capabilityDecisionSchema = z.object({
  accredited: z.boolean(),
  scopeId: z.string().min(1),
  stage: capabilityStageSchema,
  claimedMaturity: capabilityMaturitySchema,
  effectiveMaturity: capabilityMaturitySchema,
  blockers: z.array(z.string().min(1)),
  evidenceFingerprint: sha256Schema,
});
export type CapabilityDecision = z.infer<typeof capabilityDecisionSchema>;

/**
 * Accredit a narrow capability, never a product-wide claim. Production is deliberately hard:
 * canonical procedure, implementation, gold and adversarial evidence, 20 distinct real cases,
 * no critical regressions, an accountable owner and a current validity window.
 */
export function decideCapabilityAccreditation(
  accreditation: CapabilityAccreditation,
  now = new Date(),
): CapabilityDecision {
  const parsed = capabilityAccreditationSchema.parse(accreditation);
  const blockers: string[] = [];
  const evidence = parsed.evidence;
  const distinctRealCases = new Set(evidence.realCaseIds);

  if (parsed.claimedMaturity === "unsupported") blockers.push("unsupported_capability_cannot_be_accredited");
  if (!evidence.procedureVersion) blockers.push("canonical_procedure_required");
  if (!evidence.ownerId) blockers.push("accountable_owner_required");
  if (new Date(evidence.validThrough).getTime() < now.getTime()) blockers.push("capability_evidence_expired");

  const claimedRank = maturityRank[parsed.claimedMaturity];
  if (claimedRank >= maturityRank.implemented && !evidence.implementationFingerprint) {
    blockers.push("implementation_evidence_required");
  }
  if (claimedRank >= maturityRank.tested) {
    if (evidence.goldCasesPassed < evidence.goldCasesRequired) blockers.push("gold_case_evidence_incomplete");
    if (evidence.adversarialCasesPassed < evidence.adversarialCasesRequired) blockers.push("adversarial_case_evidence_incomplete");
    if (evidence.criticalRegressions > 0) blockers.push("critical_regressions_present");
    if (evidence.openCriticalFindings > 0) blockers.push("open_critical_findings_present");
  }
  if (claimedRank >= maturityRank.production) {
    if (evidence.realCaseEvidenceSource !== "controlled_execution_ledger") blockers.push("real_cases_must_come_from_controlled_execution_ledger");
    if (distinctRealCases.size !== evidence.realCaseIds.length) blockers.push("real_case_evidence_contains_duplicates");
    if (distinctRealCases.size < 20) blockers.push("production_requires_twenty_distinct_real_cases");
  }

  const effectiveMaturity = blockers.length === 0 ? parsed.claimedMaturity : highestProvenMaturity(parsed, now);
  const payload = {
    accredited: blockers.length === 0,
    scopeId: parsed.scopeId,
    stage: parsed.stage,
    claimedMaturity: parsed.claimedMaturity,
    effectiveMaturity,
    blockers,
  };
  return capabilityDecisionSchema.parse({...payload, evidenceFingerprint: fingerprintJson(parsed)});
}

const caseControlStatusSchema = z.enum(["satisfied", "failed", "not_applicable"]);

const mandateControlSchema = z.object({
  status: caseControlStatusSchema,
  objectiveCaptured: z.boolean(),
  decisionContextCaptured: z.boolean(),
});

const sourceControlSchema = z.object({
  status: caseControlStatusSchema,
  materialClaims: z.number().int().nonnegative(),
  sourceBoundMaterialClaims: z.number().int().nonnegative(),
  entityPeriodValidMaterialClaims: z.number().int().nonnegative(),
  staleMaterialClaims: z.number().int().nonnegative(),
});

const calculationControlSchema = z.object({
  status: caseControlStatusSchema,
  criticalCalculations: z.number().int().nonnegative(),
  deterministicCalculations: z.number().int().nonnegative(),
  reconciledCalculations: z.number().int().nonnegative(),
  unresolvedExceptions: z.number().int().nonnegative(),
});

const coverageControlSchema = z.object({
  status: caseControlStatusSchema,
  requiredItems: z.number().int().nonnegative(),
  coveredItems: z.number().int().nonnegative(),
  materialGaps: z.number().int().nonnegative(),
  gapsWithReasonAndNextAction: z.number().int().nonnegative(),
});

const judgmentControlSchema = z.object({
  status: caseControlStatusSchema,
  maturity: z.enum(["not_started", "hypothesis", "validating", "internal_decision_valid"]),
  uncertaintyDisclosed: z.boolean(),
  alternativesCompared: z.boolean(),
  downsideTested: z.boolean(),
});

const artifactControlSchema = z.object({
  status: caseControlStatusSchema,
  generatedArtifacts: z.number().int().nonnegative(),
  consistentArtifacts: z.number().int().nonnegative(),
  staleArtifacts: z.number().int().nonnegative(),
  approvedForExternalUse: z.boolean(),
});

const marketControlSchema = z.object({
  status: caseControlStatusSchema,
  applicable: z.boolean(),
  currentMandates: z.boolean(),
  explainableFit: z.boolean(),
});

const securityControlSchema = z.object({
  status: caseControlStatusSchema,
  retrievalBounded: z.boolean(),
  tenantIsolationVerified: z.boolean(),
  providerPolicyEnforced: z.boolean(),
  externalToolsAllowlisted: z.boolean(),
});

const authorityControlSchema = z.object({
  status: caseControlStatusSchema,
  externalActionRequested: z.boolean(),
  exactAuthorizationCaptured: z.boolean(),
  authorizedTargetsFingerprint: sha256Schema.nullable(),
});

const freshnessControlSchema = z.object({
  status: caseControlStatusSchema,
  transitiveInvalidationEnabled: z.boolean(),
  staleDependents: z.number().int().nonnegative(),
});

const economicsControlSchema = z.object({
  status: caseControlStatusSchema,
  costWithinBudget: z.boolean(),
  manualMinutes: z.number().nonnegative(),
  untrackedManualMinutes: z.number().nonnegative(),
  repeatedManualRootCauses: z.number().int().nonnegative(),
});

const outcomeControlSchema = z.object({
  status: caseControlStatusSchema,
  decisionLinked: z.boolean(),
  outcomeTaxonomyApplied: z.boolean(),
});

export const caseControlSnapshotSchema = z.object({
  snapshotAt: dateTimeSchema,
  mandate: mandateControlSchema,
  sources: sourceControlSchema,
  calculations: calculationControlSchema,
  coverage: coverageControlSchema,
  judgment: judgmentControlSchema,
  artifacts: artifactControlSchema,
  market: marketControlSchema,
  security: securityControlSchema,
  authority: authorityControlSchema,
  freshness: freshnessControlSchema,
  economics: economicsControlSchema,
  outcome: outcomeControlSchema,
});
export type CaseControlSnapshot = z.infer<typeof caseControlSnapshotSchema>;

export const operatingBlockerSchema = z.object({
  code: z.string().min(1),
  failureClass: failureClassSchema,
});
export type OperatingBlocker = z.infer<typeof operatingBlockerSchema>;

export const operatingControlDecisionSchema = z.object({
  allowed: z.boolean(),
  requestedUse: requestedUseSchema,
  highestAllowedUse: requestedUseSchema.nullable(),
  blockers: z.array(operatingBlockerSchema),
  warnings: z.array(operatingBlockerSchema),
  decisionFingerprint: sha256Schema,
});
export type OperatingControlDecision = z.infer<typeof operatingControlDecisionSchema>;

const requiredCapability: Record<RequestedUse, CapabilityStage> = {
  preliminary: "analyze",
  internal_decision: "recommend",
  external_material: "structure",
  external_action: "external_release",
};

/**
 * Fail-closed operating gate. There is no weighted score: a missing critical control remains a
 * blocker even if every other dimension is excellent. Competence and authority are independent.
 */
export function evaluateOperatingControls(input: {
  requestedUse: RequestedUse;
  snapshot: CaseControlSnapshot;
  capability: CapabilityDecision;
}): OperatingControlDecision {
  const requestedUse = requestedUseSchema.parse(input.requestedUse);
  const snapshot = caseControlSnapshotSchema.parse(input.snapshot);
  const capability = capabilityDecisionSchema.parse(input.capability);
  const blockers: OperatingBlocker[] = [];
  const warnings: OperatingBlocker[] = [];

  requireControl(snapshot.mandate.status, snapshot.mandate.objectiveCaptured && snapshot.mandate.decisionContextCaptured,
    "mandate_not_sufficiently_defined", "slow", blockers);
  requireControl(snapshot.sources.status,
    snapshot.sources.materialClaims === snapshot.sources.sourceBoundMaterialClaims
      && snapshot.sources.materialClaims === snapshot.sources.entityPeriodValidMaterialClaims
      && snapshot.sources.staleMaterialClaims === 0,
    "material_claims_not_fully_grounded", "explosive", blockers);
  requireControl(snapshot.security.status,
    snapshot.security.retrievalBounded && snapshot.security.tenantIsolationVerified
      && snapshot.security.providerPolicyEnforced && snapshot.security.externalToolsAllowlisted,
    "security_boundary_not_verified", "explosive", blockers);
  requireControl(snapshot.freshness.status,
    snapshot.freshness.transitiveInvalidationEnabled && snapshot.freshness.staleDependents === 0,
    "stale_or_non_invalidated_state", "explosive", blockers);

  if (requestedUse !== "preliminary") {
    if (snapshot.sources.materialClaims === 0) {
      blockers.push({code: "internal_decision_requires_material_claims", failureClass: "explosive"});
    }
    requireControl(snapshot.calculations.status,
      snapshot.calculations.criticalCalculations > 0
        && snapshot.calculations.criticalCalculations === snapshot.calculations.deterministicCalculations
        && snapshot.calculations.criticalCalculations === snapshot.calculations.reconciledCalculations
        && snapshot.calculations.unresolvedExceptions === 0,
      "critical_math_not_deterministic_and_reconciled", "explosive", blockers);
    requireControl(snapshot.coverage.status,
      snapshot.coverage.requiredItems > 0
        && snapshot.coverage.requiredItems === snapshot.coverage.coveredItems
        && snapshot.coverage.materialGaps === snapshot.coverage.gapsWithReasonAndNextAction,
      "material_coverage_incomplete", "explosive", blockers);
    requireControl(snapshot.judgment.status,
      snapshot.judgment.maturity === "internal_decision_valid" && snapshot.judgment.uncertaintyDisclosed
        && snapshot.judgment.alternativesCompared && snapshot.judgment.downsideTested,
      "judgment_not_valid_for_internal_decision", "explosive", blockers);
    requireControl(snapshot.economics.status, snapshot.economics.costWithinBudget,
      "case_cost_outside_approved_budget", "false_victory", blockers);
  }

  if (requestedUse === "external_material" || requestedUse === "external_action") {
    requireControl(snapshot.artifacts.status,
      snapshot.artifacts.generatedArtifacts > 0
        && snapshot.artifacts.generatedArtifacts === snapshot.artifacts.consistentArtifacts
        && snapshot.artifacts.staleArtifacts === 0
        && snapshot.artifacts.approvedForExternalUse,
      "external_artifacts_not_consistent_current_and_approved", "explosive", blockers);
  }

  if (requestedUse === "external_action") {
    requireControl(snapshot.market.status,
      snapshot.market.applicable && snapshot.market.currentMandates && snapshot.market.explainableFit,
      "market_fit_not_current_and_explainable", "explosive", blockers);
    requireControl(snapshot.authority.status,
      snapshot.authority.externalActionRequested && snapshot.authority.exactAuthorizationCaptured
        && snapshot.authority.authorizedTargetsFingerprint !== null,
      "exact_external_authority_missing", "explosive", blockers);
  }

  const expectedStage = requiredCapability[requestedUse];
  if (!capability.accredited || capability.stage !== expectedStage || maturityRank[capability.effectiveMaturity] < maturityRank.tested) {
    blockers.push({code: `capability_not_accredited_for_${expectedStage}`, failureClass: "explosive"});
  }
  if ((requestedUse === "external_material" || requestedUse === "external_action")
    && capability.effectiveMaturity !== "production") {
    blockers.push({code: "external_use_requires_production_capability", failureClass: "explosive"});
  }

  if (snapshot.economics.untrackedManualMinutes > 0) {
    warnings.push({code: "untracked_manual_work_present", failureClass: "false_victory"});
  }
  if (snapshot.economics.repeatedManualRootCauses > 0) {
    warnings.push({code: "repeated_manual_root_causes_present", failureClass: "false_victory"});
  }
  if (snapshot.outcome.status !== "not_applicable"
    && (!snapshot.outcome.decisionLinked || !snapshot.outcome.outcomeTaxonomyApplied)) {
    warnings.push({code: "outcome_learning_not_attributable", failureClass: "slow"});
  }

  // Accreditation is deliberately narrow by stage. This decision cannot claim that a different
  // stage is safe, so the highest allowed use is either the one evaluated or none.
  const highestAllowedUse = blockers.length === 0 ? requestedUse : null;
  const payload = {allowed: blockers.length === 0, requestedUse, highestAllowedUse, blockers, warnings};
  return operatingControlDecisionSchema.parse({...payload, decisionFingerprint: fingerprintJson(payload)});
}

function requireControl(
  status: z.infer<typeof caseControlStatusSchema>,
  condition: boolean,
  code: string,
  failureClass: FailureClass,
  blockers: OperatingBlocker[],
): void {
  if (status !== "satisfied" || !condition) blockers.push({code, failureClass});
}

const maturityRank: Record<CapabilityMaturity, number> = {
  unsupported: 0,
  specified: 1,
  implemented: 2,
  tested: 3,
  production: 4,
};

function highestProvenMaturity(accreditation: CapabilityAccreditation, now: Date): CapabilityMaturity {
  const evidence = accreditation.evidence;
  if (!evidence.procedureVersion || !evidence.ownerId || new Date(evidence.validThrough).getTime() < now.getTime()) return "unsupported";
  if (!evidence.implementationFingerprint) return "specified";
  if (evidence.goldCasesPassed < evidence.goldCasesRequired || evidence.adversarialCasesPassed < evidence.adversarialCasesRequired
    || evidence.criticalRegressions > 0 || evidence.openCriticalFindings > 0) return "implemented";
  const realCases = new Set(evidence.realCaseIds);
  if (evidence.realCaseEvidenceSource !== "controlled_execution_ledger"
    || realCases.size < 20 || realCases.size !== evidence.realCaseIds.length) return "tested";
  return "production";
}
