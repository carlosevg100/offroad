import {createHash} from "node:crypto";

import {informationClassSchema} from "@offroad/credit-ontology";
import {taskDataClassSchema, taskSourceClassSchema} from "@offroad/work-plan";
import {z} from "zod";

import {layerKindSchema} from "./schemas";

export const governedDocumentIdentityVersion = "governed-document-identity.v2";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const scopedIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$/);
const opaqueReferenceSchema = z.string().trim().min(3).max(500)
  .refine((value) => !/@|\s/.test(value), "reference must be opaque and contain no e-mail or whitespace");
const opaqueIdBodySchema = z.string().refine(
  (value) => /^(?:[a-f0-9]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(value),
  "actor ref must contain an opaque UUID or SHA-256",
);

export const documentActorReferenceSchema = z.object({
  kind: z.enum(["user", "service", "integration"]),
  ref: z.string().max(80),
}).strict().superRefine((actor, context) => {
  const prefix = `${actor.kind}:`;
  if (!actor.ref.startsWith(prefix)) {
    context.addIssue({code: "custom", path: ["ref"], message: "actor ref prefix must match actor kind"});
    return;
  }
  const parsed = opaqueIdBodySchema.safeParse(actor.ref.slice(prefix.length));
  if (!parsed.success) context.addIssue({code: "custom", path: ["ref"], message: parsed.error.issues[0]?.message ?? "actor ref must be opaque"});
});
export type DocumentActorReference = z.infer<typeof documentActorReferenceSchema>;

export const documentToolIdentitySchema = z.object({
  toolId: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
  version: z.string().trim().min(1).max(120),
  configurationSha256: sha256Schema,
}).strict();
export type DocumentToolIdentity = z.infer<typeof documentToolIdentitySchema>;

export const sourceDocumentBindingSchema = z.object({
  table: z.literal("public.source_documents"),
  organizationId: scopedIdSchema,
  sourceDocumentId: scopedIdSchema,
  opportunityId: scopedIdSchema.nullable(),
  intakeSessionId: scopedIdSchema.nullable(),
}).strict().superRefine((binding, context) => {
  if (binding.opportunityId === null && binding.intakeSessionId === null) {
    context.addIssue({code: "custom", path: ["opportunityId"], message: "source_documents requires opportunity_id or intake_session_id"});
  }
});
export type SourceDocumentBinding = z.infer<typeof sourceDocumentBindingSchema>;

export const sourceDocumentsRowSchema = z.object({
  id: scopedIdSchema,
  organization_id: scopedIdSchema,
  opportunity_id: scopedIdSchema.nullable(),
  intake_session_id: scopedIdSchema.nullable(),
  document_version: z.number().int().positive(),
  bucket_id: z.string().min(1),
  object_path: z.string().min(1),
  sha256: sha256Schema.nullable(),
  sha256_verified_at: z.iso.datetime({offset: true}).nullable(),
}).strict();
export type SourceDocumentsRow = z.infer<typeof sourceDocumentsRowSchema>;

/**
 * Lossless adapter for the current dual-scope source_documents row. It does not invent a
 * capital-project id: the trusted resolver must authorize and map the opportunity and/or intake
 * session to the claimed canonical project before an identity can be compiled.
 */
export function mapSourceDocumentsRowBinding(raw: SourceDocumentsRow): SourceDocumentBinding {
  const row = sourceDocumentsRowSchema.parse(raw);
  return sourceDocumentBindingSchema.parse({
    table: "public.source_documents",
    organizationId: row.organization_id,
    sourceDocumentId: row.id,
    opportunityId: row.opportunity_id,
    intakeSessionId: row.intake_session_id,
  });
}

export const documentVersionReferenceSchema = z.object({
  organizationId: scopedIdSchema,
  projectId: scopedIdSchema,
  documentId: scopedIdSchema,
  version: z.number().int().positive(),
  sourceBytesSha256: sha256Schema,
}).strict();
export type DocumentVersionReference = z.infer<typeof documentVersionReferenceSchema>;

export const derivativeParentReferenceSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("source_version"), version: documentVersionReferenceSchema}).strict(),
  z.object({kind: z.literal("derivative"), derivativeId: scopedIdSchema, contentSha256: sha256Schema}).strict(),
]);
export type DerivativeParentReference = z.infer<typeof derivativeParentReferenceSchema>;

const snapshotLocatorSchema = z.discriminatedUnion("state", [
  z.object({state: z.literal("content_addressed"), locatorRef: opaqueReferenceSchema, objectVersionRef: z.null()}).strict(),
  z.object({state: z.literal("versioned_object"), locatorRef: opaqueReferenceSchema, objectVersionRef: opaqueReferenceSchema}).strict(),
]);
export type SnapshotLocator = z.infer<typeof snapshotLocatorSchema>;

export const documentCoverageClaimSchema = z.object({
  kind: z.enum(["reading_manifest", "coverage_map", "requirement", "extraction_report"]),
  ref: opaqueReferenceSchema,
  fingerprint: sha256Schema,
}).strict();
export type DocumentCoverageClaim = z.infer<typeof documentCoverageClaimSchema>;

export const documentCoverageReferenceSchema = documentCoverageClaimSchema.extend({
  organizationId: scopedIdSchema,
  projectId: scopedIdSchema,
  documentId: scopedIdSchema,
  version: z.number().int().positive(),
  backlinkIdentityFingerprint: sha256Schema,
}).strict();
export type DocumentCoverageReference = z.infer<typeof documentCoverageReferenceSchema>;

export const documentSourceOriginSchema = z.object({
  origin: z.enum(["user_upload", "public_filing", "issuer_publication", "licensed_source", "internal_project", "system_generated", "external_data_room"]),
  sourceClass: taskSourceClassSchema,
  sourceRef: opaqueReferenceSchema,
  integration: z.object({
    status: z.enum(["native", "verified_connector", "unsupported"]),
    connectorId: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/).nullable(),
  }).strict(),
}).strict();
export type DocumentSourceOrigin = z.infer<typeof documentSourceOriginSchema>;

