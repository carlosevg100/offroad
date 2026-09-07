import {createHash} from "node:crypto";

import {informationClassSchema} from "@offroad/credit-ontology";
import {taskDataClassSchema, taskSourceClassSchema} from "@offroad/work-plan";
import {z} from "zod";

import {layerKindSchema} from "./schemas";

export const governedDocumentIdentityVersion = "governed-document-identity.v3";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const uuidSchema = z.uuid();
const opaqueLocatorSchema = z.string().trim().min(3).max(500).refine((value) => !/@|\s/.test(value), "locator must be opaque");
const sourcePathSchema = z.string().trim().min(1).max(1_024).refine((value) => !value.startsWith("/") && !value.includes(".."), "object path must be relative and normalized");

export const documentActorReferenceSchema = z.object({kind: z.enum(["user", "service", "integration"]), id: uuidSchema}).strict();
export type DocumentActorReference = z.infer<typeof documentActorReferenceSchema>;
export const documentToolIdentitySchema = z.object({toolId: uuidSchema, version: z.string().trim().min(1).max(120), configurationSha256: sha256Schema}).strict();
export type DocumentToolIdentity = z.infer<typeof documentToolIdentitySchema>;

export const sourceDocumentsRowSchema = z.object({
  id: uuidSchema, organization_id: uuidSchema, opportunity_id: uuidSchema.nullable(), intake_session_id: uuidSchema.nullable(),
  document_version: z.number().int().positive(), bucket_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,99}$/), object_path: sourcePathSchema,
  object_version: opaqueLocatorSchema.nullable(), sha256: sha256Schema.nullable(), sha256_verified_at: z.iso.datetime({offset: true}).nullable(),
}).strict();
export type SourceDocumentsRow = z.infer<typeof sourceDocumentsRowSchema>;

export const sourceDocumentBindingSchema = sourceDocumentsRowSchema.transform((row) => ({
  table: "public.source_documents" as const, sourceDocumentId: row.id, organizationId: row.organization_id,
  opportunityId: row.opportunity_id, intakeSessionId: row.intake_session_id, documentVersion: row.document_version,
  bucketId: row.bucket_id, objectPath: row.object_path, objectVersionRef: row.object_version,
  verifiedSha256: row.sha256, sha256VerifiedAt: row.sha256_verified_at,
}));
export type SourceDocumentBinding = z.output<typeof sourceDocumentBindingSchema>;

export const snapshotLocatorSchema = z.discriminatedUnion("state", [
  z.object({state: z.literal("content_addressed"), locatorRef: z.string().regex(/^sha256:[a-f0-9]{64}$/), objectVersionRef: z.null()}).strict(),
  z.object({state: z.literal("versioned_object"), locatorRef: opaqueLocatorSchema, objectVersionRef: opaqueLocatorSchema}).strict(),
]);
export type SnapshotLocator = z.infer<typeof snapshotLocatorSchema>;

export const documentVersionReferenceSchema = z.object({
  organizationId: uuidSchema, projectId: uuidSchema, companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(), documentId: uuidSchema,
  version: z.number().int().positive(), sourceBytesSha256: sha256Schema, identityFingerprint: sha256Schema,
}).strict();
export type DocumentVersionReference = z.infer<typeof documentVersionReferenceSchema>;
export const derivativeParentReferenceSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("source_version"), version: documentVersionReferenceSchema}).strict(),
  z.object({kind: z.literal("derivative"), derivativeId: uuidSchema, contentSha256: sha256Schema}).strict(),
]);
export type DerivativeParentReference = z.infer<typeof derivativeParentReferenceSchema>;

export const documentCoverageClaimSchema = z.object({kind: z.enum(["reading_manifest", "coverage_map", "requirement", "extraction_report"]), id: uuidSchema, fingerprint: sha256Schema}).strict();
export type DocumentCoverageClaim = z.infer<typeof documentCoverageClaimSchema>;
export const documentCoverageReferenceSchema = documentCoverageClaimSchema.extend({
  organizationId: uuidSchema, projectId: uuidSchema, companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(), documentId: uuidSchema,
  version: z.number().int().positive(), backlinkIdentityFingerprint: sha256Schema,
}).strict();
export type DocumentCoverageReference = z.infer<typeof documentCoverageReferenceSchema>;

export const documentSourceOriginSchema = z.object({
  registryId: uuidSchema, registryVersion: z.number().int().positive(),
  origin: z.enum(["user_upload", "public_filing", "issuer_publication", "licensed_source", "internal_project", "system_generated", "external_data_room"]),
  sourceClass: taskSourceClassSchema, sourceId: uuidSchema,
  integration: z.object({status: z.enum(["native", "verified_connector", "unsupported"]), connectorId: uuidSchema.nullable()}).strict(),
}).strict();
export type DocumentSourceOrigin = z.infer<typeof documentSourceOriginSchema>;
export const sourceAttestationSchema = z.object({
  attestationId: uuidSchema, signingKeyId: uuidSchema, payloadSha256: sha256Schema, signature: sha256Schema,
  authorizationVersion: z.string().trim().min(1).max(120), authorizedAt: z.iso.datetime({offset: true}), signedAt: z.iso.datetime({offset: true}),
}).strict();
export type SourceAttestation = z.infer<typeof sourceAttestationSchema>;

const persistedSourceBindingSchema = z.object({
  table: z.literal("public.source_documents"), sourceDocumentId: uuidSchema, organizationId: uuidSchema, opportunityId: uuidSchema.nullable(), intakeSessionId: uuidSchema.nullable(),
  documentVersion: z.number().int().positive(), bucketId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,99}$/), objectPath: sourcePathSchema,
  objectVersionRef: opaqueLocatorSchema, verifiedSha256: sha256Schema, sha256VerifiedAt: z.iso.datetime({offset: true}),
}).strict();

const documentIdentityCoreSchema = z.object({
  schemaVersion: z.literal(governedDocumentIdentityVersion), organizationId: uuidSchema, projectId: uuidSchema, companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(),
  documentId: uuidSchema, version: z.number().int().positive(), parentVersion: documentVersionReferenceSchema.nullable(), sourceBinding: persistedSourceBindingSchema,
  source: documentSourceOriginSchema, capturedBy: documentActorReferenceSchema, capturedAt: z.iso.datetime({offset: true}),
  sourceBytes: z.object({sha256: sha256Schema, byteSize: z.number().int().nonnegative()}).strict(), sourceSnapshot: snapshotLocatorSchema,
  sourceAttestation: sourceAttestationSchema, identityFingerprint: sha256Schema,
}).strict();
export type DocumentIdentityCore = z.infer<typeof documentIdentityCoreSchema>;

const extractedLayerIdentitySchema = z.object({
  layerId: uuidSchema, layerKind: layerKindSchema, contentSha256: sha256Schema, sourceBytesSha256: sha256Schema, locator: snapshotLocatorSchema,
  producedBy: documentToolIdentitySchema, producedAt: z.iso.datetime({offset: true}), parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(20), coverageRefs: z.array(documentCoverageReferenceSchema).max(100),
}).strict();
export type ExtractedLayerIdentity = z.infer<typeof extractedLayerIdentitySchema>;
const derivativeIdentitySchema = z.object({
  derivativeId: uuidSchema, kind: z.enum(["normalized_layer", "retrieval_chunk_set", "extraction_candidate_set", "profile", "evidence_fragment", "artifact", "other"]),
  contentSha256: sha256Schema, locator: snapshotLocatorSchema, producedBy: documentToolIdentitySchema, producedAt: z.iso.datetime({offset: true}),
  parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(100), coverageRefs: z.array(documentCoverageReferenceSchema).max(100),
}).strict();
export type DerivativeIdentity = z.infer<typeof derivativeIdentitySchema>;

