import {createHash, generateKeyPairSync, sign} from "node:crypto";
import {fingerprintJson} from "@offroad/case-understanding";
import {describe, expect, it} from "vitest";
import {
  evidenceAttestationSigningPayload,
  evidenceClaimDefinitionFingerprint,
  evidenceCriterionDefinitionFingerprint,
  evaluateEvidenceRegistry,
  sha256EvidenceBytes,
  verifyEvidenceAttestationSignature,
  type AttestedEvidence,
  type EvidenceClaim,
  type EvidenceCriterion,
  type EvidenceEvaluationRequest,
  type EvidenceSubject,
  type EvidenceTrustRoot,
  type EvidenceTrustScope,
} from "./evidence-registry.ts";
import type {EvidenceControlPlaneSnapshot} from "./evidence-registry-control-plane.ts";
import {evaluateEvidenceRegistryAgainstControlPlane} from "./evidence-registry-evaluator.internal.ts";

const fixedNow = new Date("2026-09-07T16:00:00.000Z").getTime();
const revision = "a".repeat(40);
const artifactBytes = new TextEncoder().encode("signed CI result for an exact capability gate\n");
const artifactSha256 = sha256EvidenceBytes(artifactBytes);
const {privateKey, publicKey} = generateKeyPairSync("ed25519");

const subject: EvidenceSubject = {
  kind: "capability",
  id: "intent.semantic-envelope-shadow",
  catalogue: "capability_ledger",
  catalogueRevision: revision,
};

const scope: EvidenceTrustScope = {
  trustDomain: "offroad.release-governance",
  tenant: {tenantKind: "organization", tenantId: "org-cedro", projectId: "project-camil"},
  deployment: {
    environment: "ci",
    deploymentId: "github-run-34096964058",
    accountId: "github:carlosevg100/offroad",
    region: "global",
  },
};

const criterion: EvidenceCriterion = {
  criterionId: "CRT-RT01-INTENT-GATE",
  subject,
  description: "The exact canonical intent gate passed for the exact capability revision.",
  environment: "ci",
  acceptedEvidenceTypes: ["ci_run"],
  minimumEvidenceCount: 1,
  freshness: {maxAgeSeconds: 86_400, maxTtlSeconds: 86_400},
  gate: {gateId: "intent-router-gold", requiredResult: "passed"},
};

const claim: EvidenceClaim = {
  claimId: "CLM-RT01-INTENT-TESTED",
  subject,
  statement: "The canonical intent envelope passed its bounded semantic gate.",
  environment: "ci",
  criterionIds: [criterion.criterionId],
};

const root: EvidenceTrustRoot = {
  trustRootId: "ATR-TEST-CI-ROOT",
  issuer: "Offroad test control plane",
  keyId: "test-ci-ed25519",
  algorithm: "Ed25519",
  publicKeyPem: publicKey.export({type: "spki", format: "pem"}).toString(),
  permittedTrustDomains: [scope.trustDomain],
  permittedTenantIds: [scope.tenant.tenantId],
  permittedDeploymentIds: [scope.deployment.deploymentId],
  permittedEvidenceTypes: ["ci_run"],
  validFrom: "2026-01-01T00:00:00.000Z",
  validThrough: "2027-01-01T00:00:00.000Z",
  revokedAt: null,
};

