import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  bindGovernedDocumentIdentityServer,
  governedDocumentVersionIdentitySchema,
  type ArtifactResolution,
  type AtomicSourceDocumentResolution,
  type CompileGovernedDocumentIdentityInput,
  type DocumentLifecycleInput,
  type DocumentSourceOrigin,
  type DocumentToolIdentity,
  type GovernedDocumentIdentityServer,
  type GovernedDocumentServerTrustRoot,
  type GovernedDocumentVersionIdentity,
  type SnapshotLocator,
} from "./governed-document-identity";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  project: "22222222-2222-4222-8222-222222222222",
  company: "33333333-3333-4333-8333-333333333333",
  conversation: "44444444-4444-4444-8444-444444444444",
  document: "55555555-5555-4555-8555-555555555555",
  opportunity: "66666666-6666-4666-8666-666666666666",
  intake: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  service: "99999999-9999-4999-8999-999999999999",
  registry: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  source: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  attestation: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  tool: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  layer: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  reason: "12345678-1234-4234-8234-123456789012",
  coverage: "23456789-2345-4345-8345-234567890123",
};
const encoder = new TextEncoder();
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
};
const fingerprint = (value: unknown) => hash(encoder.encode(stable(value)));
const sourceBytes = encoder.encode("immutable audited statements");
const layerBytes = encoder.encode("immutable extracted layer");
const parser: DocumentToolIdentity = {toolId: ids.tool, version: "1.2.3", configurationSha256: hash("parser-config")};
const actor = {kind: "user" as const, id: ids.user};
const serviceActor = {kind: "service" as const, id: ids.service};

function sourceOrigin(overrides: Partial<DocumentSourceOrigin> = {}): DocumentSourceOrigin {
  return {registryId: ids.registry, registryVersion: 1, origin: "user_upload", sourceClass: "provided_documents", sourceId: ids.source, integration: {status: "native", connectorId: null}, ...overrides};
}

function storageLocator(bucketId: string, objectPath: string): SnapshotLocator {
  return {state: "versioned_object", locatorRef: `storage:${fingerprint({bucketId, objectPath})}`, objectVersionRef: "etag:immutable-1"};
}

function makeSource(version = 1, bytes = sourceBytes, overrides: Partial<AtomicSourceDocumentResolution> = {}): AtomicSourceDocumentResolution {
  const bucketId = "opportunity-documents";
  const objectPath = `${ids.organization}/${ids.document}/v${version}`;
  const capturedAt = "2026-09-01T10:00:00.000Z";
  const row = {
    id: ids.document, organization_id: ids.organization, opportunity_id: ids.opportunity, intake_session_id: ids.intake,
    document_version: version, bucket_id: bucketId, object_path: objectPath, object_version: "etag:immutable-1",
    sha256: hash(bytes), sha256_verified_at: "2026-09-01T10:00:30.000Z",
  };
  const source = sourceOrigin();
  const sourceSnapshot = storageLocator(bucketId, objectPath);
  const base = {
    found: true, authorized: true, organizationId: ids.organization, projectId: ids.project, companyId: ids.company,
    conversationId: ids.conversation, documentId: ids.document, row, source, sourceSnapshot, capturedAt, actor,
    bytes, immutable: true,
  };
  const merged = {...base, ...overrides} as Omit<AtomicSourceDocumentResolution, "attestation">;
  const authorizationVersion = "workspace-authz.v1";
  const authorizedAt = "2026-09-01T09:59:00.000Z";
  const payload = {
    organizationId: merged.organizationId, projectId: merged.projectId, companyId: merged.companyId, conversationId: merged.conversationId,
    documentId: merged.documentId, row: merged.row, source: merged.source, sourceSnapshot: merged.sourceSnapshot, capturedAt: merged.capturedAt,
    actor: merged.actor, immutable: merged.immutable, sourceBytesSha256: merged.bytes ? hash(merged.bytes) : hash("missing"), sourceByteSize: merged.bytes?.byteLength ?? 0,
    authorizationVersion, authorizedAt,
  };
  return {...merged, attestation: {attestationId: ids.attestation, signingKeyId: ids.key, payloadSha256: fingerprint(payload), signature: hash(`signed:${fingerprint(payload)}`), authorizationVersion, authorizedAt, signedAt: "2026-09-01T10:01:00.000Z"}};
}