const supersessionSchema = z.object({state: z.enum(["current", "superseded", "withdrawn", "rejected"]), supersededBy: documentVersionReferenceSchema.nullable(), reasonId: uuidSchema.nullable()}).strict();
const documentLifecycleRevisionSchema = z.object({
  revision: z.number().int().positive(), previousLifecycleFingerprint: sha256Schema.nullable(), recordedAt: z.iso.datetime({offset: true}), recordedBy: documentActorReferenceSchema,
  asOf: z.iso.datetime({offset: true}), dataClass: taskDataClassSchema, informationClass: informationClassSchema, confidentiality: z.enum(["public", "internal", "confidential", "restricted"]),
  toolchain: z.array(documentToolIdentitySchema).max(30), extractedLayers: z.array(extractedLayerIdentitySchema).max(30), coverageRefs: z.array(documentCoverageReferenceSchema).max(500),
  derivatives: z.array(derivativeIdentitySchema).max(500), supersession: supersessionSchema, lifecycleFingerprint: sha256Schema,
}).strict();
export type DocumentLifecycleRevision = z.infer<typeof documentLifecycleRevisionSchema>;
export const governedDocumentVersionIdentitySchema = z.object({core: documentIdentityCoreSchema, lifecycleHistory: z.array(documentLifecycleRevisionSchema).min(1).max(1_000)}).strict();
export type GovernedDocumentVersionIdentity = z.infer<typeof governedDocumentVersionIdentitySchema>;

const artifactParentClaimSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("source_document")}).strict(),
  z.object({kind: z.literal("derivative"), derivativeId: uuidSchema, contentSha256: sha256Schema}).strict(),
]);
const artifactClaimSchema = z.object({artifactId: uuidSchema, parentRefs: z.array(artifactParentClaimSchema).min(1).max(100), coverage: z.array(documentCoverageClaimSchema).max(100)}).strict();
const extractedLayerClaimSchema = artifactClaimSchema.extend({layerKind: layerKindSchema}).strict();
const derivativeClaimSchema = artifactClaimSchema.extend({kind: z.enum(["normalized_layer", "retrieval_chunk_set", "extraction_candidate_set", "profile", "evidence_fragment", "artifact", "other"])}).strict();
export const documentLifecycleInputSchema = z.object({
  asOf: z.iso.datetime({offset: true}), dataClass: taskDataClassSchema, informationClass: informationClassSchema, confidentiality: z.enum(["public", "internal", "confidential", "restricted"]),
  extractedLayers: z.array(extractedLayerClaimSchema).max(30), coverage: z.array(documentCoverageClaimSchema).max(500), derivatives: z.array(derivativeClaimSchema).max(500),
  supersession: z.object({state: z.enum(["current", "superseded", "withdrawn", "rejected"]), successorVersion: z.number().int().positive().nullable(), reasonId: uuidSchema.nullable()}).strict(),
}).strict();
export type DocumentLifecycleInput = z.input<typeof documentLifecycleInputSchema>;
export const compileGovernedDocumentIdentityInputSchema = z.object({
  sourceDocumentId: uuidSchema, sourceDocumentVersion: z.number().int().positive(), lifecycle: documentLifecycleInputSchema.omit({supersession: true}),
}).strict();
export type CompileGovernedDocumentIdentityInput = z.input<typeof compileGovernedDocumentIdentityInputSchema>;

export type AtomicSourceDocumentResolution = {
  found: boolean; authorized: boolean; organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string;
  row: SourceDocumentsRow; source: DocumentSourceOrigin; sourceSnapshot: SnapshotLocator; capturedAt: string; actor: DocumentActorReference;
  bytes: Uint8Array | null; immutable: boolean; attestation: SourceAttestation;
};
export type ArtifactResolution = {found: boolean; immutable: boolean; artifactId: string; locator: SnapshotLocator; bytes: Uint8Array | null; producedBy: DocumentToolIdentity; producedAt: string};
export type CoverageResolution = {found: boolean; organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string; version: number; fingerprint: string; backlinkIdentityFingerprint: string};

/** Server-only dependency. It is instantiated once and closed over before request handling. */
export interface GovernedDocumentServerTrustRoot {
  resolveOperationActor(): Promise<DocumentActorReference>;
  isActorRegistered(actor: DocumentActorReference): Promise<boolean>;
  resolveSourceDocument(sourceDocumentId: string, sourceDocumentVersion: number): Promise<AtomicSourceDocumentResolution>;
  verifySourceAttestation(resolution: AtomicSourceDocumentResolution): Promise<boolean>;
  resolveSourceRegistration(registryId: string, registryVersion: number): Promise<DocumentSourceOrigin | null>;
  resolveArtifact(artifactId: string): Promise<ArtifactResolution>;
  resolveCoverage(claim: DocumentCoverageClaim): Promise<CoverageResolution>;
  isToolRegistered(tool: DocumentToolIdentity): Promise<boolean>;
  resolvePersistedVersion(reference: DocumentVersionReference): Promise<GovernedDocumentVersionIdentity | null>;
  now(): string;
}

export const documentIdentityIssueCodeSchema = z.enum([
  "identity_fingerprint_mismatch", "duplicate_version_identity", "version_hash_conflict", "hash_reused_across_versions", "source_resolution_failed", "scope_authorization_failed",
  "source_attestation_invalid", "source_binding_mismatch", "source_registry_mismatch", "parent_version_not_found", "parent_hash_mismatch", "parent_scope_mismatch", "parent_document_mismatch",
  "parent_version_not_prior", "parent_version_not_immediate", "version_lineage_cycle", "source_snapshot_not_immutable", "source_snapshot_locator_mismatch", "source_snapshot_version_mismatch",
  "source_snapshot_hash_mismatch", "source_hash_not_verified", "content_addressed_locator_mismatch", "origin_source_class_mismatch", "source_integration_state_mismatch", "data_confidentiality_mismatch",
  "actor_not_registered", "authorization_after_capture", "attestation_before_verification", "as_of_after_capture", "lifecycle_before_capture", "lifecycle_recorded_at_not_monotonic",
  "lifecycle_revision_gap", "lifecycle_previous_mismatch", "lifecycle_fingerprint_mismatch", "artifact_identity_mutated", "duplicate_derivative_identity", "derivative_parent_not_found",
  "derivative_parent_hash_mismatch", "derivative_lineage_cycle", "artifact_unresolved", "artifact_not_immutable", "artifact_locator_mismatch", "artifact_hash_mismatch", "layer_source_hash_mismatch",
  "tool_identity_not_registered", "producer_before_capture", "producer_after_lifecycle", "producer_before_parent", "coverage_scope_mismatch", "coverage_fingerprint_mismatch", "coverage_backlink_mismatch",
  "coverage_reference_unresolved", "supersession_state_mismatch", "supersession_illegal_transition", "supersession_target_not_found", "supersession_scope_mismatch", "supersession_hash_mismatch",
  "supersession_target_not_newer", "supersession_target_not_immediate", "supersession_target_inactive", "supersession_chain_mismatch", "supersession_multiple_current", "supersession_current_not_latest", "supersession_orphaned_version",
]);
export type DocumentIdentityIssueCode = z.infer<typeof documentIdentityIssueCodeSchema>;
export type DocumentIdentityIssue = {code: DocumentIdentityIssueCode; recordRef: string; path: string; relatedRef: string | null};
export type DocumentIdentityValidationReport = {schemaVersion: "governed-document-identity-validation.v3"; status: "valid" | "invalid"; recordCount: number; issues: DocumentIdentityIssue[]; validatedRecordFingerprints: string[]; graphFingerprint: string};

