import {createHash, createHmac} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  bindGovernedDocumentIdentityServer,
  extractedLayerSemanticIdentitySchema,
  governedDocumentAttestationMaxFutureSkewMs,
  governedDocumentIdentityRuntimeBoundary,
  governedDocumentVersionIdentitySchema,
  type ArtifactAttestation,
  type ArtifactResolution,
  type AtomicSourceDocumentResolution,
  type ClassificationTransitionReceipt,
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
  classificationReceipt: "78901234-7890-4890-8890-789012345678", classificationAttestation: "89012345-8901-4901-8901-890123456789",
  classificationReceipt2: "78901234-7890-4890-8890-789012345679", classificationAttestation2: "89012345-8901-4901-8901-890123456780",
  classificationOperation: "01234567-89ab-4cde-8fab-0123456789ab", classificationOperation2: "01234567-89ab-4cde-8fab-0123456789ac",
  derivative: "90123456-9012-4012-8012-901234567890",
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
function signBody(body: unknown, attestationId: string, signedAt = "2026-09-01T10:05:00.000Z"): GenericAttestation {
  const metadata = {attestationId, signingKeyId: ids.key, signatureAlgorithm: "ed25519" as const, signatureVersion: 1, signedAt};
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
  const base = {found: true, authorized: true, identityRecordId: version === 1 ? ids.recordV1 : ids.recordV2, organizationId: ids.organization, projectId: ids.project, companyId: ids.company, conversationId: ids.conversation, documentId: ids.document, row, source: sourceOrigin(), classification: {dataClass: "project_confidential" as const, informationClass: "company_document" as const, confidentiality: "confidential" as const}, sourceSnapshot: storageLocator(bucketId, objectPath), capturedAt, actor, bytes, immutable: true};
  const merged = {...base, ...overrides} as Omit<AtomicSourceDocumentResolution, "attestation">;
  const authorization = {authorizationVersion: "workspace-authz.v1", authorizedAt: "2026-09-01T09:59:00.000Z"};
  const body = {identityRecordId: merged.identityRecordId, organizationId: merged.organizationId, projectId: merged.projectId, companyId: merged.companyId, conversationId: merged.conversationId, documentId: merged.documentId, row: merged.row, source: merged.source, classification: merged.classification, sourceSnapshot: merged.sourceSnapshot, capturedAt: merged.capturedAt, actor: merged.actor, immutable: merged.immutable, sourceBytesSha256: merged.bytes ? hash(merged.bytes) : hash("missing"), sourceByteSize: merged.bytes?.byteLength ?? 0, ...authorization};
  return {...merged, attestation: {...signBody(body, ids.sourceAttestation), ...authorization} as SourceAttestation};
}

