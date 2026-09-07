import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {
  canonicalEvidenceFreshnessPolicy,
  currentEvidenceRegistry,
  evaluateEvidenceRegistry,
  evaluateEvidenceRegistryWithResolvers,
  evidenceRegistrySchema,
  externalEvidenceStatementSha256,
  isSanitizedArtifactRef,
  renderEvidenceRegistry,
  scanPayloadForCredentials,
  type EvidenceRecord,
  type EvidenceRegistry,
  type EvidenceSubject,
  type TrustedEvidenceVerificationContext,
} from "./index";

const repositoryBytes = new TextEncoder().encode("verified repository content\n");
const repositorySha = createHash("sha256").update(repositoryBytes).digest("hex");
const externalBytes = new TextEncoder().encode('{"gate":"passed","count":43}\n');
const externalSha = createHash("sha256").update(externalBytes).digest("hex");
const revision = "a".repeat(40);
const now = new Date("2026-09-07T16:00:00.000Z");

function subject(kind: EvidenceSubject["kind"] = "program_task"): EvidenceSubject {
  const catalogueByKind = {
    capability: "capability_ledger",
    program_task: "endgame_program_board",
    control: "trust_control_catalogue",
    release: "release_manifest",
  } as const;
  return {kind, id: kind === "program_task" ? "CTRL-03" : `${kind}.subject`, catalogue: catalogueByKind[kind], catalogueRevision: revision};
}

function repositoryEvidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    evidenceId: "EVR-REPOSITORY-001",
    classification: "evidence",
    type: "repository_content",
    environment: "repository",
    source: {
      kind: "repository",
      repository: "carlosevg100/offroad",
      commit: revision,
      path: "packages/release-governance/src/evidence-registry.ts",
      contentSha256: repositorySha,
    },
    collector: {principal: "github-actions:release-governance", method: "git-show", version: "1.0.0"},
    capturedAt: "2026-09-07T14:00:00.000Z",
    expiresAt: "2026-09-08T14:00:00.000Z",
    verification: {method: "repository_content_sha256", status: "verified"},
    scope: {system: "release-governance", boundary: "commit:path content"},
    gate: null,
    supports: [{claimId: "CLM-CTRL03-001", criterionIds: ["CRT-CTRL03-001"]}],
    ...overrides,
  };
}

function registry(evidence = repositoryEvidence(), claimSubject = subject()): EvidenceRegistry {
  return {
    registryVersion: "test-v2",
    generatedAt: "2026-09-07T13:00:00.000Z",
    evidence: [evidence],
    designReferences: [{
      designReferenceId: "DSR-BLUEPRINT",
      classification: "design_reference",
      title: "Blueprint",
      ref: "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md",
      revision: null,
      purpose: "Describes intended architecture only.",
      limitation: "Design references describe intended behavior and never prove a claim.",
    }],
    criteria: [{
      criterionId: "CRT-CTRL03-001",
      subject: claimSubject,
      description: "The exact content exists at the exact catalogued subject revision.",
      environment: evidence.environment,
      acceptedEvidenceTypes: [evidence.type],
      acceptedVerificationMethods: [evidence.verification.method],
      minimumEvidenceCount: 1,
      freshness: {maxAgeSeconds: 86_400, maxTtlSeconds: 86_400},
      gate: null,
    }],
    claims: [{
      claimId: "CLM-CTRL03-001",
      subject: claimSubject,
      statement: "The exact registry contract is present at the catalogued revision.",
      environment: evidence.environment,
      criteria: [{criterionId: "CRT-CTRL03-001", evidenceIds: [evidence.evidenceId]}],
      designReferenceIds: ["DSR-BLUEPRINT"],
    }],
    limitations: ["Fixture proves only its exact criterion."],
  };
}