export class GovernedDocumentIdentityError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "GovernedDocumentIdentityError"; }
}
export type GovernedDocumentIdentityServer = Readonly<{
  compile(input: CompileGovernedDocumentIdentityInput): Promise<GovernedDocumentVersionIdentity>;
  append(record: GovernedDocumentVersionIdentity, input: DocumentLifecycleInput): Promise<GovernedDocumentVersionIdentity>;
  validateGraph(records: readonly GovernedDocumentVersionIdentity[]): Promise<DocumentIdentityValidationReport>;
  assertGraph(records: readonly GovernedDocumentVersionIdentity[]): Promise<DocumentIdentityValidationReport>;
}>;

/** Bind at the trusted server composition root. Request handlers receive only this frozen facade. */
export function bindGovernedDocumentIdentityServer(root: GovernedDocumentServerTrustRoot): GovernedDocumentIdentityServer {
  const validateGraph = (records: readonly GovernedDocumentVersionIdentity[]) => validateGraphInternal(records, root);
  return Object.freeze({
    compile: (input) => compileIdentity(input, root), append: (record, input) => appendLifecycle(record, input, root), validateGraph,
    async assertGraph(records) { const report = await validateGraph(records); if (report.status === "invalid") throw new GovernedDocumentIdentityError("governed_document_identity_invalid"); return report; },
  });
}

async function compileIdentity(rawInput: CompileGovernedDocumentIdentityInput, root: GovernedDocumentServerTrustRoot) {
  const input = compileGovernedDocumentIdentityInputSchema.parse(rawInput);
  const actor = documentActorReferenceSchema.parse(await root.resolveOperationActor());
  if (!await root.isActorRegistered(actor)) throw new GovernedDocumentIdentityError("actor_not_registered");
  const resolved = await resolveAtomicSource(input.sourceDocumentId, input.sourceDocumentVersion, actor, root);
  const sourceHash = sha256Bytes(resolved.bytes!);
  let parentVersion: DocumentVersionReference | null = null;
  if (resolved.row.document_version > 1) {
    const query = versionReferenceFromResolution(resolved, resolved.row.document_version - 1, "0".repeat(64), "0".repeat(64));
    const predecessor = await root.resolvePersistedVersion(query);
    if (!predecessor) throw new GovernedDocumentIdentityError("parent_version_not_found");
    await assertRecordValid(predecessor, root, false);
    if (!sameScopeResolution(predecessor.core, resolved) || predecessor.core.version !== resolved.row.document_version - 1) throw new GovernedDocumentIdentityError("parent_scope_mismatch");
    parentVersion = referenceOf(predecessor);
  }
  const coreBody = canonicalize({
    schemaVersion: governedDocumentIdentityVersion, organizationId: resolved.organizationId, projectId: resolved.projectId,
    companyId: resolved.companyId, conversationId: resolved.conversationId, documentId: resolved.documentId, version: resolved.row.document_version,
    parentVersion, sourceBinding: strictBinding(resolved.row), source: resolved.source, capturedBy: resolved.actor, capturedAt: resolved.capturedAt,
    sourceBytes: {sha256: sourceHash, byteSize: resolved.bytes!.byteLength}, sourceSnapshot: resolved.sourceSnapshot, sourceAttestation: resolved.attestation,
  });
  const core = documentIdentityCoreSchema.parse({...coreBody, identityFingerprint: fingerprint(coreBody)});
  const lifecycleInput = documentLifecycleInputSchema.parse({...input.lifecycle, supersession: {state: "current", successorVersion: null, reasonId: null}});
  const lifecycle = await compileLifecycle(core, lifecycleInput, 1, null, actor, root);
  const record = governedDocumentVersionIdentitySchema.parse({core, lifecycleHistory: [lifecycle]});
  await assertRecordValid(record, root, true);
  return record;
}

async function appendLifecycle(rawRecord: GovernedDocumentVersionIdentity, rawInput: DocumentLifecycleInput, root: GovernedDocumentServerTrustRoot) {
  const record = governedDocumentVersionIdentitySchema.parse(rawRecord);
  await assertRecordValid(record, root, true);
  const input = documentLifecycleInputSchema.parse(rawInput);
  const actor = documentActorReferenceSchema.parse(await root.resolveOperationActor());
  if (!await root.isActorRegistered(actor)) throw new GovernedDocumentIdentityError("actor_not_registered");
  const previous = latest(record);
  enforceTransition(previous.supersession, input.supersession);
  const lifecycle = await compileLifecycle(record.core, input, previous.revision + 1, previous.lifecycleFingerprint, actor, root);
  const appended = governedDocumentVersionIdentitySchema.parse({...record, lifecycleHistory: [...record.lifecycleHistory, lifecycle]});
  await assertRecordValid(appended, root, true);
  return appended;
}

async function compileLifecycle(core: DocumentIdentityCore, input: DocumentLifecycleInput, revision: number, previousFingerprint: string | null, actor: DocumentActorReference, root: GovernedDocumentServerTrustRoot) {
  const recordedAt = z.iso.datetime({offset: true}).parse(root.now());
  const coverageRefs = await resolveCoverageRefs(input.coverage, core, root);
  const extractedLayers: ExtractedLayerIdentity[] = [];
  const derivatives: DerivativeIdentity[] = [];
  const tools = new Map<string, DocumentToolIdentity>();
  for (const claim of input.extractedLayers) {
    const artifact = await resolveArtifact(claim.artifactId, root);
    tools.set(toolKey(artifact.producedBy), artifact.producedBy);
    extractedLayers.push({
      layerId: artifact.artifactId, layerKind: claim.layerKind, contentSha256: sha256Bytes(artifact.bytes!), sourceBytesSha256: core.sourceBytes.sha256,
      locator: artifact.locator, producedBy: artifact.producedBy, producedAt: artifact.producedAt, parentRefs: resolveParentClaims(claim.parentRefs, core),
      coverageRefs: await resolveCoverageRefs(claim.coverage, core, root),
    });
  }
  for (const claim of input.derivatives) {
    const artifact = await resolveArtifact(claim.artifactId, root);
    tools.set(toolKey(artifact.producedBy), artifact.producedBy);
    derivatives.push({
      derivativeId: artifact.artifactId, kind: claim.kind, contentSha256: sha256Bytes(artifact.bytes!), locator: artifact.locator,
      producedBy: artifact.producedBy, producedAt: artifact.producedAt, parentRefs: resolveParentClaims(claim.parentRefs, core),
      coverageRefs: await resolveCoverageRefs(claim.coverage, core, root),
    });
  }
  const supersession = await resolveSupersession(core, input.supersession, root);
  const body = canonicalize({
    revision, previousLifecycleFingerprint: previousFingerprint, recordedAt, recordedBy: actor, asOf: input.asOf, dataClass: input.dataClass,
    informationClass: input.informationClass, confidentiality: input.confidentiality, toolchain: [...tools.values()], extractedLayers,
    coverageRefs, derivatives, supersession,
  });
  return documentLifecycleRevisionSchema.parse({...body, lifecycleFingerprint: fingerprint({identityFingerprint: core.identityFingerprint, ...body})});
}