const scopeAttestationSchema = z.object({
  attestationRef: opaqueReferenceSchema,
  decisionSha256: sha256Schema,
  authorizationVersion: z.string().min(1).max(120),
  authorizedAt: z.iso.datetime({offset: true}),
}).strict();

const documentIdentityCoreSchema = z.object({
  schemaVersion: z.literal(governedDocumentIdentityVersion),
  organizationId: scopedIdSchema,
  projectId: scopedIdSchema,
  documentId: scopedIdSchema,
  version: z.number().int().positive(),
  parentVersion: documentVersionReferenceSchema.nullable(),
  sourceBinding: sourceDocumentBindingSchema.nullable(),
  source: documentSourceOriginSchema,
  capturedBy: documentActorReferenceSchema,
  capturedAt: z.iso.datetime({offset: true}),
  sourceBytes: z.object({sha256: sha256Schema, byteSize: z.number().int().nonnegative()}).strict(),
  sourceSnapshot: snapshotLocatorSchema,
  scopeAttestation: scopeAttestationSchema,
  identityFingerprint: sha256Schema,
}).strict();
export type DocumentIdentityCore = z.infer<typeof documentIdentityCoreSchema>;

const extractedLayerIdentitySchema = z.object({
  layerId: scopedIdSchema,
  layerKind: layerKindSchema,
  contentSha256: sha256Schema,
  sourceBytesSha256: sha256Schema,
  locator: snapshotLocatorSchema,
  producedBy: documentToolIdentitySchema,
  producedAt: z.iso.datetime({offset: true}),
  parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(20),
  coverageRefs: z.array(documentCoverageReferenceSchema).max(100),
}).strict();
export type ExtractedLayerIdentity = z.infer<typeof extractedLayerIdentitySchema>;

const derivativeIdentitySchema = z.object({
  derivativeId: scopedIdSchema,
  kind: z.enum(["normalized_layer", "retrieval_chunk_set", "extraction_candidate_set", "profile", "evidence_fragment", "artifact", "other"]),
  contentSha256: sha256Schema,
  locator: snapshotLocatorSchema,
  producedBy: documentToolIdentitySchema,
  producedAt: z.iso.datetime({offset: true}),
  parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(100),
  coverageRefs: z.array(documentCoverageReferenceSchema).max(100),
}).strict();
export type DerivativeIdentity = z.infer<typeof derivativeIdentitySchema>;

const supersessionSchema = z.object({
  state: z.enum(["current", "superseded", "withdrawn", "rejected"]),
  supersededBy: documentVersionReferenceSchema.nullable(),
  reasonRef: opaqueReferenceSchema.nullable(),
}).strict();

const documentLifecycleRevisionSchema = z.object({
  revision: z.number().int().positive(),
  previousLifecycleFingerprint: sha256Schema.nullable(),
  recordedAt: z.iso.datetime({offset: true}),
  recordedBy: documentActorReferenceSchema,
  asOf: z.iso.datetime({offset: true}),
  dataClass: taskDataClassSchema,
  informationClass: informationClassSchema,
  confidentiality: z.enum(["public", "internal", "confidential", "restricted"]),
  toolchain: z.array(documentToolIdentitySchema).max(30),
  extractedLayers: z.array(extractedLayerIdentitySchema).max(30),
  coverageRefs: z.array(documentCoverageReferenceSchema).max(500),
  derivatives: z.array(derivativeIdentitySchema).max(500),
  supersession: supersessionSchema,
  lifecycleFingerprint: sha256Schema,
}).strict();
export type DocumentLifecycleRevision = z.infer<typeof documentLifecycleRevisionSchema>;

export const governedDocumentVersionIdentitySchema = z.object({
  core: documentIdentityCoreSchema,
  lifecycleHistory: z.array(documentLifecycleRevisionSchema).min(1).max(1_000),
}).strict();
export type GovernedDocumentVersionIdentity = z.infer<typeof governedDocumentVersionIdentitySchema>;

const artifactClaimSchema = z.object({
  id: scopedIdSchema,
  locator: snapshotLocatorSchema,
  claimedSha256: sha256Schema.optional(),
  producedBy: documentToolIdentitySchema,
  producedAt: z.iso.datetime({offset: true}),
  parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(100),
  coverage: z.array(documentCoverageClaimSchema).max(100),
}).strict();

const extractedLayerClaimSchema = artifactClaimSchema.extend({layerKind: layerKindSchema}).strict();
const derivativeClaimSchema = artifactClaimSchema.extend({
  kind: z.enum(["normalized_layer", "retrieval_chunk_set", "extraction_candidate_set", "profile", "evidence_fragment", "artifact", "other"]),
}).strict();

export const documentLifecycleInputSchema = z.object({
  recordedAt: z.iso.datetime({offset: true}),
  recordedBy: documentActorReferenceSchema,
  asOf: z.iso.datetime({offset: true}),
  dataClass: taskDataClassSchema,
  informationClass: informationClassSchema,
  confidentiality: z.enum(["public", "internal", "confidential", "restricted"]),
  toolchain: z.array(documentToolIdentitySchema).max(30),
  extractedLayers: z.array(extractedLayerClaimSchema).max(30),
  coverage: z.array(documentCoverageClaimSchema).max(500),
  derivatives: z.array(derivativeClaimSchema).max(500),
  supersession: supersessionSchema,
}).strict();
export type DocumentLifecycleInput = z.input<typeof documentLifecycleInputSchema>;

export const compileGovernedDocumentIdentityInputSchema = z.object({
  organizationId: scopedIdSchema,
  projectId: scopedIdSchema,
  documentId: scopedIdSchema,
  version: z.number().int().positive(),
  parentVersion: documentVersionReferenceSchema.nullable(),
  sourceBinding: sourceDocumentBindingSchema.nullable(),
  source: documentSourceOriginSchema,
  capturedBy: documentActorReferenceSchema,
  capturedAt: z.iso.datetime({offset: true}),
  sourceSnapshot: snapshotLocatorSchema,
  claimedSourceBytesSha256: sha256Schema.optional(),
  lifecycle: documentLifecycleInputSchema,
}).strict();
export type CompileGovernedDocumentIdentityInput = z.input<typeof compileGovernedDocumentIdentityInputSchema>;

