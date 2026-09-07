import {createHash, createHmac} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  bindGovernedDocumentIdentityServer,
  governedDocumentVersionIdentitySchema,
  type ArtifactAttestation,
  type ArtifactResolution,
  type AtomicSourceDocumentResolution,
  type CompileGovernedDocumentIdentityInput,
  type DocumentLifecycleInput,
  type DocumentSourceOrigin,
  type DocumentToolIdentity,
  type GovernedDocumentServerTrustRoot,
  type GovernedDocumentVersionIdentity,
  type LifecycleJournalAttestation,
  type SnapshotLocator,
  type SourceAttestation,
} from "./governed-document-identity";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111", project: "22222222-2222-4222-8222-222222222222",
  company: "33333333-3333-4333-8333-333333333333", conversation: "44444444-4444-4444-8444-444444444444",
  document: "55555555-5555-4555-8555-555555555555", opportunity: "66666666-6666-4666-8666-666666666666",
  intake: "77777777-7777-4777-8777-777777777777", user: "88888888-8888-4888-8888-888888888888",
  service: "99999999-9999-4999-8999-999999999999", registry: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  source: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  sourceAttestation: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", tool: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  layer: "ffffffff-ffff-4fff-8fff-ffffffffffff", reason: "12345678-1234-4234-8234-123456789012",
  execution: "23456789-2345-4345-8345-234567890123", artifactAttestation: "34567890-3456-4456-8456-345678901234",
  journalAttestation: "45678901-4567-4567-8567-456789012345", recordV1: "56789012-5678-4678-8678-567890123456",
  recordV2: "67890123-6789-4789-8789-678901234567",
};
const signingSecret = "unit-test-server-secret";
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

type GenericAttestation = ArtifactAttestation | LifecycleJournalAttestation;
function signBody(body: unknown, attestationId: string): GenericAttestation {
  const metadata = {attestationId, signingKeyId: ids.key, signatureAlgorithm: "ed25519" as const, signatureVersion: 1, signedAt: "2026-09-01T10:01:00.000Z"};
  const payloadSha256 = fingerprint({body, ...metadata});
  return {...metadata, payloadSha256, signature: createHmac("sha256", signingSecret).update(payloadSha256).digest("base64url")};
}
function signatureValid(body: unknown, attestation: GenericAttestation) {
  const metadata = {attestationId: attestation.attestationId, signingKeyId: attestation.signingKeyId, signatureAlgorithm: attestation.signatureAlgorithm, signatureVersion: attestation.signatureVersion, signedAt: attestation.signedAt};
  const payloadSha256 = fingerprint({body, ...metadata});
  return payloadSha256 === attestation.payloadSha256 && createHmac("sha256", signingSecret).update(payloadSha256).digest("base64url") === attestation.signature;
}

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
  const row = {id: ids.document, organization_id: ids.organization, opportunity_id: ids.opportunity, intake_session_id: ids.intake, document_version: version, bucket_id: bucketId, object_path: objectPath, object_version: "etag:immutable-1", sha256: hash(bytes), sha256_verified_at: "2026-09-01T10:00:30.000Z"};
  const base = {found: true, authorized: true, identityRecordId: version === 1 ? ids.recordV1 : ids.recordV2, organizationId: ids.organization, projectId: ids.project, companyId: ids.company, conversationId: ids.conversation, documentId: ids.document, row, source: sourceOrigin(), sourceSnapshot: storageLocator(bucketId, objectPath), capturedAt, actor, bytes, immutable: true};
  const merged = {...base, ...overrides} as Omit<AtomicSourceDocumentResolution, "attestation">;
  const authorization = {authorizationVersion: "workspace-authz.v1", authorizedAt: "2026-09-01T09:59:00.000Z"};
  const body = {identityRecordId: merged.identityRecordId, organizationId: merged.organizationId, projectId: merged.projectId, companyId: merged.companyId, conversationId: merged.conversationId, documentId: merged.documentId, row: merged.row, source: merged.source, sourceSnapshot: merged.sourceSnapshot, capturedAt: merged.capturedAt, actor: merged.actor, immutable: merged.immutable, sourceBytesSha256: merged.bytes ? hash(merged.bytes) : hash("missing"), sourceByteSize: merged.bytes?.byteLength ?? 0, ...authorization};
  return {...merged, attestation: {...signBody(body, ids.sourceAttestation), ...authorization} as SourceAttestation};
}