const atomicSourceResolutionSchema = z.object({
  found: z.literal(true), authorized: z.boolean(), organizationId: uuidSchema, projectId: uuidSchema, companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(), documentId: uuidSchema,
  row: sourceDocumentsRowSchema, source: documentSourceOriginSchema, sourceSnapshot: snapshotLocatorSchema, capturedAt: z.iso.datetime({offset: true}), actor: documentActorReferenceSchema,
  bytes: z.instanceof(Uint8Array), immutable: z.boolean(), attestation: sourceAttestationSchema,
}).strict();

async function resolveAtomicSource(sourceDocumentId: string, version: number, actor: DocumentActorReference, root: GovernedDocumentServerTrustRoot) {
  let raw: AtomicSourceDocumentResolution;
  try { raw = await root.resolveSourceDocument(sourceDocumentId, version); } catch { throw new GovernedDocumentIdentityError("source_resolution_failed"); }
  if (!raw.found || !raw.bytes) throw new GovernedDocumentIdentityError("source_resolution_failed");
  if (!raw.authorized) throw new GovernedDocumentIdentityError("scope_authorization_failed");
  const resolved = atomicSourceResolutionSchema.parse(raw);
  if (stableJson(resolved.actor) !== stableJson(actor)) throw new GovernedDocumentIdentityError("scope_authorization_failed");
  const binding = strictBinding(resolved.row);
  const sourceHash = sha256Bytes(resolved.bytes);
  if (binding.sourceDocumentId !== sourceDocumentId || binding.documentVersion !== version || binding.organizationId !== resolved.organizationId || resolved.row.id !== resolved.documentId) throw new GovernedDocumentIdentityError("source_binding_mismatch");
  if (binding.verifiedSha256 !== sourceHash) throw new GovernedDocumentIdentityError("source_hash_not_verified");
  if (!resolved.immutable) throw new GovernedDocumentIdentityError("source_snapshot_not_immutable");
  if (resolved.sourceSnapshot.state !== "versioned_object" || resolved.sourceSnapshot.objectVersionRef !== binding.objectVersionRef) throw new GovernedDocumentIdentityError("source_snapshot_version_mismatch");
  if (resolved.sourceSnapshot.locatorRef !== storageLocator(binding.bucketId, binding.objectPath)) throw new GovernedDocumentIdentityError("source_snapshot_locator_mismatch");
  if (Date.parse(resolved.attestation.authorizedAt) > Date.parse(resolved.capturedAt)) throw new GovernedDocumentIdentityError("authorization_after_capture");
  if (Date.parse(resolved.attestation.signedAt) < Date.parse(binding.sha256VerifiedAt)) throw new GovernedDocumentIdentityError("attestation_before_verification");
  const registration = await root.resolveSourceRegistration(resolved.source.registryId, resolved.source.registryVersion);
  if (!registration || stableJson(registration) !== stableJson(resolved.source)) throw new GovernedDocumentIdentityError("source_registry_mismatch");
  validateSourceOrThrow(resolved.source);
  if (resolved.attestation.payloadSha256 !== fingerprint(sourceAttestationPayload(resolved, sourceHash)) || !await root.verifySourceAttestation(resolved)) throw new GovernedDocumentIdentityError("source_attestation_invalid");
  return resolved;
}

function sourceAttestationPayload(resolved: AtomicSourceDocumentResolution, sourceHash: string) {
  return canonicalize({
    organizationId: resolved.organizationId, projectId: resolved.projectId, companyId: resolved.companyId, conversationId: resolved.conversationId,
    documentId: resolved.documentId, row: resolved.row, source: resolved.source, sourceSnapshot: resolved.sourceSnapshot, capturedAt: resolved.capturedAt,
    actor: resolved.actor, immutable: resolved.immutable, sourceBytesSha256: sourceHash, sourceByteSize: resolved.bytes?.byteLength ?? 0,
    authorizationVersion: resolved.attestation.authorizationVersion, authorizedAt: resolved.attestation.authorizedAt,
  });
}

async function resolveArtifact(artifactId: string, root: GovernedDocumentServerTrustRoot) {
  let artifact: ArtifactResolution;
  try { artifact = await root.resolveArtifact(artifactId); } catch { throw new GovernedDocumentIdentityError("artifact_unresolved"); }
  if (!artifact.found || !artifact.bytes || artifact.artifactId !== artifactId) throw new GovernedDocumentIdentityError("artifact_unresolved");
  if (!artifact.immutable) throw new GovernedDocumentIdentityError("artifact_not_immutable");
  if (artifact.locator.state === "content_addressed" && artifact.locator.locatorRef !== `sha256:${sha256Bytes(artifact.bytes)}`) throw new GovernedDocumentIdentityError("content_addressed_locator_mismatch");
  if (!await root.isToolRegistered(artifact.producedBy)) throw new GovernedDocumentIdentityError("tool_identity_not_registered");
  return artifact;
}

async function resolveCoverageRefs(claims: readonly DocumentCoverageClaim[], core: DocumentIdentityCore, root: GovernedDocumentServerTrustRoot) {
  const output: DocumentCoverageReference[] = [];
  for (const claim of claims) {
    const resolved = await root.resolveCoverage(claim);
    if (!resolved.found) throw new GovernedDocumentIdentityError("coverage_reference_unresolved");
    if (!sameScope(resolved, core)) throw new GovernedDocumentIdentityError("coverage_scope_mismatch");
    if (resolved.fingerprint !== claim.fingerprint) throw new GovernedDocumentIdentityError("coverage_fingerprint_mismatch");
    if (resolved.backlinkIdentityFingerprint !== core.identityFingerprint) throw new GovernedDocumentIdentityError("coverage_backlink_mismatch");
    output.push({...claim, organizationId: core.organizationId, projectId: core.projectId, companyId: core.companyId, conversationId: core.conversationId, documentId: core.documentId, version: core.version, backlinkIdentityFingerprint: core.identityFingerprint});
  }
  return output;
}

async function resolveSupersession(core: DocumentIdentityCore, input: DocumentLifecycleInput["supersession"], root: GovernedDocumentServerTrustRoot) {
  if (input.state === "superseded") {
    if (input.successorVersion === null || input.reasonId === null) throw new GovernedDocumentIdentityError("supersession_state_mismatch");
    if (input.successorVersion !== core.version + 1) throw new GovernedDocumentIdentityError("supersession_target_not_immediate");
    const query = {...referenceOfCore(core), version: input.successorVersion, sourceBytesSha256: "0".repeat(64), identityFingerprint: "0".repeat(64)};
    const successor = await root.resolvePersistedVersion(query);
    if (!successor) throw new GovernedDocumentIdentityError("supersession_target_not_found");
    await assertRecordValid(successor, root, false);
    if (!sameScopeWithoutVersion(successor.core, core)) throw new GovernedDocumentIdentityError("supersession_scope_mismatch");
    if (!successor.core.parentVersion || successor.core.parentVersion.identityFingerprint !== core.identityFingerprint) throw new GovernedDocumentIdentityError("supersession_chain_mismatch");
    if (!["current", "superseded"].includes(latest(successor).supersession.state)) throw new GovernedDocumentIdentityError("supersession_target_inactive");
    return {state: input.state, supersededBy: referenceOf(successor), reasonId: input.reasonId};
  }
  if (input.successorVersion !== null || (input.state === "current") !== (input.reasonId === null)) throw new GovernedDocumentIdentityError("supersession_state_mismatch");
  return {state: input.state, supersededBy: null, reasonId: input.reasonId};
}