export type ScopeResolution = {
  authorized: boolean;
  organizationId: string;
  projectId: string;
  documentId: string;
  version: number;
  sourceBinding: SourceDocumentBinding | null;
  actorRef: string;
  attestationRef: string;
  decisionSha256: string;
  authorizationVersion: string;
  authorizedAt: string;
};
export type ImmutableBytesResolution = {found: boolean; immutable: boolean; locatorRef: string; objectVersionRef: string | null; bytes: Uint8Array | null};
export type CoverageResolution = {found: boolean; organizationId: string; projectId: string; documentId: string; version: number; fingerprint: string; backlinkIdentityFingerprint: string};

/** All methods cross a trusted server-side boundary. Passing claims back unchanged is not a verifier. */
export interface GovernedDocumentIdentityResolver {
  resolveScope(input: {organizationId: string; projectId: string; documentId: string; version: number; sourceBinding: SourceDocumentBinding | null; actor: DocumentActorReference}): Promise<ScopeResolution>;
  resolveSnapshot(locator: SnapshotLocator): Promise<ImmutableBytesResolution>;
  resolveArtifact(locator: SnapshotLocator): Promise<ImmutableBytesResolution>;
  resolveCoverage(claim: DocumentCoverageClaim): Promise<CoverageResolution>;
  isToolRegistered(tool: DocumentToolIdentity): Promise<boolean>;
}

export const documentIdentityIssueCodeSchema = z.enum([
  "identity_fingerprint_mismatch", "duplicate_version_identity", "version_hash_conflict", "hash_reused_across_versions",
  "scope_authorization_failed", "scope_attestation_mismatch", "source_binding_scope_mismatch",
  "parent_version_not_found", "parent_hash_mismatch", "parent_scope_mismatch", "parent_document_mismatch", "parent_version_not_prior", "parent_version_not_immediate", "version_lineage_cycle",
  "source_snapshot_unresolved", "source_snapshot_not_immutable", "source_snapshot_locator_mismatch", "source_snapshot_version_mismatch", "source_snapshot_hash_mismatch",
  "origin_source_class_mismatch", "source_integration_state_mismatch", "external_data_room_not_supported", "data_confidentiality_mismatch",
  "as_of_after_capture", "lifecycle_before_capture", "lifecycle_recorded_at_not_monotonic", "lifecycle_revision_gap", "lifecycle_previous_mismatch", "lifecycle_fingerprint_mismatch",
  "duplicate_derivative_identity", "derivative_parent_not_found", "derivative_parent_hash_mismatch", "derivative_lineage_cycle", "artifact_unresolved", "artifact_not_immutable", "artifact_locator_mismatch", "artifact_version_mismatch", "artifact_hash_mismatch",
  "layer_source_hash_mismatch", "tool_identity_not_registered", "producer_before_capture", "producer_after_lifecycle", "producer_before_parent",
  "coverage_scope_mismatch", "coverage_fingerprint_mismatch", "coverage_backlink_mismatch", "coverage_reference_unresolved",
  "supersession_state_mismatch", "supersession_target_not_found", "supersession_scope_mismatch", "supersession_hash_mismatch", "supersession_target_not_newer", "supersession_target_not_immediate", "supersession_target_inactive", "supersession_chain_mismatch", "supersession_multiple_current", "supersession_current_not_latest", "supersession_orphaned_version",
]);
export type DocumentIdentityIssueCode = z.infer<typeof documentIdentityIssueCodeSchema>;
export type DocumentIdentityIssue = {code: DocumentIdentityIssueCode; recordKey: string; path: string; relatedRef: string | null};
export type DocumentIdentityValidationReport = {schemaVersion: "governed-document-identity-validation.v2"; status: "valid" | "invalid"; recordCount: number; issues: DocumentIdentityIssue[]; validatedRecordFingerprints: string[]; graphFingerprint: string};

export class GovernedDocumentIdentityCompileError extends Error {
  constructor(readonly code:
    | "scope_not_authorized" | "scope_attestation_mismatch" | "source_snapshot_unresolved" | "source_snapshot_not_immutable"
    | "source_snapshot_locator_mismatch" | "source_snapshot_version_mismatch" | "source_bytes_hash_mismatch"
    | "tool_not_registered" | "artifact_unresolved" | "artifact_not_immutable" | "artifact_locator_mismatch"
    | "artifact_version_mismatch" | "artifact_hash_mismatch" | "coverage_unverified" | "coverage_scope_mismatch" | "coverage_backlink_mismatch"
    | "persisted_identity_invalid") {
    super(code);
    this.name = "GovernedDocumentIdentityCompileError";
  }
}

export async function compileGovernedDocumentIdentity(rawInput: CompileGovernedDocumentIdentityInput, resolver: GovernedDocumentIdentityResolver): Promise<GovernedDocumentVersionIdentity> {
  const input = compileGovernedDocumentIdentityInputSchema.parse(rawInput);
  const scope = await resolveTrustedScope(input, resolver);
  const sourceResolution = await resolveImmutable(input.sourceSnapshot, resolver.resolveSnapshot.bind(resolver), "source");
  const sourceHash = sha256Bytes(sourceResolution.bytes!);
  if (input.claimedSourceBytesSha256 && input.claimedSourceBytesSha256 !== sourceHash) throw new GovernedDocumentIdentityCompileError("source_bytes_hash_mismatch");
  const coreWithoutFingerprint = canonicalize({
    schemaVersion: governedDocumentIdentityVersion,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    documentId: scope.documentId,
    version: input.version,
    parentVersion: input.parentVersion,
    sourceBinding: scope.sourceBinding,
    source: input.source,
    capturedBy: input.capturedBy,
    capturedAt: input.capturedAt,
    sourceBytes: {sha256: sourceHash, byteSize: sourceResolution.bytes!.byteLength},
    sourceSnapshot: input.sourceSnapshot,
    scopeAttestation: {attestationRef: scope.attestationRef, decisionSha256: scope.decisionSha256, authorizationVersion: scope.authorizationVersion, authorizedAt: scope.authorizedAt},
  });
  const core = documentIdentityCoreSchema.parse({...coreWithoutFingerprint, identityFingerprint: fingerprint(coreWithoutFingerprint)});
  const lifecycle = await compileLifecycleRevision(core, input.lifecycle, 1, null, resolver);
  return governedDocumentVersionIdentitySchema.parse({core, lifecycleHistory: [lifecycle]});
}