function sourceReference(record: GovernedDocumentVersionIdentity) {
  const core = record.core;
  return {kind: "source_version" as const, version: {organizationId: core.organizationId, projectId: core.projectId, companyId: core.companyId, conversationId: core.conversationId, documentId: core.documentId, version: core.version, sourceBytesSha256: core.sourceBytes.sha256, identityFingerprint: core.identityFingerprint}};
}
function artifactBody(artifact: Omit<ArtifactResolution, "attestation">, contentSha256: string) {
  return {artifactId: artifact.artifactId, organizationId: artifact.organizationId, projectId: artifact.projectId, companyId: artifact.companyId, conversationId: artifact.conversationId, documentId: artifact.documentId, documentVersion: artifact.documentVersion, sourceBytesSha256: artifact.sourceBytesSha256, identityFingerprint: artifact.identityFingerprint, immutable: artifact.immutable, locator: artifact.locator, contentSha256, byteSize: artifact.bytes?.byteLength ?? 0, producedBy: artifact.producedBy, producerExecutionId: artifact.producerExecutionId, producedAt: artifact.producedAt, parentRefs: artifact.parentRefs, coverage: artifact.coverage};
}
function makeArtifact(record: GovernedDocumentVersionIdentity, overrides: Partial<ArtifactResolution> = {}): ArtifactResolution {
  const core = record.core;
  const base = {found: true, immutable: true, artifactId: ids.layer, organizationId: core.organizationId, projectId: core.projectId, companyId: core.companyId, conversationId: core.conversationId, documentId: core.documentId, documentVersion: core.version, sourceBytesSha256: core.sourceBytes.sha256, identityFingerprint: core.identityFingerprint, locator: {state: "content_addressed" as const, locatorRef: `sha256:${hash(layerBytes)}`, objectVersionRef: null}, bytes: layerBytes, producedBy: parser, producerExecutionId: ids.execution, producedAt: "2026-09-01T10:02:00.000Z", parentRefs: [sourceReference(record)], coverage: []};
  const merged = {...base, ...overrides} as Omit<ArtifactResolution, "attestation">;
  return {...merged, attestation: signBody(artifactBody(merged, merged.bytes ? hash(merged.bytes) : hash("missing")), ids.artifactAttestation)};
}