async function assertRecordValid(record: GovernedDocumentVersionIdentity, root: GovernedDocumentServerTrustRoot, verifyCurrentAuthorization: boolean) {
  const report = await validateGraphInternal([record], root, {allowIsolatedCurrent: true, verifyCurrentAuthorization});
  if (report.status === "invalid") throw new GovernedDocumentIdentityError(report.issues[0]?.code ?? "governed_document_identity_invalid");
}

async function validateGraphInternal(rawRecords: readonly GovernedDocumentVersionIdentity[], root: GovernedDocumentServerTrustRoot, options: {allowIsolatedCurrent?: boolean; verifyCurrentAuthorization?: boolean} = {}) {
  const records = rawRecords.map((record) => governedDocumentVersionIdentitySchema.parse(record));
  const issues: DocumentIdentityIssue[] = [];
  const add: AddIssue = (code, record, path, related = null) => issues.push({code, recordRef: diagnosticRef(versionKey(record.core)), path, relatedRef: related ? diagnosticRef(related) : null});
  const byVersion = new Map<string, GovernedDocumentVersionIdentity[]>();
  const byDocument = new Map<string, GovernedDocumentVersionIdentity[]>();
  for (const record of records) {
    byVersion.set(versionKey(record.core), [...(byVersion.get(versionKey(record.core)) ?? []), record]);
    byDocument.set(documentKey(record.core), [...(byDocument.get(documentKey(record.core)) ?? []), record]);
    await validateCore(record, root, add, options.verifyCurrentAuthorization ?? true);
    await validateLifecycle(record, root, add);
  }
  for (const duplicates of byVersion.values()) if (duplicates.length > 1) {
    const code = new Set(duplicates.map((item) => item.core.sourceBytes.sha256)).size > 1 ? "version_hash_conflict" : "duplicate_version_identity";
    for (const record of duplicates) add(code, record, "core.version");
  }
  for (const versions of byDocument.values()) validateDocumentChain(versions, byVersion, add, options.allowIsolatedCurrent ?? false);
  detectVersionCycles(records, byVersion, add);
  const ordered = issues.sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  const body = {schemaVersion: "governed-document-identity-validation.v3" as const, status: ordered.length ? "invalid" as const : "valid" as const, recordCount: records.length, issues: ordered, validatedRecordFingerprints: records.map((record) => record.core.identityFingerprint).sort()};
  return {...body, graphFingerprint: fingerprint(body)};
}

async function validateCore(record: GovernedDocumentVersionIdentity, root: GovernedDocumentServerTrustRoot, add: AddIssue, verifyCurrentAuthorization: boolean) {
  const {identityFingerprint: _identity, ...body} = record.core;
  if (fingerprint(canonicalize(body)) !== record.core.identityFingerprint) add("identity_fingerprint_mismatch", record, "core.identityFingerprint");
  if (!await root.isActorRegistered(record.core.capturedBy)) add("actor_not_registered", record, "core.capturedBy");
  if (Date.parse(record.core.sourceAttestation.authorizedAt) > Date.parse(record.core.capturedAt)) add("authorization_after_capture", record, "core.sourceAttestation.authorizedAt");
  if (record.core.sourceSnapshot.state === "content_addressed" && record.core.sourceSnapshot.locatorRef !== `sha256:${record.core.sourceBytes.sha256}`) add("content_addressed_locator_mismatch", record, "core.sourceSnapshot.locatorRef");
  let resolved: AtomicSourceDocumentResolution;
  try { resolved = await root.resolveSourceDocument(record.core.sourceBinding.sourceDocumentId, record.core.version); } catch { add("source_resolution_failed", record, "core.sourceBinding"); return; }
  if (!resolved.found || !resolved.bytes) { add("source_resolution_failed", record, "core.sourceBinding"); return; }
  if (verifyCurrentAuthorization && !resolved.authorized) add("scope_authorization_failed", record, "core.sourceAttestation");
  const sourceHash = sha256Bytes(resolved.bytes);
  if (sourceHash !== record.core.sourceBytes.sha256 || resolved.bytes.byteLength !== record.core.sourceBytes.byteSize) add("source_snapshot_hash_mismatch", record, "core.sourceBytes");
  let binding: DocumentIdentityCore["sourceBinding"];
  try { binding = strictBinding(resolved.row); } catch { add("source_hash_not_verified", record, "core.sourceBinding"); return; }
  if (stableJson(binding) !== stableJson(record.core.sourceBinding) || !sameScopeResolution(record.core, resolved) || stableJson(resolved.actor) !== stableJson(record.core.capturedBy)) add("source_binding_mismatch", record, "core.sourceBinding");
  if (!resolved.immutable) add("source_snapshot_not_immutable", record, "core.sourceSnapshot");
  if (stableJson(resolved.sourceSnapshot) !== stableJson(record.core.sourceSnapshot)) add("source_snapshot_locator_mismatch", record, "core.sourceSnapshot");
  if (sourceHash !== binding.verifiedSha256) add("source_hash_not_verified", record, "core.sourceBinding.verifiedSha256");
  if (record.core.sourceSnapshot.state !== "versioned_object" || record.core.sourceSnapshot.objectVersionRef !== binding.objectVersionRef) add("source_snapshot_version_mismatch", record, "core.sourceSnapshot.objectVersionRef");
  if (record.core.sourceSnapshot.locatorRef !== storageLocator(binding.bucketId, binding.objectPath)) add("source_snapshot_locator_mismatch", record, "core.sourceSnapshot.locatorRef");
  if (Date.parse(record.core.sourceAttestation.signedAt) < Date.parse(binding.sha256VerifiedAt)) add("attestation_before_verification", record, "core.sourceAttestation.signedAt");
  const registration = await root.resolveSourceRegistration(record.core.source.registryId, record.core.source.registryVersion);
  if (!registration || stableJson(registration) !== stableJson(record.core.source) || stableJson(resolved.source) !== stableJson(record.core.source)) add("source_registry_mismatch", record, "core.source");
  if (record.core.sourceAttestation.payloadSha256 !== fingerprint(sourceAttestationPayload(resolved, sourceHash)) || stableJson(record.core.sourceAttestation) !== stableJson(resolved.attestation) || !await root.verifySourceAttestation(resolved)) add("source_attestation_invalid", record, "core.sourceAttestation");
  validateSource(record, add);
}