function sourceReference(record: GovernedDocumentVersionIdentity) {
  const core = record.core;
  return {kind: "source_version" as const, version: {organizationId: core.organizationId, projectId: core.projectId, companyId: core.companyId, conversationId: core.conversationId, documentId: core.documentId, version: core.version, sourceBytesSha256: core.sourceBytes.sha256, identityFingerprint: core.identityFingerprint}};
}
function artifactBody(artifact: Omit<ArtifactResolution, "attestation">, contentSha256: string) {
  return {artifactId: artifact.artifactId, organizationId: artifact.organizationId, projectId: artifact.projectId, companyId: artifact.companyId, conversationId: artifact.conversationId, documentId: artifact.documentId, documentVersion: artifact.documentVersion, sourceBytesSha256: artifact.sourceBytesSha256, identityFingerprint: artifact.identityFingerprint, immutable: artifact.immutable, locator: artifact.locator, contentSha256, byteSize: artifact.bytes?.byteLength ?? 0, semanticIdentity: artifact.semanticIdentity, producedBy: artifact.producedBy, producerExecutionId: artifact.producerExecutionId, producedAt: artifact.producedAt, parentRefs: artifact.parentRefs, coverage: artifact.coverage};
}
function makeArtifact(record: GovernedDocumentVersionIdentity, overrides: Partial<ArtifactResolution> = {}): ArtifactResolution {
  const core = record.core;
  const base = {found: true, immutable: true, artifactId: ids.layer, organizationId: core.organizationId, projectId: core.projectId, companyId: core.companyId, conversationId: core.conversationId, documentId: core.documentId, documentVersion: core.version, sourceBytesSha256: core.sourceBytes.sha256, identityFingerprint: core.identityFingerprint, locator: {state: "content_addressed" as const, locatorRef: `sha256:${hash(layerBytes)}`, objectVersionRef: null}, bytes: layerBytes, semanticIdentity: {role: "extracted_layer" as const, layerKind: "pdf" as const, mediaType: "application/pdf"}, producedBy: parser, producerExecutionId: ids.execution, producedAt: "2026-09-01T10:02:00.000Z", parentRefs: [sourceReference(record)], coverage: []};
  const merged = {...base, ...overrides} as Omit<ArtifactResolution, "attestation">;
  return {...merged, attestation: signBody(artifactBody(merged, merged.bytes ? hash(merged.bytes) : hash("missing")), ids.artifactAttestation)};
}
function resignArtifact(artifact: ArtifactResolution, signedAt: string): ArtifactResolution {
  const {attestation: _attestation, ...body} = artifact;
  return {...body, attestation: signBody(artifactBody(body, body.bytes ? hash(body.bytes) : hash("missing")), ids.artifactAttestation, signedAt)};
}

function receiptBody(receipt: Omit<ClassificationTransitionReceipt, "attestation">) { return receipt; }
function makeClassificationReceipt(record: GovernedDocumentVersionIdentity, to: ClassificationTransitionReceipt["to"], authorizations: ClassificationTransitionReceipt["authorizations"], overrides: Partial<Omit<ClassificationTransitionReceipt, "attestation" | "from" | "to" | "authorizations">> & {attestationId?: string; signedAt?: string} = {}): ClassificationTransitionReceipt {
  const previous = record.lifecycleHistory.at(-1)!;
  const {attestationId = ids.classificationAttestation, signedAt, ...fields} = overrides;
  const base = {receiptId: ids.classificationReceipt, identityRecordId: record.core.identityRecordId, organizationId: record.core.organizationId, projectId: record.core.projectId, companyId: record.core.companyId, conversationId: record.core.conversationId, documentId: record.core.documentId, documentVersion: record.core.version, from: {dataClass: previous.dataClass, informationClass: previous.informationClass, confidentiality: previous.confidentiality}, to, purpose: "classification_transition" as const, operationId: ids.classificationOperation, priorLifecycleFingerprint: previous.lifecycleFingerprint, targetRevision: previous.revision + 1, authorizations, authorizedActor: actor, authorizedAt: "2026-09-01T10:04:00.000Z", ...fields};
  return {...base, attestation: signBody(receiptBody(base), attestationId, signedAt)};
}

