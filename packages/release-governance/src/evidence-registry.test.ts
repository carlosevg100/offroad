import {generateKeyPairSync, sign} from "node:crypto";
import {fingerprintJson} from "@offroad/case-understanding";
import {describe, expect, it} from "vitest";
import {
  evidenceAttestationFingerprint,
  evidenceAttestationSigningPayload,
  evidenceClaimDefinitionFingerprint,
  evidenceCriterionDefinitionFingerprint,
  evaluateEvidenceRegistry,
  sha256EvidenceBytes,
  type AttestedEvidence,
  type EvidenceAcceptanceManifest,
  type EvidenceClaim,
  type EvidenceCriterion,
  type EvidenceEvaluationRequest,
  type EvidenceIngestReceipt,
  type EvidencePromotionTarget,
  type EvidenceSubject,
  type EvidenceTrustRoot,
  type EvidenceTrustScope,
} from "./evidence-registry.ts";
import {
  consumePersistedEvidenceDecisionForPromotion,
  persistEvidenceDecisionForPromotion,
  type AuthoritativeEvidencePromotionDecision,
  type EvidenceControlPlaneSnapshot,
  type EvidencePromotionAuthorityStore,
} from "./evidence-registry-control-plane.ts";
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

const workloadIdentity = {
  oidcIssuer: "https://token.actions.githubusercontent.com",
  audience: "sts.amazonaws.com",
  repository: "carlosevg100/offroad",
  workflowRef: ".github/workflows/intent-router-gold.yml@refs/heads/main",
  gitRef: "refs/heads/main",
};

const runBinding = {runId: "github-run-34096964058", runAttempt: 1, workloadIdentity};
const collector = {principal: "github-actions:intent-gate", method: "signed-run", version: "1.0.0"};
const gate = {gateId: "intent-router-gold", result: "passed"} as const;

const root: EvidenceTrustRoot = {
  trustRootId: "ATR-TEST-CI-ROOT",
  issuer: "Offroad test control plane",
  keyId: "test-ci-ed25519",
  algorithm: "Ed25519",
  publicKeyPem: publicKey.export({type: "spki", format: "pem"}).toString(),
  purpose: "acceptance_evidence",
  scope,
  subject,
  claimBinding: {claimId: claim.claimId, claimDefinitionFingerprint: evidenceClaimDefinitionFingerprint(claim)},
  criterionBinding: {
    criterionId: criterion.criterionId,
    criterionDefinitionFingerprint: evidenceCriterionDefinitionFingerprint(criterion),
  },
  evidenceType: "ci_run",
  collector,
  gate,
  workloadIdentity,
  artifactNamespace: "artifact://sha256/",
  freshness: {
    maxAttestationTtlSeconds: 86_400,
    maxIssuanceToReceiptSeconds: 7_200,
    maxReceiptAgeSeconds: 86_400,
    clockSkewSeconds: 30,
  },
  validFrom: "2026-01-01T00:00:00.000Z",
  validThrough: "2027-01-01T00:00:00.000Z",
  revokedAt: null,
};

const limitations = ["Synthetic security fixture; never production evidence."];
const promotionTarget: EvidencePromotionTarget = {
  subject,
  scope,
  gate,
  transition: {
    resourceKind: "capability",
    resourceId: subject.id,
    fromState: "shadow",
    toState: "tested",
  },
};
const manifest: EvidenceAcceptanceManifest = {
  manifestId: "EAM-RT01-TEST",
  manifestVersion: "1",
  registryVersion: "ctrl03-test-v1",
  scope,
  criteria: [criterion],
  claims: [claim],
  limitations,
  promotionTarget,
  trustRootIds: [root.trustRootId],
};