async function validateLifecycle(record: GovernedDocumentVersionIdentity, root: GovernedDocumentServerTrustRoot, add: AddIssue) {
  let previous: DocumentLifecycleRevision | null = null;
  const immutableArtifacts = new Map<string, string>();
  for (const lifecycle of record.lifecycleHistory) {
    if (lifecycle.revision !== (previous?.revision ?? 0) + 1) add("lifecycle_revision_gap", record, "lifecycleHistory.revision");
    if (lifecycle.previousLifecycleFingerprint !== (previous?.lifecycleFingerprint ?? null)) add("lifecycle_previous_mismatch", record, "lifecycleHistory.previousLifecycleFingerprint");
    const {lifecycleFingerprint: _fingerprint, ...body} = lifecycle;
    if (fingerprint({identityFingerprint: record.core.identityFingerprint, ...canonicalize(body)}) !== lifecycle.lifecycleFingerprint) add("lifecycle_fingerprint_mismatch", record, "lifecycleHistory.lifecycleFingerprint");
    if (!await root.isActorRegistered(lifecycle.recordedBy)) add("actor_not_registered", record, "lifecycleHistory.recordedBy");
    if (Date.parse(lifecycle.asOf) > Date.parse(record.core.capturedAt)) add("as_of_after_capture", record, "lifecycleHistory.asOf");
    if (Date.parse(lifecycle.recordedAt) < Date.parse(record.core.capturedAt)) add("lifecycle_before_capture", record, "lifecycleHistory.recordedAt");
    if (previous && Date.parse(lifecycle.recordedAt) < Date.parse(previous.recordedAt)) add("lifecycle_recorded_at_not_monotonic", record, "lifecycleHistory.recordedAt");
    if (previous && !isAllowedTransition(previous.supersession, lifecycle.supersession)) add("supersession_illegal_transition", record, "lifecycleHistory.supersession.state");
    const registeredTools = new Set(lifecycle.toolchain.map(toolKey));
    for (const tool of lifecycle.toolchain) if (!await root.isToolRegistered(tool)) add("tool_identity_not_registered", record, "lifecycleHistory.toolchain", toolKey(tool));
    const nodes = [
      ...lifecycle.extractedLayers.map((node) => ({id: node.layerId, stable: stableJson(node), hash: node.contentSha256, parents: node.parentRefs, locator: node.locator, producedBy: node.producedBy, producedAt: node.producedAt, coverage: node.coverageRefs})),
      ...lifecycle.derivatives.map((node) => ({id: node.derivativeId, stable: stableJson(node), hash: node.contentSha256, parents: node.parentRefs, locator: node.locator, producedBy: node.producedBy, producedAt: node.producedAt, coverage: node.coverageRefs})),
    ];
    const byId = new Map<string, typeof nodes>();
    for (const node of nodes) {
      const seen = immutableArtifacts.get(node.id);
      if (seen !== undefined && seen !== node.stable) add("artifact_identity_mutated", record, "lifecycleHistory.artifacts", node.id);
      else immutableArtifacts.set(node.id, node.stable);
      byId.set(node.id, [...(byId.get(node.id) ?? []), node]);
      if (!registeredTools.has(toolKey(node.producedBy)) || !await root.isToolRegistered(node.producedBy)) add("tool_identity_not_registered", record, "lifecycleHistory.artifacts.producedBy", toolKey(node.producedBy));
      if (Date.parse(node.producedAt) < Date.parse(record.core.capturedAt)) add("producer_before_capture", record, "lifecycleHistory.artifacts.producedAt");
      if (Date.parse(node.producedAt) > Date.parse(lifecycle.recordedAt)) add("producer_after_lifecycle", record, "lifecycleHistory.artifacts.producedAt");
      await validateArtifact(node, record, root, add);
      for (const coverage of node.coverage) await validateCoverage(record, coverage, root, add);
    }
    for (const layer of lifecycle.extractedLayers) if (layer.sourceBytesSha256 !== record.core.sourceBytes.sha256) add("layer_source_hash_mismatch", record, "lifecycleHistory.extractedLayers.sourceBytesSha256");
    for (const duplicates of byId.values()) if (duplicates.length > 1) add("duplicate_derivative_identity", record, "lifecycleHistory.artifacts");
    for (const node of nodes) for (const parent of node.parents) validateParent(record, node, parent, byId, add);
    detectDerivativeCycles(record, nodes, byId, add);
    for (const coverage of lifecycle.coverageRefs) await validateCoverage(record, coverage, root, add);
    validateConfidentiality(record, lifecycle, add);
    validateSupersessionShape(record, lifecycle, add);
    await validatePersistedSupersessionTarget(record, lifecycle, root, add);
    previous = lifecycle;
  }
}

async function validatePersistedSupersessionTarget(record: GovernedDocumentVersionIdentity, lifecycle: DocumentLifecycleRevision, root: GovernedDocumentServerTrustRoot, add: AddIssue) {
  const reference = lifecycle.supersession.supersededBy;
  if (!reference) return;
  let target: GovernedDocumentVersionIdentity | null;
  try { target = await root.resolvePersistedVersion(reference); } catch { target = null; }
  if (!target) { add("supersession_target_not_found", record, "lifecycleHistory.supersession.supersededBy"); return; }
  let parsed: GovernedDocumentVersionIdentity;
  try { parsed = governedDocumentVersionIdentitySchema.parse(target); } catch { add("supersession_target_not_found", record, "lifecycleHistory.supersession.supersededBy"); return; }
  if (!sameScopeWithoutVersion(parsed.core, record.core)) add("supersession_scope_mismatch", record, "lifecycleHistory.supersession.supersededBy");
  if (parsed.core.version !== record.core.version + 1) add("supersession_target_not_immediate", record, "lifecycleHistory.supersession.supersededBy.version");
  if (parsed.core.sourceBytes.sha256 !== reference.sourceBytesSha256 || parsed.core.identityFingerprint !== reference.identityFingerprint) add("supersession_hash_mismatch", record, "lifecycleHistory.supersession.supersededBy");
  if (!parsed.core.parentVersion || parsed.core.parentVersion.identityFingerprint !== record.core.identityFingerprint) add("supersession_chain_mismatch", record, "lifecycleHistory.supersession.supersededBy");
  if (!["current", "superseded"].includes(latest(parsed).supersession.state)) add("supersession_target_inactive", record, "lifecycleHistory.supersession.supersededBy");
}

async function validateArtifact(node: {id: string; hash: string; locator: SnapshotLocator; producedBy: DocumentToolIdentity; producedAt: string}, record: GovernedDocumentVersionIdentity, root: GovernedDocumentServerTrustRoot, add: AddIssue) {
  let resolved: ArtifactResolution;
  try { resolved = await root.resolveArtifact(node.id); } catch { add("artifact_unresolved", record, "lifecycleHistory.artifacts"); return; }
  if (!resolved.found || !resolved.bytes || resolved.artifactId !== node.id) { add("artifact_unresolved", record, "lifecycleHistory.artifacts"); return; }
  if (!resolved.immutable) add("artifact_not_immutable", record, "lifecycleHistory.artifacts.locator");
  if (stableJson(resolved.locator) !== stableJson(node.locator)) add("artifact_locator_mismatch", record, "lifecycleHistory.artifacts.locator");
  if (sha256Bytes(resolved.bytes) !== node.hash) add("artifact_hash_mismatch", record, "lifecycleHistory.artifacts.contentSha256");
  if (stableJson(resolved.producedBy) !== stableJson(node.producedBy) || resolved.producedAt !== node.producedAt) add("artifact_identity_mutated", record, "lifecycleHistory.artifacts.provenance");
  if (node.locator.state === "content_addressed" && node.locator.locatorRef !== `sha256:${node.hash}`) add("content_addressed_locator_mismatch", record, "lifecycleHistory.artifacts.locatorRef");
}

async function validateCoverage(record: GovernedDocumentVersionIdentity, coverage: DocumentCoverageReference, root: GovernedDocumentServerTrustRoot, add: AddIssue) {
  let resolved: CoverageResolution;
  try { resolved = await root.resolveCoverage(coverage); } catch { add("coverage_reference_unresolved", record, "coverageRefs", coverage.id); return; }
  if (!resolved.found) add("coverage_reference_unresolved", record, "coverageRefs", coverage.id);
  if (!sameScope(resolved, record.core) || !sameScope(coverage, record.core)) add("coverage_scope_mismatch", record, "coverageRefs", coverage.id);
  if (resolved.fingerprint !== coverage.fingerprint) add("coverage_fingerprint_mismatch", record, "coverageRefs", coverage.id);
  if (resolved.backlinkIdentityFingerprint !== record.core.identityFingerprint || coverage.backlinkIdentityFingerprint !== record.core.identityFingerprint) add("coverage_backlink_mismatch", record, "coverageRefs", coverage.id);
}

