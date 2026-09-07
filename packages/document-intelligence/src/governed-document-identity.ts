import {createHash} from "node:crypto";

import {informationClassSchema} from "@offroad/credit-ontology";
import {taskDataClassSchema, taskSourceClassSchema} from "@offroad/work-plan";
import {z} from "zod";

import {layerKindSchema} from "./schemas";

export const governedDocumentIdentityVersion = "governed-document-identity.v3";
export const governedDocumentIdentityRuntimeBoundary = Object.freeze({
  persistence: "external_transaction_required",
  concurrency: "adapter_compare_and_swap_required",
  effectsAuthorization: "forbidden_before_committed_revision",
} as const);

/** Attestation clocks may lead the trusted application clock by at most five minutes. */
export const governedDocumentAttestationMaxFutureSkewMs = 5 * 60 * 1_000;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const uuidSchema = z.uuid();
const opaqueLocatorSchema = z.string().trim().min(3).max(500).refine((value) => !/@|\s/.test(value), "locator must be opaque");
const sourcePathSchema = z.string().min(1).max(1_024).superRefine((value, context) => {
  const valid = value === value.trim() && /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(value)
    && !value.includes("\\") && !value.includes("//") && !/%(?:2e|2f|5c)/i.test(value)
    && value.split("/").every((part) => part !== "." && part !== "..") && value.normalize("NFC") === value;
  if (!valid) context.addIssue({code: "custom", message: "object path must be a canonical relative storage key"});
});

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
const cryptographicAttestationSchema = z.object({
  attestationId: uuidSchema, signingKeyId: uuidSchema, signatureAlgorithm: z.enum(["ed25519", "ecdsa-p256-sha256", "rsa-pss-sha256", "aws-kms"]),
  signatureVersion: z.number().int().positive(), signedAt: z.iso.datetime({offset: true}), payloadSha256: sha256Schema,
  signature: z.string().regex(/^[A-Za-z0-9+/_=-]{40,4096}$/),
}).strict();
export const sourceAttestationSchema = cryptographicAttestationSchema.extend({
  authorizationVersion: z.string().trim().min(1).max(120), authorizedAt: z.iso.datetime({offset: true}),
}).strict();
export type SourceAttestation = z.infer<typeof sourceAttestationSchema>;
export const artifactAttestationSchema = cryptographicAttestationSchema;
export type ArtifactAttestation = z.infer<typeof artifactAttestationSchema>;
export const lifecycleJournalAttestationSchema = cryptographicAttestationSchema;
export type LifecycleJournalAttestation = z.infer<typeof lifecycleJournalAttestationSchema>;

const confidentialitySchema = z.enum(["public", "internal", "confidential", "restricted"]);
export const documentClassificationSchema = z.object({
  dataClass: taskDataClassSchema, informationClass: informationClassSchema, confidentiality: confidentialitySchema,
}).strict();
export type DocumentClassification = z.infer<typeof documentClassificationSchema>;
const classificationAuthorizationSchema = z.enum(["change_data_class", "change_confidentiality", "declassify", "change_information_class", "upgrade_information_class"]);
export const classificationTransitionReceiptSchema = z.object({
  receiptId: uuidSchema, identityRecordId: uuidSchema, organizationId: uuidSchema, projectId: uuidSchema,
  companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(), documentId: uuidSchema,
  documentVersion: z.number().int().positive(), from: documentClassificationSchema, to: documentClassificationSchema,
  purpose: z.literal("classification_transition"), operationId: uuidSchema,
  priorLifecycleFingerprint: sha256Schema, targetRevision: z.number().int().positive(),
  authorizations: z.array(classificationAuthorizationSchema).min(1).max(5), authorizedActor: documentActorReferenceSchema,
  authorizationPolicyVersion: z.string().trim().min(1).max(120), authorizedAt: z.iso.datetime({offset: true}),
  validThrough: z.iso.datetime({offset: true}), attestation: cryptographicAttestationSchema,
}).strict();
export type ClassificationTransitionReceipt = z.infer<typeof classificationTransitionReceiptSchema>;
export const classificationAuthorizationPolicySchema = z.object({
  authorizationPolicyVersion: z.string().trim().min(1).max(120), maxValidityMs: z.number().int().positive().max(86_400_000),
}).strict();
export type ClassificationAuthorizationPolicy = z.infer<typeof classificationAuthorizationPolicySchema>;

const derivativeKindSchema = z.enum(["normalized_layer", "retrieval_chunk_set", "extraction_candidate_set", "profile", "evidence_fragment", "artifact", "other"]);
const canonicalLayerMediaTypes = {
  pdf: z.literal("application/pdf"),
  spreadsheet: z.enum([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.ms-excel.sheet.binary.macroenabled.12",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/x-dbf",
  ]),
  docx: z.enum([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/rtf",
    "text/rtf",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.wordperfect",
  ]),
  pptx: z.enum([
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.oasis.opendocument.presentation",
  ]),
  csv: z.enum(["text/csv", "text/plain"]),
  image: z.string().regex(/^image\/[a-z0-9][a-z0-9.+-]*$/),
} as const;
export const extractedLayerSemanticIdentitySchema = z.discriminatedUnion("layerKind", [
  z.object({role: z.literal("extracted_layer"), layerKind: z.literal("pdf"), mediaType: canonicalLayerMediaTypes.pdf}).strict(),
  z.object({role: z.literal("extracted_layer"), layerKind: z.literal("spreadsheet"), mediaType: canonicalLayerMediaTypes.spreadsheet}).strict(),
  z.object({role: z.literal("extracted_layer"), layerKind: z.literal("docx"), mediaType: canonicalLayerMediaTypes.docx}).strict(),
  z.object({role: z.literal("extracted_layer"), layerKind: z.literal("pptx"), mediaType: canonicalLayerMediaTypes.pptx}).strict(),
  z.object({role: z.literal("extracted_layer"), layerKind: z.literal("csv"), mediaType: canonicalLayerMediaTypes.csv}).strict(),
  z.object({role: z.literal("extracted_layer"), layerKind: z.literal("image"), mediaType: canonicalLayerMediaTypes.image}).strict(),
]);
export const artifactSemanticIdentitySchema = z.union([
  extractedLayerSemanticIdentitySchema,
  z.object({role: z.literal("derivative"), derivativeKind: derivativeKindSchema, mediaType: z.string().regex(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/)}).strict(),
]);
export type ArtifactSemanticIdentity = z.infer<typeof artifactSemanticIdentitySchema>;

const persistedSourceBindingSchema = z.object({
  table: z.literal("public.source_documents"), sourceDocumentId: uuidSchema, organizationId: uuidSchema, opportunityId: uuidSchema.nullable(), intakeSessionId: uuidSchema.nullable(),
  documentVersion: z.number().int().positive(), bucketId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,99}$/), objectPath: sourcePathSchema,
  objectVersionRef: opaqueLocatorSchema, verifiedSha256: sha256Schema, sha256VerifiedAt: z.iso.datetime({offset: true}),
}).strict();