type RootOptions = {
  sources?: Map<number, AtomicSourceDocumentResolution>; currentActor?: typeof actor | typeof serviceActor; registeredActors?: Set<string>;
  registeredTools?: Set<string>; sourceRegistration?: DocumentSourceOrigin | null; artifacts?: Map<string, ArtifactResolution>;
  records?: Map<number, GovernedDocumentVersionIdentity>; canonical?: Map<string, GovernedDocumentVersionIdentity>; receipts?: Map<string, ClassificationTransitionReceipt>; authorizedAppend?: boolean; now?: string; journalSignedAt?: string;
};
function toolKey(tool: DocumentToolIdentity) { return stable(tool); }
function makeRoot(options: RootOptions = {}): GovernedDocumentServerTrustRoot {
  const sources = options.sources ?? new Map([[1, makeSource()]]);
  const artifacts = options.artifacts ?? new Map<string, ArtifactResolution>();
  const records = options.records ?? new Map<number, GovernedDocumentVersionIdentity>();
  const canonical = options.canonical ?? new Map<string, GovernedDocumentVersionIdentity>();
  const receipts = options.receipts ?? new Map<string, ClassificationTransitionReceipt>();
  const currentActor = options.currentActor ?? actor;
  const registeredActors = options.registeredActors ?? new Set([stable(actor), stable(serviceActor)]);
  const registeredTools = options.registeredTools ?? new Set([toolKey(parser)]);
  return {
    async resolveOperationActor() { return currentActor; }, async isActorRegistered(candidate) { return registeredActors.has(stable(candidate)); },
    async resolveSourceDocument(_id, version) { return sources.get(version) ?? makeSource(version, sourceBytes, {found: false, bytes: null}); },
    async verifySourceAttestation(resolution) { const {authorizationVersion: _v, authorizedAt: _a, ...generic} = resolution.attestation; const body = {identityRecordId: resolution.identityRecordId, organizationId: resolution.organizationId, projectId: resolution.projectId, companyId: resolution.companyId, conversationId: resolution.conversationId, documentId: resolution.documentId, row: resolution.row, source: resolution.source, classification: resolution.classification, sourceSnapshot: resolution.sourceSnapshot, capturedAt: resolution.capturedAt, actor: resolution.actor, immutable: resolution.immutable, sourceBytesSha256: resolution.bytes ? hash(resolution.bytes) : hash("missing"), sourceByteSize: resolution.bytes?.byteLength ?? 0, authorizationVersion: resolution.attestation.authorizationVersion, authorizedAt: resolution.attestation.authorizedAt}; return signatureValid(body, generic); },
    async resolveSourceRegistration() { return options.sourceRegistration === undefined ? sourceOrigin() : options.sourceRegistration; },
    async resolveArtifact(artifactId) { return artifacts.get(artifactId) ?? makeArtifact([...canonical.values()][0]!, {found: false, artifactId, bytes: null}); },
    async verifyArtifactAttestation(resolution) { return signatureValid(artifactBody(resolution, resolution.bytes ? hash(resolution.bytes) : hash("missing")), resolution.attestation); },
    async resolveCoverage(claim) { return {found: false, organizationId: ids.organization, projectId: ids.project, companyId: ids.company, conversationId: ids.conversation, documentId: ids.document, version: 1, fingerprint: claim.fingerprint, backlinkIdentityFingerprint: hash("missing")}; },
    async isToolRegistered(tool) { return registeredTools.has(toolKey(tool)); }, async resolvePersistedVersion(reference) { return records.get(reference.version) ?? null; },
    async loadCanonicalIdentity(identityRecordId) { return canonical.get(identityRecordId) ?? null; },
    async authorizeIdentityOperation() { return options.authorizedAppend ?? true; },
    async attestLifecycleJournal(body) { return signBody(body, ids.journalAttestation, options.journalSignedAt); }, async verifyLifecycleJournalAttestation(body, attestation) { return signatureValid(body, attestation); },
    async resolveClassificationReceipt(receiptId) { return receipts.get(receiptId) ?? null; },
    async verifyClassificationReceipt(receipt) { const {attestation, ...body} = receipt; return signatureValid(receiptBody(body), attestation); },
    now() { return options.now ?? "2026-09-01T10:05:00.000Z"; },
  };
}