function signEvidence(overrides: Partial<Omit<AttestedEvidence, "detachedSignature">> = {}): AttestedEvidence {
  const unsigned: Omit<AttestedEvidence, "detachedSignature"> = {
    schemaVersion: "offroad-acceptance-evidence.v1",
    evidenceId: "EVR-RT01-CI-001",
    type: "ci_run",
    subject,
    scope: structuredClone(scope),
    claimBinding: {
      claimId: claim.claimId,
      claimDefinitionFingerprint: evidenceClaimDefinitionFingerprint(claim),
    },
    criterionBinding: {
      criterionId: criterion.criterionId,
      criterionDefinitionFingerprint: evidenceCriterionDefinitionFingerprint(criterion),
    },
    artifact: {
      immutableRef: `artifact://sha256/${artifactSha256}`,
      contentSha256: artifactSha256,
    },
    collector: {principal: "github-actions:intent-gate", method: "signed-run", version: "1.0.0"},
    gate: {gateId: "intent-router-gold", result: "passed"},
    issuedAt: "2026-09-07T14:00:00.000Z",
    expiresAt: "2026-09-08T14:00:00.000Z",
    trustRootId: root.trustRootId,
    issuer: root.issuer,
    keyId: root.keyId,
    algorithm: "Ed25519",
    ...overrides,
  };
  return {
    ...unsigned,
    detachedSignature: sign(null, evidenceAttestationSigningPayload(unsigned), privateKey).toString("base64"),
  };
}

function request(evidence = signEvidence()): EvidenceEvaluationRequest {
  return {
    registry: {
      registryVersion: "ctrl03-test-v1",
      generatedAt: "2026-09-07T13:00:00.000Z",
      scope: structuredClone(scope),
      criteria: [criterion],
      claims: [claim],
      evidence: [evidence],
      limitations: ["Synthetic security fixture; never production evidence."],
    },
    resolvedArtifacts: [{evidenceId: evidence.evidenceId, immutableRef: evidence.artifact.immutableRef, bytes: artifactBytes}],
  };
}

function testControlPlane(nowMs = fixedNow): EvidenceControlPlaneSnapshot {
  const body = {registryVersion: "test-control-plane-v1", roots: [root]};
  return {...body, registryFingerprint: fingerprintJson(body), nowMs};
}