type RootOptions = {
  sources?: Map<number, AtomicSourceDocumentResolution>;
  currentActor?: typeof actor | typeof serviceActor;
  registeredActors?: Set<string>;
  registeredTools?: Set<string>;
  sourceRegistration?: DocumentSourceOrigin | null;
  signatureValid?: boolean;
  artifacts?: Map<string, ArtifactResolution>;
  records?: Map<number, GovernedDocumentVersionIdentity>;
  now?: string;
};

function toolKey(tool: DocumentToolIdentity) { return stable(tool); }

function makeRoot(options: RootOptions = {}): GovernedDocumentServerTrustRoot {
  const sources = options.sources ?? new Map([[1, makeSource()]]);
  const artifacts = options.artifacts ?? new Map<string, ArtifactResolution>();
  const records = options.records ?? new Map<number, GovernedDocumentVersionIdentity>();
  const currentActor = options.currentActor ?? actor;
  const registeredActors = options.registeredActors ?? new Set([stable(actor), stable(serviceActor)]);
  const registeredTools = options.registeredTools ?? new Set([toolKey(parser)]);
  return {
    async resolveOperationActor() { return currentActor; },
    async isActorRegistered(candidate) { return registeredActors.has(stable(candidate)); },
    async resolveSourceDocument(_sourceDocumentId, version) { return sources.get(version) ?? makeSource(version, sourceBytes, {found: false, bytes: null}); },
    async verifySourceAttestation() { return options.signatureValid ?? true; },
    async resolveSourceRegistration() { return options.sourceRegistration === undefined ? sourceOrigin() : options.sourceRegistration; },
    async resolveArtifact(artifactId) { return artifacts.get(artifactId) ?? {found: false, immutable: false, artifactId, locator: {state: "content_addressed", locatorRef: `sha256:${hash("missing")}`, objectVersionRef: null}, bytes: null, producedBy: parser, producedAt: "2026-09-01T10:02:00.000Z"}; },
    async resolveCoverage(claim) { return {found: false, organizationId: ids.organization, projectId: ids.project, companyId: ids.company, conversationId: ids.conversation, documentId: ids.document, version: 1, fingerprint: claim.fingerprint, backlinkIdentityFingerprint: hash("missing")}; },
    async isToolRegistered(tool) { return registeredTools.has(toolKey(tool)); },
    async resolvePersistedVersion(reference) { return records.get(reference.version) ?? null; },
    now() { return options.now ?? "2026-09-01T10:05:00.000Z"; },
  };
}

function compileInput(overrides: Partial<CompileGovernedDocumentIdentityInput> = {}): CompileGovernedDocumentIdentityInput {
  return {
    sourceDocumentId: ids.document,
    sourceDocumentVersion: 1,
    lifecycle: {asOf: "2026-08-31T23:59:59.000Z", dataClass: "project_confidential", informationClass: "audited", confidentiality: "confidential", extractedLayers: [], coverage: [], derivatives: []},
    ...overrides,
  };
}

function appendInput(overrides: Partial<DocumentLifecycleInput> = {}): DocumentLifecycleInput {
  return {
    asOf: "2026-08-31T23:59:59.000Z", dataClass: "project_confidential", informationClass: "reviewed", confidentiality: "confidential",
    extractedLayers: [], coverage: [], derivatives: [], supersession: {state: "current", successorVersion: null, reasonId: null}, ...overrides,
  };
}

async function compile(server = bindGovernedDocumentIdentityServer(makeRoot()), overrides: Partial<CompileGovernedDocumentIdentityInput> = {}) {
  return server.compile(compileInput(overrides));
}

async function makeVersionPair() {
  const records = new Map<number, GovernedDocumentVersionIdentity>();
  const sources = new Map([[1, makeSource()], [2, makeSource(2, encoder.encode("version two"))]]);
  const root = makeRoot({sources, records});
  const server = bindGovernedDocumentIdentityServer(root);
  const v1 = await server.compile(compileInput());
  records.set(1, v1);
  const v2 = await server.compile(compileInput({sourceDocumentVersion: 2}));
  records.set(2, v2);
  return {server, records, v1, v2};
}

