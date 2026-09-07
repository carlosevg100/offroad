import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  appendGovernedDocumentLifecycle,
  compileGovernedDocumentIdentity,
  governedDocumentVersionIdentitySchema,
  mapSourceDocumentsRowBinding,
  validateGovernedDocumentIdentityGraph,
  type CompileGovernedDocumentIdentityInput,
  type DocumentLifecycleInput,
  type GovernedDocumentIdentityResolver,
  type GovernedDocumentVersionIdentity,
  type SnapshotLocator,
} from "./governed-document-identity";

const encoder = new TextEncoder();
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const sourceBytes = encoder.encode("immutable audited financial statements");
const layerBytes = encoder.encode("verified extracted layer");
const profileBytes = encoder.encode("verified profile derivative");
const sourceHash = hash(sourceBytes);
const layerHash = hash(layerBytes);
const profileHash = hash(profileBytes);
const actor = {kind: "user" as const, ref: "user:11111111-1111-4111-8111-111111111111"};
const service = {kind: "service" as const, ref: "service:22222222-2222-4222-8222-222222222222"};
const parser = {toolId: "offroad.pdf-parser", version: "1.2.3", configurationSha256: hash("parser-config")};
const binding = {
  table: "public.source_documents" as const,
  organizationId: "org-a",
  sourceDocumentId: "document-a",
  opportunityId: "opportunity-a",
  intakeSessionId: "session-a",
};
const sourceLocator: SnapshotLocator = {state: "content_addressed", locatorRef: `sha256:${sourceHash}`, objectVersionRef: null};
const layerLocator: SnapshotLocator = {state: "content_addressed", locatorRef: `sha256:${layerHash}`, objectVersionRef: null};
const profileLocator: SnapshotLocator = {state: "versioned_object", locatorRef: "storage:profile-a", objectVersionRef: "version:1"};

type ResolverOptions = {
  authorized?: boolean;
  scope?: {organizationId: string; projectId: string; documentId: string; version?: number};
  source?: Partial<{found: boolean; immutable: boolean; locatorRef: string; objectVersionRef: string | null; bytes: Uint8Array | null}>;
  artifacts?: Map<string, {found: boolean; immutable: boolean; locatorRef: string; objectVersionRef: string | null; bytes: Uint8Array | null}>;
  registeredTools?: Set<string>;
  coverage?: Map<string, {found: boolean; organizationId: string; projectId: string; documentId: string; version: number; fingerprint: string; backlinkIdentityFingerprint: string}>;
};

function toolKey(tool = parser) {
  return `${tool.toolId}@${tool.version}:${tool.configurationSha256}`;
}

function makeResolver(options: ResolverOptions = {}): GovernedDocumentIdentityResolver {
  const scope = options.scope ?? {organizationId: "org-a", projectId: "project-a", documentId: "document-a"};
  const artifacts = options.artifacts ?? new Map([
    [layerLocator.locatorRef, {found: true, immutable: true, locatorRef: layerLocator.locatorRef, objectVersionRef: null, bytes: layerBytes}],
    [profileLocator.locatorRef, {found: true, immutable: true, locatorRef: profileLocator.locatorRef, objectVersionRef: profileLocator.objectVersionRef, bytes: profileBytes}],
  ]);
  const registeredTools = options.registeredTools ?? new Set([toolKey()]);
  return {
    async resolveScope() {
      return {
        authorized: options.authorized ?? true,
        ...scope,
        version: scope.version ?? 1,
        sourceBinding: binding,
        actorRef: actor.ref,
        attestationRef: "authz:decision-001",
        decisionSha256: hash("signed-scope-decision"),
        authorizationVersion: "workspace-authz.v1",
        authorizedAt: "2026-09-01T09:59:00.000Z",
      };
    },
    async resolveSnapshot(locator) {
      return {
        found: options.source?.found ?? true,
        immutable: options.source?.immutable ?? true,
        locatorRef: options.source?.locatorRef ?? locator.locatorRef,
        objectVersionRef: options.source?.objectVersionRef ?? locator.objectVersionRef,
        bytes: options.source?.bytes === undefined ? sourceBytes : options.source.bytes,
      };
    },
    async resolveArtifact(locator) {
      return artifacts.get(locator.locatorRef) ?? {found: false, immutable: false, locatorRef: locator.locatorRef, objectVersionRef: locator.objectVersionRef, bytes: null};
    },
    async resolveCoverage(claim) {
      return options.coverage?.get(claim.ref) ?? {found: false, organizationId: "org-a", projectId: "project-a", documentId: "document-a", version: 1, fingerprint: claim.fingerprint, backlinkIdentityFingerprint: "0".repeat(64)};
    },
    async isToolRegistered(tool) {
      return registeredTools.has(toolKey(tool));
    },
  };
}

