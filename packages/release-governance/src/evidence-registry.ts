export {
  attestedEvidenceSchema,
  evidenceAcceptanceManifestSchema,
  evidenceAttestationSigningPayload,
  evidenceAttestationFingerprint,
  evidenceClaimDefinitionFingerprint,
  evidenceClaimSchema,
  evidenceCollectorSchema,
  evidenceCriterionDefinitionFingerprint,
  evidenceCriterionSchema,
  evidenceDeploymentScopeSchema,
  evidenceEnvironmentSchema,
  evidenceEvaluationRequestSchema,
  evidenceFreshnessSchema,
  evidenceGateResultSchema,
  evidenceIngestReceiptSchema,
  evidencePromotionTargetSchema,
  evidenceRegistryDecisionSchema,
  evidenceRegistryIssueSchema,
  evidenceRegistrySchema,
  evidenceRunBindingSchema,
  evidenceSubjectFingerprint,
  evidenceSubjectSchema,
  evidenceTenantScopeSchema,
  evidenceTrustRootSchema,
  evidenceTrustScopeFingerprint,
  evidenceTrustScopeSchema,
  evidenceTypeSchema,
  evidenceWorkloadIdentitySchema,
  resolvedEvidenceArtifactSchema,
  sha256EvidenceBytes,
  type EvidenceAcceptanceManifest,
  type AttestedEvidence,
  type EvidenceClaim,
  type EvidenceClaimDecision,
  type EvidenceCollector,
  type EvidenceCriterion,
  type EvidenceEnvironment,
  type EvidenceEvaluationRequest,
  type EvidenceIngestReceipt,
  type EvidencePromotionTarget,
  type EvidenceRegistry,
  type EvidenceRegistryDecision,
  type EvidenceRegistryIssue,
  type EvidenceRunBinding,
  type EvidenceSubject,
  type EvidenceTrustRoot,
  type EvidenceTrustScope,
  type EvidenceType,
  type EvidenceWorkloadIdentity,
  type ResolvedEvidenceArtifact,
} from "./evidence-registry-contract.ts";

import {evidenceEvaluationRequestSchema} from "./evidence-registry-contract.ts";
import {readEvidenceControlPlaneSnapshot} from "./evidence-registry-control-plane.ts";
import {
  evaluateEvidenceRegistryAgainstControlPlane,
  invalidEvidenceRegistryDecision,
} from "./evidence-registry-evaluator.internal.ts";

/**
 * Evaluates acceptance evidence using only the control plane's trust roots and process clock.
 * Extra caller fields are rejected, including attempted roots, allowlists, verifier labels or time.
 */
export function evaluateEvidenceRegistry(input: unknown) {
  const controlPlane = readEvidenceControlPlaneSnapshot();
  const parsed = evidenceEvaluationRequestSchema.safeParse(input);
  if (!parsed.success) return invalidEvidenceRegistryDecision(input, controlPlane);
  return evaluateEvidenceRegistryAgainstControlPlane(parsed.data, controlPlane);
}