export async function appendGovernedDocumentLifecycle(rawRecord: GovernedDocumentVersionIdentity, input: DocumentLifecycleInput, resolver: GovernedDocumentIdentityResolver): Promise<GovernedDocumentVersionIdentity> {
  const record = governedDocumentVersionIdentitySchema.parse(rawRecord);
  await assertCoreStillTrusted(record, resolver);
  const previous = record.lifecycleHistory.at(-1)!;
  const next = await compileLifecycleRevision(record.core, documentLifecycleInputSchema.parse(input), previous.revision + 1, previous.lifecycleFingerprint, resolver);
  return governedDocumentVersionIdentitySchema.parse({...record, lifecycleHistory: [...record.lifecycleHistory, next]});
}

export async function validateGovernedDocumentIdentityGraph(rawRecords: readonly GovernedDocumentVersionIdentity[], resolver: GovernedDocumentIdentityResolver): Promise<DocumentIdentityValidationReport> {
  const records = rawRecords.map((record) => governedDocumentVersionIdentitySchema.parse(record));
  const issues: DocumentIdentityIssue[] = [];
  const add: AddIssue = (code, record, path, relatedRef = null) => issues.push({code, recordKey: versionKey(record.core), path, relatedRef});
  const byVersion = new Map<string, GovernedDocumentVersionIdentity[]>();
  const byDocument = new Map<string, GovernedDocumentVersionIdentity[]>();
  for (const record of records) {
    byVersion.set(versionKey(record.core), [...(byVersion.get(versionKey(record.core)) ?? []), record]);
    byDocument.set(scopedDocumentKey(record.core), [...(byDocument.get(scopedDocumentKey(record.core)) ?? []), record]);
    await validateCore(record, resolver, add);
    await validateLifecycle(record, resolver, add);
  }
  for (const duplicates of byVersion.values()) {
    if (duplicates.length < 2) continue;
    const hashes = new Set(duplicates.map((entry) => entry.core.sourceBytes.sha256));
    for (const record of duplicates) add(hashes.size > 1 ? "version_hash_conflict" : "duplicate_version_identity", record, "core.version");
  }
  for (const versions of byDocument.values()) validateDocumentChain(versions, byVersion, add);
  detectVersionCycles(records, byVersion, add);
  const ordered = issues.sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  const validatedRecordFingerprints = records.map((record) => record.core.identityFingerprint).sort();
  const body = {schemaVersion: "governed-document-identity-validation.v2" as const, status: ordered.length ? "invalid" as const : "valid" as const, recordCount: records.length, issues: ordered, validatedRecordFingerprints};
  return {...body, graphFingerprint: fingerprint(body)};
}

export async function assertGovernedDocumentIdentityGraph(records: readonly GovernedDocumentVersionIdentity[], resolver: GovernedDocumentIdentityResolver) {
  const report = await validateGovernedDocumentIdentityGraph(records, resolver);
  if (report.status === "invalid") throw new Error(`governed_document_identity_invalid:${report.issues.map((issue) => issue.code).join(",")}`);
  return report;
}

async function resolveTrustedScope(input: CompileGovernedDocumentIdentityInput, resolver: GovernedDocumentIdentityResolver): Promise<ScopeResolution> {
  const result = await resolver.resolveScope({organizationId: input.organizationId, projectId: input.projectId, documentId: input.documentId, version: input.version, sourceBinding: input.sourceBinding, actor: input.capturedBy});
  if (!result.authorized) throw new GovernedDocumentIdentityCompileError("scope_not_authorized");
  const same = result.organizationId === input.organizationId && result.projectId === input.projectId && result.documentId === input.documentId && result.version === input.version && result.actorRef === input.capturedBy.ref && stableJson(result.sourceBinding) === stableJson(input.sourceBinding) && (!input.sourceBinding || input.sourceBinding.organizationId === input.organizationId);
  if (!same || !sha256Schema.safeParse(result.decisionSha256).success) throw new GovernedDocumentIdentityCompileError("scope_attestation_mismatch");
  return result;
}

async function assertCoreStillTrusted(record: GovernedDocumentVersionIdentity, resolver: GovernedDocumentIdentityResolver): Promise<void> {
  const {identityFingerprint: _fingerprint, ...body} = record.core;
  if (fingerprint(canonicalize(body)) !== record.core.identityFingerprint) throw new GovernedDocumentIdentityCompileError("persisted_identity_invalid");
  let scope: ScopeResolution;
  try {
    scope = await resolver.resolveScope({organizationId: record.core.organizationId, projectId: record.core.projectId, documentId: record.core.documentId, version: record.core.version, sourceBinding: record.core.sourceBinding, actor: record.core.capturedBy});
  } catch {
    throw new GovernedDocumentIdentityCompileError("scope_not_authorized");
  }
  const matches = scope.authorized && scope.organizationId === record.core.organizationId && scope.projectId === record.core.projectId && scope.documentId === record.core.documentId && scope.version === record.core.version && scope.actorRef === record.core.capturedBy.ref && stableJson(scope.sourceBinding) === stableJson(record.core.sourceBinding) && scope.attestationRef === record.core.scopeAttestation.attestationRef && scope.decisionSha256 === record.core.scopeAttestation.decisionSha256 && scope.authorizationVersion === record.core.scopeAttestation.authorizationVersion && scope.authorizedAt === record.core.scopeAttestation.authorizedAt;
  if (!matches) throw new GovernedDocumentIdentityCompileError(scope.authorized ? "scope_attestation_mismatch" : "scope_not_authorized");
  const resolved = await resolveImmutable(record.core.sourceSnapshot, resolver.resolveSnapshot.bind(resolver), "source");
  if (sha256Bytes(resolved.bytes!) !== record.core.sourceBytes.sha256 || resolved.bytes!.byteLength !== record.core.sourceBytes.byteSize) throw new GovernedDocumentIdentityCompileError("persisted_identity_invalid");
}