type RootOptions = {
  sources?: Map<number, AtomicSourceDocumentResolution>; currentActor?: typeof actor | typeof serviceActor; registeredActors?: Set<string>;
  registeredTools?: Set<string>; sourceRegistration?: DocumentSourceOrigin | null; artifacts?: Map<string, ArtifactResolution>;
  records?: Map<number, GovernedDocumentVersionIdentity>; canonical?: Map<string, GovernedDocumentVersionIdentity>; authorizedAppend?: boolean; now?: string;
};
function toolKey(tool: DocumentToolIdentity) { return stable(tool); }
function makeRoot(options: RootOptions = {}): GovernedDocumentServerTrustRoot {
  const sources = options.sources ?? new Map([[1, makeSource()]]);
  const artifacts = options.artifacts ?? new Map<string, ArtifactResolution>();
  const records = options.records ?? new Map<number, GovernedDocumentVersionIdentity>();
  const canonical = options.canonical ?? new Map<string, GovernedDocumentVersionIdentity>();
  const currentActor = options.currentActor ?? actor;
  const registeredActors = options.registeredActors ?? new Set([stable(actor), stable(serviceActor)]);
  const registeredTools = options.registeredTools ?? new Set([toolKey(parser)]);
  return {
    async resolveOperationActor() { return currentActor; }, async isActorRegistered(candidate) { return registeredActors.has(stable(candidate)); },
    async resolveSourceDocument(_id, version) { return sources.get(version) ?? makeSource(version, sourceBytes, {found: false, bytes: null}); },
    async verifySourceAttestation(resolution) { const {authorizationVersion: _v, authorizedAt: _a, ...generic} = resolution.attestation; const body = {identityRecordId: resolution.identityRecordId, organizationId: resolution.organizationId, projectId: resolution.projectId, companyId: resolution.companyId, conversationId: resolution.conversationId, documentId: resolution.documentId, row: resolution.row, source: resolution.source, sourceSnapshot: resolution.sourceSnapshot, capturedAt: resolution.capturedAt, actor: resolution.actor, immutable: resolution.immutable, sourceBytesSha256: resolution.bytes ? hash(resolution.bytes) : hash("missing"), sourceByteSize: resolution.bytes?.byteLength ?? 0, authorizationVersion: resolution.attestation.authorizationVersion, authorizedAt: resolution.attestation.authorizedAt}; return signatureValid(body, generic); },
    async resolveSourceRegistration() { return options.sourceRegistration === undefined ? sourceOrigin() : options.sourceRegistration; },
    async resolveArtifact(artifactId) { return artifacts.get(artifactId) ?? makeArtifact([...canonical.values()][0]!, {found: false, artifactId, bytes: null}); },
    async verifyArtifactAttestation(resolution) { return signatureValid(artifactBody(resolution, resolution.bytes ? hash(resolution.bytes) : hash("missing")), resolution.attestation); },
    async resolveCoverage(claim) { return {found: false, organizationId: ids.organization, projectId: ids.project, companyId: ids.company, conversationId: ids.conversation, documentId: ids.document, version: 1, fingerprint: claim.fingerprint, backlinkIdentityFingerprint: hash("missing")}; },
    async isToolRegistered(tool) { return registeredTools.has(toolKey(tool)); }, async resolvePersistedVersion(reference) { return records.get(reference.version) ?? null; },
    async loadCanonicalIdentity(identityRecordId) { return canonical.get(identityRecordId) ?? null; },
    async authorizeIdentityOperation() { return options.authorizedAppend ?? true; },
    async attestLifecycleJournal(body) { return signBody(body, ids.journalAttestation); }, async verifyLifecycleJournalAttestation(body, attestation) { return signatureValid(body, attestation); },
    now() { return options.now ?? "2026-09-01T10:05:00.000Z"; },
  };
}

function compileInput(overrides: Partial<CompileGovernedDocumentIdentityInput> = {}): CompileGovernedDocumentIdentityInput {
  return {sourceDocumentId: ids.document, sourceDocumentVersion: 1, lifecycle: {asOf: "2026-08-31T23:59:59.000Z", dataClass: "project_confidential", informationClass: "audited", confidentiality: "confidential", extractedLayers: [], coverage: [], derivatives: []}, ...overrides};
}
function appendInput(overrides: Partial<DocumentLifecycleInput> = {}): DocumentLifecycleInput {
  return {asOf: "2026-08-31T23:59:59.000Z", dataClass: "project_confidential", informationClass: "reviewed", confidentiality: "confidential", extractedLayers: [], coverage: [], derivatives: [], supersession: {state: "current", successorVersion: null, reasonId: null}, ...overrides};
}
function harness(options: RootOptions = {}) {
  const records = options.records ?? new Map<number, GovernedDocumentVersionIdentity>();
  const canonical = options.canonical ?? new Map<string, GovernedDocumentVersionIdentity>();
  const root = makeRoot({...options, records, canonical});
  const server = bindGovernedDocumentIdentityServer(root);
  return {root, server, records, canonical, store(record: GovernedDocumentVersionIdentity) { records.set(record.core.version, record); canonical.set(record.core.identityRecordId, record); }};
}

