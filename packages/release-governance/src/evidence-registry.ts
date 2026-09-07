export {
  attestedEvidenceSchema,
  evidenceAttestationSigningPayload,
  evidenceClaimDefinitionFingerprint,
  evidenceClaimSchema,
  evidenceCriterionDefinitionFingerprint,
  evidenceCriterionSchema,
  evidenceDeploymentScopeSchema,
  evidenceEnvironmentSchema,
  evidenceEvaluationRequestSchema,
  evidenceFreshnessSchema,
  evidenceRegistryDecisionSchema,
  evidenceRegistryIssueSchema,
  evidenceRegistrySchema,
  evidenceSubjectFingerprint,
  evidenceSubjectSchema,
  evidenceTenantScopeSchema,
  evidenceTrustRootSchema,
  evidenceTrustScopeFingerprint,
  evidenceTrustScopeSchema,
  evidenceTypeSchema,
  resolvedEvidenceArtifactSchema,
  sha256EvidenceBytes,
  verifyEvidenceAttestationSignature,
  type AttestedEvidence,
  type EvidenceClaim,
  type EvidenceClaimDecision,
  type EvidenceCriterion,
  type EvidenceEnvironment,
  type EvidenceEvaluationRequest,
  type EvidenceRegistry,
  type EvidenceRegistryDecision,
  type EvidenceRegistryIssue,
  type EvidenceSubject,
  type EvidenceTrustRoot,
  type EvidenceTrustScope,
  type EvidenceType,
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