function signEvidence(overrides: Partial<Omit<AttestedEvidence, "detachedSignature">> = {}): AttestedEvidence {
  const unsigned: Omit<AttestedEvidence, "detachedSignature"> = {
    schemaVersion: "offroad-acceptance-evidence.v1",
    evidenceId: "EVR-RT01-CI-001",
    type: "ci_run",
    subject,
    scope: structuredClone(scope),
    claimBinding: structuredClone(root.claimBinding),
    criterionBinding: structuredClone(root.criterionBinding),
    artifact: {immutableRef: `artifact://sha256/${artifactSha256}`, contentSha256: artifactSha256},
    collector,
    gate,
    runBinding,
    nonce: "nonce-rt01-ci-00000001",
    issuedAt: "2026-09-07T14:00:00.000Z",
    expiresAt: "2026-09-08T14:00:00.000Z",
    trustRootId: root.trustRootId,
    issuer: root.issuer,
    keyId: root.keyId,
    algorithm: "Ed25519",
    ...overrides,
  };
  return {...unsigned, detachedSignature: sign(null, evidenceAttestationSigningPayload(unsigned), privateKey).toString("base64")};
}

function request(evidence = signEvidence()): EvidenceEvaluationRequest {
  return {
    registry: {
      registryVersion: manifest.registryVersion,
      generatedAt: "2026-09-07T13:00:00.000Z",
      scope: structuredClone(scope),
      criteria: [structuredClone(criterion)],
      claims: [structuredClone(claim)],
      evidence: [evidence],
      limitations: [...limitations],
    },
    resolvedArtifacts: [{evidenceId: evidence.evidenceId, immutableRef: evidence.artifact.immutableRef, bytes: artifactBytes}],
  };
}

function receiptFor(input: EvidenceEvaluationRequest, overrides: Partial<EvidenceIngestReceipt> = {}): EvidenceIngestReceipt {
  const evidence = input.registry.evidence[0]!;
  return {
    schemaVersion: "offroad-evidence-receipt.v1",
    receiptId: "ERC-RT01-CI-001",
    evidenceId: evidence.evidenceId,
    registryFingerprint: fingerprintJson(input.registry),
    attestationFingerprint: evidenceAttestationFingerprint(evidence),
    artifact: structuredClone(evidence.artifact),
    receivedAt: "2026-09-07T15:00:00.000Z",
    runBinding: structuredClone(evidence.runBinding),
    nonce: evidence.nonce,
    casRevision: 7,
    state: "available",
    consumedByPromotionId: null,
    ...overrides,
  };
}

function testControlPlane(
  input: EvidenceEvaluationRequest,
  overrides: Partial<Omit<EvidenceControlPlaneSnapshot, "registryFingerprint">> = {},
): EvidenceControlPlaneSnapshot {
  const {nowMs = fixedNow, ...trustedStateOverrides} = overrides;
  const body = {
    registryVersion: "test-control-plane-v2",
    roots: [root],
    manifests: [manifest],
    receipts: [receiptFor(input)],
    ...trustedStateOverrides,
  };
  return {...body, registryFingerprint: fingerprintJson(body), nowMs};
}

function evaluate(input: EvidenceEvaluationRequest, overrides = {}) {
  return evaluateEvidenceRegistryAgainstControlPlane(input, testControlPlane(input, overrides));
}

function blockerCodes(input: EvidenceEvaluationRequest, overrides = {}): string[] {
  return evaluate(input, overrides).blockers.map((entry) => entry.code);
}