function sourceRef(input: Partial<{organizationId: string; projectId: string; documentId: string; version: number; sourceBytesSha256: string}> = {}) {
  return {organizationId: input.organizationId ?? "org-a", projectId: input.projectId ?? "project-a", documentId: input.documentId ?? "document-a", version: input.version ?? 1, sourceBytesSha256: input.sourceBytesSha256 ?? sourceHash};
}

function lifecycle(overrides: Partial<DocumentLifecycleInput> = {}): DocumentLifecycleInput {
  return {
    recordedAt: "2026-09-01T10:04:00.000Z",
    recordedBy: service,
    asOf: "2026-08-31T23:59:59.000Z",
    dataClass: "project_confidential",
    informationClass: "audited",
    confidentiality: "confidential",
    toolchain: [parser],
    extractedLayers: [{
      id: "layer-a",
      layerKind: "pdf",
      locator: layerLocator,
      claimedSha256: layerHash,
      producedBy: parser,
      producedAt: "2026-09-01T10:02:00.000Z",
      parentRefs: [{kind: "source_version", version: sourceRef()}],
      coverage: [],
    }],
    coverage: [],
    derivatives: [{
      id: "profile-a",
      kind: "profile",
      locator: profileLocator,
      claimedSha256: profileHash,
      producedBy: parser,
      producedAt: "2026-09-01T10:03:00.000Z",
      parentRefs: [{kind: "derivative", derivativeId: "layer-a", contentSha256: layerHash}],
      coverage: [],
    }],
    supersession: {state: "current", supersededBy: null, reasonRef: null},
    ...overrides,
  };
}

function input(overrides: Partial<CompileGovernedDocumentIdentityInput> = {}): CompileGovernedDocumentIdentityInput {
  return {
    organizationId: "org-a",
    projectId: "project-a",
    documentId: "document-a",
    version: 1,
    parentVersion: null,
    sourceBinding: binding,
    source: {origin: "user_upload", sourceClass: "provided_documents", sourceRef: "storage:document-a", integration: {status: "native", connectorId: null}},
    capturedBy: actor,
    capturedAt: "2026-09-01T10:00:00.000Z",
    sourceSnapshot: sourceLocator,
    claimedSourceBytesSha256: sourceHash,
    lifecycle: lifecycle(),
    ...overrides,
  };
}

async function compile(overrides: Partial<CompileGovernedDocumentIdentityInput> = {}, resolver = makeResolver()) {
  return compileGovernedDocumentIdentity(input(overrides), resolver);
}

async function codes(records: GovernedDocumentVersionIdentity[], resolver = makeResolver()) {
  return (await validateGovernedDocumentIdentityGraph(records, resolver)).issues.map((issue) => issue.code);
}