describe("governed document identity v3", () => {
  it("binds and freezes server methods, and rejects authority fields in commands", async () => {
    const h = harness();
    const original = await h.server.compile(compileInput());
    h.root.resolveSourceDocument = async () => makeSource(1, sourceBytes, {organizationId: ids.company});
    expect((await h.server.compile(compileInput())).core.organizationId).toBe(original.core.organizationId);
    await expect(h.server.compile({...compileInput(), organizationId: ids.company, actor, attestation: makeSource().attestation} as never)).rejects.toThrow();
  });

  it("atomically binds scope, row, version, canonical storage key, object version, hash, bytes and signature", async () => {
    const original = makeSource();
    const mutations: Partial<AtomicSourceDocumentResolution>[] = [
      {row: {...original.row, organization_id: ids.company}}, {row: {...original.row, document_version: 2}},
      {sourceSnapshot: {...original.sourceSnapshot, locatorRef: "storage:wrong"}},
      {sourceSnapshot: {state: "versioned_object", locatorRef: original.sourceSnapshot.locatorRef, objectVersionRef: "etag:moved"}},
      {row: {...original.row, sha256: hash("forged")}}, {bytes: encoder.encode("different bytes")},
    ];
    for (const mutation of mutations) await expect(harness({sources: new Map([[1, makeSource(1, sourceBytes, mutation)]])}).server.compile(compileInput())).rejects.toThrow();
    const forged = makeSource(); forged.attestation.signature = "A".repeat(43);
    await expect(harness({sources: new Map([[1, forged]])}).server.compile(compileInput())).rejects.toThrow("source_attestation_invalid");
  });

  it("rejects non-canonical and encoded-traversal object paths", async () => {
    for (const objectPath of ["a//b", "a/./b", "a/../b", "a\\b", "a/%2e%2e/b", "/a/b"]) {
      const source = makeSource(); source.row = {...source.row, object_path: objectPath};
      await expect(harness({sources: new Map([[1, source]])}).server.compile(compileInput())).rejects.toThrow();
    }
  });

  it("loads append state canonically by opaque ref and authorizes the operation", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const appended = await h.server.append(record.core.identityRecordId, appendInput());
    expect(appended.lifecycleHistory).toHaveLength(2);
    await expect(harness({authorizedAppend: false, canonical: new Map([[record.core.identityRecordId, record]])}).server.append(record.core.identityRecordId, appendInput())).rejects.toThrow("operation_authorization_failed");
    await expect(h.server.append(ids.recordV2, appendInput())).rejects.toThrow("source_resolution_failed");
  });

  it("rejects canonical history tampering even after the attacker recalculates its ordinary hash", async () => {
    const h = harness(); const record = await h.server.compile(compileInput());
    const forged = structuredClone(record); const revision = forged.lifecycleHistory[0]!; revision.informationClass = "management";
    const {lifecycleFingerprint: _old, journalAttestation: _attestation, ...body} = revision;
    revision.lifecycleFingerprint = fingerprint({identityFingerprint: forged.core.identityFingerprint, ...body});
    h.store(forged);
    await expect(h.server.append(record.core.identityRecordId, appendInput())).rejects.toThrow("lifecycle_attestation_invalid");
  });

  it("derives artifact scope, parent graph and producer execution only from an attested resolver", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const artifact = makeArtifact(record); const artifacts = new Map([[ids.layer, artifact]]);
    const ah = harness({canonical: h.canonical, records: h.records, artifacts});
    const appended = await ah.server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer, layerKind: "pdf"}]}));
    expect(appended.lifecycleHistory[1]?.extractedLayers[0]).toMatchObject({parentRefs: artifact.parentRefs, producerExecutionId: ids.execution});
    await expect(ah.server.append(record.core.identityRecordId, {...appendInput(), extractedLayers: [{artifactId: ids.layer, layerKind: "pdf", parentRefs: []}]} as never)).rejects.toThrow();
    const wrongScopeParent = sourceReference(record);
    wrongScopeParent.version.organizationId = ids.company;
    for (const mutation of [{projectId: ids.company}, {sourceBytesSha256: hash("other")}, {parentRefs: []}, {parentRefs: [wrongScopeParent]}]) {
      const bad = makeArtifact(record, mutation as Partial<ArtifactResolution>);
      await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, bad]])}).server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer, layerKind: "pdf"}]}))).rejects.toThrow();
    }
  });

  it("rejects artifact signatures and content-addressed locators inconsistent with resolved bytes", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const artifact = makeArtifact(record); artifact.attestation.signature = "B".repeat(43);
    await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, artifact]])}).server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer, layerKind: "pdf"}]}))).rejects.toThrow("artifact_attestation_invalid");
    const wrong = makeArtifact(record, {locator: {state: "content_addressed", locatorRef: `sha256:${hash("wrong")}`, objectVersionRef: null}});
    await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, wrong]])}).server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer, layerKind: "pdf"}]}))).rejects.toThrow("content_addressed_locator_mismatch");
  });

  it("keeps artifact ids immutable throughout the append-only history", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const artifact = makeArtifact(record); const ah = harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, artifact]])});
    const first = await ah.server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer, layerKind: "pdf"}]})); ah.store(first);
    await expect(ah.server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer, layerKind: "spreadsheet"}]}))).rejects.toThrow("artifact_identity_mutated");
  });

  it("enforces irreversible states and a real coherent successor", async () => {
    const h = harness({sources: new Map([[1, makeSource()], [2, makeSource(2, encoder.encode("version two"))]])});
    const v1 = await h.server.compile(compileInput()); h.store(v1);
    await expect(h.server.append(v1.core.identityRecordId, appendInput({supersession: {state: "superseded", successorVersion: 2, reasonId: ids.reason}}))).rejects.toThrow("supersession_target_not_found");
    const v2 = await h.server.compile(compileInput({sourceDocumentVersion: 2})); h.store(v2);
    const linked = await h.server.append(v1.core.identityRecordId, appendInput({supersession: {state: "superseded", successorVersion: 2, reasonId: ids.reason}})); h.store(linked);
    expect((await h.server.validateGraph([linked, v2])).status).toBe("valid");
    await expect(h.server.append(v1.core.identityRecordId, appendInput())).rejects.toThrow("supersession_illegal_transition");
  });

  it("derives recordedBy/source registries and signs all attestation metadata", async () => {
    const source = makeSource(1, sourceBytes, {actor: serviceActor});
    const h = harness({currentActor: serviceActor, sources: new Map([[1, source]])});
    const record = await h.server.compile(compileInput());
    expect(record.lifecycleHistory[0]?.recordedBy).toEqual(serviceActor);
    expect(record.core.sourceAttestation).toMatchObject({signatureAlgorithm: "ed25519", signatureVersion: 1, signingKeyId: ids.key, signedAt: "2026-09-01T10:01:00.000Z"});
    expect(record.lifecycleHistory[0]?.journalAttestation).toMatchObject({attestationId: ids.journalAttestation, signatureAlgorithm: "ed25519"});
    await expect(h.server.compile({...compileInput(), recordedBy: actor, source: sourceOrigin()} as never)).rejects.toThrow();
    await expect(harness({sourceRegistration: {...sourceOrigin(), sourceId: ids.reason}}).server.compile(compileInput())).rejects.toThrow("source_registry_mismatch");
  });

  it("governs company/conversation, chronology and emits only opaque report refs", async () => {
    const h = harness(); const record = await h.server.compile(compileInput());
    expect(record.core).toMatchObject({companyId: ids.company, conversationId: ids.conversation});
    const late = makeSource(); late.attestation.authorizedAt = "2026-09-01T10:00:01.000Z";
    await expect(harness({sources: new Map([[1, late]])}).server.compile(compileInput())).rejects.toThrow("authorization_after_capture");
    const forged = governedDocumentVersionIdentitySchema.parse({...record, core: {...record.core, identityFingerprint: "0".repeat(64)}});
    const report = await h.server.validateGraph([forged]);
    expect(report.issues.every((issue) => /^sha256:[a-f0-9]{64}$/.test(issue.recordRef) && (issue.relatedRef === null || /^sha256:[a-f0-9]{64}$/.test(issue.relatedRef)))).toBe(true);
    expect(JSON.stringify(report.issues)).not.toContain(ids.organization);
  });
});