describe("governed document identity v3", () => {
  it("binds one server-side trust root and rejects caller-supplied authority fields", async () => {
    const root = makeRoot();
    const server = bindGovernedDocumentIdentityServer(root);
    const record = await server.compile(compileInput());
    expect(record.core.organizationId).toBe(ids.organization);
    await expect(server.compile({...compileInput(), organizationId: "aaaaaaaa-1111-4111-8111-111111111111"} as never)).rejects.toThrow();
    await expect(server.compile({...compileInput(), actor, attestation: makeSource().attestation} as never)).rejects.toThrow();
  });

  it("atomically binds source_documents scope, version, storage object, verified hash, bytes and signed attestation", async () => {
    const original = makeSource();
    const mutations: Partial<AtomicSourceDocumentResolution>[] = [
      {row: {...original.row, organization_id: "aaaaaaaa-1111-4111-8111-111111111111"}},
      {row: {...original.row, document_version: 2}},
      {sourceSnapshot: {...original.sourceSnapshot, locatorRef: "storage:wrong"}},
      {sourceSnapshot: {state: "versioned_object", locatorRef: original.sourceSnapshot.locatorRef, objectVersionRef: "etag:moved"}},
      {row: {...original.row, sha256: hash("forged")}},
      {bytes: encoder.encode("different bytes")},
    ];
    for (const mutation of mutations) {
      const source = makeSource(1, sourceBytes, mutation);
      const server = bindGovernedDocumentIdentityServer(makeRoot({sources: new Map([[1, source]])}));
      await expect(server.compile(compileInput())).rejects.toThrow();
    }
    await expect(bindGovernedDocumentIdentityServer(makeRoot({signatureValid: false})).compile(compileInput())).rejects.toThrow("source_attestation_invalid");
  });

  it("fails closed when authorization is absent or later revoked", async () => {
    const denied = makeSource(1, sourceBytes, {authorized: false});
    await expect(bindGovernedDocumentIdentityServer(makeRoot({sources: new Map([[1, denied]])})).compile(compileInput())).rejects.toThrow("scope_authorization_failed");
    const record = await compile();
    await expect(bindGovernedDocumentIdentityServer(makeRoot({sources: new Map([[1, denied]])})).append(record, appendInput())).rejects.toThrow("scope_authorization_failed");
  });

  it("validates the complete existing lifecycle before append and the complete result before return", async () => {
    const server = bindGovernedDocumentIdentityServer(makeRoot());
    const record = await compile(server);
    const tampered = structuredClone(record);
    tampered.lifecycleHistory[0]!.informationClass = "management";
    await expect(server.append(tampered, appendInput())).rejects.toThrow("lifecycle_fingerprint_mismatch");
    await expect(server.compile(compileInput({lifecycle: {...compileInput().lifecycle, asOf: "2026-09-02T00:00:00.000Z"}}))).rejects.toThrow("as_of_after_capture");
    await expect(bindGovernedDocumentIdentityServer(makeRoot({now: "2026-08-31T00:00:00.000Z"})).compile(compileInput())).rejects.toThrow("lifecycle_before_capture");
  });

  it("enforces irreversible lifecycle state transitions", async () => {
    const server = bindGovernedDocumentIdentityServer(makeRoot());
    const current = await compile(server);
    const withdrawn = await server.append(current, appendInput({supersession: {state: "withdrawn", successorVersion: null, reasonId: ids.reason}}));
    await expect(server.append(withdrawn, appendInput())).rejects.toThrow("supersession_illegal_transition");
    await expect(server.append(withdrawn, appendInput({supersession: {state: "rejected", successorVersion: null, reasonId: ids.reason}}))).rejects.toThrow("supersession_illegal_transition");
  });

  it("requires a real, coherent and active successor before supersession", async () => {
    const server = bindGovernedDocumentIdentityServer(makeRoot());
    const v1 = await compile(server);
    await expect(server.append(v1, appendInput({supersession: {state: "superseded", successorVersion: 2, reasonId: ids.reason}}))).rejects.toThrow("supersession_target_not_found");
    const pair = await makeVersionPair();
    const linked = await pair.server.append(pair.v1, appendInput({supersession: {state: "superseded", successorVersion: 2, reasonId: ids.reason}}));
    expect((await pair.server.validateGraph([linked, pair.v2])).status).toBe("valid");
    await expect(pair.server.append(linked, appendInput())).rejects.toThrow("supersession_illegal_transition");
    pair.records.delete(2);
    await expect(pair.server.append(linked, appendInput({supersession: {state: "superseded", successorVersion: 2, reasonId: ids.reason}}))).rejects.toThrow("supersession_target_not_found");
  });

  it("keeps layer and derivative IDs immutable across the full append-only history", async () => {
    const locator: SnapshotLocator = {state: "content_addressed", locatorRef: `sha256:${hash(layerBytes)}`, objectVersionRef: null};
    const artifacts = new Map([[ids.layer, {found: true, immutable: true, artifactId: ids.layer, locator, bytes: layerBytes, producedBy: parser, producedAt: "2026-09-01T10:02:00.000Z"} satisfies ArtifactResolution]]);
    const root = makeRoot({artifacts});
    const server = bindGovernedDocumentIdentityServer(root);
    const parentRefs = [{kind: "source_document" as const}];
    const initial = await server.compile(compileInput({lifecycle: {...compileInput().lifecycle, extractedLayers: [{artifactId: ids.layer, layerKind: "pdf", parentRefs, coverage: []}]}}));
    await expect(server.append(initial, appendInput({extractedLayers: [{artifactId: ids.layer, layerKind: "spreadsheet", parentRefs, coverage: []}]}))).rejects.toThrow("artifact_identity_mutated");
  });

  it("derives recordedBy and registered source/connector metadata from server registries", async () => {
    const server = bindGovernedDocumentIdentityServer(makeRoot({currentActor: serviceActor, sources: new Map([[1, makeSource(1, sourceBytes, {actor: serviceActor})]])}));
    const record = await server.compile(compileInput());
    expect(record.lifecycleHistory[0]?.recordedBy).toEqual(serviceActor);
    await expect(server.compile({...compileInput(), recordedBy: actor, source: sourceOrigin()} as never)).rejects.toThrow();
    await expect(bindGovernedDocumentIdentityServer(makeRoot({sourceRegistration: {...sourceOrigin(), sourceId: "34567890-3456-4456-8456-345678901234"}})).compile(compileInput())).rejects.toThrow("source_registry_mismatch");
    await expect(bindGovernedDocumentIdentityServer(makeRoot({registeredActors: new Set()})).compile(compileInput())).rejects.toThrow("actor_not_registered");
  });

  it("governs company and conversation scope and enforces authorization chronology", async () => {
    const record = await compile();
    expect(record.core).toMatchObject({companyId: ids.company, conversationId: ids.conversation});
    const lateAuth = makeSource();
    lateAuth.attestation.authorizedAt = "2026-09-01T10:00:01.000Z";
    await expect(bindGovernedDocumentIdentityServer(makeRoot({sources: new Map([[1, lateAuth]])})).compile(compileInput())).rejects.toThrow("authorization_after_capture");
  });

  it("requires content-addressed artifact locators to encode their actual hash", async () => {
    const badLocator: SnapshotLocator = {state: "content_addressed", locatorRef: `sha256:${hash("wrong")}`, objectVersionRef: null};
    const artifacts = new Map([[ids.layer, {found: true, immutable: true, artifactId: ids.layer, locator: badLocator, bytes: layerBytes, producedBy: parser, producedAt: "2026-09-01T10:02:00.000Z"} satisfies ArtifactResolution]]);
    const server = bindGovernedDocumentIdentityServer(makeRoot({artifacts}));
    await expect(server.compile(compileInput({lifecycle: {...compileInput().lifecycle, extractedLayers: [{artifactId: ids.layer, layerKind: "pdf", parentRefs: [{kind: "source_document"}], coverage: []}]}}))).rejects.toThrow("content_addressed_locator_mismatch");
  });

  it("emits only hashed opaque references in validation reports", async () => {
    const server = bindGovernedDocumentIdentityServer(makeRoot());
    const record = await compile(server);
    const forged = governedDocumentVersionIdentitySchema.parse({...record, core: {...record.core, identityFingerprint: "0".repeat(64)}});
    const report = await server.validateGraph([forged]);
    expect(report.status).toBe("invalid");
    expect(report.issues.every((issue) => /^sha256:[a-f0-9]{64}$/.test(issue.recordRef) && (issue.relatedRef === null || /^sha256:[a-f0-9]{64}$/.test(issue.relatedRef)))).toBe(true);
    expect(JSON.stringify(report.issues)).not.toContain(ids.organization);
    expect(JSON.stringify(report.issues)).not.toContain(ids.document);
  });
});