describe("control-plane-owned acceptance evidence", () => {
  it("accepts only an exact control-plane manifest, root and immutable receipt", () => {
    const input = request();
    expect(evaluate(input)).toMatchObject({
      registryValid: true,
      allClaimsSupported: true,
      verifiedEvidenceIds: ["EVR-RT01-CI-001"],
      promotionPreconditions: [{receiptId: "ERC-RT01-CI-001", evidenceId: "EVR-RT01-CI-001", expectedCasRevision: 7}],
      blockers: [],
    });
  });

  it("persists an authoritative opaque decision and atomically rejects replay and cross-target use", async () => {
    const input = request();
    const persisted = new Map<string, AuthoritativeEvidencePromotionDecision & {consumed: boolean}>();
    const store: EvidencePromotionAuthorityStore = {
      persistAuthoritativeDecision: async (decision) => {
        if (persisted.has(decision.decisionId)) return false;
        persisted.set(decision.decisionId, {...decision, consumed: false});
        return true;
      },
      consumeDecisionAndReceiptsAtomically: async ({decisionId, expectedTarget}) => {
        const record = persisted.get(decisionId);
        if (!record || record.consumed || fingerprintJson(record.target) !== fingerprintJson(expectedTarget)) return false;
        const receipt = testControlPlane(input).receipts[0]!;
        const exactReceiptSet = record.receipts.length === 1
          && record.receipts[0]!.receiptId === receipt.receiptId
          && record.receipts[0]!.evidenceId === receipt.evidenceId
          && record.receipts[0]!.expectedCasRevision === receipt.casRevision
          && record.receipts[0]!.nonce === receipt.nonce;
        if (!exactReceiptSet || receipt.state !== "available") return false;
        record.consumed = true;
        return true;
      },
    };
    const result = await persistEvidenceDecisionForPromotion(input, testControlPlane(input), store);
    expect(result).toMatchObject({persisted: true});
    expect(result.decisionId).toMatch(/^EPD-[A-F0-9]{48}$/);
    expect(persisted.get(result.decisionId!)?.target).toEqual(promotionTarget);

    const otherTarget = {
      ...promotionTarget,
      transition: {...promotionTarget.transition, resourceId: "another-capability"},
      subject: {...promotionTarget.subject, id: "another-capability"},
    } satisfies EvidencePromotionTarget;
    await expect(consumePersistedEvidenceDecisionForPromotion(result.decisionId!, "promotion-cross-target", otherTarget, store))
      .resolves.toMatchObject({authorized: false, code: "receipt_cas_rejected"});
    await expect(consumePersistedEvidenceDecisionForPromotion(result.decisionId!, "promotion-rt01", promotionTarget, store))
      .resolves.toMatchObject({authorized: true, code: "authorized"});
    await expect(consumePersistedEvidenceDecisionForPromotion(result.decisionId!, "promotion-replay", promotionTarget, store))
      .resolves.toMatchObject({authorized: false, code: "receipt_cas_rejected"});

    // Recomputing every public hash still does not create the opaque persisted decision id.
    const forgedPublicHash = fingerprintJson({...result.decision, promotionTarget: otherTarget});
    const forgedOpaqueId = `EPD-${forgedPublicHash.slice(0, 48).toUpperCase()}`;
    await expect(consumePersistedEvidenceDecisionForPromotion(forgedOpaqueId, "promotion-forged", otherTarget, store))
      .resolves.toMatchObject({authorized: false, code: "receipt_cas_rejected"});
  });

  it("does not accept caller-injected roots, verifier labels, receipts or clocks", () => {
    const injected = evaluateEvidenceRegistry({
      ...request(),
      trustedRoots: [root],
      receipts: [receiptFor(request())],
      verifier: {principal: "attacker:verifier"},
      now: "2026-09-07T16:00:00.000Z",
    });
    expect(injected).toMatchObject({
      registryValid: false,
      allClaimsSupported: false,
      verifiedEvidenceIds: [],
      promotionPreconditions: [],
      blockers: [expect.objectContaining({code: "invalid_evaluation_request"})],
    });
  });

  it.each([
    ["claim", (input: EvidenceEvaluationRequest) => { input.registry.claims[0]!.statement = "Offroad is certified."; }, "registry_claims_not_control_plane_canonical"],
    ["criterion", (input: EvidenceEvaluationRequest) => { input.registry.criteria[0]!.description = "Different criterion."; }, "registry_criteria_not_control_plane_canonical"],
    ["limitations", (input: EvidenceEvaluationRequest) => { input.registry.limitations = ["Limitations removed."]; }, "registry_limitations_not_control_plane_canonical"],
    ["generatedAt", (input: EvidenceEvaluationRequest) => { input.registry.generatedAt = "2026-09-07T13:01:00.000Z"; }, "receipt_registry_fingerprint_mismatch"],
  ] as const)("rejects caller-defined or tampered registry %s", (_label, mutate, blocker) => {
    const input = request();
    const controlPlane = testControlPlane(input);
    mutate(input);
    const decision = evaluateEvidenceRegistryAgainstControlPlane(input, controlPlane);
    expect(decision.registryValid).toBe(false);
    expect(decision.verifiedEvidenceIds).toEqual([]);
    expect(decision.claimDecisions.every((entry) => !entry.supported)).toBe(true);
    expect(decision.blockers).toContainEqual(expect.objectContaining({code: blocker}));
  });

  it.each([
    ["tenant kind", (value: EvidenceTrustScope) => { value.tenant.tenantKind = "platform"; value.tenant.projectId = null; }],
    ["tenant", (value: EvidenceTrustScope) => { value.tenant.tenantId = "org-other"; }],
    ["project", (value: EvidenceTrustScope) => { value.tenant.projectId = "project-other"; }],
    ["environment", (value: EvidenceTrustScope) => { value.deployment.environment = "staging"; }],
    ["deployment", (value: EvidenceTrustScope) => { value.deployment.deploymentId = "github-run-other"; }],
    ["account", (value: EvidenceTrustScope) => { value.deployment.accountId = "github:other/repo"; }],
    ["region", (value: EvidenceTrustScope) => { value.deployment.region = "us-east-1"; }],
    ["trust domain", (value: EvidenceTrustScope) => { value.trustDomain = "other.trust-domain"; }],
  ])("rejects a signed attestation outside the root's exact %s", (_label, mutate) => {
    const changedScope = structuredClone(scope);
    mutate(changedScope);
    expect(blockerCodes(request(signEvidence({scope: changedScope})))).toContain("attestation_scope_not_permitted");
  });

  it.each([
    ["collector", signEvidence({collector: {...collector, version: "2.0.0"}}), "attestation_collector_not_permitted"],
    ["gate", signEvidence({gate: {...gate, gateId: "different-gate"}}), "attestation_gate_not_permitted"],
    ["workload", signEvidence({runBinding: {...runBinding, workloadIdentity: {...workloadIdentity, gitRef: "refs/heads/evil"}}}), "attestation_workload_identity_not_permitted"],
    ["evidence type", signEvidence({type: "test_run"}), "attestation_evidence_type_not_permitted"],
  ] as const)("rejects incompatible %s authorization", (_label, evidence, blocker) => {
    expect(blockerCodes(request(evidence))).toContain(blocker);
  });

  it.each([
    ["subject", {...root, subject: {...subject, id: "another-capability"}}, "attestation_subject_not_permitted"],
    ["claim", {...root, claimBinding: {...root.claimBinding, claimId: "CLM-OTHER-CLAIM"}}, "attestation_claim_not_permitted"],
    ["criterion", {...root, criterionBinding: {...root.criterionBinding, criterionId: "CRT-OTHER-CRITERION"}}, "attestation_criterion_not_permitted"],
  ] as const)("rejects a root scoped to another %s", (_label, changedRoot, blocker) => {
    const input = request();
    expect(blockerCodes(input, {roots: [changedRoot]})).toContain(blocker);
  });

  it.each([
    ["future root", {...root, validFrom: "2026-10-01T00:00:00.000Z"}, "attestation_trust_root_not_current"],
    ["expired root", {...root, validThrough: "2026-09-01T00:00:00.000Z"}, "attestation_trust_root_not_current"],
    ["revoked root", {...root, revokedAt: "2026-09-07T15:30:00.000Z"}, "attestation_trust_root_revoked"],
  ] as const)("rejects %s", (_label, changedRoot, blocker) => {
    const input = request();
    expect(blockerCodes(input, {roots: [changedRoot]})).toContain(blocker);
  });

  it("rejects future issuance, excessive TTL and stale evidence directly", () => {
    const future = request(signEvidence({issuedAt: "2026-09-07T17:00:00.000Z", expiresAt: "2026-09-08T17:00:00.000Z"}));
    expect(blockerCodes(future)).toContain("evidence_issued_in_future");

    const longTtl = request(signEvidence({expiresAt: "2026-09-10T14:00:00.000Z"}));
    expect(blockerCodes(longTtl)).toEqual(expect.arrayContaining(["criterion_ttl_exceeded", "root_attestation_ttl_exceeded"]));

    const stale = request();
    expect(blockerCodes(stale, {nowMs: new Date("2026-09-09T16:00:00.000Z").getTime()}))
      .toEqual(expect.arrayContaining(["criterion_max_age_exceeded", "root_receipt_max_age_exceeded"]));
  });

  it.each([
    ["late receipt", {receivedAt: "2026-09-07T16:30:01.000Z"}, "evidence_receipt_delay_exceeded"],
    ["future receipt", {receivedAt: "2026-09-07T17:00:00.000Z"}, "receipt_received_in_future"],
    ["run binding", {runBinding: {...runBinding, runId: "github-run-other"}}, "receipt_run_binding_mismatch"],
    ["nonce", {nonce: "nonce-rt01-ci-99999999"}, "receipt_nonce_mismatch"],
    ["consumed receipt", {state: "consumed", consumedByPromotionId: "promotion-old"}, "receipt_already_consumed"],
  ] as const)("rejects %s", (_label, receiptOverride, blocker) => {
    const input = request();
    expect(blockerCodes(input, {receipts: [receiptFor(input, receiptOverride as Partial<EvidenceIngestReceipt>)]})).toContain(blocker);
  });

  it("rejects duplicate receipt nonces across evidence identities", () => {
    const input = request();
    const duplicate = {...receiptFor(input), receiptId: "ERC-RT01-CI-002", evidenceId: "EVR-RT01-CI-002"} satisfies EvidenceIngestReceipt;
    expect(blockerCodes(input, {receipts: [receiptFor(input), duplicate]})).toContain("receipt_nonce_reused");
  });

  it("rejects a tampered control-plane registry fingerprint", () => {
    const input = request();
    const controlPlane = {...testControlPlane(input), registryFingerprint: "0".repeat(64)};
    const decision = evaluateEvidenceRegistryAgainstControlPlane(input, controlPlane);
    expect(decision.blockers).toContainEqual(expect.objectContaining({code: "trust_registry_fingerprint_mismatch"}));
    expect(decision.verifiedEvidenceIds).toEqual([]);
  });

  it("returns a stable fail-closed decision for cyclic and BigInt invalid input", () => {
    const cyclic: {amount: bigint; self?: unknown} = {amount: 10n};
    cyclic.self = cyclic;
    const decision = evaluateEvidenceRegistry(cyclic);
    expect(decision).toMatchObject({registryValid: false, allClaimsSupported: false, verifiedEvidenceIds: [], promotionPreconditions: []});
    expect(decision.registryFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects semantically incoherent platform/project and subject/catalogue scopes", () => {
    const platformProject = structuredClone(request());
    platformProject.registry.scope.tenant = {tenantKind: "platform", tenantId: "platform", projectId: "project-camil"};
    expect(evaluateEvidenceRegistry(platformProject).registryValid).toBe(false);

    const wrongCatalogue = structuredClone(request());
    wrongCatalogue.registry.claims[0]!.subject.catalogue = "release_manifest";
    expect(evaluateEvidenceRegistry(wrongCatalogue).registryValid).toBe(false);
  });
});