const documentIdentityCoreSchema = z.object({
  schemaVersion: z.literal(governedDocumentIdentityVersion), identityRecordId: uuidSchema, organizationId: uuidSchema, projectId: uuidSchema, companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(),
  documentId: uuidSchema, version: z.number().int().positive(), parentVersion: documentVersionReferenceSchema.nullable(), sourceBinding: persistedSourceBindingSchema,
  source: documentSourceOriginSchema, sourceClassification: documentClassificationSchema, capturedBy: documentActorReferenceSchema, capturedAt: z.iso.datetime({offset: true}),
  sourceBytes: z.object({sha256: sha256Schema, byteSize: z.number().int().nonnegative()}).strict(), sourceSnapshot: snapshotLocatorSchema,
  sourceAttestation: sourceAttestationSchema, identityFingerprint: sha256Schema,
}).strict();
export type DocumentIdentityCore = z.infer<typeof documentIdentityCoreSchema>;

const extractedLayerIdentitySchema = z.object({
  layerId: uuidSchema, layerKind: layerKindSchema, mediaType: z.string().min(3).max(200), contentSha256: sha256Schema, sourceBytesSha256: sha256Schema, locator: snapshotLocatorSchema,
  producedBy: documentToolIdentitySchema, producerExecutionId: uuidSchema, producedAt: z.iso.datetime({offset: true}), parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(20), coverageRefs: z.array(documentCoverageReferenceSchema).max(100), artifactAttestation: artifactAttestationSchema,
}).strict().superRefine((layer, context) => {
  const semantic = extractedLayerSemanticIdentitySchema.safeParse({role: "extracted_layer", layerKind: layer.layerKind, mediaType: layer.mediaType});
  if (!semantic.success) context.addIssue({code: "custom", path: ["mediaType"], message: "media type is incompatible with extracted layer kind"});
});
export type ExtractedLayerIdentity = z.infer<typeof extractedLayerIdentitySchema>;
const derivativeIdentitySchema = z.object({
  derivativeId: uuidSchema, kind: derivativeKindSchema, mediaType: z.string().min(3).max(200), contentSha256: sha256Schema, locator: snapshotLocatorSchema, producedBy: documentToolIdentitySchema, producerExecutionId: uuidSchema, producedAt: z.iso.datetime({offset: true}),
  parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(100), coverageRefs: z.array(documentCoverageReferenceSchema).max(100), artifactAttestation: artifactAttestationSchema,
}).strict();
export type DerivativeIdentity = z.infer<typeof derivativeIdentitySchema>;

const supersessionSchema = z.object({state: z.enum(["current", "superseded", "withdrawn", "rejected"]), supersededBy: documentVersionReferenceSchema.nullable(), reasonId: uuidSchema.nullable()}).strict();
const documentLifecycleRevisionSchema = z.object({
  revision: z.number().int().positive(), previousLifecycleFingerprint: sha256Schema.nullable(), recordedAt: z.iso.datetime({offset: true}), recordedBy: documentActorReferenceSchema,
  asOf: z.iso.datetime({offset: true}), dataClass: taskDataClassSchema, informationClass: informationClassSchema, confidentiality: confidentialitySchema,
  classificationReceipt: classificationTransitionReceiptSchema.nullable(),
  toolchain: z.array(documentToolIdentitySchema).max(30), extractedLayers: z.array(extractedLayerIdentitySchema).max(30), coverageRefs: z.array(documentCoverageReferenceSchema).max(500),
  derivatives: z.array(derivativeIdentitySchema).max(500), supersession: supersessionSchema, lifecycleFingerprint: sha256Schema, journalAttestation: lifecycleJournalAttestationSchema,
}).strict();
export type DocumentLifecycleRevision = z.infer<typeof documentLifecycleRevisionSchema>;
export const governedDocumentVersionIdentitySchema = z.object({core: documentIdentityCoreSchema, lifecycleHistory: z.array(documentLifecycleRevisionSchema).min(1).max(1_000)}).strict();
export type GovernedDocumentVersionIdentity = z.infer<typeof governedDocumentVersionIdentitySchema>;

const artifactClaimSchema = z.object({artifactId: uuidSchema}).strict();
export const documentLifecycleInputSchema = z.object({
  asOf: z.iso.datetime({offset: true}), classificationReceiptId: uuidSchema.nullable(),
  extractedLayers: z.array(artifactClaimSchema).max(30), coverage: z.array(documentCoverageClaimSchema).max(500), derivatives: z.array(artifactClaimSchema).max(500),
  supersession: z.object({state: z.enum(["current", "superseded", "withdrawn", "rejected"]), successorVersion: z.number().int().positive().nullable(), reasonId: uuidSchema.nullable()}).strict(),
}).strict();
export type DocumentLifecycleInput = z.input<typeof documentLifecycleInputSchema>;
export const compileGovernedDocumentIdentityInputSchema = z.object({
  sourceDocumentId: uuidSchema, sourceDocumentVersion: z.number().int().positive(), lifecycle: documentLifecycleInputSchema.omit({supersession: true, classificationReceiptId: true}),
}).strict();
export type CompileGovernedDocumentIdentityInput = z.input<typeof compileGovernedDocumentIdentityInputSchema>;

export type AtomicSourceDocumentResolution = {
  found: boolean; authorized: boolean; identityRecordId: string; organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string;
  row: SourceDocumentsRow; source: DocumentSourceOrigin; classification: DocumentClassification; sourceSnapshot: SnapshotLocator; capturedAt: string; actor: DocumentActorReference;
  bytes: Uint8Array | null; immutable: boolean; attestation: SourceAttestation;
};
export type ArtifactResolution = {
  found: boolean; immutable: boolean; artifactId: string; organizationId: string; projectId: string; companyId: string | null; conversationId: string | null;
  documentId: string; documentVersion: number; sourceBytesSha256: string; identityFingerprint: string; locator: SnapshotLocator; bytes: Uint8Array | null;
  semanticIdentity: ArtifactSemanticIdentity; producedBy: DocumentToolIdentity; producerExecutionId: string; producedAt: string; parentRefs: DerivativeParentReference[];
  coverage: DocumentCoverageClaim[]; attestation: ArtifactAttestation;
};
export type CoverageResolution = {found: boolean; organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string; version: number; fingerprint: string; backlinkIdentityFingerprint: string};

/** Server-only dependency. It is instantiated once and closed over before request handling. */
export interface GovernedDocumentServerTrustRoot {
  resolveOperationActor(): Promise<DocumentActorReference>;
  isActorRegistered(actor: DocumentActorReference): Promise<boolean>;
  resolveSourceDocument(sourceDocumentId: string, sourceDocumentVersion: number): Promise<AtomicSourceDocumentResolution>;
  verifySourceAttestation(resolution: AtomicSourceDocumentResolution): Promise<boolean>;
  resolveSourceRegistration(registryId: string, registryVersion: number): Promise<DocumentSourceOrigin | null>;
  resolveArtifact(artifactId: string): Promise<ArtifactResolution>;
  verifyArtifactAttestation(resolution: ArtifactResolution): Promise<boolean>;
  resolveCoverage(claim: DocumentCoverageClaim): Promise<CoverageResolution>;
  isToolRegistered(tool: DocumentToolIdentity): Promise<boolean>;
  resolvePersistedVersion(reference: DocumentVersionReference): Promise<GovernedDocumentVersionIdentity | null>;
  loadCanonicalIdentity(identityRecordId: string): Promise<GovernedDocumentVersionIdentity | null>;
  authorizeIdentityOperation(actor: DocumentActorReference, identityRecordId: string, operation: "append_lifecycle"): Promise<boolean>;
  attestLifecycleJournal(payload: unknown): Promise<LifecycleJournalAttestation>;
  verifyLifecycleJournalAttestation(payload: unknown, attestation: LifecycleJournalAttestation): Promise<boolean>;
  resolveClassificationReceipt(receiptId: string): Promise<ClassificationTransitionReceipt | null>;
  verifyClassificationReceipt(receipt: ClassificationTransitionReceipt): Promise<boolean>;
  resolveClassificationAuthorizationPolicy(authorizationPolicyVersion: string): Promise<ClassificationAuthorizationPolicy | null>;
  isClassificationAuthorizationCurrent(receipt: ClassificationTransitionReceipt): Promise<boolean>;
  now(): string;
}

