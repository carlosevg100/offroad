import {fingerprintJson, stableJson} from "@offroad/case-understanding";
import {
  evidenceClaimDefinitionFingerprint,
  evidenceCriterionDefinitionFingerprint,
  evidenceRegistryDecisionSchema,
  evidenceSubjectFingerprint,
  evidenceTrustRootSchema,
  evidenceTrustScopeFingerprint,
  sha256EvidenceBytes,
  verifyEvidenceAttestationSignature,
  type AttestedEvidence,
  type EvidenceClaim,
  type EvidenceClaimDecision,
  type EvidenceCriterion,
  type EvidenceEvaluationRequest,
  type EvidenceRegistryDecision,
  type EvidenceRegistryIssue,
  type ResolvedEvidenceArtifact,
} from "./evidence-registry-contract.ts";
import type {EvidenceControlPlaneSnapshot} from "./evidence-registry-control-plane.ts";

type EvaluatedEvidence = Readonly<{
  verified: boolean;
  blockers: readonly EvidenceRegistryIssue[];
}>;

/** Internal pure evaluator. Production callers only reach it through the control-plane wrapper. */
export function evaluateEvidenceRegistryAgainstControlPlane(
  request: EvidenceEvaluationRequest,
  controlPlane: EvidenceControlPlaneSnapshot,
): EvidenceRegistryDecision {
  const registry = request.registry;
  const globalBlockers: EvidenceRegistryIssue[] = [];
  const nowIsValid = Number.isFinite(controlPlane.nowMs);
  if (!nowIsValid) globalBlockers.push(issue("trusted_clock_invalid"));

  const expectedTrustRegistryFingerprint = fingerprintJson({
    registryVersion: controlPlane.registryVersion,
    roots: controlPlane.roots,
  });
  if (controlPlane.registryFingerprint !== expectedTrustRegistryFingerprint) {
    globalBlockers.push(issue("trust_registry_fingerprint_mismatch"));
  }

  const roots = uniqueIndex(
    controlPlane.roots.map((root) => evidenceTrustRootSchema.parse(root)),
    (root) => root.trustRootId,
    "duplicate_trust_root_id",
    globalBlockers,
  );
  const claims = uniqueIndex(registry.claims, (claim) => claim.claimId, "duplicate_claim_id", globalBlockers);
  const criteria = uniqueIndex(registry.criteria, (criterion) => criterion.criterionId, "duplicate_criterion_id", globalBlockers);
  const evidence = uniqueIndex(registry.evidence, (entry) => entry.evidenceId, "duplicate_evidence_id", globalBlockers);
  const resolved = uniqueIndex(request.resolvedArtifacts, (entry) => entry.evidenceId, "duplicate_resolved_evidence_id", globalBlockers);

  const evaluatedAt = nowIsValid
    ? new Date(controlPlane.nowMs).toISOString()
    : "1970-01-01T00:00:00.000Z";
  if (nowIsValid && new Date(registry.generatedAt).getTime() > controlPlane.nowMs) {
    globalBlockers.push(issue("registry_generated_in_future"));
  }

  for (const criterion of registry.criteria) {
    if (!registry.claims.some((claim) => claim.criterionIds.includes(criterion.criterionId))) {
      globalBlockers.push(issue("criterion_not_bound_to_claim", null, criterion.criterionId));
    }
  }

  const evaluatedEvidence = new Map<string, EvaluatedEvidence>();
  for (const entry of registry.evidence) {
    evaluatedEvidence.set(entry.evidenceId, evaluateEvidence({
      evidence: entry,
      registryScopeFingerprint: evidenceTrustScopeFingerprint(registry.scope),
      claim: claims.get(entry.claimBinding.claimId) ?? null,
      criterion: criteria.get(entry.criterionBinding.criterionId) ?? null,
      resolved: resolved.get(entry.evidenceId) ?? null,
      root: roots.get(entry.trustRootId) ?? null,
      nowMs: controlPlane.nowMs,
      nowIsValid,
    }));
  }

  for (const artifact of request.resolvedArtifacts) {
    if (!evidence.has(artifact.evidenceId)) {
      globalBlockers.push(issue("resolved_artifact_without_evidence", null, null, artifact.evidenceId));
    }
  }

  const claimDecisions = registry.claims.map((claim) => evaluateClaim({
    claim,
    criteria,
    evidence: registry.evidence,
    evaluatedEvidence,
    registryEnvironment: registry.scope.deployment.environment,
  }));
  const blockers = stableIssues([
    ...globalBlockers,
    ...[...evaluatedEvidence.values()].flatMap((entry) => entry.blockers),
    ...claimDecisions.flatMap((entry) => entry.blockers),
  ]);
  const registryValid = blockers.length === 0;
  const verifiedEvidenceIds = [...evaluatedEvidence.entries()]
    .filter(([, result]) => result.verified)
    .map(([evidenceId]) => evidenceId)
    .sort();
  const payload = {
    registryValid,
    allClaimsSupported: registryValid && claimDecisions.length > 0
      && claimDecisions.every((entry) => entry.supported),
    verificationMode: "control_plane" as const,
    evaluatedAt,
    trustRegistryFingerprint: controlPlane.registryFingerprint,
    registryFingerprint: fingerprintJson(registry),
    verifiedEvidenceIds,
    claimDecisions,
    blockers,
  };
  return evidenceRegistryDecisionSchema.parse({
    ...payload,
    decisionFingerprint: fingerprintJson(payload),
  });
}