async function resolveImmutable(locator: SnapshotLocator, resolve: (locator: SnapshotLocator) => Promise<ImmutableBytesResolution>, kind: "source" | "artifact") {
  const result = await resolve(locator);
  if (!result.found || result.bytes === null) throw new GovernedDocumentIdentityCompileError(kind === "source" ? "source_snapshot_unresolved" : "artifact_unresolved");
  if (!result.immutable) throw new GovernedDocumentIdentityCompileError(kind === "source" ? "source_snapshot_not_immutable" : "artifact_not_immutable");
  if (result.locatorRef !== locator.locatorRef) throw new GovernedDocumentIdentityCompileError(kind === "source" ? "source_snapshot_locator_mismatch" : "artifact_locator_mismatch");
  if (result.objectVersionRef !== locator.objectVersionRef) throw new GovernedDocumentIdentityCompileError(kind === "source" ? "source_snapshot_version_mismatch" : "artifact_version_mismatch");
  return result;
}

async function compileLifecycleRevision(core: DocumentIdentityCore, input: DocumentLifecycleInput, revision: number, previous: string | null, resolver: GovernedDocumentIdentityResolver): Promise<DocumentLifecycleRevision> {
  for (const tool of input.toolchain) if (!await resolver.isToolRegistered(tool)) throw new GovernedDocumentIdentityCompileError("tool_not_registered");
  const registered = new Set(input.toolchain.map(toolKey));
  const coverage = await resolveCoverageRefs(input.coverage, core, resolver);
  const layers: ExtractedLayerIdentity[] = [];
  for (const claim of input.extractedLayers) {
    if (!registered.has(toolKey(claim.producedBy)) || !await resolver.isToolRegistered(claim.producedBy)) throw new GovernedDocumentIdentityCompileError("tool_not_registered");
    const resolved = await resolveImmutable(claim.locator, resolver.resolveArtifact.bind(resolver), "artifact");
    const contentSha256 = sha256Bytes(resolved.bytes!);
    if (claim.claimedSha256 && claim.claimedSha256 !== contentSha256) throw new GovernedDocumentIdentityCompileError("artifact_hash_mismatch");
    layers.push({layerId: claim.id, layerKind: claim.layerKind, contentSha256, sourceBytesSha256: core.sourceBytes.sha256, locator: claim.locator, producedBy: claim.producedBy, producedAt: claim.producedAt, parentRefs: claim.parentRefs, coverageRefs: await resolveCoverageRefs(claim.coverage, core, resolver)});
  }
  const derivatives: DerivativeIdentity[] = [];
  for (const claim of input.derivatives) {
    if (!registered.has(toolKey(claim.producedBy)) || !await resolver.isToolRegistered(claim.producedBy)) throw new GovernedDocumentIdentityCompileError("tool_not_registered");
    const resolved = await resolveImmutable(claim.locator, resolver.resolveArtifact.bind(resolver), "artifact");
    const contentSha256 = sha256Bytes(resolved.bytes!);
    if (claim.claimedSha256 && claim.claimedSha256 !== contentSha256) throw new GovernedDocumentIdentityCompileError("artifact_hash_mismatch");
    derivatives.push({derivativeId: claim.id, kind: claim.kind, contentSha256, locator: claim.locator, producedBy: claim.producedBy, producedAt: claim.producedAt, parentRefs: claim.parentRefs, coverageRefs: await resolveCoverageRefs(claim.coverage, core, resolver)});
  }
  const body = canonicalize({revision, previousLifecycleFingerprint: previous, recordedAt: input.recordedAt, recordedBy: input.recordedBy, asOf: input.asOf, dataClass: input.dataClass, informationClass: input.informationClass, confidentiality: input.confidentiality, toolchain: input.toolchain, extractedLayers: layers, coverageRefs: coverage, derivatives, supersession: input.supersession});
  return documentLifecycleRevisionSchema.parse({...body, lifecycleFingerprint: fingerprint({identityFingerprint: core.identityFingerprint, ...body})});
}

async function resolveCoverageRefs(claims: readonly DocumentCoverageClaim[], core: DocumentIdentityCore, resolver: GovernedDocumentIdentityResolver): Promise<DocumentCoverageReference[]> {
  const refs: DocumentCoverageReference[] = [];
  for (const claim of claims) {
    const resolved = await resolver.resolveCoverage(claim);
    if (!resolved.found) throw new GovernedDocumentIdentityCompileError("coverage_unverified");
    if (resolved.organizationId !== core.organizationId || resolved.projectId !== core.projectId || resolved.documentId !== core.documentId || resolved.version !== core.version) throw new GovernedDocumentIdentityCompileError("coverage_scope_mismatch");
    if (resolved.fingerprint !== claim.fingerprint) throw new GovernedDocumentIdentityCompileError("coverage_unverified");
    if (resolved.backlinkIdentityFingerprint !== core.identityFingerprint) throw new GovernedDocumentIdentityCompileError("coverage_backlink_mismatch");
    refs.push({...claim, organizationId: core.organizationId, projectId: core.projectId, documentId: core.documentId, version: core.version, backlinkIdentityFingerprint: core.identityFingerprint});
  }
  return refs;
}