describe("control-plane-owned acceptance evidence", () => {
  it("accepts an exact signed binding only in the internal control-plane evaluator", () => {
    const input = request();
    const decision = evaluateEvidenceRegistryAgainstControlPlane(input, testControlPlane());
    expect(decision).toMatchObject({
      registryValid: true,
      allClaimsSupported: true,
      verifiedEvidenceIds: ["EVR-RT01-CI-001"],
      blockers: [],
    });
    expect(verifyEvidenceAttestationSignature(input.registry.evidence[0]!, root.publicKeyPem)).toBe(true);
  });

  it("does not accept caller-injected roots, verifier labels or clocks", () => {
    const exactPublicDecision = evaluateEvidenceRegistry(request());
    expect(exactPublicDecision.registryValid).toBe(false);
    expect(exactPublicDecision.blockers).toContainEqual(expect.objectContaining({code: "attestation_trust_root_missing"}));

    const injected = evaluateEvidenceRegistry({
      ...request(),
      trustedRoots: [root],
      verifier: {principal: "attacker:verifier"},
      now: "2026-09-07T16:00:00.000Z",
    });
    expect(injected).toMatchObject({
      registryValid: false,
      allClaimsSupported: false,
      blockers: [expect.objectContaining({code: "invalid_evaluation_request"})],
    });
  });

  it.each([
    ["claim", (input: EvidenceEvaluationRequest) => { input.registry.claims[0]!.statement = "Offroad is SOC 2 Type II certified."; }, "claim_definition_mismatch"],
    ["criterion", (input: EvidenceEvaluationRequest) => { input.registry.criteria[0]!.description = "A materially different acceptance criterion."; }, "criterion_definition_mismatch"],
    ["subject", (input: EvidenceEvaluationRequest) => {
      input.registry.claims[0]!.subject = {...subject, id: "trust.enterprise-assurance"};
      input.registry.criteria[0]!.subject = {...subject, id: "trust.enterprise-assurance"};
    }, "evidence_claim_subject_mismatch"],
  ] as const)("rejects %s substitution under the original signature", (_label, mutate, blocker) => {
    const input = structuredClone(request());
    mutate(input);
    const decision = evaluateEvidenceRegistryAgainstControlPlane(input, testControlPlane());
    expect(decision.registryValid).toBe(false);
    expect(decision.blockers).toContainEqual(expect.objectContaining({code: blocker}));
  });

  it.each([
    ["tenant", (input: EvidenceEvaluationRequest) => { input.registry.scope.tenant.tenantId = "org-other"; }],
    ["project", (input: EvidenceEvaluationRequest) => { input.registry.scope.tenant.projectId = "project-other"; }],
    ["deployment", (input: EvidenceEvaluationRequest) => { input.registry.scope.deployment.deploymentId = "github-run-other"; }],
    ["account", (input: EvidenceEvaluationRequest) => { input.registry.scope.deployment.accountId = "github:other/repo"; }],
    ["region", (input: EvidenceEvaluationRequest) => { input.registry.scope.deployment.region = "us-east-1"; }],
    ["trust domain", (input: EvidenceEvaluationRequest) => { input.registry.scope.trustDomain = "other.trust-domain"; }],
  ])("rejects cross-scope replay into another %s", (_label, mutate) => {
    const input = structuredClone(request());
    mutate(input);
    const decision = evaluateEvidenceRegistryAgainstControlPlane(input, testControlPlane());
    expect(decision.registryValid).toBe(false);
    expect(decision.blockers).toContainEqual(expect.objectContaining({code: "evidence_scope_mismatch"}));
  });

  it("rejects a rewritten binding even when the claim definition now matches", () => {
    const input = structuredClone(request());
    input.registry.claims[0]!.statement = "A substituted claim.";
    input.registry.evidence[0]!.claimBinding.claimDefinitionFingerprint =
      evidenceClaimDefinitionFingerprint(input.registry.claims[0]!);
    const decision = evaluateEvidenceRegistryAgainstControlPlane(input, testControlPlane());
    expect(decision.blockers).toContainEqual(expect.objectContaining({code: "attestation_signature_invalid"}));
  });

  it("uses the internal clock and rejects expired evidence despite a caller backdating attempt", () => {
    const expired = signEvidence({
      issuedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
    });
    const internal = evaluateEvidenceRegistryAgainstControlPlane(request(expired), testControlPlane());
    expect(internal.registryValid).toBe(false);
    expect(internal.blockers).toContainEqual(expect.objectContaining({code: "evidence_expired"}));

    const publicAttempt = evaluateEvidenceRegistry({...request(expired), now: "2020-01-01T12:00:00.000Z"});
    expect(publicAttempt.blockers).toEqual([expect.objectContaining({code: "invalid_evaluation_request"})]);
  });

  it("fails closed if the internal control-plane clock is invalid", () => {
    const decision = evaluateEvidenceRegistryAgainstControlPlane(request(), testControlPlane(Number.NaN));
    expect(decision.registryValid).toBe(false);
    expect(decision.blockers).toContainEqual(expect.objectContaining({code: "trusted_clock_invalid"}));
    expect(decision.verifiedEvidenceIds).toEqual([]);
  });

  it("rejects cross-artifact replay and changed artifact bytes", () => {
    const wrongReference = structuredClone(request());
    const otherDigest = createHash("sha256").update("other").digest("hex");
    wrongReference.resolvedArtifacts[0]!.immutableRef = `artifact://sha256/${otherDigest}`;
    expect(evaluateEvidenceRegistryAgainstControlPlane(wrongReference, testControlPlane()).blockers)
      .toContainEqual(expect.objectContaining({code: "evidence_artifact_reference_mismatch"}));

    const wrongBytes = structuredClone(request());
    wrongBytes.resolvedArtifacts[0]!.bytes = new TextEncoder().encode("tampered");
    expect(evaluateEvidenceRegistryAgainstControlPlane(wrongBytes, testControlPlane()).blockers)
      .toContainEqual(expect.objectContaining({code: "evidence_artifact_content_mismatch"}));
  });
});