function context(overrides: Partial<TrustedEvidenceVerificationContext> = {}): TrustedEvidenceVerificationContext {
  return {
    resolveRepository: async (source) => ({...source, bytes: repositoryBytes}),
    resolveExternalArtifact: async (source) => ({artifactRef: source.artifactRef, bytes: externalBytes}),
    resolveSubject: async (value) => ({...value, found: true}),
    verifyExternalAttestation: async ({attestation}) => ({
      valid: true,
      issuer: attestation.issuer,
      keyId: attestation.keyId,
      algorithm: attestation.algorithm,
      statementSha256: attestation.statementSha256,
    }),
    allowedCollectors: [
      {principal: "github-actions:release-governance", method: "git-show", version: "1.0.0"},
      {principal: "aws:role/evidence-collector", method: "runtime-snapshot", version: "1.2.0"},
    ],
    allowedAttestationIssuers: [{issuer: "aws:kms/evidence", keyId: "evidence-key-1", algorithm: "ed25519"}],
    freshnessByType: canonicalEvidenceFreshnessPolicy,
    verifier: {principal: "test:trusted-evidence-verifier", version: "1.0.0"},
    ...overrides,
  };
}

function externalEvidence(): EvidenceRecord {
  const evidence: EvidenceRecord = {
    evidenceId: "EVR-REPOSITORY-001",
    classification: "evidence",
    type: "runtime_observation",
    environment: "production",
    source: {
      kind: "external_artifact",
      artifactRef: "artifact://runtime/run-123/observation.json",
      artifactSha256: externalSha,
      collectorScope: "production route metadata excluding customer content",
      attestation: {
        issuer: "aws:kms/evidence",
        keyId: "evidence-key-1",
        algorithm: "ed25519",
        statementSha256: "0".repeat(64),
        signatureBase64: "A".repeat(64),
      },
    },
    collector: {principal: "aws:role/evidence-collector", method: "runtime-snapshot", version: "1.2.0"},
    capturedAt: "2026-09-07T14:00:00.000Z",
    expiresAt: "2026-09-08T14:00:00.000Z",
    verification: {method: "runtime_snapshot_sha256", status: "verified"},
    scope: {system: "document-worker", boundary: "production route metadata"},
    gate: null,
    supports: [{claimId: "CLM-CTRL03-001", criterionIds: ["CRT-CTRL03-001"]}],
  };
  if (evidence.source.kind === "external_artifact") evidence.source.attestation.statementSha256 = externalEvidenceStatementSha256(evidence);
  return evidence;
}