async function validateCore(record: GovernedDocumentVersionIdentity, resolver: GovernedDocumentIdentityResolver, add: AddIssue) {
  const {identityFingerprint: _fingerprint, ...body} = record.core;
  if (fingerprint(canonicalize(body)) !== record.core.identityFingerprint) add("identity_fingerprint_mismatch", record, "core.identityFingerprint");
  try {
    const scope = await resolver.resolveScope({organizationId: record.core.organizationId, projectId: record.core.projectId, documentId: record.core.documentId, version: record.core.version, sourceBinding: record.core.sourceBinding, actor: record.core.capturedBy});
    if (!scope.authorized) add("scope_authorization_failed", record, "core.scopeAttestation");
    else if (scope.organizationId !== record.core.organizationId || scope.projectId !== record.core.projectId || scope.documentId !== record.core.documentId || scope.version !== record.core.version || scope.actorRef !== record.core.capturedBy.ref || stableJson(scope.sourceBinding) !== stableJson(record.core.sourceBinding) || scope.attestationRef !== record.core.scopeAttestation.attestationRef || scope.decisionSha256 !== record.core.scopeAttestation.decisionSha256 || scope.authorizationVersion !== record.core.scopeAttestation.authorizationVersion || scope.authorizedAt !== record.core.scopeAttestation.authorizedAt) add("scope_attestation_mismatch", record, "core.scopeAttestation");
  } catch { add("scope_authorization_failed", record, "core.scopeAttestation"); }
  if (record.core.sourceBinding && record.core.sourceBinding.organizationId !== record.core.organizationId) add("source_binding_scope_mismatch", record, "core.sourceBinding.organizationId");
  await verifyResolvedBytes(record, record.core.sourceSnapshot, record.core.sourceBytes.sha256, "core.sourceSnapshot", resolver.resolveSnapshot.bind(resolver), add);
  validateSource(record, add);
}