function validateParent(record: GovernedDocumentVersionIdentity, node: {id: string; parents: DerivativeParentReference[]; producedAt: string}, parent: DerivativeParentReference, byId: ReadonlyMap<string, readonly {id: string; hash: string; producedAt: string}[]>, add: AddIssue) {
  if (parent.kind === "source_version") {
    if (parent.version.identityFingerprint !== record.core.identityFingerprint) add("derivative_parent_not_found", record, "lifecycleHistory.artifacts.parentRefs");
    if (parent.version.sourceBytesSha256 !== record.core.sourceBytes.sha256) add("derivative_parent_hash_mismatch", record, "lifecycleHistory.artifacts.parentRefs");
    return;
  }
  const candidates = byId.get(parent.derivativeId) ?? [];
  const matching = candidates.find((candidate) => candidate.hash === parent.contentSha256);
  if (!candidates.length) add("derivative_parent_not_found", record, "lifecycleHistory.artifacts.parentRefs", parent.derivativeId);
  else if (!matching) add("derivative_parent_hash_mismatch", record, "lifecycleHistory.artifacts.parentRefs", parent.derivativeId);
  if (matching && Date.parse(matching.producedAt) > Date.parse(node.producedAt)) add("producer_before_parent", record, "lifecycleHistory.artifacts.producedAt", parent.derivativeId);
}

function validateSource(record: GovernedDocumentVersionIdentity, add: AddIssue) {
  try { validateSourceOrThrow(record.core.source); } catch (error) {
    add(error instanceof GovernedDocumentIdentityError && error.code === "origin_source_class_mismatch" ? "origin_source_class_mismatch" : "source_integration_state_mismatch", record, "core.source");
  }
}

function validateSourceOrThrow(source: DocumentSourceOrigin) {
  if ((source.integration.status === "native" || source.integration.status === "unsupported") && source.integration.connectorId !== null) throw new GovernedDocumentIdentityError("source_integration_state_mismatch");
  if (source.integration.status === "verified_connector" && source.integration.connectorId === null) throw new GovernedDocumentIdentityError("source_integration_state_mismatch");
  if (source.origin === "external_data_room" && source.integration.status !== "verified_connector") throw new GovernedDocumentIdentityError("source_integration_state_mismatch");
  const allowed: Record<DocumentSourceOrigin["origin"], readonly DocumentSourceOrigin["sourceClass"][]> = {
    user_upload: ["provided_documents"], public_filing: ["public_company", "public_market"], issuer_publication: ["public_company"],
    licensed_source: ["public_company", "public_market", "capital_network"], internal_project: ["project_context"], system_generated: ["project_context", "house_method"], external_data_room: ["provided_documents"],
  };
  if (!allowed[source.origin].includes(source.sourceClass)) throw new GovernedDocumentIdentityError("origin_source_class_mismatch");
}

function validateConfidentiality(record: GovernedDocumentVersionIdentity, lifecycle: DocumentLifecycleRevision, add: AddIssue) {
  const valid = lifecycle.dataClass === "public" ? lifecycle.confidentiality === "public" : lifecycle.dataClass === "restricted_personal" ? lifecycle.confidentiality === "restricted" : lifecycle.confidentiality !== "public";
  if (!valid) add("data_confidentiality_mismatch", record, "lifecycleHistory.confidentiality");
}

function validateSupersessionShape(record: GovernedDocumentVersionIdentity, lifecycle: DocumentLifecycleRevision, add: AddIssue) {
  const terminal = lifecycle.supersession.state !== "current";
  if (lifecycle.supersession.state === "superseded" && lifecycle.supersession.supersededBy === null) add("supersession_state_mismatch", record, "lifecycleHistory.supersession.supersededBy");
  if (lifecycle.supersession.state !== "superseded" && lifecycle.supersession.supersededBy !== null) add("supersession_state_mismatch", record, "lifecycleHistory.supersession.supersededBy");
  if (terminal !== (lifecycle.supersession.reasonId !== null)) add("supersession_state_mismatch", record, "lifecycleHistory.supersession.reasonId");
}

function enforceTransition(previous: DocumentLifecycleRevision["supersession"], next: DocumentLifecycleInput["supersession"]) {
  if (previous.state !== "current") {
    const sameTarget = (previous.supersededBy?.version ?? null) === next.successorVersion;
    if (previous.state !== next.state || previous.reasonId !== next.reasonId || !sameTarget) throw new GovernedDocumentIdentityError("supersession_illegal_transition");
  }
  if (previous.state === "current" && next.state === "current" && (next.successorVersion !== null || next.reasonId !== null)) throw new GovernedDocumentIdentityError("supersession_state_mismatch");
}

function isAllowedTransition(previous: DocumentLifecycleRevision["supersession"], next: DocumentLifecycleRevision["supersession"]) {
  if (previous.state === "current") return true;
  return previous.state === next.state && previous.reasonId === next.reasonId && stableJson(previous.supersededBy) === stableJson(next.supersededBy);
}

function validateDocumentChain(versions: GovernedDocumentVersionIdentity[], byVersion: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>, add: AddIssue, allowIsolatedCurrent: boolean) {
  const ordered = [...versions].sort((a, b) => a.core.version - b.core.version);
  const byHash = new Map<string, GovernedDocumentVersionIdentity[]>();
  for (const record of ordered) byHash.set(record.core.sourceBytes.sha256, [...(byHash.get(record.core.sourceBytes.sha256) ?? []), record]);
  for (const reused of byHash.values()) if (new Set(reused.map((record) => record.core.version)).size > 1) for (const record of reused) add("hash_reused_across_versions", record, "core.sourceBytes.sha256");
  const active = ordered.filter((record) => ["current", "superseded"].includes(latest(record).supersession.state));
  const currents = active.filter((record) => latest(record).supersession.state === "current");
  if (!allowIsolatedCurrent && currents.length > 1) for (const record of currents) add("supersession_multiple_current", record, "lifecycleHistory.supersession.state");
  if (!allowIsolatedCurrent && currents.length === 1 && active.at(-1) !== currents[0]) add("supersession_current_not_latest", currents[0]!, "lifecycleHistory.supersession.state");
  for (const record of ordered) {
    const parent = record.core.parentVersion;
    if (record.core.version > 1 && !parent) add("parent_version_not_found", record, "core.parentVersion");
    if (parent) {
      if (!sameScopeWithoutVersion(parent, record.core)) add("parent_scope_mismatch", record, "core.parentVersion");
      if (parent.documentId !== record.core.documentId) add("parent_document_mismatch", record, "core.parentVersion.documentId");
      if (parent.version >= record.core.version) add("parent_version_not_prior", record, "core.parentVersion.version");
      if (parent.version !== record.core.version - 1) add("parent_version_not_immediate", record, "core.parentVersion.version");
      const resolved = resolveVersion(parent, byVersion);
      if (!resolved && ordered.length > 1) add("parent_version_not_found", record, "core.parentVersion");
      else if (resolved && (resolved.core.sourceBytes.sha256 !== parent.sourceBytesSha256 || resolved.core.identityFingerprint !== parent.identityFingerprint)) add("parent_hash_mismatch", record, "core.parentVersion");
    }
    const supersession = latest(record).supersession;
    if (supersession.state === "superseded" && supersession.supersededBy) {
      const target = resolveVersion(supersession.supersededBy, byVersion);
      if (!target && ordered.length > 1) add("supersession_target_not_found", record, "lifecycleHistory.supersession.supersededBy");
      if (target) {
        if (!sameScopeWithoutVersion(target.core, record.core)) add("supersession_scope_mismatch", record, "lifecycleHistory.supersession.supersededBy");
        if (target.core.version !== record.core.version + 1) add("supersession_target_not_immediate", record, "lifecycleHistory.supersession.supersededBy.version");
        if (target.core.sourceBytes.sha256 !== supersession.supersededBy.sourceBytesSha256 || target.core.identityFingerprint !== supersession.supersededBy.identityFingerprint) add("supersession_hash_mismatch", record, "lifecycleHistory.supersession.supersededBy");
        if (!target.core.parentVersion || target.core.parentVersion.identityFingerprint !== record.core.identityFingerprint) add("supersession_chain_mismatch", record, "lifecycleHistory.supersession.supersededBy");
        if (!["current", "superseded"].includes(latest(target).supersession.state)) add("supersession_target_inactive", record, "lifecycleHistory.supersession.supersededBy");
      }
    } else if (!allowIsolatedCurrent && supersession.state === "current" && record !== active.at(-1)) add("supersession_orphaned_version", record, "lifecycleHistory.supersession.state");
  }
}