function evaluateEvidence(input: {
  evidence: AttestedEvidence;
  registryScopeFingerprint: string;
  claim: EvidenceClaim | null;
  criterion: EvidenceCriterion | null;
  resolved: ResolvedEvidenceArtifact | null;
  root: ReturnType<typeof evidenceTrustRootSchema.parse> | null;
  nowMs: number;
  nowIsValid: boolean;
}): EvaluatedEvidence {
  const {evidence, claim, criterion, resolved, root, nowMs, nowIsValid} = input;
  const blockers: EvidenceRegistryIssue[] = [];
  const push = (code: string, claimId = evidence.claimBinding.claimId, criterionId = evidence.criterionBinding.criterionId) => {
    blockers.push(issue(code, claimId, criterionId, evidence.evidenceId));
  };

  if (!nowIsValid) push("trusted_clock_invalid");
  if (!claim) push("evidence_claim_missing");
  if (!criterion) push("evidence_criterion_missing");
  if (claim && !claim.criterionIds.includes(evidence.criterionBinding.criterionId)) push("criterion_not_bound_to_claim");
  if (claim && evidence.claimBinding.claimDefinitionFingerprint !== evidenceClaimDefinitionFingerprint(claim)) {
    push("claim_definition_mismatch");
  }
  if (criterion && evidence.criterionBinding.criterionDefinitionFingerprint !== evidenceCriterionDefinitionFingerprint(criterion)) {
    push("criterion_definition_mismatch");
  }
  if (claim && evidenceSubjectFingerprint(evidence.subject) !== evidenceSubjectFingerprint(claim.subject)) {
    push("evidence_claim_subject_mismatch");
  }
  if (criterion && evidenceSubjectFingerprint(evidence.subject) !== evidenceSubjectFingerprint(criterion.subject)) {
    push("evidence_criterion_subject_mismatch");
  }
  if (evidenceTrustScopeFingerprint(evidence.scope) !== input.registryScopeFingerprint) push("evidence_scope_mismatch");
  if (claim && claim.environment !== evidence.scope.deployment.environment) push("claim_environment_mismatch");
  if (criterion && criterion.environment !== evidence.scope.deployment.environment) push("criterion_environment_mismatch");
  if (criterion && !criterion.acceptedEvidenceTypes.includes(evidence.type)) push("evidence_type_not_accepted");

  if (!root) {
    push("attestation_trust_root_missing");
  } else {
    if (root.issuer !== evidence.issuer) push("attestation_issuer_mismatch");
    if (root.keyId !== evidence.keyId || root.algorithm !== evidence.algorithm) push("attestation_key_mismatch");
    if (!root.permittedTrustDomains.includes(evidence.scope.trustDomain)) push("attestation_trust_domain_not_permitted");
    if (!root.permittedTenantIds.includes(evidence.scope.tenant.tenantId)) push("attestation_tenant_not_permitted");
    if (!root.permittedDeploymentIds.includes(evidence.scope.deployment.deploymentId)) push("attestation_deployment_not_permitted");
    if (!root.permittedEvidenceTypes.includes(evidence.type)) push("attestation_evidence_type_not_permitted");
    const rootFrom = new Date(root.validFrom).getTime();
    const rootThrough = new Date(root.validThrough).getTime();
    const issuedAt = new Date(evidence.issuedAt).getTime();
    if (rootThrough <= rootFrom) push("attestation_trust_root_validity_window_invalid");
    if (root.revokedAt && nowIsValid && new Date(root.revokedAt).getTime() <= nowMs) push("attestation_trust_root_revoked");
    if (nowIsValid && (rootFrom > nowMs || rootThrough <= nowMs)) push("attestation_trust_root_not_current");
    if (issuedAt < rootFrom || issuedAt >= rootThrough) push("attestation_issued_outside_trust_root_window");
    if (!verifyEvidenceAttestationSignature(evidence, root.publicKeyPem)) push("attestation_signature_invalid");
  }

  const issuedAt = new Date(evidence.issuedAt).getTime();
  const expiresAt = new Date(evidence.expiresAt).getTime();
  if (expiresAt <= issuedAt) push("evidence_validity_window_invalid");
  if (nowIsValid && issuedAt > nowMs) push("evidence_issued_in_future");
  if (nowIsValid && expiresAt <= nowMs) push("evidence_expired");
  if (criterion) {
    if ((expiresAt - issuedAt) / 1_000 > criterion.freshness.maxTtlSeconds) push("criterion_ttl_exceeded");
    if (nowIsValid && (nowMs - issuedAt) / 1_000 > criterion.freshness.maxAgeSeconds) push("criterion_max_age_exceeded");
    if (criterion.gate) {
      if (!evidence.gate || evidence.gate.gateId !== criterion.gate.gateId
        || evidence.gate.result !== criterion.gate.requiredResult) push("evidence_gate_mismatch");
    }
  }
  if ((evidence.subject.kind === "capability" || evidence.subject.kind === "release") && !criterion?.gate) {
    push("promotable_subject_requires_gate");
  }

  if (!resolved) {
    push("evidence_artifact_unresolved");
  } else {
    if (resolved.immutableRef !== evidence.artifact.immutableRef) push("evidence_artifact_reference_mismatch");
    if (sha256EvidenceBytes(resolved.bytes) !== evidence.artifact.contentSha256) push("evidence_artifact_content_mismatch");
  }

  const stable = stableIssues(blockers);
  return {verified: stable.length === 0, blockers: stable};
}

