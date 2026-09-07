import {createHash} from "node:crypto";
import {fingerprintJson, stableJson} from "@offroad/case-understanding";
import {
  evidenceAcceptanceManifestSchema,
  evidenceAttestationFingerprint,
  evidenceClaimDefinitionFingerprint,
  evidenceCriterionDefinitionFingerprint,
  evidenceIngestReceiptSchema,
  evidenceRegistryDecisionSchema,
  evidenceSubjectFingerprint,
  evidenceTrustRootSchema,
  evidenceTrustScopeFingerprint,
  sha256EvidenceBytes,
  verifyAttestationCryptographicSignatureOnly,
  type EvidenceAcceptanceManifest,
  type AttestedEvidence,
  type EvidenceClaim,
  type EvidenceClaimDecision,
  type EvidenceCriterion,
  type EvidenceEvaluationRequest,
  type EvidenceIngestReceipt,
  type EvidenceRegistryDecision,
  type EvidenceRegistryIssue,
  type ResolvedEvidenceArtifact,
} from "./evidence-registry-contract.ts";
import type {EvidenceControlPlaneSnapshot} from "./evidence-registry-control-plane.ts";

type EvaluatedEvidence = Readonly<{
  verified: boolean;
  blockers: readonly EvidenceRegistryIssue[];
  promotionPrecondition: Readonly<{
    receiptId: string;
    evidenceId: string;
    expectedCasRevision: number;
    nonce: string;
  }> | null;
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
    manifests: controlPlane.manifests,
    receipts: controlPlane.receipts,
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
  const manifests = uniqueIndex(
    controlPlane.manifests.map((manifest) => evidenceAcceptanceManifestSchema.parse(manifest)),
    (manifest) => manifest.manifestId,
    "duplicate_acceptance_manifest_id",
    globalBlockers,
  );
  const receipts = uniqueIndex(
    controlPlane.receipts.map((receipt) => evidenceIngestReceiptSchema.parse(receipt)),
    (receipt) => receipt.evidenceId,
    "duplicate_evidence_receipt",
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

  const manifest = resolveAcceptanceManifest(registry, [...manifests.values()], globalBlockers);
  const registryFingerprint = fingerprintJson(registry);

  const nonceOwners = new Map<string, string>();
  const receiptIdOwners = new Map<string, string>();
  for (const receipt of controlPlane.receipts) {
    const previous = nonceOwners.get(receipt.nonce);
    if (previous && previous !== receipt.evidenceId) globalBlockers.push(issue("receipt_nonce_reused", null, null, receipt.evidenceId));
    nonceOwners.set(receipt.nonce, receipt.evidenceId);
    const previousReceipt = receiptIdOwners.get(receipt.receiptId);
    if (previousReceipt && previousReceipt !== receipt.evidenceId) {
      globalBlockers.push(issue("receipt_id_reused", null, null, receipt.evidenceId));
    }
    receiptIdOwners.set(receipt.receiptId, receipt.evidenceId);
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
      receipt: receipts.get(entry.evidenceId) ?? null,
      manifest,
      registryFingerprint,
      nowMs: controlPlane.nowMs,
      nowIsValid,
    }));
  }

  for (const artifact of request.resolvedArtifacts) {
    if (!evidence.has(artifact.evidenceId)) {
      globalBlockers.push(issue("resolved_artifact_without_evidence", null, null, artifact.evidenceId));
    }
  }

  let claimDecisions = registry.claims.map((claim) => evaluateClaim({
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
  let verifiedEvidenceIds = [...evaluatedEvidence.entries()]
    .filter(([, result]) => result.verified)
    .map(([evidenceId]) => evidenceId)
    .sort();
  let promotionPreconditions = [...evaluatedEvidence.values()]
    .flatMap((entry) => entry.promotionPrecondition ? [entry.promotionPrecondition] : [])
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  if (!registryValid) {
    verifiedEvidenceIds = [];
    promotionPreconditions = [];
    claimDecisions = claimDecisions.map((decision) => ({
      ...decision,
      supported: false,
      supportedCriteria: 0,
    }));
  }
  const payload = {
    registryValid,
    allClaimsSupported: registryValid && claimDecisions.length > 0
      && claimDecisions.every((entry) => entry.supported),
    verificationMode: "control_plane" as const,
    evaluatedAt,
    trustRegistryFingerprint: controlPlane.registryFingerprint,
    registryFingerprint,
    verifiedEvidenceIds,
    promotionPreconditions,
    promotionTarget: registryValid ? manifest?.promotionTarget ?? null : null,
    claimDecisions,
    blockers,
  };
  return evidenceRegistryDecisionSchema.parse({
    ...payload,
    decisionFingerprint: fingerprintJson(payload),
  });
}

function resolveAcceptanceManifest(
  registry: EvidenceEvaluationRequest["registry"],
  manifests: EvidenceAcceptanceManifest[],
  blockers: EvidenceRegistryIssue[],
): EvidenceAcceptanceManifest | null {
  const matches = manifests.filter((candidate) =>
    candidate.registryVersion === registry.registryVersion
    && evidenceTrustScopeFingerprint(candidate.scope) === evidenceTrustScopeFingerprint(registry.scope));
  if (matches.length === 0) {
    blockers.push(issue("acceptance_manifest_missing"));
    return null;
  }
  if (matches.length > 1) {
    blockers.push(issue("acceptance_manifest_ambiguous"));
    return null;
  }
  const manifest = matches[0]!;
  if (fingerprintJson(manifest.claims) !== fingerprintJson(registry.claims)) {
    blockers.push(issue("registry_claims_not_control_plane_canonical"));
  }
  if (fingerprintJson(manifest.criteria) !== fingerprintJson(registry.criteria)) {
    blockers.push(issue("registry_criteria_not_control_plane_canonical"));
  }
  if (fingerprintJson(manifest.limitations) !== fingerprintJson(registry.limitations)) {
    blockers.push(issue("registry_limitations_not_control_plane_canonical"));
  }
  if (evidenceTrustScopeFingerprint(manifest.promotionTarget.scope)
    !== evidenceTrustScopeFingerprint(manifest.scope)) {
    blockers.push(issue("promotion_target_scope_mismatch"));
  }
  if (manifest.claims.some((claim) =>
    evidenceSubjectFingerprint(claim.subject) !== evidenceSubjectFingerprint(manifest.promotionTarget.subject))) {
    blockers.push(issue("promotion_target_claim_subject_mismatch"));
  }
  if (manifest.criteria.some((criterion) =>
    evidenceSubjectFingerprint(criterion.subject) !== evidenceSubjectFingerprint(manifest.promotionTarget.subject))) {
    blockers.push(issue("promotion_target_criterion_subject_mismatch"));
  }
  if (manifest.criteria.some((criterion) => !criterion.gate
    || criterion.gate.gateId !== manifest.promotionTarget.gate.gateId
    || criterion.gate.requiredResult !== manifest.promotionTarget.gate.result)) {
    blockers.push(issue("promotion_target_gate_mismatch"));
  }
  return manifest;
}

function evaluateEvidence(input: {
  evidence: AttestedEvidence;
  registryScopeFingerprint: string;
  claim: EvidenceClaim | null;
  criterion: EvidenceCriterion | null;
  resolved: ResolvedEvidenceArtifact | null;
  root: ReturnType<typeof evidenceTrustRootSchema.parse> | null;
  receipt: EvidenceIngestReceipt | null;
  manifest: EvidenceAcceptanceManifest | null;
  registryFingerprint: string;
  nowMs: number;
  nowIsValid: boolean;
}): EvaluatedEvidence {
  const {evidence, claim, criterion, resolved, root, receipt, manifest, nowMs, nowIsValid} = input;
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
  if (manifest && !manifest.trustRootIds.includes(evidence.trustRootId)) push("trust_root_not_authorized_by_manifest");

  if (!root) {
    push("attestation_trust_root_missing");
  } else {
    if (root.issuer !== evidence.issuer) push("attestation_issuer_mismatch");
    if (root.keyId !== evidence.keyId || root.algorithm !== evidence.algorithm) push("attestation_key_mismatch");
    if (evidenceTrustScopeFingerprint(root.scope) !== evidenceTrustScopeFingerprint(evidence.scope)) push("attestation_scope_not_permitted");
    if (evidenceSubjectFingerprint(root.subject) !== evidenceSubjectFingerprint(evidence.subject)) push("attestation_subject_not_permitted");
    if (stableJson(root.claimBinding) !== stableJson(evidence.claimBinding)) push("attestation_claim_not_permitted");
    if (stableJson(root.criterionBinding) !== stableJson(evidence.criterionBinding)) push("attestation_criterion_not_permitted");
    if (root.evidenceType !== evidence.type) push("attestation_evidence_type_not_permitted");
    if (stableJson(root.collector) !== stableJson(evidence.collector)) push("attestation_collector_not_permitted");
    if (stableJson(root.gate) !== stableJson(evidence.gate)) push("attestation_gate_not_permitted");
    if (stableJson(root.workloadIdentity) !== stableJson(evidence.runBinding.workloadIdentity)) push("attestation_workload_identity_not_permitted");
    if (!evidence.artifact.immutableRef.startsWith(root.artifactNamespace)) push("attestation_artifact_namespace_not_permitted");
    const rootFrom = new Date(root.validFrom).getTime();
    const rootThrough = new Date(root.validThrough).getTime();
    const issuedAt = new Date(evidence.issuedAt).getTime();
    const expiresAt = new Date(evidence.expiresAt).getTime();
    if (rootThrough <= rootFrom) push("attestation_trust_root_validity_window_invalid");
    const revokedAt = root.revokedAt ? new Date(root.revokedAt).getTime() : null;
    if (revokedAt !== null && ((nowIsValid && revokedAt <= nowMs) || issuedAt >= revokedAt)) push("attestation_trust_root_revoked");
    if (nowIsValid && (rootFrom > nowMs || rootThrough <= nowMs)) push("attestation_trust_root_not_current");
    if (issuedAt < rootFrom || issuedAt >= rootThrough) push("attestation_issued_outside_trust_root_window");
    if ((expiresAt - issuedAt) / 1_000 > root.freshness.maxAttestationTtlSeconds) push("root_attestation_ttl_exceeded");
    if (!verifyAttestationCryptographicSignatureOnly(evidence, root.publicKeyPem)) push("attestation_signature_invalid");
  }

  const issuedAt = new Date(evidence.issuedAt).getTime();
  const expiresAt = new Date(evidence.expiresAt).getTime();
  if (expiresAt <= issuedAt) push("evidence_validity_window_invalid");
  if (nowIsValid && issuedAt > nowMs) push("evidence_issued_in_future");
  if (nowIsValid && expiresAt <= nowMs) push("evidence_expired");
  if (criterion) {
    if ((expiresAt - issuedAt) / 1_000 > criterion.freshness.maxTtlSeconds) push("criterion_ttl_exceeded");
    if (criterion.gate) {
      if (!evidence.gate || evidence.gate.gateId !== criterion.gate.gateId
        || evidence.gate.result !== criterion.gate.requiredResult) push("evidence_gate_mismatch");
    }
  }
  if ((evidence.subject.kind === "capability" || evidence.subject.kind === "release") && !criterion?.gate) {
    push("promotable_subject_requires_gate");
  }

  if (!receipt) {
    push("control_plane_receipt_missing");
  } else {
    const receivedAt = new Date(receipt.receivedAt).getTime();
    if (receipt.registryFingerprint !== input.registryFingerprint) push("receipt_registry_fingerprint_mismatch");
    if (receipt.attestationFingerprint !== evidenceAttestationFingerprint(evidence)) push("receipt_attestation_fingerprint_mismatch");
    if (stableJson(receipt.artifact) !== stableJson(evidence.artifact)) push("receipt_artifact_mismatch");
    if (stableJson(receipt.runBinding) !== stableJson(evidence.runBinding)) push("receipt_run_binding_mismatch");
    if (receipt.nonce !== evidence.nonce) push("receipt_nonce_mismatch");
    if (receipt.state !== "available") push("receipt_already_consumed");
    if (nowIsValid && receivedAt > nowMs + ((root?.freshness.clockSkewSeconds ?? 0) * 1_000)) push("receipt_received_in_future");
    if (root) {
      const skewMs = root.freshness.clockSkewSeconds * 1_000;
      if (issuedAt > receivedAt + skewMs) push("evidence_issued_after_receipt");
      if (receivedAt - issuedAt > (root.freshness.maxIssuanceToReceiptSeconds * 1_000) + skewMs) {
        push("evidence_receipt_delay_exceeded");
      }
      if (nowIsValid && nowMs - receivedAt > (root.freshness.maxReceiptAgeSeconds * 1_000) + skewMs) {
        push("root_receipt_max_age_exceeded");
      }
      if (criterion && nowIsValid && nowMs - receivedAt > (criterion.freshness.maxAgeSeconds * 1_000) + skewMs) {
        push("criterion_max_age_exceeded");
      }
    }
  }

  if (!resolved) {
    push("evidence_artifact_unresolved");
  } else {
    if (resolved.immutableRef !== evidence.artifact.immutableRef) push("evidence_artifact_reference_mismatch");
    if (sha256EvidenceBytes(resolved.bytes) !== evidence.artifact.contentSha256) push("evidence_artifact_content_mismatch");
  }

  const stable = stableIssues(blockers);
  return {
    verified: stable.length === 0,
    blockers: stable,
    promotionPrecondition: stable.length === 0 && receipt ? {
      receiptId: receipt.receiptId,
      evidenceId: receipt.evidenceId,
      expectedCasRevision: receipt.casRevision,
      nonce: receipt.nonce,
    } : null,
  };
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
    registryFingerprint: safeUnknownFingerprint(input),
    verifiedEvidenceIds: [],
    promotionPreconditions: [],
    promotionTarget: null,
    claimDecisions: [],
    blockers: [issue(code)],
  };
  return evidenceRegistryDecisionSchema.parse({...payload, decisionFingerprint: fingerprintJson(payload)});
}

function safeUnknownFingerprint(input: unknown): string {
  try {
    return fingerprintJson(input);
  } catch {
    try {
      const seen = new WeakMap<object, string>();
      const normalize = (value: unknown, path: string): unknown => {
        if (typeof value === "bigint") return {$type: "bigint", value: value.toString()};
        if (typeof value === "undefined") return {$type: "undefined"};
        if (typeof value === "number" && !Number.isFinite(value)) return {$type: "number", value: String(value)};
        if (typeof value === "symbol") return {$type: "symbol", value: String(value.description ?? "")};
        if (typeof value === "function") return {$type: "function"};
        if (!value || typeof value !== "object") return value;
        const previous = seen.get(value);
        if (previous) return {$ref: previous};
        seen.set(value, path);
        if (Array.isArray(value)) return value.map((entry, index) => normalize(entry, `${path}/${index}`));
        const output: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
          try {
            output[key] = normalize((value as Record<string, unknown>)[key], `${path}/${key}`);
          } catch {
            output[key] = {$type: "unreadable"};
          }
        }
        return output;
      };
      return fingerprintJson(normalize(input, "$"));
    } catch {
      return createHash("sha256").update("offroad:invalid-unfingerprintable-input:v1").digest("hex");
    }
  }
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