export const documentIdentityIssueCodeSchema = z.enum([
  "identity_fingerprint_mismatch", "duplicate_version_identity", "version_hash_conflict", "hash_reused_across_versions", "source_resolution_failed", "scope_authorization_failed", "operation_authorization_failed",
  "source_attestation_invalid", "source_binding_mismatch", "source_registry_mismatch", "parent_version_not_found", "parent_hash_mismatch", "parent_scope_mismatch", "parent_document_mismatch",
  "parent_version_not_prior", "parent_version_not_immediate", "version_lineage_cycle", "source_snapshot_not_immutable", "source_snapshot_locator_mismatch", "source_snapshot_version_mismatch",
  "source_snapshot_hash_mismatch", "source_hash_not_verified", "content_addressed_locator_mismatch", "origin_source_class_mismatch", "source_integration_state_mismatch", "data_confidentiality_mismatch",
  "actor_not_registered", "authorization_after_capture", "attestation_before_verification", "source_hash_verification_time_invalid", "source_attestation_time_invalid", "as_of_after_capture", "lifecycle_before_capture", "lifecycle_recorded_at_not_monotonic",
  "lifecycle_revision_gap", "lifecycle_previous_mismatch", "lifecycle_fingerprint_mismatch", "lifecycle_attestation_invalid", "artifact_identity_mutated", "artifact_attestation_invalid", "artifact_scope_mismatch", "duplicate_derivative_identity", "derivative_parent_not_found",
  "classification_receipt_unresolved", "classification_receipt_invalid", "classification_receipt_expired", "classification_authorization_not_current", "classification_transition_unauthorized", "source_classification_mismatch", "artifact_semantic_identity_mismatch",
  "artifact_attestation_time_invalid", "classification_authorization_time_invalid", "classification_attestation_time_invalid", "lifecycle_attestation_time_invalid",
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
  append(identityRecordId: string, input: DocumentLifecycleInput): Promise<GovernedDocumentVersionIdentity>;
  validateGraph(records: readonly GovernedDocumentVersionIdentity[]): Promise<DocumentIdentityValidationReport>;
  assertGraph(records: readonly GovernedDocumentVersionIdentity[]): Promise<DocumentIdentityValidationReport>;
}>;

/** Bind at the trusted server composition root. Request handlers receive only this frozen facade. */
export function bindGovernedDocumentIdentityServer(root: GovernedDocumentServerTrustRoot): GovernedDocumentIdentityServer {
  const trusted = captureTrustRoot(root);
  const validateGraph = (records: readonly GovernedDocumentVersionIdentity[]) => validateGraphInternal(records, trusted);
  return Object.freeze({
    compile: (input) => compileIdentity(input, trusted), append: (identityRecordId, input) => appendLifecycle(identityRecordId, input, trusted), validateGraph,
    async assertGraph(records) { const report = await validateGraph(records); if (report.status === "invalid") throw new GovernedDocumentIdentityError("governed_document_identity_invalid"); return report; },
  });
}

function captureTrustRoot(root: GovernedDocumentServerTrustRoot): GovernedDocumentServerTrustRoot {
  return Object.freeze({
    resolveOperationActor: root.resolveOperationActor.bind(root), isActorRegistered: root.isActorRegistered.bind(root),
    resolveSourceDocument: root.resolveSourceDocument.bind(root), verifySourceAttestation: root.verifySourceAttestation.bind(root),
    resolveSourceRegistration: root.resolveSourceRegistration.bind(root), resolveArtifact: root.resolveArtifact.bind(root),
    verifyArtifactAttestation: root.verifyArtifactAttestation.bind(root), resolveCoverage: root.resolveCoverage.bind(root),
    isToolRegistered: root.isToolRegistered.bind(root), resolvePersistedVersion: root.resolvePersistedVersion.bind(root),
    loadCanonicalIdentity: root.loadCanonicalIdentity.bind(root), authorizeIdentityOperation: root.authorizeIdentityOperation.bind(root),
    attestLifecycleJournal: root.attestLifecycleJournal.bind(root), verifyLifecycleJournalAttestation: root.verifyLifecycleJournalAttestation.bind(root),
    resolveClassificationReceipt: root.resolveClassificationReceipt.bind(root), verifyClassificationReceipt: root.verifyClassificationReceipt.bind(root),
    resolveClassificationAuthorizationPolicy: root.resolveClassificationAuthorizationPolicy.bind(root), isClassificationAuthorizationCurrent: root.isClassificationAuthorizationCurrent.bind(root),
    now: root.now.bind(root),
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
    if (!sameScopeWithoutVersion(predecessor.core, resolved) || predecessor.core.version !== resolved.row.document_version - 1) throw new GovernedDocumentIdentityError("parent_scope_mismatch");
    parentVersion = referenceOf(predecessor);
  }
  const coreBody = canonicalize({
    schemaVersion: governedDocumentIdentityVersion, identityRecordId: resolved.identityRecordId, organizationId: resolved.organizationId, projectId: resolved.projectId,
    companyId: resolved.companyId, conversationId: resolved.conversationId, documentId: resolved.documentId, version: resolved.row.document_version,
    parentVersion, sourceBinding: strictBinding(resolved.row), source: resolved.source, sourceClassification: resolved.classification, capturedBy: resolved.actor, capturedAt: resolved.capturedAt,
    sourceBytes: {sha256: sourceHash, byteSize: resolved.bytes!.byteLength}, sourceSnapshot: resolved.sourceSnapshot, sourceAttestation: resolved.attestation,
  });
  const core = documentIdentityCoreSchema.parse({...coreBody, identityFingerprint: fingerprint(coreBody)});
  const lifecycleInput = documentLifecycleInputSchema.parse({...input.lifecycle, classificationReceiptId: null, supersession: {state: "current", successorVersion: null, reasonId: null}});
  const lifecycle = await compileLifecycle(core, lifecycleInput, core.sourceClassification, 1, null, actor, root);
  const record = governedDocumentVersionIdentitySchema.parse({core, lifecycleHistory: [lifecycle]});
  await assertRecordValid(record, root, true);
  return record;
}

async function appendLifecycle(rawIdentityRecordId: string, rawInput: DocumentLifecycleInput, root: GovernedDocumentServerTrustRoot) {
  const identityRecordId = uuidSchema.parse(rawIdentityRecordId);
  const actor = documentActorReferenceSchema.parse(await root.resolveOperationActor());
  if (!await root.isActorRegistered(actor)) throw new GovernedDocumentIdentityError("actor_not_registered");
  if (!await root.authorizeIdentityOperation(actor, identityRecordId, "append_lifecycle")) throw new GovernedDocumentIdentityError("operation_authorization_failed");
  const canonical = await root.loadCanonicalIdentity(identityRecordId);
  if (!canonical) throw new GovernedDocumentIdentityError("source_resolution_failed");
  const record = governedDocumentVersionIdentitySchema.parse(structuredClone(canonical));
  if (record.core.identityRecordId !== identityRecordId) throw new GovernedDocumentIdentityError("source_binding_mismatch");
  await assertRecordValid(record, root, true);
  const input = documentLifecycleInputSchema.parse(rawInput);
  const previous = latest(record);
  enforceTransition(previous.supersession, input.supersession);
  const previousClassification = lifecycleClassification(previous);
  const lifecycle = await compileLifecycle(record.core, input, previousClassification, previous.revision + 1, previous.lifecycleFingerprint, actor, root, record.lifecycleHistory);
  const appended = governedDocumentVersionIdentitySchema.parse({...record, lifecycleHistory: [...record.lifecycleHistory, lifecycle]});
  await assertRecordValid(appended, root, true);
  return appended;
}

async function compileLifecycle(core: DocumentIdentityCore, input: DocumentLifecycleInput, previousClassification: DocumentClassification, revision: number, previousFingerprint: string | null, actor: DocumentActorReference, root: GovernedDocumentServerTrustRoot, priorHistory: readonly DocumentLifecycleRevision[] = []) {
  const recordedAt = z.iso.datetime({offset: true}).parse(root.now());
  const {classification, receipt: classificationReceipt} = await resolveClassificationTransition(core, previousClassification, input.classificationReceiptId, actor, recordedAt, revision, previousFingerprint, priorHistory, root);
  const coverageRefs = await resolveCoverageRefs(input.coverage, core, root);
  const extractedLayers: ExtractedLayerIdentity[] = [];
  const derivatives: DerivativeIdentity[] = [];
  const tools = new Map<string, DocumentToolIdentity>();
  for (const claim of input.extractedLayers) {
    const artifact = await resolveArtifact(claim.artifactId, core, root);
    tools.set(toolKey(artifact.producedBy), artifact.producedBy);
    if (artifact.semanticIdentity.role !== "extracted_layer") throw new GovernedDocumentIdentityError("artifact_semantic_identity_mismatch");
    extractedLayers.push({
      layerId: artifact.artifactId, layerKind: artifact.semanticIdentity.layerKind, mediaType: artifact.semanticIdentity.mediaType, contentSha256: sha256Bytes(artifact.bytes!), sourceBytesSha256: core.sourceBytes.sha256,
      locator: artifact.locator, producedBy: artifact.producedBy, producerExecutionId: artifact.producerExecutionId, producedAt: artifact.producedAt,
      parentRefs: artifact.parentRefs, coverageRefs: await resolveCoverageRefs(artifact.coverage, core, root), artifactAttestation: artifact.attestation,
    });
  }
  for (const claim of input.derivatives) {
    const artifact = await resolveArtifact(claim.artifactId, core, root);
    tools.set(toolKey(artifact.producedBy), artifact.producedBy);
    if (artifact.semanticIdentity.role !== "derivative") throw new GovernedDocumentIdentityError("artifact_semantic_identity_mismatch");
    derivatives.push({
      derivativeId: artifact.artifactId, kind: artifact.semanticIdentity.derivativeKind, mediaType: artifact.semanticIdentity.mediaType, contentSha256: sha256Bytes(artifact.bytes!), locator: artifact.locator,
      producedBy: artifact.producedBy, producerExecutionId: artifact.producerExecutionId, producedAt: artifact.producedAt,
      parentRefs: artifact.parentRefs, coverageRefs: await resolveCoverageRefs(artifact.coverage, core, root), artifactAttestation: artifact.attestation,
    });
  }
  const supersession = await resolveSupersession(core, input.supersession, root);
  const body = canonicalize({
    revision, previousLifecycleFingerprint: previousFingerprint, recordedAt, recordedBy: actor, asOf: input.asOf, ...classification, classificationReceipt,
    toolchain: [...tools.values()], extractedLayers,
    coverageRefs, derivatives, supersession,
  });
  const lifecycleFingerprint = fingerprint({identityFingerprint: core.identityFingerprint, ...body});
  const journalBody = canonicalize({identityRecordId: core.identityRecordId, identityFingerprint: core.identityFingerprint, lifecycleFingerprint, ...body});
  const journalAttestation = lifecycleJournalAttestationSchema.parse(await root.attestLifecycleJournal(journalBody));
  if (!attestationTimeValid(journalAttestation.signedAt, recordedAt, root.now())) throw new GovernedDocumentIdentityError("lifecycle_attestation_time_invalid");
  if (journalAttestation.payloadSha256 !== fingerprint(signedPayload(journalBody, journalAttestation)) || !await root.verifyLifecycleJournalAttestation(journalBody, journalAttestation)) throw new GovernedDocumentIdentityError("lifecycle_attestation_invalid");
  return documentLifecycleRevisionSchema.parse({...body, lifecycleFingerprint, journalAttestation});
}

const atomicSourceResolutionSchema = z.object({
  found: z.literal(true), authorized: z.boolean(), identityRecordId: uuidSchema, organizationId: uuidSchema, projectId: uuidSchema, companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(), documentId: uuidSchema,
  row: sourceDocumentsRowSchema, source: documentSourceOriginSchema, classification: documentClassificationSchema, sourceSnapshot: snapshotLocatorSchema, capturedAt: z.iso.datetime({offset: true}), actor: documentActorReferenceSchema,
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
  if (!orderedTimestamps(resolved.attestation.authorizedAt, resolved.capturedAt, binding.sha256VerifiedAt)) throw new GovernedDocumentIdentityError("source_hash_verification_time_invalid");
  if (!timestampNotAfterTrustedNow(binding.sha256VerifiedAt, root.now())) throw new GovernedDocumentIdentityError("source_hash_verification_time_invalid");
  if (!attestationTimeValid(resolved.attestation.signedAt, latestTimestamp(resolved.attestation.authorizedAt, resolved.capturedAt, binding.sha256VerifiedAt), root.now())) throw new GovernedDocumentIdentityError("source_attestation_time_invalid");
  const registration = await root.resolveSourceRegistration(resolved.source.registryId, resolved.source.registryVersion);
  if (!registration || stableJson(registration) !== stableJson(resolved.source)) throw new GovernedDocumentIdentityError("source_registry_mismatch");
  validateSourceOrThrow(resolved.source);
  if (resolved.attestation.payloadSha256 !== fingerprint(sourceAttestationPayload(resolved, sourceHash)) || !await root.verifySourceAttestation(resolved)) throw new GovernedDocumentIdentityError("source_attestation_invalid");
  return resolved;
}

function sourceAttestationPayload(resolved: AtomicSourceDocumentResolution, sourceHash: string) {
  const body = canonicalize({
    identityRecordId: resolved.identityRecordId,
    organizationId: resolved.organizationId, projectId: resolved.projectId, companyId: resolved.companyId, conversationId: resolved.conversationId,
    documentId: resolved.documentId, row: resolved.row, source: resolved.source, classification: resolved.classification, sourceSnapshot: resolved.sourceSnapshot, capturedAt: resolved.capturedAt,
    actor: resolved.actor, immutable: resolved.immutable, sourceBytesSha256: sourceHash, sourceByteSize: resolved.bytes?.byteLength ?? 0,
    authorizationVersion: resolved.attestation.authorizationVersion, authorizedAt: resolved.attestation.authorizedAt,
  });
  return signedPayload(body, resolved.attestation);
}

const artifactResolutionSchema = z.object({
  found: z.literal(true), immutable: z.boolean(), artifactId: uuidSchema, organizationId: uuidSchema, projectId: uuidSchema, companyId: uuidSchema.nullable(), conversationId: uuidSchema.nullable(),
  documentId: uuidSchema, documentVersion: z.number().int().positive(), sourceBytesSha256: sha256Schema, identityFingerprint: sha256Schema,
  locator: snapshotLocatorSchema, bytes: z.instanceof(Uint8Array), semanticIdentity: artifactSemanticIdentitySchema, producedBy: documentToolIdentitySchema, producerExecutionId: uuidSchema,
  producedAt: z.iso.datetime({offset: true}), parentRefs: z.array(derivativeParentReferenceSchema).min(1).max(100), coverage: z.array(documentCoverageClaimSchema).max(100), attestation: artifactAttestationSchema,
}).strict();

async function resolveArtifact(artifactId: string, core: DocumentIdentityCore, root: GovernedDocumentServerTrustRoot) {
  let artifact: ArtifactResolution;
  try { artifact = await root.resolveArtifact(artifactId); } catch { throw new GovernedDocumentIdentityError("artifact_unresolved"); }
  if (!artifact.found || !artifact.bytes || artifact.artifactId !== artifactId) throw new GovernedDocumentIdentityError("artifact_unresolved");
  const parsed = artifactResolutionSchema.parse(artifact);
  if (!parsed.immutable) throw new GovernedDocumentIdentityError("artifact_not_immutable");
  if (!sameArtifactScope(parsed, core)) throw new GovernedDocumentIdentityError("artifact_scope_mismatch");
  const artifactHash = sha256Bytes(parsed.bytes);
  if (artifact.locator.state === "content_addressed" && artifact.locator.locatorRef !== `sha256:${sha256Bytes(artifact.bytes)}`) throw new GovernedDocumentIdentityError("content_addressed_locator_mismatch");
  if (!await root.isToolRegistered(parsed.producedBy)) throw new GovernedDocumentIdentityError("tool_identity_not_registered");
  if (!attestationTimeValid(parsed.attestation.signedAt, parsed.producedAt, root.now())) throw new GovernedDocumentIdentityError("artifact_attestation_time_invalid");
  const payload = artifactAttestationPayload(parsed, artifactHash);
  if (parsed.attestation.payloadSha256 !== fingerprint(payload) || !await root.verifyArtifactAttestation(parsed)) throw new GovernedDocumentIdentityError("artifact_attestation_invalid");
  return parsed;
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

async function resolveClassificationTransition(core: DocumentIdentityCore, previous: DocumentClassification, receiptId: string | null, actor: DocumentActorReference, recordedAt: string, targetRevision: number, priorLifecycleFingerprint: string | null, priorHistory: readonly DocumentLifecycleRevision[], root: GovernedDocumentServerTrustRoot) {
  if (receiptId === null) return {classification: previous, receipt: null};
  if (priorLifecycleFingerprint === null) throw new GovernedDocumentIdentityError("classification_receipt_invalid");
  const previousRecordedAt = priorHistory.at(-1)?.recordedAt;
  if (!previousRecordedAt) throw new GovernedDocumentIdentityError("classification_receipt_invalid");
  const raw = await root.resolveClassificationReceipt(receiptId);
  if (!raw) throw new GovernedDocumentIdentityError("classification_receipt_unresolved");
  const receipt = classificationTransitionReceiptSchema.parse(raw);
  if (receipt.receiptId !== receiptId || !sameClassificationReceiptScope(receipt, core) || stableJson(receipt.authorizedActor) !== stableJson(actor)) throw new GovernedDocumentIdentityError("classification_receipt_invalid");
  if (stableJson(receipt.from) !== stableJson(previous) || receipt.priorLifecycleFingerprint !== priorLifecycleFingerprint || receipt.targetRevision !== targetRevision) throw new GovernedDocumentIdentityError("classification_receipt_invalid");
  if (!classificationAuthorizationTimeValid(receipt.authorizedAt, previousRecordedAt, recordedAt, root.now())) throw new GovernedDocumentIdentityError("classification_authorization_time_invalid");
  if (priorHistory.some((revision) => revision.classificationReceipt?.receiptId === receipt.receiptId || revision.classificationReceipt?.operationId === receipt.operationId || revision.classificationReceipt?.attestation.attestationId === receipt.attestation.attestationId)) throw new GovernedDocumentIdentityError("classification_receipt_invalid");
  enforceClassificationAuthorization(receipt);
  if (!attestationTimeValid(receipt.attestation.signedAt, latestTimestamp(receipt.authorizedAt, previousRecordedAt), root.now())) throw new GovernedDocumentIdentityError("classification_attestation_time_invalid");
  if (receipt.attestation.payloadSha256 !== fingerprint(classificationReceiptPayload(receipt)) || !await root.verifyClassificationReceipt(receipt)) throw new GovernedDocumentIdentityError("classification_receipt_invalid");
  const policy = await resolveClassificationPolicy(receipt, root);
  if (!classificationReceiptValidityValid(receipt, policy, root.now(), true)) throw new GovernedDocumentIdentityError("classification_receipt_expired");
  if (!await root.isClassificationAuthorizationCurrent(receipt)) throw new GovernedDocumentIdentityError("classification_authorization_not_current");
  return {classification: receipt.to, receipt};
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
  if (stableJson(resolved.classification) !== stableJson(record.core.sourceClassification)) add("source_classification_mismatch", record, "core.sourceClassification");
  if (!resolved.immutable) add("source_snapshot_not_immutable", record, "core.sourceSnapshot");
  if (stableJson(resolved.sourceSnapshot) !== stableJson(record.core.sourceSnapshot)) add("source_snapshot_locator_mismatch", record, "core.sourceSnapshot");
  if (sourceHash !== binding.verifiedSha256) add("source_hash_not_verified", record, "core.sourceBinding.verifiedSha256");
  if (record.core.sourceSnapshot.state !== "versioned_object" || record.core.sourceSnapshot.objectVersionRef !== binding.objectVersionRef) add("source_snapshot_version_mismatch", record, "core.sourceSnapshot.objectVersionRef");
  if (record.core.sourceSnapshot.locatorRef !== storageLocator(binding.bucketId, binding.objectPath)) add("source_snapshot_locator_mismatch", record, "core.sourceSnapshot.locatorRef");
  if (!orderedTimestamps(record.core.sourceAttestation.authorizedAt, record.core.capturedAt, record.core.sourceBinding.sha256VerifiedAt)) add("source_hash_verification_time_invalid", record, "core.sourceBinding.sha256VerifiedAt");
  if (!timestampNotAfterTrustedNow(record.core.sourceBinding.sha256VerifiedAt, root.now())) add("source_hash_verification_time_invalid", record, "core.sourceBinding.sha256VerifiedAt");
  if (!attestationTimeValid(record.core.sourceAttestation.signedAt, latestTimestamp(record.core.sourceAttestation.authorizedAt, record.core.capturedAt, record.core.sourceBinding.sha256VerifiedAt), root.now())) add("source_attestation_time_invalid", record, "core.sourceAttestation.signedAt");
  const registration = await root.resolveSourceRegistration(record.core.source.registryId, record.core.source.registryVersion);
  if (!registration || stableJson(registration) !== stableJson(record.core.source) || stableJson(resolved.source) !== stableJson(record.core.source)) add("source_registry_mismatch", record, "core.source");
  if (record.core.sourceAttestation.payloadSha256 !== fingerprint(sourceAttestationPayload(resolved, sourceHash)) || stableJson(record.core.sourceAttestation) !== stableJson(resolved.attestation) || !await root.verifySourceAttestation(resolved)) add("source_attestation_invalid", record, "core.sourceAttestation");
  validateSource(record, add);
}

async function validateLifecycle(record: GovernedDocumentVersionIdentity, root: GovernedDocumentServerTrustRoot, add: AddIssue) {
  let previous: DocumentLifecycleRevision | null = null;
  const immutableArtifacts = new Map<string, string>();
  const immutableContentSemantics = new Map<string, string>();
  const usedClassificationReceiptIds = new Set<string>();
  const usedClassificationOperationIds = new Set<string>();
  const usedClassificationAttestationIds = new Set<string>();
  for (const lifecycle of record.lifecycleHistory) {
    if (lifecycle.revision !== (previous?.revision ?? 0) + 1) add("lifecycle_revision_gap", record, "lifecycleHistory.revision");
    if (lifecycle.previousLifecycleFingerprint !== (previous?.lifecycleFingerprint ?? null)) add("lifecycle_previous_mismatch", record, "lifecycleHistory.previousLifecycleFingerprint");
    const {lifecycleFingerprint: _fingerprint, journalAttestation, ...body} = lifecycle;
    if (fingerprint({identityFingerprint: record.core.identityFingerprint, ...canonicalize(body)}) !== lifecycle.lifecycleFingerprint) add("lifecycle_fingerprint_mismatch", record, "lifecycleHistory.lifecycleFingerprint");
    const journalBody = canonicalize({identityRecordId: record.core.identityRecordId, identityFingerprint: record.core.identityFingerprint, lifecycleFingerprint: lifecycle.lifecycleFingerprint, ...body});
    if (!attestationTimeValid(journalAttestation.signedAt, lifecycle.recordedAt, root.now())) add("lifecycle_attestation_time_invalid", record, "lifecycleHistory.journalAttestation.signedAt");
    if (journalAttestation.payloadSha256 !== fingerprint(signedPayload(journalBody, journalAttestation)) || !await root.verifyLifecycleJournalAttestation(journalBody, journalAttestation)) add("lifecycle_attestation_invalid", record, "lifecycleHistory.journalAttestation");
    if (!await root.isActorRegistered(lifecycle.recordedBy)) add("actor_not_registered", record, "lifecycleHistory.recordedBy");
    if (Date.parse(lifecycle.asOf) > Date.parse(record.core.capturedAt)) add("as_of_after_capture", record, "lifecycleHistory.asOf");
    if (Date.parse(lifecycle.recordedAt) < Date.parse(record.core.capturedAt)) add("lifecycle_before_capture", record, "lifecycleHistory.recordedAt");
    if (previous && Date.parse(lifecycle.recordedAt) < Date.parse(previous.recordedAt)) add("lifecycle_recorded_at_not_monotonic", record, "lifecycleHistory.recordedAt");
    if (previous && !isAllowedTransition(previous.supersession, lifecycle.supersession)) add("supersession_illegal_transition", record, "lifecycleHistory.supersession.state");
    await validateClassificationTransition(record, previous, lifecycle, root, add);
    if (lifecycle.classificationReceipt) {
      if (usedClassificationReceiptIds.has(lifecycle.classificationReceipt.receiptId) || usedClassificationOperationIds.has(lifecycle.classificationReceipt.operationId) || usedClassificationAttestationIds.has(lifecycle.classificationReceipt.attestation.attestationId)) add("classification_receipt_invalid", record, "lifecycleHistory.classificationReceipt");
      usedClassificationReceiptIds.add(lifecycle.classificationReceipt.receiptId);
      usedClassificationOperationIds.add(lifecycle.classificationReceipt.operationId);
      usedClassificationAttestationIds.add(lifecycle.classificationReceipt.attestation.attestationId);
    }
    const registeredTools = new Set(lifecycle.toolchain.map(toolKey));
    for (const tool of lifecycle.toolchain) if (!await root.isToolRegistered(tool)) add("tool_identity_not_registered", record, "lifecycleHistory.toolchain", toolKey(tool));
    const nodes = [
      ...lifecycle.extractedLayers.map((node) => ({id: node.layerId, semanticIdentity: extractedLayerSemanticIdentitySchema.parse({role: "extracted_layer", layerKind: node.layerKind, mediaType: node.mediaType}), stable: stableJson(node), hash: node.contentSha256, parents: node.parentRefs, locator: node.locator, producedBy: node.producedBy, producerExecutionId: node.producerExecutionId, producedAt: node.producedAt, coverage: node.coverageRefs, attestation: node.artifactAttestation})),
      ...lifecycle.derivatives.map((node) => ({id: node.derivativeId, semanticIdentity: {role: "derivative" as const, derivativeKind: node.kind, mediaType: node.mediaType}, stable: stableJson(node), hash: node.contentSha256, parents: node.parentRefs, locator: node.locator, producedBy: node.producedBy, producerExecutionId: node.producerExecutionId, producedAt: node.producedAt, coverage: node.coverageRefs, attestation: node.artifactAttestation})),
    ];
    const byId = new Map<string, typeof nodes>();
    for (const node of nodes) {
      const seen = immutableArtifacts.get(node.id);
      if (seen !== undefined && seen !== node.stable) add("artifact_identity_mutated", record, "lifecycleHistory.artifacts", node.id);
      else immutableArtifacts.set(node.id, node.stable);
      const priorSemanticIdentity = immutableContentSemantics.get(node.hash);
      const semanticIdentity = stableJson(node.semanticIdentity);
      if (priorSemanticIdentity !== undefined && priorSemanticIdentity !== semanticIdentity) add("artifact_semantic_identity_mismatch", record, "lifecycleHistory.artifacts.semanticIdentity", node.id);
      else immutableContentSemantics.set(node.hash, semanticIdentity);
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

async function validateArtifact(node: {id: string; semanticIdentity: ArtifactSemanticIdentity; hash: string; locator: SnapshotLocator; producedBy: DocumentToolIdentity; producerExecutionId: string; producedAt: string; parents: DerivativeParentReference[]; coverage: DocumentCoverageReference[]; attestation: ArtifactAttestation}, record: GovernedDocumentVersionIdentity, root: GovernedDocumentServerTrustRoot, add: AddIssue) {
  let resolved: z.infer<typeof artifactResolutionSchema>;
  try {
    const raw = await root.resolveArtifact(node.id);
    if (!raw.found || !raw.bytes || raw.artifactId !== node.id) throw new Error("unresolved");
    resolved = artifactResolutionSchema.parse(raw);
  } catch { add("artifact_unresolved", record, "lifecycleHistory.artifacts"); return; }
  if (!resolved.immutable) add("artifact_not_immutable", record, "lifecycleHistory.artifacts.locator");
  if (stableJson(resolved.locator) !== stableJson(node.locator)) add("artifact_locator_mismatch", record, "lifecycleHistory.artifacts.locator");
  if (sha256Bytes(resolved.bytes) !== node.hash) add("artifact_hash_mismatch", record, "lifecycleHistory.artifacts.contentSha256");
  if (!sameArtifactScope(resolved, record.core)) add("artifact_scope_mismatch", record, "lifecycleHistory.artifacts.scope");
  if (stableJson(resolved.semanticIdentity) !== stableJson(node.semanticIdentity)) add("artifact_semantic_identity_mismatch", record, "lifecycleHistory.artifacts.semanticIdentity");
  if (stableJson(resolved.producedBy) !== stableJson(node.producedBy) || resolved.producerExecutionId !== node.producerExecutionId || resolved.producedAt !== node.producedAt || stableJson(resolved.parentRefs) !== stableJson(node.parents)) add("artifact_identity_mutated", record, "lifecycleHistory.artifacts.provenance");
  const claimsFromNode = node.coverage.map(({kind, id, fingerprint}) => ({kind, id, fingerprint}));
  if (stableJson(resolved.coverage) !== stableJson(claimsFromNode) || stableJson(resolved.attestation) !== stableJson(node.attestation)) add("artifact_identity_mutated", record, "lifecycleHistory.artifacts.attestation");
  const artifactHash = sha256Bytes(resolved.bytes);
  if (!attestationTimeValid(node.attestation.signedAt, node.producedAt, root.now())) add("artifact_attestation_time_invalid", record, "lifecycleHistory.artifacts.attestation.signedAt");
  if (node.attestation.payloadSha256 !== fingerprint(artifactAttestationPayload(resolved, artifactHash)) || !await root.verifyArtifactAttestation(resolved)) add("artifact_attestation_invalid", record, "lifecycleHistory.artifacts.attestation");
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
    if (!sameScope(parent.version, record.core) || parent.version.identityFingerprint !== record.core.identityFingerprint) add("derivative_parent_not_found", record, "lifecycleHistory.artifacts.parentRefs");
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

async function validateClassificationTransition(record: GovernedDocumentVersionIdentity, previous: DocumentLifecycleRevision | null, lifecycle: DocumentLifecycleRevision, root: GovernedDocumentServerTrustRoot, add: AddIssue) {
  const from = previous ? lifecycleClassification(previous) : record.core.sourceClassification;
  const to = lifecycleClassification(lifecycle);
  const receipt = lifecycle.classificationReceipt;
  if (receipt === null) {
    if (stableJson(from) !== stableJson(to)) add("classification_transition_unauthorized", record, "lifecycleHistory.classificationReceipt");
    return;
  }
  if (!previous || !sameClassificationReceiptScope(receipt, record.core) || stableJson(receipt.from) !== stableJson(from) || stableJson(receipt.to) !== stableJson(to) || stableJson(receipt.authorizedActor) !== stableJson(lifecycle.recordedBy) || receipt.priorLifecycleFingerprint !== previous.lifecycleFingerprint || receipt.targetRevision !== lifecycle.revision) {
    add("classification_receipt_invalid", record, "lifecycleHistory.classificationReceipt");
    return;
  }
  if (!classificationAuthorizationTimeValid(receipt.authorizedAt, previous.recordedAt, lifecycle.recordedAt, root.now())) add("classification_authorization_time_invalid", record, "lifecycleHistory.classificationReceipt.authorizedAt");
  try { enforceClassificationAuthorization(receipt); } catch { add("classification_transition_unauthorized", record, "lifecycleHistory.classificationReceipt"); }
  if (!attestationTimeValid(receipt.attestation.signedAt, latestTimestamp(receipt.authorizedAt, previous.recordedAt), root.now())) add("classification_attestation_time_invalid", record, "lifecycleHistory.classificationReceipt.attestation.signedAt");
  if (receipt.attestation.payloadSha256 !== fingerprint(classificationReceiptPayload(receipt)) || !await root.verifyClassificationReceipt(receipt)) add("classification_receipt_invalid", record, "lifecycleHistory.classificationReceipt.attestation");
  const rawPolicy = await root.resolveClassificationAuthorizationPolicy(receipt.authorizationPolicyVersion);
  const policy = rawPolicy ? classificationAuthorizationPolicySchema.safeParse(rawPolicy) : null;
  if (!policy?.success || policy.data.authorizationPolicyVersion !== receipt.authorizationPolicyVersion || !classificationReceiptValidityValid(receipt, policy.data, root.now(), false)) add("classification_receipt_expired", record, "lifecycleHistory.classificationReceipt.validThrough");
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
function signedPayload(body: unknown, attestation: Pick<ArtifactAttestation, "attestationId" | "signingKeyId" | "signatureAlgorithm" | "signatureVersion" | "signedAt">) { return canonicalize({body, attestationId: attestation.attestationId, signingKeyId: attestation.signingKeyId, signatureAlgorithm: attestation.signatureAlgorithm, signatureVersion: attestation.signatureVersion, signedAt: attestation.signedAt}); }
function lifecycleClassification(lifecycle: Pick<DocumentLifecycleRevision, "dataClass" | "informationClass" | "confidentiality">): DocumentClassification { return {dataClass: lifecycle.dataClass, informationClass: lifecycle.informationClass, confidentiality: lifecycle.confidentiality}; }
function sameClassificationReceiptScope(receipt: ClassificationTransitionReceipt, core: DocumentIdentityCore) { return receipt.identityRecordId === core.identityRecordId && sameScope({organizationId: receipt.organizationId, projectId: receipt.projectId, companyId: receipt.companyId, conversationId: receipt.conversationId, documentId: receipt.documentId, version: receipt.documentVersion}, core); }
function classificationReceiptPayload(receipt: ClassificationTransitionReceipt) {
  const {attestation, ...body} = receipt;
  return signedPayload(canonicalize(body), attestation);
}
function enforceClassificationAuthorization(receipt: ClassificationTransitionReceipt) {
  const grants = new Set(receipt.authorizations);
  const dataRank: Record<DocumentClassification["dataClass"], number> = {public: 0, project_confidential: 1, restricted_personal: 2};
  const confidentialityRank: Record<DocumentClassification["confidentiality"], number> = {public: 0, internal: 1, confidential: 2, restricted: 3};
  const informationRank: Record<DocumentClassification["informationClass"], number> = {audited: 1, reviewed: 2, accounting: 3, bank_statement: 4, management: 5, projection: 6, company_document: 7, calculated: 8};
  if (receipt.from.dataClass !== receipt.to.dataClass && !grants.has("change_data_class")) throw new GovernedDocumentIdentityError("classification_transition_unauthorized");
  if (receipt.from.confidentiality !== receipt.to.confidentiality && !grants.has("change_confidentiality")) throw new GovernedDocumentIdentityError("classification_transition_unauthorized");
  if ((dataRank[receipt.to.dataClass] < dataRank[receipt.from.dataClass] || confidentialityRank[receipt.to.confidentiality] < confidentialityRank[receipt.from.confidentiality]) && !grants.has("declassify")) throw new GovernedDocumentIdentityError("classification_transition_unauthorized");
  if (receipt.from.informationClass !== receipt.to.informationClass && !grants.has("change_information_class")) throw new GovernedDocumentIdentityError("classification_transition_unauthorized");
  if (informationRank[receipt.to.informationClass] < informationRank[receipt.from.informationClass] && !grants.has("upgrade_information_class")) throw new GovernedDocumentIdentityError("classification_transition_unauthorized");
}
function artifactAttestationPayload(artifact: ArtifactResolution, contentSha256: string) {
  const body = canonicalize({
    artifactId: artifact.artifactId, organizationId: artifact.organizationId, projectId: artifact.projectId, companyId: artifact.companyId,
    conversationId: artifact.conversationId, documentId: artifact.documentId, documentVersion: artifact.documentVersion,
    sourceBytesSha256: artifact.sourceBytesSha256, identityFingerprint: artifact.identityFingerprint, immutable: artifact.immutable,
    locator: artifact.locator, contentSha256, byteSize: artifact.bytes?.byteLength ?? 0, semanticIdentity: artifact.semanticIdentity, producedBy: artifact.producedBy,
    producerExecutionId: artifact.producerExecutionId, producedAt: artifact.producedAt, parentRefs: artifact.parentRefs, coverage: artifact.coverage,
  });
  return signedPayload(body, artifact.attestation);
}
function referenceOf(record: GovernedDocumentVersionIdentity): DocumentVersionReference { return {...referenceOfCore(record.core), version: record.core.version, sourceBytesSha256: record.core.sourceBytes.sha256, identityFingerprint: record.core.identityFingerprint}; }
function referenceOfCore(core: DocumentIdentityCore) { return {organizationId: core.organizationId, projectId: core.projectId, companyId: core.companyId, conversationId: core.conversationId, documentId: core.documentId}; }
function versionReferenceFromResolution(resolution: AtomicSourceDocumentResolution, version: number, sourceBytesSha256: string, identityFingerprint: string): DocumentVersionReference { return {organizationId: resolution.organizationId, projectId: resolution.projectId, companyId: resolution.companyId, conversationId: resolution.conversationId, documentId: resolution.documentId, version, sourceBytesSha256, identityFingerprint}; }
function sameScope(a: {organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string; version: number}, b: DocumentIdentityCore) { return a.organizationId === b.organizationId && a.projectId === b.projectId && a.companyId === b.companyId && a.conversationId === b.conversationId && a.documentId === b.documentId && a.version === b.version; }
function sameScopeWithoutVersion(a: Pick<DocumentIdentityCore, "organizationId" | "projectId" | "companyId" | "conversationId" | "documentId">, b: Pick<DocumentIdentityCore, "organizationId" | "projectId" | "companyId" | "conversationId" | "documentId">) { return a.organizationId === b.organizationId && a.projectId === b.projectId && a.companyId === b.companyId && a.conversationId === b.conversationId && a.documentId === b.documentId; }
function sameScopeResolution(core: DocumentIdentityCore, resolution: AtomicSourceDocumentResolution) { return core.identityRecordId === resolution.identityRecordId && core.organizationId === resolution.organizationId && core.projectId === resolution.projectId && core.companyId === resolution.companyId && core.conversationId === resolution.conversationId && core.documentId === resolution.documentId; }
function sameArtifactScope(artifact: ArtifactResolution, core: DocumentIdentityCore) { return artifact.organizationId === core.organizationId && artifact.projectId === core.projectId && artifact.companyId === core.companyId && artifact.conversationId === core.conversationId && artifact.documentId === core.documentId && artifact.documentVersion === core.version && artifact.sourceBytesSha256 === core.sourceBytes.sha256 && artifact.identityFingerprint === core.identityFingerprint; }
function latest(record: GovernedDocumentVersionIdentity) { return record.lifecycleHistory.at(-1)!; }
function resolveVersion(reference: DocumentVersionReference, byVersion: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>) { const items = byVersion.get(versionKey(reference)) ?? []; return items.length === 1 ? items[0] ?? null : null; }
function versionKey(value: {organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string; version: number}) { return stableJson([value.organizationId, value.projectId, value.companyId, value.conversationId, value.documentId, value.version]); }
function documentKey(value: {organizationId: string; projectId: string; companyId: string | null; conversationId: string | null; documentId: string}) { return stableJson([value.organizationId, value.projectId, value.companyId, value.conversationId, value.documentId]); }
function toolKey(tool: DocumentToolIdentity) { return stableJson(tool); }
function diagnosticRef(value: string) { return `sha256:${fingerprint(value)}`; }
function sha256Bytes(value: Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function fingerprint(value: unknown) { return sha256Bytes(new TextEncoder().encode(stableJson(value))); }
function attestationTimeValid(signedAt: string, notBefore: string, trustedNow: string) {
  const signed = Date.parse(signedAt);
  const lowerBound = Date.parse(notBefore);
  const upperBound = Date.parse(trustedNow) + governedDocumentAttestationMaxFutureSkewMs;
  return Number.isFinite(signed) && Number.isFinite(lowerBound) && Number.isFinite(upperBound)
    && signed >= lowerBound && signed <= upperBound;
}

function timestampNotAfterTrustedNow(value: string, trustedNow: string) {
  const timestamp = Date.parse(value);
  const upperBound = Date.parse(trustedNow);
  return Number.isFinite(timestamp) && Number.isFinite(upperBound) && timestamp <= upperBound;
}

function orderedTimestamps(...values: string[]) {
  const timestamps = values.map((value) => Date.parse(value));
  return timestamps.every(Number.isFinite) && timestamps.every((value, index) => index === 0 || timestamps[index - 1]! <= value);
}

function latestTimestamp(...values: string[]) {
  return new Date(Math.max(...values.map((value) => Date.parse(value)))).toISOString();
}

function classificationAuthorizationTimeValid(authorizedAt: string, previousRecordedAt: string, recordedAt: string, trustedNow: string) {
  const authorized = Date.parse(authorizedAt);
  const lowerBound = Date.parse(previousRecordedAt);
  const lifecycleBound = Date.parse(recordedAt);
  const trustedBound = Date.parse(trustedNow) + governedDocumentAttestationMaxFutureSkewMs;
  return [authorized, lowerBound, lifecycleBound, trustedBound].every(Number.isFinite)
    && authorized >= lowerBound && authorized <= lifecycleBound && authorized <= trustedBound;
}

async function resolveClassificationPolicy(receipt: ClassificationTransitionReceipt, root: GovernedDocumentServerTrustRoot) {
  const raw = await root.resolveClassificationAuthorizationPolicy(receipt.authorizationPolicyVersion);
  const policy = raw ? classificationAuthorizationPolicySchema.safeParse(raw) : null;
  if (!policy?.success || policy.data.authorizationPolicyVersion !== receipt.authorizationPolicyVersion) throw new GovernedDocumentIdentityError("classification_receipt_invalid");
  return policy.data;
}

function classificationReceiptValidityValid(receipt: ClassificationTransitionReceipt, policy: ClassificationAuthorizationPolicy, trustedNow: string, requireCurrent: boolean) {
  const authorized = Date.parse(receipt.authorizedAt);
  const signed = Date.parse(receipt.attestation.signedAt);
  const expires = Date.parse(receipt.validThrough);
  const now = Date.parse(trustedNow);
  const finite = [authorized, signed, expires, now, policy.maxValidityMs].every(Number.isFinite);
  return finite && expires > authorized && expires - authorized <= policy.maxValidityMs && signed <= expires && (!requireCurrent || now <= expires);
}

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