function evaluateClaim(input: {
  claim: EvidenceClaim;
  criteria: Map<string, EvidenceCriterion>;
  evidence: AttestedEvidence[];
  evaluatedEvidence: Map<string, EvaluatedEvidence>;
  registryEnvironment: string;
}): EvidenceClaimDecision {
  const blockers: EvidenceRegistryIssue[] = [];
  let supportedCriteria = 0;
  if (input.claim.environment !== input.registryEnvironment) {
    blockers.push(issue("claim_environment_mismatch", input.claim.claimId));
  }
  for (const criterionId of input.claim.criterionIds) {
    const criterion = input.criteria.get(criterionId);
    if (!criterion) {
      blockers.push(issue("criterion_missing", input.claim.claimId, criterionId));
      continue;
    }
    if (evidenceSubjectFingerprint(criterion.subject) !== evidenceSubjectFingerprint(input.claim.subject)) {
      blockers.push(issue("criterion_subject_mismatch", input.claim.claimId, criterionId));
      continue;
    }
    if (criterion.environment !== input.claim.environment) {
      blockers.push(issue("criterion_environment_mismatch", input.claim.claimId, criterionId));
      continue;
    }
    const accepted = input.evidence.filter((entry) =>
      entry.claimBinding.claimId === input.claim.claimId
      && entry.criterionBinding.criterionId === criterionId
      && input.evaluatedEvidence.get(entry.evidenceId)?.verified === true);
    if (accepted.length < criterion.minimumEvidenceCount) {
      blockers.push(issue("criterion_minimum_evidence_not_met", input.claim.claimId, criterionId));
    } else {
      supportedCriteria += 1;
    }
  }
  const stable = stableIssues(blockers);
  return {
    claimId: input.claim.claimId,
    supported: stable.length === 0 && supportedCriteria === input.claim.criterionIds.length,
    supportedCriteria,
    totalCriteria: input.claim.criterionIds.length,
    blockers: stable,
  };
}

export function invalidEvidenceRegistryDecision(
  input: unknown,
  controlPlane: EvidenceControlPlaneSnapshot,
  code = "invalid_evaluation_request",
): EvidenceRegistryDecision {
  const nowIsValid = Number.isFinite(controlPlane.nowMs);
  const payload = {
    registryValid: false,
    allClaimsSupported: false,
    verificationMode: "control_plane" as const,
    evaluatedAt: nowIsValid ? new Date(controlPlane.nowMs).toISOString() : "1970-01-01T00:00:00.000Z",
    trustRegistryFingerprint: controlPlane.registryFingerprint,
    registryFingerprint: fingerprintJson(input),
    verifiedEvidenceIds: [],
    claimDecisions: [],
    blockers: [issue(code)],
  };
  return evidenceRegistryDecisionSchema.parse({...payload, decisionFingerprint: fingerprintJson(payload)});
}

function issue(
  code: string,
  claimId: string | null = null,
  criterionId: string | null = null,
  evidenceId: string | null = null,
): EvidenceRegistryIssue {
  return {code, claimId, criterionId, evidenceId};
}

function uniqueIndex<T>(
  values: readonly T[],
  key: (value: T) => string,
  duplicateCode: string,
  blockers: EvidenceRegistryIssue[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) blockers.push(issue(duplicateCode));
    result.set(id, value);
  }
  return result;
}

function stableIssues(values: readonly EvidenceRegistryIssue[]): EvidenceRegistryIssue[] {
  return [...new Map(values
    .map((entry) => [stableJson(entry), entry] as const)
    .sort(([left], [right]) => left.localeCompare(right))).values()];
}