type AddIssue = (code: DocumentIdentityIssueCode, record: GovernedDocumentVersionIdentity, path: string, related?: string | null) => void;

function detectVersionCycles(records: GovernedDocumentVersionIdentity[], byVersion: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>, add: AddIssue) {
  const visiting = new Set<string>(); const visited = new Set<string>(); const cyclic = new Set<string>();
  const visit = (record: GovernedDocumentVersionIdentity, trail: string[]) => {
    const key = versionKey(record.core);
    if (visiting.has(key)) { for (const member of trail.slice(Math.max(0, trail.indexOf(key)))) cyclic.add(member); cyclic.add(key); return; }
    if (visited.has(key)) return;
    visiting.add(key);
    if (record.core.parentVersion) { const parent = resolveVersion(record.core.parentVersion, byVersion); if (parent) visit(parent, [...trail, key]); }
    visiting.delete(key); visited.add(key);
  };
  for (const record of records) visit(record, []);
  for (const record of records) if (cyclic.has(versionKey(record.core))) add("version_lineage_cycle", record, "core.parentVersion");
}

function detectDerivativeCycles(record: GovernedDocumentVersionIdentity, nodes: readonly {id: string; parents: DerivativeParentReference[]}[], byId: ReadonlyMap<string, readonly {id: string; parents: DerivativeParentReference[]}[]>, add: AddIssue) {
  const visiting = new Set<string>(); const visited = new Set<string>(); const cyclic = new Set<string>();
  const visit = (node: {id: string; parents: DerivativeParentReference[]}, trail: string[]) => {
    if (visiting.has(node.id)) { for (const member of trail.slice(Math.max(0, trail.indexOf(node.id)))) cyclic.add(member); cyclic.add(node.id); return; }
    if (visited.has(node.id)) return;
    visiting.add(node.id);
    for (const parent of node.parents) if (parent.kind === "derivative") { const target = byId.get(parent.derivativeId)?.[0]; if (target) visit(target, [...trail, node.id]); }
    visiting.delete(node.id); visited.add(node.id);
  };
  for (const node of nodes) visit(node, []);
  for (const id of cyclic) add("derivative_lineage_cycle", record, "lifecycleHistory.artifacts.parentRefs", id);
}

function strictBinding(row: SourceDocumentsRow): DocumentIdentityCore["sourceBinding"] {
  const binding = sourceDocumentBindingSchema.parse(row);
  if ((binding.opportunityId === null && binding.intakeSessionId === null) || binding.objectVersionRef === null || binding.verifiedSha256 === null || binding.sha256VerifiedAt === null) throw new GovernedDocumentIdentityError("source_hash_not_verified");
  return {...binding, objectVersionRef: binding.objectVersionRef, verifiedSha256: binding.verifiedSha256, sha256VerifiedAt: binding.sha256VerifiedAt};
}

function storageLocator(bucketId: string, objectPath: string) { return `storage:${fingerprint({bucketId, objectPath})}`; }
function resolveParentClaims(claims: readonly z.infer<typeof artifactParentClaimSchema>[], core: DocumentIdentityCore): DerivativeParentReference[] { return claims.map((claim) => claim.kind === "source_document" ? {kind: "source_version", version: {...referenceOfCore(core), version: core.version, sourceBytesSha256: core.sourceBytes.sha256, identityFingerprint: core.identityFingerprint}} : claim); }
function referenceOf(record: GovernedDocumentVersionIdentity): DocumentVersionReference { return {...referenceOfCore(record.core), version: record.core.version, sourceBytesSha256: record.core.sourceBytes.sha256, identityFingerprint: record.core.identityFingerprint}; }
function referenceOfCore(core: DocumentIdentityCore) { return {organizationId: core.organizationId, projectId: core.projectId, companyId: core.companyId, conversationId: core.conversationId, documentId: core.documentId}; }
function versionReferenceFromResolution(resolution: AtomicSourceDocumentResolution, version: number, sourceBytesSha256: string, identityFingerprint: string): DocumentVersionReference { return {organizationId: resolution.organizationId, projectId: resolution.projectId, companyId: resolution.companyId, conversationId: resolution.conversationId, documentId: resolution.documentId, version, sourceBytesSha256, identityFingerprint}; }
function sameScope(a: {organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string; version: number}, b: DocumentIdentityCore) { return a.organizationId === b.organizationId && a.projectId === b.projectId && a.companyId === b.companyId && a.conversationId === b.conversationId && a.documentId === b.documentId && a.version === b.version; }
function sameScopeWithoutVersion(a: Pick<DocumentIdentityCore, "organizationId" | "projectId" | "companyId" | "conversationId" | "documentId">, b: Pick<DocumentIdentityCore, "organizationId" | "projectId" | "companyId" | "conversationId" | "documentId">) { return a.organizationId === b.organizationId && a.projectId === b.projectId && a.companyId === b.companyId && a.conversationId === b.conversationId && a.documentId === b.documentId; }
function sameScopeResolution(core: DocumentIdentityCore, resolution: AtomicSourceDocumentResolution) { return core.organizationId === resolution.organizationId && core.projectId === resolution.projectId && core.companyId === resolution.companyId && core.conversationId === resolution.conversationId && core.documentId === resolution.documentId; }
function latest(record: GovernedDocumentVersionIdentity) { return record.lifecycleHistory.at(-1)!; }
function resolveVersion(reference: DocumentVersionReference, byVersion: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>) { const items = byVersion.get(versionKey(reference)) ?? []; return items.length === 1 ? items[0] ?? null : null; }
function versionKey(value: {organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string; version: number}) { return stableJson([value.organizationId, value.projectId, value.companyId, value.conversationId, value.documentId, value.version]); }
function documentKey(value: {organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string}) { return stableJson([value.organizationId, value.projectId, value.companyId, value.conversationId, value.documentId]); }
function toolKey(tool: DocumentToolIdentity) { return stableJson(tool); }
function diagnosticRef(value: string) { return `sha256:${fingerprint(value)}`; }
function sha256Bytes(value: Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function fingerprint(value: unknown) { return sha256Bytes(new TextEncoder().encode(stableJson(value))); }

function canonicalize<T>(input: T): T {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  const sortable = new Set(["toolchain", "coverageRefs", "extractedLayers", "derivatives", "parentRefs"]);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      const mapped = value.map((entry) => canonicalize(entry));
      output[key] = sortable.has(key) ? mapped.sort((a, b) => stableJson(a).localeCompare(stableJson(b))) : mapped;
    } else output[key] = canonicalize(value);
  }
  return output as T;
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