function compileInput(overrides: Partial<CompileGovernedDocumentIdentityInput> = {}): CompileGovernedDocumentIdentityInput {
  return {sourceDocumentId: ids.document, sourceDocumentVersion: 1, lifecycle: {asOf: "2026-08-31T23:59:59.000Z", extractedLayers: [], coverage: [], derivatives: []}, ...overrides};
}
function appendInput(overrides: Partial<DocumentLifecycleInput> = {}): DocumentLifecycleInput {
  return {asOf: "2026-08-31T23:59:59.000Z", classificationReceiptId: null, extractedLayers: [], coverage: [], derivatives: [], supersession: {state: "current", successorVersion: null, reasonId: null}, ...overrides};
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

  it("cannot relabel a private uploaded source as public or audited through a command", async () => {
    const h = harness();
    const record = await h.server.compile(compileInput()); h.store(record);
    expect(record.core.sourceClassification).toEqual({dataClass: "project_confidential", informationClass: "company_document", confidentiality: "confidential"});
    expect(record.lifecycleHistory[0]).toMatchObject(record.core.sourceClassification);
    await expect(h.server.compile({...compileInput(), lifecycle: {...compileInput().lifecycle, dataClass: "public", informationClass: "audited", confidentiality: "public"}} as never)).rejects.toThrow();
    await expect(h.server.append(record.core.identityRecordId, {...appendInput(), dataClass: "public", informationClass: "audited", confidentiality: "public"} as never)).rejects.toThrow();
  });

  it("requires a signed, scoped receipt for declassification and information-class upgrades", async () => {
    const base = harness(); const record = await base.server.compile(compileInput()); base.store(record);
    const audited = {...record.core.sourceClassification, informationClass: "audited" as const};
    const insufficientUpgrade = makeClassificationReceipt(record, audited, ["change_information_class"]);
    await expect(harness({canonical: base.canonical, records: base.records, receipts: new Map([[insufficientUpgrade.receiptId, insufficientUpgrade]])}).server.append(record.core.identityRecordId, appendInput({classificationReceiptId: insufficientUpgrade.receiptId}))).rejects.toThrow("classification_transition_unauthorized");
    const authorizedUpgrade = makeClassificationReceipt(record, audited, ["change_information_class", "upgrade_information_class"]);
    const upgraded = await harness({canonical: base.canonical, records: base.records, receipts: new Map([[authorizedUpgrade.receiptId, authorizedUpgrade]])}).server.append(record.core.identityRecordId, appendInput({classificationReceiptId: authorizedUpgrade.receiptId}));
    expect(upgraded.lifecycleHistory.at(-1)).toMatchObject({...audited, classificationReceipt: authorizedUpgrade});

    const publicClassification = {dataClass: "public" as const, informationClass: "company_document" as const, confidentiality: "public" as const};
    const insufficientDeclassification = makeClassificationReceipt(record, publicClassification, ["change_data_class", "change_confidentiality"]);
    await expect(harness({canonical: base.canonical, records: base.records, receipts: new Map([[insufficientDeclassification.receiptId, insufficientDeclassification]])}).server.append(record.core.identityRecordId, appendInput({classificationReceiptId: insufficientDeclassification.receiptId}))).rejects.toThrow("classification_transition_unauthorized");
    const authorizedDeclassification = makeClassificationReceipt(record, publicClassification, ["change_data_class", "change_confidentiality", "declassify"]);
    const declassified = await harness({canonical: base.canonical, records: base.records, receipts: new Map([[authorizedDeclassification.receiptId, authorizedDeclassification]])}).server.append(record.core.identityRecordId, appendInput({classificationReceiptId: authorizedDeclassification.receiptId}));
    expect(declassified.lifecycleHistory.at(-1)).toMatchObject({...publicClassification, classificationReceipt: authorizedDeclassification});
  });

  it("binds classification receipts to their exact purpose, prior revision and target revision", async () => {
    const base = harness(); const record = await base.server.compile(compileInput()); base.store(record);
    const publicClassification = {dataClass: "public" as const, informationClass: "company_document" as const, confidentiality: "public" as const};
    const grants: ClassificationTransitionReceipt["authorizations"] = ["change_data_class", "change_confidentiality", "declassify"];

    const wrongPrior = makeClassificationReceipt(record, publicClassification, grants, {priorLifecycleFingerprint: "0".repeat(64)});
    await expect(harness({canonical: base.canonical, records: base.records, receipts: new Map([[wrongPrior.receiptId, wrongPrior]])}).server.append(record.core.identityRecordId, appendInput({classificationReceiptId: wrongPrior.receiptId}))).rejects.toThrow("classification_receipt_invalid");

    const wrongRevision = makeClassificationReceipt(record, publicClassification, grants, {targetRevision: 99});
    await expect(harness({canonical: base.canonical, records: base.records, receipts: new Map([[wrongRevision.receiptId, wrongRevision]])}).server.append(record.core.identityRecordId, appendInput({classificationReceiptId: wrongRevision.receiptId}))).rejects.toThrow("classification_receipt_invalid");

    const valid = makeClassificationReceipt(record, publicClassification, grants);
    const {attestation: _attestation, ...validBody} = valid;
    const crossPurposeBody = {...validBody, purpose: "artifact_binding"};
    const crossPurpose = {...crossPurposeBody, attestation: signBody(crossPurposeBody, ids.classificationAttestation)} as unknown as ClassificationTransitionReceipt;
    await expect(harness({canonical: base.canonical, records: base.records, receipts: new Map([[valid.receiptId, crossPurpose]])}).server.append(record.core.identityRecordId, appendInput({classificationReceiptId: valid.receiptId}))).rejects.toThrow();
  });

  it("rejects an old signed declassification receipt after A to B to A", async () => {
    const receipts = new Map<string, ClassificationTransitionReceipt>();
    const h = harness({receipts});
    const original = await h.server.compile(compileInput()); h.store(original);
    const publicClassification = {dataClass: "public" as const, informationClass: "company_document" as const, confidentiality: "public" as const};
    const declassify = makeClassificationReceipt(original, publicClassification, ["change_data_class", "change_confidentiality", "declassify"]);
    receipts.set(declassify.receiptId, declassify);
    const publicRecord = await h.server.append(original.core.identityRecordId, appendInput({classificationReceiptId: declassify.receiptId})); h.store(publicRecord);

    const reclassify = makeClassificationReceipt(publicRecord, original.core.sourceClassification, ["change_data_class", "change_confidentiality"], {
      receiptId: ids.classificationReceipt2, attestationId: ids.classificationAttestation2, operationId: ids.classificationOperation2,
    });
    receipts.set(reclassify.receiptId, reclassify);
    const privateAgain = await h.server.append(original.core.identityRecordId, appendInput({classificationReceiptId: reclassify.receiptId})); h.store(privateAgain);
    expect(privateAgain.lifecycleHistory.at(-1)).toMatchObject(original.core.sourceClassification);

    await expect(h.server.append(original.core.identityRecordId, appendInput({classificationReceiptId: declassify.receiptId}))).rejects.toThrow("classification_receipt_invalid");
  });

  it("consumes receipt, operation and attestation ids only once", async () => {
    const duplicateFields = ["receiptId", "operationId", "attestationId"] as const;
    for (const duplicateField of duplicateFields) {
      const receipts = new Map<string, ClassificationTransitionReceipt>();
      const h = harness({receipts});
      const original = await h.server.compile(compileInput()); h.store(original);
      const publicClassification = {dataClass: "public" as const, informationClass: "company_document" as const, confidentiality: "public" as const};
      const first = makeClassificationReceipt(original, publicClassification, ["change_data_class", "change_confidentiality", "declassify"]);
      receipts.set(first.receiptId, first);
      const publicRecord = await h.server.append(original.core.identityRecordId, appendInput({classificationReceiptId: first.receiptId})); h.store(publicRecord);
      const identityOverrides = {
        receiptId: duplicateField === "receiptId" ? first.receiptId : ids.classificationReceipt2,
        operationId: duplicateField === "operationId" ? first.operationId : ids.classificationOperation2,
        attestationId: duplicateField === "attestationId" ? first.attestation.attestationId : ids.classificationAttestation2,
      };
      const second = makeClassificationReceipt(publicRecord, original.core.sourceClassification, ["change_data_class", "change_confidentiality"], identityOverrides);
      receipts.set(second.receiptId, second);
      await expect(h.server.append(original.core.identityRecordId, appendInput({classificationReceiptId: second.receiptId}))).rejects.toThrow("classification_receipt_invalid");
    }
  });

  it("rejects canonical history tampering even after the attacker recalculates its ordinary hash", async () => {
    const h = harness(); const record = await h.server.compile(compileInput());
    const forged = structuredClone(record); const revision = forged.lifecycleHistory[0]!; revision.asOf = "2026-08-30T23:59:59.000Z";
    const {lifecycleFingerprint: _old, journalAttestation: _attestation, ...body} = revision;
    revision.lifecycleFingerprint = fingerprint({identityFingerprint: forged.core.identityFingerprint, ...body});
    h.store(forged);
    await expect(h.server.append(record.core.identityRecordId, appendInput())).rejects.toThrow("lifecycle_attestation_invalid");
  });

  it("derives artifact scope, parent graph and producer execution only from an attested resolver", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const artifact = makeArtifact(record); const artifacts = new Map([[ids.layer, artifact]]);
    const ah = harness({canonical: h.canonical, records: h.records, artifacts});
    const appended = await ah.server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer}]}));
    expect(appended.lifecycleHistory[1]?.extractedLayers[0]).toMatchObject({layerKind: "pdf", mediaType: "application/pdf", parentRefs: artifact.parentRefs, producerExecutionId: ids.execution});
    await expect(ah.server.append(record.core.identityRecordId, {...appendInput(), extractedLayers: [{artifactId: ids.layer, layerKind: "pdf", parentRefs: []}]} as never)).rejects.toThrow();
    const wrongScopeParent = sourceReference(record);
    wrongScopeParent.version.organizationId = ids.company;
    for (const mutation of [{projectId: ids.company}, {sourceBytesSha256: hash("other")}, {parentRefs: []}, {parentRefs: [wrongScopeParent]}]) {
      const bad = makeArtifact(record, mutation as Partial<ArtifactResolution>);
      await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, bad]])}).server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer}]}))).rejects.toThrow();
    }
  });

  it("rejects artifact signatures and content-addressed locators inconsistent with resolved bytes", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const artifact = makeArtifact(record); artifact.attestation.signature = "B".repeat(43);
    await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, artifact]])}).server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer}]}))).rejects.toThrow("artifact_attestation_invalid");
    const wrong = makeArtifact(record, {locator: {state: "content_addressed", locatorRef: `sha256:${hash("wrong")}`, objectVersionRef: null}});
    await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, wrong]])}).server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer}]}))).rejects.toThrow("content_addressed_locator_mismatch");
  });

  it("keeps artifact ids immutable throughout the append-only history", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const artifact = makeArtifact(record); const artifacts = new Map([[ids.layer, artifact]]); const ah = harness({canonical: h.canonical, records: h.records, artifacts});
    const first = await ah.server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer}]})); ah.store(first);
    artifacts.set(ids.layer, makeArtifact(record, {semanticIdentity: {role: "extracted_layer", layerKind: "spreadsheet", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}}));
    await expect(ah.server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer}]}))).rejects.toThrow();
    expect((await ah.server.validateGraph([first])).issues.map((issue) => issue.code)).toContain("artifact_semantic_identity_mismatch");
  });

  it("cannot bind the same artifact bytes under different semantic types", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const layer = makeArtifact(record);
    const derivative = makeArtifact(record, {artifactId: ids.derivative, semanticIdentity: {role: "derivative", derivativeKind: "retrieval_chunk_set", mediaType: "application/json"}});
    const server = harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, layer], [ids.derivative, derivative]])}).server;
    await expect(server.append(record.core.identityRecordId, appendInput({extractedLayers: [{artifactId: ids.layer}], derivatives: [{artifactId: ids.derivative}]}))).rejects.toThrow("artifact_semantic_identity_mismatch");
    await expect(server.append(record.core.identityRecordId, appendInput({derivatives: [{artifactId: ids.layer}]}))).rejects.toThrow("artifact_semantic_identity_mismatch");
  });

  it("binds every extracted layer kind to its canonical MIME family", async () => {
    const canonical = {
      pdf: "application/pdf",
      spreadsheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      csv: "text/csv",
      image: "image/png",
    } as const;
    for (const [layerKind, mediaType] of Object.entries(canonical)) {
      expect(extractedLayerSemanticIdentitySchema.safeParse({role: "extracted_layer", layerKind, mediaType}).success).toBe(true);
      for (const [otherKind, otherMediaType] of Object.entries(canonical)) {
        if (otherKind === layerKind) continue;
        expect(extractedLayerSemanticIdentitySchema.safeParse({role: "extracted_layer", layerKind, mediaType: otherMediaType}).success).toBe(false);
      }
    }

    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const incoherent = makeArtifact(record, {semanticIdentity: {role: "extracted_layer", layerKind: "spreadsheet", mediaType: "application/pdf"} as never});
    await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, incoherent]])}).server.append(
      record.core.identityRecordId,
      appendInput({extractedLayers: [{artifactId: ids.layer}]}),
    )).rejects.toThrow();
  });

  it("fails closed when artifact, classification or journal attestations violate trusted chronology", async () => {
    const h = harness(); const record = await h.server.compile(compileInput()); h.store(record);
    const tooEarlyArtifact = resignArtifact(makeArtifact(record), "2026-09-01T10:01:59.999Z");
    await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, tooEarlyArtifact]])}).server.append(
      record.core.identityRecordId,
      appendInput({extractedLayers: [{artifactId: ids.layer}]}),
    )).rejects.toThrow("artifact_attestation_time_invalid");

    const futureArtifact = resignArtifact(makeArtifact(record), new Date(Date.parse("2026-09-01T10:05:00.000Z") + governedDocumentAttestationMaxFutureSkewMs + 1).toISOString());
    await expect(harness({canonical: h.canonical, records: h.records, artifacts: new Map([[ids.layer, futureArtifact]])}).server.append(
      record.core.identityRecordId,
      appendInput({extractedLayers: [{artifactId: ids.layer}]}),
    )).rejects.toThrow("artifact_attestation_time_invalid");

    const publicClassification = {dataClass: "public" as const, informationClass: "company_document" as const, confidentiality: "public" as const};
    const earlyReceipt = makeClassificationReceipt(record, publicClassification, ["change_data_class", "change_confidentiality", "declassify"], {signedAt: "2026-09-01T10:03:59.999Z"});
    await expect(harness({canonical: h.canonical, records: h.records, receipts: new Map([[earlyReceipt.receiptId, earlyReceipt]])}).server.append(
      record.core.identityRecordId,
      appendInput({classificationReceiptId: earlyReceipt.receiptId}),
    )).rejects.toThrow("classification_attestation_time_invalid");

    await expect(harness({journalSignedAt: "2026-09-01T10:04:59.999Z"}).server.compile(compileInput())).rejects.toThrow("lifecycle_attestation_time_invalid");
  });

  it("publishes a machine-verifiable boundary that forbids effects before transactional commit", () => {
    expect(governedDocumentIdentityRuntimeBoundary).toEqual({
      persistence: "external_transaction_required",
      concurrency: "adapter_compare_and_swap_required",
      effectsAuthorization: "forbidden_before_committed_revision",
    });
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
    expect(record.core.sourceAttestation).toMatchObject({signatureAlgorithm: "ed25519", signatureVersion: 1, signingKeyId: ids.key, signedAt: "2026-09-01T10:05:00.000Z"});
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