describe("governed document identity v2", () => {
  it("compiles and re-verifies only through trusted scope, bytes and tool resolvers", async () => {
    const identity = await compile();
    expect(identity.core.sourceBytes).toEqual({sha256: sourceHash, byteSize: sourceBytes.byteLength});
    expect(identity.lifecycleHistory[0]?.extractedLayers[0]?.contentSha256).toBe(layerHash);
    expect(await validateGovernedDocumentIdentityGraph([identity], makeResolver())).toMatchObject({status: "valid", issues: []});
  });

  it("fails closed when a tenant/project claim is unauthorized or relabeled", async () => {
    await expect(compile({}, makeResolver({authorized: false}))).rejects.toThrow("scope_not_authorized");
    await expect(compile({organizationId: "org-b"}, makeResolver())).rejects.toThrow("scope_attestation_mismatch");

    const identity = await compile();
    const relabeled = structuredClone(identity);
    relabeled.core.organizationId = "org-b";
    expect(await codes([relabeled])).toEqual(expect.arrayContaining(["identity_fingerprint_mismatch", "scope_attestation_mismatch", "source_binding_scope_mismatch"]));
  });

  it("does not accept a serialized attestation after authorization has been revoked", async () => {
    const identity = await compile();
    expect(await codes([identity], makeResolver({authorized: false}))).toContain("scope_authorization_failed");
    await expect(appendGovernedDocumentLifecycle(identity, lifecycle({recordedAt: "2026-09-01T10:05:00.000Z"}), makeResolver({authorized: false}))).rejects.toThrow("scope_not_authorized");
  });

  it("resolves source locator, immutability, object version and bytes instead of trusting claims", async () => {
    await expect(compile({}, makeResolver({source: {immutable: false}}))).rejects.toThrow("source_snapshot_not_immutable");
    await expect(compile({}, makeResolver({source: {locatorRef: "sha256:wrong"}}))).rejects.toThrow("source_snapshot_locator_mismatch");
    await expect(compile({}, makeResolver({source: {bytes: encoder.encode("different")}}))).rejects.toThrow("source_bytes_hash_mismatch");
    expect(() => input({sourceSnapshot: {state: "versioned_object", locatorRef: "storage:file", objectVersionRef: null} as never})).not.toThrow();
    await expect(compileGovernedDocumentIdentity(input({sourceSnapshot: {state: "versioned_object", locatorRef: "storage:file", objectVersionRef: null} as never}), makeResolver())).rejects.toThrow();

    const versioned: SnapshotLocator = {state: "versioned_object", locatorRef: "storage:file", objectVersionRef: "etag:one"};
    await expect(compile({sourceSnapshot: versioned}, makeResolver({source: {objectVersionRef: "etag:two"}}))).rejects.toThrow("source_snapshot_version_mismatch");
  });

  it("resolves derivative bytes and exact registered tool configuration", async () => {
    const badArtifacts = new Map([[layerLocator.locatorRef, {found: true, immutable: true, locatorRef: layerLocator.locatorRef, objectVersionRef: null, bytes: encoder.encode("tampered")}]]);
    await expect(compile({}, makeResolver({artifacts: badArtifacts}))).rejects.toThrow("artifact_hash_mismatch");
    await expect(compile({}, makeResolver({registeredTools: new Set()}))).rejects.toThrow("tool_not_registered");
    await expect(compile({lifecycle: lifecycle({toolchain: [{...parser, configurationSha256: hash("other-config")}]})})).rejects.toThrow("tool_not_registered");
  });

  it("keeps immutable identity stable while append-only enrichment changes lifecycle", async () => {
    const first = await compile();
    const appended = await appendGovernedDocumentLifecycle(first, lifecycle({recordedAt: "2026-09-01T10:05:00.000Z", informationClass: "reviewed"}), makeResolver());
    expect(appended.core.identityFingerprint).toBe(first.core.identityFingerprint);
    expect(appended.lifecycleHistory).toHaveLength(2);
    expect(appended.lifecycleHistory[1]?.previousLifecycleFingerprint).toBe(first.lifecycleHistory[0]?.lifecycleFingerprint);
    expect(appended.lifecycleHistory[1]?.lifecycleFingerprint).not.toBe(first.lifecycleHistory[0]?.lifecycleFingerprint);
    expect((await validateGovernedDocumentIdentityGraph([appended], makeResolver())).status).toBe("valid");
  });

  it("detects lifecycle mutation, revision gaps and broken append-only backlinks", async () => {
    const first = await compile();
    const appended = await appendGovernedDocumentLifecycle(first, lifecycle({recordedAt: "2026-09-01T10:05:00.000Z"}), makeResolver());
    const tampered = structuredClone(appended);
    tampered.lifecycleHistory[0]!.informationClass = "management";
    tampered.lifecycleHistory[1]!.revision = 4;
    tampered.lifecycleHistory[1]!.previousLifecycleFingerprint = "0".repeat(64);
    tampered.lifecycleHistory[1]!.recordedAt = "2026-09-01T10:03:00.000Z";
    expect(await codes([tampered])).toEqual(expect.arrayContaining(["lifecycle_fingerprint_mismatch", "lifecycle_revision_gap", "lifecycle_previous_mismatch", "lifecycle_recorded_at_not_monotonic"]));
  });

  it("enforces capture, production and lifecycle chronology", async () => {
    const identity = await compile({lifecycle: lifecycle({
      asOf: "2026-09-02T00:00:00.000Z",
      recordedAt: "2026-09-01T09:00:00.000Z",
      extractedLayers: [{...lifecycle().extractedLayers[0]!, producedAt: "2026-08-31T00:00:00.000Z"}],
      derivatives: [],
    })});
    expect(await codes([identity])).toEqual(expect.arrayContaining(["as_of_after_capture", "lifecycle_before_capture", "producer_before_capture"]));

    const producedLate = await compile({lifecycle: lifecycle({
      recordedAt: "2026-09-01T10:01:00.000Z",
      extractedLayers: [{...lifecycle().extractedLayers[0]!, producedAt: "2026-09-01T10:02:00.000Z"}],
      derivatives: [],
    })});
    expect(await codes([producedLate])).toContain("producer_after_lifecycle");
  });

  it("requires scoped coverage with a verified backlink to the immutable identity", async () => {
    const base = await compile();
    const claim = {kind: "coverage_map" as const, ref: "coverage:map-a", fingerprint: hash("coverage-a")};
    const wrongCoverage = new Map([[claim.ref, {found: true, organizationId: "org-b", projectId: "project-a", documentId: "document-a", version: 1, fingerprint: claim.fingerprint, backlinkIdentityFingerprint: base.core.identityFingerprint}]]);
    await expect(appendGovernedDocumentLifecycle(base, lifecycle({recordedAt: "2026-09-01T10:05:00.000Z", coverage: [claim]}), makeResolver({coverage: wrongCoverage}))).rejects.toThrow("coverage_scope_mismatch");

    const wrongBacklink = new Map([[claim.ref, {found: true, organizationId: "org-a", projectId: "project-a", documentId: "document-a", version: 1, fingerprint: claim.fingerprint, backlinkIdentityFingerprint: "0".repeat(64)}]]);
    await expect(appendGovernedDocumentLifecycle(base, lifecycle({recordedAt: "2026-09-01T10:05:00.000Z", coverage: [claim]}), makeResolver({coverage: wrongBacklink}))).rejects.toThrow("coverage_backlink_mismatch");

    const wrongFingerprint = new Map([[claim.ref, {found: true, organizationId: "org-a", projectId: "project-a", documentId: "document-a", version: 1, fingerprint: hash("other-coverage"), backlinkIdentityFingerprint: base.core.identityFingerprint}]]);
    await expect(appendGovernedDocumentLifecycle(base, lifecycle({recordedAt: "2026-09-01T10:05:00.000Z", coverage: [claim]}), makeResolver({coverage: wrongFingerprint}))).rejects.toThrow("coverage_unverified");
  });

  it("detects globally inconsistent supersession and accepts one contiguous current chain", async () => {
    const v1Bytes = sourceBytes;
    const v2Bytes = encoder.encode("version two");
    const v2Hash = hash(v2Bytes);
    const v2Locator: SnapshotLocator = {state: "content_addressed", locatorRef: `sha256:${v2Hash}`, objectVersionRef: null};
    const v1 = await compile();
    const v2Resolver = makeResolver({scope: {organizationId: "org-a", projectId: "project-a", documentId: "document-a", version: 2}, source: {bytes: v2Bytes}});
    const v2 = await compile({
      version: 2,
      parentVersion: sourceRef({version: 1, sourceBytesSha256: hash(v1Bytes)}),
      sourceSnapshot: v2Locator,
      claimedSourceBytesSha256: v2Hash,
      lifecycle: lifecycle({extractedLayers: [], derivatives: []}),
    }, v2Resolver);
    expect(await codes([v1, v2], makeResolver())).toEqual(expect.arrayContaining(["supersession_multiple_current", "supersession_orphaned_version"]));

    const linkedV1 = await appendGovernedDocumentLifecycle(v1, lifecycle({
      recordedAt: "2026-09-01T10:06:00.000Z",
      supersession: {state: "superseded", supersededBy: sourceRef({version: 2, sourceBytesSha256: v2Hash}), reasonRef: "decision:new-version"},
    }), makeResolver());
    const combinedResolver: GovernedDocumentIdentityResolver = {
      ...makeResolver(),
      async resolveScope(request) {
        const base = await makeResolver().resolveScope(request);
        return {...base, version: request.version};
      },
      async resolveSnapshot(locator) {
        return locator.locatorRef === v2Locator.locatorRef
          ? {found: true, immutable: true, locatorRef: locator.locatorRef, objectVersionRef: null, bytes: v2Bytes}
          : {found: true, immutable: true, locatorRef: locator.locatorRef, objectVersionRef: null, bytes: sourceBytes};
      },
    };
    expect((await validateGovernedDocumentIdentityGraph([linkedV1, v2], combinedResolver)).status).toBe("valid");
  });

  it("detects derivative cycles and unknown or forged parents", async () => {
    const identity = await compile();
    const tampered = structuredClone(identity);
    const current = tampered.lifecycleHistory[0]!;
    current.derivatives[0]!.parentRefs = [{kind: "derivative", derivativeId: "missing", contentSha256: hash("missing")}];
    expect(await codes([tampered])).toEqual(expect.arrayContaining(["derivative_parent_not_found", "lifecycle_fingerprint_mismatch"]));
  });

  it("detects identical bytes relabeled as a new document version", async () => {
    const v1 = await compile();
    const v2 = await compile({
      version: 2,
      parentVersion: sourceRef(),
      lifecycle: lifecycle({extractedLayers: [], derivatives: []}),
    }, makeResolver({scope: {organizationId: "org-a", projectId: "project-a", documentId: "document-a", version: 2}}));
    const resolver: GovernedDocumentIdentityResolver = {
      ...makeResolver(),
      async resolveScope(request) {
        return {...await makeResolver().resolveScope(request), version: request.version};
      },
    };
    expect(await codes([v1, v2], resolver)).toContain("hash_reused_across_versions");
  });

  it("rejects PII-shaped user, service and integration actor references", async () => {
    for (const bad of [
      {kind: "user" as const, ref: "user:person@example.com"},
      {kind: "service" as const, ref: "service:carlos-silva"},
      {kind: "integration" as const, ref: "integration:dropbox-customer-name"},
    ]) await expect(compileGovernedDocumentIdentity(input({capturedBy: bad}), makeResolver())).rejects.toThrow();
  });

  it("maps both current source_documents scopes without inventing project identity", () => {
    const mapped = mapSourceDocumentsRowBinding({
      id: "document-a", organization_id: "org-a", opportunity_id: "opportunity-a", intake_session_id: "session-a", document_version: 1,
      bucket_id: "opportunity-documents", object_path: "org-a/session-a/document-a", sha256: sourceHash, sha256_verified_at: "2026-09-01T10:01:00.000Z",
    });
    expect(mapped).toEqual(binding);
    expect(() => mapSourceDocumentsRowBinding({
      id: "document-a", organization_id: "org-a", opportunity_id: null, intake_session_id: null, document_version: 1,
      bucket_id: "opportunity-documents", object_path: "org-a/document-a", sha256: null, sha256_verified_at: null,
    })).toThrow("source_documents requires opportunity_id or intake_session_id");
  });

  it("keeps arbitrary external data rooms explicitly unsupported", async () => {
    const identity = await compile({source: {origin: "external_data_room", sourceClass: "provided_documents", sourceRef: "dataroom:room-a", integration: {status: "verified_connector", connectorId: "unknown-room"}}});
    expect(await codes([identity])).toContain("external_data_room_not_supported");
  });

  it("detects forged core and lifecycle fingerprints on persisted records", async () => {
    const identity = await compile();
    const forged = governedDocumentVersionIdentitySchema.parse({
      ...identity,
      core: {...identity.core, identityFingerprint: "0".repeat(64)},
      lifecycleHistory: identity.lifecycleHistory.map((entry) => ({...entry, lifecycleFingerprint: "1".repeat(64)})),
    });
    expect(await codes([forged])).toEqual(expect.arrayContaining(["identity_fingerprint_mismatch", "lifecycle_fingerprint_mismatch"]));
  });
});