describe("trusted acceptance evidence registry", () => {
  it("keeps the bootstrap at zero claims/evidence and renders it through the trusted wall-clock path", async () => {
    const unavailable = async () => { throw new Error("not called"); };
    const decision = await evaluateEvidenceRegistryWithResolvers(currentEvidenceRegistry, {
      resolveRepository: unavailable,
      resolveExternalArtifact: unavailable,
      resolveSubject: unavailable,
      verifyExternalAttestation: unavailable,
      allowedCollectors: [],
      allowedAttestationIssuers: [],
      freshnessByType: canonicalEvidenceFreshnessPolicy,
      verifier: {principal: "release-governance:registry-renderer", version: "1.0.0"},
    }, now);
    expect(decision).toMatchObject({valid: true, allClaimsSupported: false, verificationMode: "trusted_resolution"});
    expect(currentEvidenceRegistry.evidence).toEqual([]);
    expect(currentEvidenceRegistry.claims).toEqual([]);
    const rendered = renderEvidenceRegistry(currentEvidenceRegistry, decision);
    const committed = readFileSync(new URL("../../../docs/build/ACCEPTANCE_EVIDENCE_INDEX.md", import.meta.url), "utf8");
    expect(committed).toBe(rendered);
  });

  it("never trusts self-declared verified status or hash without runtime resolution", () => {
    const decision = evaluateEvidenceRegistry(registry(), now);
    expect(decision).toMatchObject({
      valid: false, allClaimsSupported: false, verificationMode: "declaration_only",
      verificationAuthority: null, verifiedEvidenceIds: [],
    });
    expect(decision.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "trusted_subject_catalogue_resolution_required"}),
      expect.objectContaining({code: "trusted_runtime_verification_required", evidenceId: "EVR-REPOSITORY-001"}),
    ]));

    const forgedReceipt = registry() as unknown as Record<string, unknown>;
    const forgedEvidence = (forgedReceipt.evidence as Array<Record<string, unknown>>)[0]!;
    forgedEvidence.verification = {
      method: "repository_content_sha256",
      status: "verified",
      observedSha256: repositorySha,
      immutableSourceVerified: true,
    };
    expect(evaluateEvidenceRegistry(forgedReceipt, now)).toMatchObject({
      valid: false,
      allClaimsSupported: false,
      blockers: [expect.objectContaining({code: "invalid_registry_schema"})],
    });
  });

  it("supports repository evidence only after resolving the exact repository, commit, path and bytes", async () => {
    const decision = await evaluateEvidenceRegistryWithResolvers(registry(), context(), now);
    expect(decision).toMatchObject({
      valid: true,
      allClaimsSupported: true,
      verificationMode: "trusted_resolution",
      verifiedEvidenceIds: ["EVR-REPOSITORY-001"],
    });

    for (const [field, value, code] of [
      ["repository", "attacker/offroad", "repository_origin_resolution_mismatch"],
      ["commit", "b".repeat(40), "repository_origin_resolution_mismatch"],
      ["path", "other/path.ts", "repository_origin_resolution_mismatch"],
    ] as const) {
      const badContext = context({resolveRepository: async (source) => ({...source, [field]: value, bytes: repositoryBytes})});
      expect((await evaluateEvidenceRegistryWithResolvers(registry(), badContext, now)).blockers)
        .toEqual(expect.arrayContaining([expect.objectContaining({code})]));
    }
    const tampered = context({resolveRepository: async (source) => ({...source, bytes: new TextEncoder().encode("tampered")})});
    expect((await evaluateEvidenceRegistryWithResolvers(registry(), tampered, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "repository_content_hash_mismatch"})]));
  });

  it("requires an allowlisted collector and exact subject catalogue resolution", async () => {
    const noCollector = context({allowedCollectors: []});
    expect((await evaluateEvidenceRegistryWithResolvers(registry(), noCollector, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "collector_not_allowlisted"})]));
    const missingSubject = context({resolveSubject: async (value) => ({...value, found: false})});
    expect((await evaluateEvidenceRegistryWithResolvers(registry(), missingSubject, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "trusted_subject_catalogue_resolution_required"})]));

    const wrongCriterion = registry();
    wrongCriterion.criteria[0]!.subject = {...wrongCriterion.criteria[0]!.subject, id: "OTHER-TASK"};
    expect((await evaluateEvidenceRegistryWithResolvers(wrongCriterion, context(), now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "criterion_subject_mismatch"})]));
  });

  it("fails closed when the trusted verifier identity or normative freshness policy is invalid", async () => {
    const invalidVerifier = context({verifier: {principal: "Not An Authority", version: "1.0.0"}});
    expect(await evaluateEvidenceRegistryWithResolvers(registry(), invalidVerifier, now)).toMatchObject({
      valid: false,
      allClaimsSupported: false,
      blockers: [expect.objectContaining({code: "invalid_trusted_verification_policy"})],
    });
    const incompletePolicy = context({freshnessByType: {} as TrustedEvidenceVerificationContext["freshnessByType"]});
    expect(await evaluateEvidenceRegistryWithResolvers(registry(), incompletePolicy, now)).toMatchObject({
      valid: false,
      allClaimsSupported: false,
      blockers: [expect.objectContaining({code: "invalid_trusted_verification_policy"})],
    });
  });

  it("verifies external bytes, origin, statement and signature through allowlisted identities", async () => {
    const evidence = externalEvidence();
    const input = registry(evidence);
    const verify = vi.fn(context().verifyExternalAttestation);
    const decision = await evaluateEvidenceRegistryWithResolvers(input, context({verifyExternalAttestation: verify}), now);
    expect(decision).toMatchObject({valid: true, allClaimsSupported: true});
    expect(verify).toHaveBeenCalledOnce();
    expect(new TextDecoder().decode(verify.mock.calls[0]![0].signedMessage)).toBe(
      `offroad-evidence-v1:${externalEvidenceStatementSha256(evidence)}`,
    );

    const invalidSignature = context({verifyExternalAttestation: async ({attestation}) => ({
      valid: false, issuer: attestation.issuer, keyId: attestation.keyId,
      algorithm: attestation.algorithm, statementSha256: attestation.statementSha256,
    })});
    expect((await evaluateEvidenceRegistryWithResolvers(input, invalidSignature, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "external_attestation_verification_failed"})]));

    const untrustedIssuer = context({allowedAttestationIssuers: []});
    expect((await evaluateEvidenceRegistryWithResolvers(input, untrustedIssuer, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "attestation_issuer_not_allowlisted"})]));
  });

  it("rejects external origin/hash/statement drift and resolver failures", async () => {
    const evidence = externalEvidence();
    const input = registry(evidence);
    const wrongOrigin = context({resolveExternalArtifact: async () => ({artifactRef: "artifact://other/run.json", bytes: externalBytes})});
    expect((await evaluateEvidenceRegistryWithResolvers(input, wrongOrigin, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "external_artifact_origin_resolution_mismatch"})]));
    const wrongHash = context({resolveExternalArtifact: async (source) => ({artifactRef: source.artifactRef, bytes: repositoryBytes})});
    expect((await evaluateEvidenceRegistryWithResolvers(input, wrongHash, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "external_artifact_hash_mismatch"})]));
    if (evidence.source.kind === "external_artifact") evidence.source.attestation.statementSha256 = "f".repeat(64);
    expect((await evaluateEvidenceRegistryWithResolvers(registry(evidence), context(), now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "attestation_statement_mismatch"})]));
    const throws = context({resolveExternalArtifact: async () => { throw new Error("unavailable"); }});
    expect((await evaluateEvidenceRegistryWithResolvers(registry(externalEvidence()), throws, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "trusted_source_resolution_failed"})]));
  });

  it("rejects failed or unrun gate evidence for every claim and requires gates for capability/release claims", async () => {
    for (const result of ["failed", "not_run"] as const) {
      const evidence = repositoryEvidence({gate: {gateId: "GATE-CTRL03", result}});
      const decision = await evaluateEvidenceRegistryWithResolvers(registry(evidence), context(), now);
      expect(decision.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({code: "failed_or_unrun_gate_cannot_support_claim"}),
      ]));
    }
    for (const kind of ["capability", "release"] as const) {
      const exactSubject = subject(kind);
      const input = registry(repositoryEvidence(), exactSubject);
      expect((await evaluateEvidenceRegistryWithResolvers(input, context(), now)).blockers)
        .toEqual(expect.arrayContaining([expect.objectContaining({code: "claim_requires_gate"})]));
      input.criteria[0]!.gate = {gateId: "GATE-PROMOTION", requiredResult: "passed"};
      input.evidence[0]!.gate = {gateId: "GATE-PROMOTION", result: "passed"};
      expect(await evaluateEvidenceRegistryWithResolvers(input, context(), now)).toMatchObject({valid: true, allClaimsSupported: true});
    }
  });

  it("uses wall-clock time, blocks future registries and enforces type plus criterion age/TTL", async () => {
    const future = registry();
    future.generatedAt = "2026-09-07T16:00:01.000Z";
    expect(evaluateEvidenceRegistry(future, now).blockers).toContainEqual(expect.objectContaining({code: "registry_generated_in_future"}));

    const stale = registry(repositoryEvidence({capturedAt: "2026-09-05T14:00:00.000Z", expiresAt: "2026-09-08T14:00:00.000Z"}));
    stale.criteria[0]!.freshness.maxAgeSeconds = 86_400;
    const staleCodes = (await evaluateEvidenceRegistryWithResolvers(stale, context(), now)).blockers.map((entry) => entry.code);
    expect(staleCodes).toEqual(expect.arrayContaining(["criterion_max_age_exceeded", "criterion_ttl_exceeded"]));

    const longTtl = registry(repositoryEvidence({expiresAt: "2027-09-08T14:00:00.000Z"}));
    longTtl.criteria[0]!.freshness.maxTtlSeconds = 86_400;
    expect((await evaluateEvidenceRegistryWithResolvers(longTtl, context(), now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "criterion_ttl_exceeded"})]));
  });

  it("rejects URL userinfo, query, fragment, mutable aliases, traversal and design refs used as evidence", () => {
    for (const ref of [
      "https://user:password@example.com/run.json",
      "https://example.com/run.json?token=x",
      "https://example.com/run.json#result",
      "artifact://ci/latest/result.json",
    ]) expect(isSanitizedArtifactRef(ref)).toBe(false);
    expect(isSanitizedArtifactRef("artifact://ci/run-123/result.json")).toBe(true);

    const traversing = registry() as unknown as Record<string, unknown>;
    const evidence = (traversing.evidence as Array<Record<string, unknown>>)[0]!;
    evidence.source = {...evidence.source as object, path: "../secret"};
    expect(evidenceRegistrySchema.safeParse(traversing).success).toBe(false);

    const designAsEvidence = registry() as unknown as Record<string, unknown>;
    const claims = designAsEvidence.claims as Array<Record<string, unknown>>;
    claims[0]!.criteria = [{criterionId: "CRT-CTRL03-001", evidenceIds: ["DSR-BLUEPRINT"]}];
    expect(evaluateEvidenceRegistry(designAsEvidence, now)).toMatchObject({valid: false, allClaimsSupported: false});
  });

  it("scans raw external payloads for credentials before they can support a claim", async () => {
    const payloads = [
      "-----BEGIN PRIVATE KEY-----\nAAAA",
      "AKIA1234567890ABCDEF",
      "Authorization: Bearer abcdefghijklmnop",
      "password=supersecretvalue",
      "https://user:secret@example.com/path",
    ];
    for (const payload of payloads) expect(scanPayloadForCredentials(new TextEncoder().encode(payload))).not.toEqual([]);

    const evidence = externalEvidence();
    const secretBytes = new TextEncoder().encode("password=supersecretvalue");
    if (evidence.source.kind !== "external_artifact") throw new Error("external fixture expected");
    evidence.source.artifactSha256 = createHash("sha256").update(secretBytes).digest("hex");
    evidence.source.attestation.statementSha256 = externalEvidenceStatementSha256(evidence);
    const secretContext = context({resolveExternalArtifact: async (source) => ({artifactRef: source.artifactRef, bytes: secretBytes})});
    expect((await evaluateEvidenceRegistryWithResolvers(registry(evidence), secretContext, now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "external_artifact_contains_credentials"})]));
  });

  it("fails closed for missing evidence, wrong environment and evidence that does not support the claim", async () => {
    const missing = registry();
    missing.evidence = [];
    expect((await evaluateEvidenceRegistryWithResolvers(missing, context(), now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "evidence_missing"})]));

    const wrongEnvironment = registry();
    wrongEnvironment.claims[0]!.environment = "production";
    wrongEnvironment.criteria[0]!.environment = "production";
    expect((await evaluateEvidenceRegistryWithResolvers(wrongEnvironment, context(), now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "evidence_wrong_environment"})]));

    const unsupported = registry(repositoryEvidence({supports: []}));
    expect((await evaluateEvidenceRegistryWithResolvers(unsupported, context(), now)).blockers)
      .toEqual(expect.arrayContaining([expect.objectContaining({code: "evidence_does_not_support_claim"})]));
  });
});