async function validateLifecycle(record: GovernedDocumentVersionIdentity, resolver: GovernedDocumentIdentityResolver, add: AddIssue) {
  let previous: DocumentLifecycleRevision | null = null;
  for (const lifecycle of record.lifecycleHistory) {
    if (lifecycle.revision !== (previous?.revision ?? 0) + 1) add("lifecycle_revision_gap", record, `lifecycleHistory.${lifecycle.revision}.revision`);
    if (lifecycle.previousLifecycleFingerprint !== (previous?.lifecycleFingerprint ?? null)) add("lifecycle_previous_mismatch", record, `lifecycleHistory.${lifecycle.revision}.previousLifecycleFingerprint`);
    const {lifecycleFingerprint: _fingerprint, ...body} = lifecycle;
    if (fingerprint({identityFingerprint: record.core.identityFingerprint, ...canonicalize(body)}) !== lifecycle.lifecycleFingerprint) add("lifecycle_fingerprint_mismatch", record, `lifecycleHistory.${lifecycle.revision}.lifecycleFingerprint`);
    if (Date.parse(lifecycle.asOf) > Date.parse(record.core.capturedAt)) add("as_of_after_capture", record, `lifecycleHistory.${lifecycle.revision}.asOf`);
    if (Date.parse(lifecycle.recordedAt) < Date.parse(record.core.capturedAt)) add("lifecycle_before_capture", record, `lifecycleHistory.${lifecycle.revision}.recordedAt`);
    if (previous && Date.parse(lifecycle.recordedAt) < Date.parse(previous.recordedAt)) add("lifecycle_recorded_at_not_monotonic", record, `lifecycleHistory.${lifecycle.revision}.recordedAt`);
    const registered = new Set(lifecycle.toolchain.map(toolKey));
    for (const tool of lifecycle.toolchain) if (!await resolver.isToolRegistered(tool)) add("tool_identity_not_registered", record, `lifecycleHistory.${lifecycle.revision}.toolchain`, toolKey(tool));
    const nodes = [
      ...lifecycle.extractedLayers.map((layer) => ({id: layer.layerId, hash: layer.contentSha256, parents: layer.parentRefs, locator: layer.locator, producedBy: layer.producedBy, producedAt: layer.producedAt, coverage: layer.coverageRefs})),
      ...lifecycle.derivatives.map((item) => ({id: item.derivativeId, hash: item.contentSha256, parents: item.parentRefs, locator: item.locator, producedBy: item.producedBy, producedAt: item.producedAt, coverage: item.coverageRefs})),
    ];
    const byId = new Map<string, typeof nodes>();
    for (const node of nodes) {
      byId.set(node.id, [...(byId.get(node.id) ?? []), node]);
      if (!registered.has(toolKey(node.producedBy)) || !await resolver.isToolRegistered(node.producedBy)) add("tool_identity_not_registered", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.producedBy`, toolKey(node.producedBy));
      if (Date.parse(node.producedAt) < Date.parse(record.core.capturedAt)) add("producer_before_capture", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.producedAt`);
      if (Date.parse(node.producedAt) > Date.parse(lifecycle.recordedAt)) add("producer_after_lifecycle", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.producedAt`);
      await verifyResolvedBytes(record, node.locator, node.hash, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.locator`, resolver.resolveArtifact.bind(resolver), add);
      for (const coverage of node.coverage) await validateCoverage(record, coverage, resolver, add);
    }
    for (const layer of lifecycle.extractedLayers) {
      if (layer.sourceBytesSha256 !== record.core.sourceBytes.sha256) add("layer_source_hash_mismatch", record, `lifecycleHistory.${lifecycle.revision}.extractedLayers.${layer.layerId}.sourceBytesSha256`);
    }
    for (const [id, duplicates] of byId) if (duplicates.length > 1) add("duplicate_derivative_identity", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${id}`);
    for (const node of nodes) for (const parent of node.parents) {
      if (parent.kind === "source_version") {
        if (versionReferenceKey(parent.version) !== versionKey(record.core)) add("derivative_parent_not_found", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.parentRefs`, versionReferenceKey(parent.version));
        else if (parent.version.sourceBytesSha256 !== record.core.sourceBytes.sha256) add("derivative_parent_hash_mismatch", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.parentRefs`);
      } else {
        const candidates = byId.get(parent.derivativeId) ?? [];
        if (!candidates.length) add("derivative_parent_not_found", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.parentRefs`, parent.derivativeId);
        else if (!candidates.some((candidate) => candidate.hash === parent.contentSha256)) add("derivative_parent_hash_mismatch", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.parentRefs`, parent.derivativeId);
        const parentProducedAt = candidates.find((candidate) => candidate.hash === parent.contentSha256)?.producedAt;
        if (parentProducedAt && Date.parse(parentProducedAt) > Date.parse(node.producedAt)) add("producer_before_parent", record, `lifecycleHistory.${lifecycle.revision}.derivatives.${node.id}.producedAt`, parent.derivativeId);
      }
    }
    detectDerivativeCycles(record, lifecycle.revision, nodes, byId, add);
    for (const coverage of lifecycle.coverageRefs) await validateCoverage(record, coverage, resolver, add);
    validateConfidentiality(record, lifecycle, add);
    validateSupersessionShape(record, lifecycle, add);
    previous = lifecycle;
  }
}

async function verifyResolvedBytes(record: GovernedDocumentVersionIdentity, locator: SnapshotLocator, expectedHash: string, path: string, resolve: (locator: SnapshotLocator) => Promise<ImmutableBytesResolution>, add: AddIssue) {
  let result: ImmutableBytesResolution;
  try { result = await resolve(locator); } catch { add(path.startsWith("core") ? "source_snapshot_unresolved" : "artifact_unresolved", record, path); return; }
  const source = path.startsWith("core");
  if (!result.found || result.bytes === null) { add(source ? "source_snapshot_unresolved" : "artifact_unresolved", record, path); return; }
  if (!result.immutable) add(source ? "source_snapshot_not_immutable" : "artifact_not_immutable", record, path);
  if (result.locatorRef !== locator.locatorRef) add(source ? "source_snapshot_locator_mismatch" : "artifact_locator_mismatch", record, path);
  if (result.objectVersionRef !== locator.objectVersionRef) add(source ? "source_snapshot_version_mismatch" : "artifact_version_mismatch", record, path);
  if (sha256Bytes(result.bytes) !== expectedHash) add(source ? "source_snapshot_hash_mismatch" : "artifact_hash_mismatch", record, path);
}

async function validateCoverage(record: GovernedDocumentVersionIdentity, coverage: DocumentCoverageReference, resolver: GovernedDocumentIdentityResolver, add: AddIssue) {
  let result: CoverageResolution;
  try { result = await resolver.resolveCoverage(coverage); } catch { add("coverage_reference_unresolved", record, "coverageRefs", coverage.ref); return; }
  if (!result.found) add("coverage_reference_unresolved", record, "coverageRefs", coverage.ref);
  const scopeMatches = coverage.organizationId === record.core.organizationId && coverage.projectId === record.core.projectId && coverage.documentId === record.core.documentId && coverage.version === record.core.version && result.organizationId === record.core.organizationId && result.projectId === record.core.projectId && result.documentId === record.core.documentId && result.version === record.core.version;
  if (!scopeMatches) add("coverage_scope_mismatch", record, "coverageRefs", coverage.ref);
  if (coverage.fingerprint !== result.fingerprint) add("coverage_fingerprint_mismatch", record, "coverageRefs", coverage.ref);
  if (coverage.backlinkIdentityFingerprint !== record.core.identityFingerprint || result.backlinkIdentityFingerprint !== record.core.identityFingerprint) add("coverage_backlink_mismatch", record, "coverageRefs", coverage.ref);
}

function validateSource(record: GovernedDocumentVersionIdentity, add: AddIssue) {
  const source = record.core.source;
  if (source.origin === "external_data_room" && (source.integration.status !== "unsupported" || source.integration.connectorId !== null)) add("external_data_room_not_supported", record, "core.source.integration");
  if ((source.integration.status === "native" || source.integration.status === "unsupported") && source.integration.connectorId !== null) add("source_integration_state_mismatch", record, "core.source.integration.connectorId");
  if (source.integration.status === "verified_connector" && source.integration.connectorId === null) add("source_integration_state_mismatch", record, "core.source.integration.connectorId");
  const allowed: Record<DocumentSourceOrigin["origin"], readonly DocumentSourceOrigin["sourceClass"][]> = {user_upload: ["provided_documents"], public_filing: ["public_company", "public_market"], issuer_publication: ["public_company"], licensed_source: ["public_company", "public_market", "capital_network"], internal_project: ["project_context"], system_generated: ["project_context", "house_method"], external_data_room: ["provided_documents"]};
  if (!allowed[source.origin].includes(source.sourceClass)) add("origin_source_class_mismatch", record, "core.source.sourceClass");
}

function validateConfidentiality(record: GovernedDocumentVersionIdentity, lifecycle: DocumentLifecycleRevision, add: AddIssue) {
  const valid = lifecycle.dataClass === "public" ? lifecycle.confidentiality === "public" : lifecycle.dataClass === "restricted_personal" ? lifecycle.confidentiality === "restricted" : lifecycle.confidentiality !== "public";
  if (!valid) add("data_confidentiality_mismatch", record, `lifecycleHistory.${lifecycle.revision}.confidentiality`);
}

function validateSupersessionShape(record: GovernedDocumentVersionIdentity, lifecycle: DocumentLifecycleRevision, add: AddIssue) {
  if (lifecycle.supersession.state === "superseded" && lifecycle.supersession.supersededBy === null) add("supersession_state_mismatch", record, `lifecycleHistory.${lifecycle.revision}.supersession.supersededBy`);
  if (lifecycle.supersession.state !== "superseded" && lifecycle.supersession.supersededBy !== null) add("supersession_state_mismatch", record, `lifecycleHistory.${lifecycle.revision}.supersession.supersededBy`);
}

function validateDocumentChain(versions: GovernedDocumentVersionIdentity[], byVersion: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>, add: AddIssue) {
  const unique = [...versions].sort((a, b) => a.core.version - b.core.version);
  const byHash = new Map<string, GovernedDocumentVersionIdentity[]>();
  for (const record of unique) byHash.set(record.core.sourceBytes.sha256, [...(byHash.get(record.core.sourceBytes.sha256) ?? []), record]);
  for (const reused of byHash.values()) if (new Set(reused.map((record) => record.core.version)).size > 1) {
    for (const record of reused) add("hash_reused_across_versions", record, "core.sourceBytes.sha256");
  }
  const active = unique.filter((record) => ["current", "superseded"].includes(latest(record).supersession.state));
  const currents = active.filter((record) => latest(record).supersession.state === "current");
  if (currents.length > 1) for (const current of currents) add("supersession_multiple_current", current, "lifecycleHistory.supersession.state");
  const latestActive = active.at(-1);
  if (currents.length === 1 && latestActive !== currents[0]) add("supersession_current_not_latest", currents[0]!, "lifecycleHistory.supersession.state");
  for (const record of unique) {
    const parentRef = record.core.parentVersion;
    if (record.core.version > 1 && !parentRef) add("parent_version_not_found", record, "core.parentVersion");
    if (parentRef) {
      if (parentRef.organizationId !== record.core.organizationId || parentRef.projectId !== record.core.projectId) add("parent_scope_mismatch", record, "core.parentVersion");
      if (parentRef.documentId !== record.core.documentId) add("parent_document_mismatch", record, "core.parentVersion.documentId");
      if (parentRef.version >= record.core.version) add("parent_version_not_prior", record, "core.parentVersion.version");
      if (parentRef.version !== record.core.version - 1) add("parent_version_not_immediate", record, "core.parentVersion.version");
      const parent = resolveVersion(parentRef, byVersion);
      if (!parent) add("parent_version_not_found", record, "core.parentVersion");
      else if (parent.core.sourceBytes.sha256 !== parentRef.sourceBytesSha256) add("parent_hash_mismatch", record, "core.parentVersion.sourceBytesSha256");
    }
    const state = latest(record).supersession;
    if (state.state === "superseded") {
      const targetRef = state.supersededBy;
      if (!targetRef) continue;
      if (targetRef.organizationId !== record.core.organizationId || targetRef.projectId !== record.core.projectId || targetRef.documentId !== record.core.documentId) add("supersession_scope_mismatch", record, "lifecycleHistory.supersession.supersededBy");
      if (targetRef.version <= record.core.version) add("supersession_target_not_newer", record, "lifecycleHistory.supersession.supersededBy.version");
      if (targetRef.version !== record.core.version + 1) add("supersession_target_not_immediate", record, "lifecycleHistory.supersession.supersededBy.version");
      const target = resolveVersion(targetRef, byVersion);
      if (!target) add("supersession_target_not_found", record, "lifecycleHistory.supersession.supersededBy");
      else {
        if (target.core.sourceBytes.sha256 !== targetRef.sourceBytesSha256) add("supersession_hash_mismatch", record, "lifecycleHistory.supersession.supersededBy.sourceBytesSha256");
        if (!target.core.parentVersion || versionReferenceKey(target.core.parentVersion) !== versionKey(record.core) || target.core.parentVersion.sourceBytesSha256 !== record.core.sourceBytes.sha256) add("supersession_chain_mismatch", record, "lifecycleHistory.supersession.supersededBy");
        if (!["current", "superseded"].includes(latest(target).supersession.state)) add("supersession_target_inactive", record, "lifecycleHistory.supersession.supersededBy");
      }
    } else if (state.state === "current" && record !== latestActive) add("supersession_orphaned_version", record, "lifecycleHistory.supersession.state");
  }
}

type AddIssue = (code: DocumentIdentityIssueCode, record: GovernedDocumentVersionIdentity, path: string, relatedRef?: string | null) => void;

function detectVersionCycles(records: GovernedDocumentVersionIdentity[], byVersion: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>, add: AddIssue) {
  const visiting = new Set<string>(); const visited = new Set<string>(); const cycles = new Set<string>();
  const visit = (record: GovernedDocumentVersionIdentity, trail: string[]) => {
    const key = versionKey(record.core);
    if (visiting.has(key)) { const start = trail.indexOf(key); for (const member of trail.slice(Math.max(0, start))) cycles.add(member); cycles.add(key); return; }
    if (visited.has(key)) return;
    visiting.add(key);
    if (record.core.parentVersion) { const parent = resolveVersion(record.core.parentVersion, byVersion); if (parent) visit(parent, [...trail, key]); }
    visiting.delete(key); visited.add(key);
  };
  for (const record of records) visit(record, []);
  for (const record of records) if (cycles.has(versionKey(record.core))) add("version_lineage_cycle", record, "core.parentVersion");
}

function detectDerivativeCycles(record: GovernedDocumentVersionIdentity, revision: number, nodes: readonly {id: string; parents: DerivativeParentReference[]}[], byId: ReadonlyMap<string, readonly {id: string; parents: DerivativeParentReference[]}[]>, add: AddIssue) {
  const visiting = new Set<string>(); const visited = new Set<string>(); const cycles = new Set<string>();
  const visit = (node: {id: string; parents: DerivativeParentReference[]}, trail: string[]) => {
    if (visiting.has(node.id)) { const start = trail.indexOf(node.id); for (const member of trail.slice(Math.max(0, start))) cycles.add(member); cycles.add(node.id); return; }
    if (visited.has(node.id)) return;
    visiting.add(node.id);
    for (const parent of node.parents) if (parent.kind === "derivative") { const target = byId.get(parent.derivativeId)?.[0]; if (target) visit(target, [...trail, node.id]); }
    visiting.delete(node.id); visited.add(node.id);
  };
  for (const node of nodes) visit(node, []);
  for (const id of cycles) add("derivative_lineage_cycle", record, `lifecycleHistory.${revision}.derivatives.${id}.parentRefs`);
}

function latest(record: GovernedDocumentVersionIdentity) { return record.lifecycleHistory.at(-1)!; }
function resolveVersion(reference: DocumentVersionReference, byVersion: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>) { const candidates = byVersion.get(versionReferenceKey(reference)) ?? []; return candidates.length === 1 ? candidates[0] ?? null : null; }
function versionKey(record: Pick<DocumentIdentityCore, "organizationId" | "projectId" | "documentId" | "version">) { return `${record.organizationId}/${record.projectId}/${record.documentId}@${record.version}`; }
function scopedDocumentKey(record: Pick<DocumentIdentityCore, "organizationId" | "projectId" | "documentId">) { return `${record.organizationId}/${record.projectId}/${record.documentId}`; }
function versionReferenceKey(reference: DocumentVersionReference) { return versionKey(reference); }
function toolKey(tool: DocumentToolIdentity) { return `${tool.toolId}@${tool.version}:${tool.configurationSha256}`; }
function sha256Bytes(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
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
