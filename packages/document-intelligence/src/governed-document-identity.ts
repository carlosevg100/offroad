import {createHash} from "node:crypto";

import {informationClassSchema} from "@offroad/credit-ontology";
import {taskDataClassSchema, taskSourceClassSchema} from "@offroad/work-plan";
import {z} from "zod";

import {layerKindSchema} from "./schemas";

export const governedDocumentIdentityVersion = "governed-document-identity.v1";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const scopedIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$/);
const opaqueReferenceSchema = z.string().trim().min(3).max(500);

export const documentActorReferenceSchema = z.object({
  kind: z.enum(["user", "service", "integration"]),
  /** Opaque identifier only. Names, e-mail addresses and other raw PII are not valid refs. */
  ref: z.string().regex(/^[a-z][a-z0-9_.-]{1,31}:[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/),
}).strict().superRefine((actor, context) => {
  if (!actor.ref.startsWith(`${actor.kind}:`)) {
    context.addIssue({code: "custom", path: ["ref"], message: "actor ref prefix must match actor kind"});
  }
  if (actor.kind === "user") {
    const opaqueUserId = actor.ref.slice("user:".length);
    if (!/^(?:[a-f0-9]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(opaqueUserId)) {
      context.addIssue({code: "custom", path: ["ref"], message: "user actor ref must contain an opaque UUID or SHA-256, never a name or e-mail"});
    }
  }
});
export type DocumentActorReference = z.infer<typeof documentActorReferenceSchema>;

export const documentToolIdentitySchema = z.object({
  toolId: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
  version: z.string().trim().min(1).max(120),
  configurationSha256: sha256Schema.nullable(),
}).strict();
export type DocumentToolIdentity = z.infer<typeof documentToolIdentitySchema>;

export const documentVersionReferenceSchema = z.object({
  organizationId: scopedIdSchema,
  projectId: scopedIdSchema,
  documentId: scopedIdSchema,
  version: z.number().int().positive(),
  sourceBytesSha256: sha256Schema,
}).strict();
export type DocumentVersionReference = z.infer<typeof documentVersionReferenceSchema>;

export const derivativeParentReferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("source_version"),
    version: documentVersionReferenceSchema,
  }).strict(),
  z.object({
    kind: z.literal("derivative"),
    derivativeId: scopedIdSchema,
    contentSha256: sha256Schema,
  }).strict(),
]);
export type DerivativeParentReference = z.infer<typeof derivativeParentReferenceSchema>;

export const documentCoverageReferenceSchema = z.object({
  kind: z.enum(["reading_manifest", "coverage_map", "requirement", "extraction_report"]),
  ref: opaqueReferenceSchema,
  fingerprint: sha256Schema,
}).strict();
export type DocumentCoverageReference = z.infer<typeof documentCoverageReferenceSchema>;

export const documentSourceOriginSchema = z.object({
  origin: z.enum([
    "user_upload",
    "public_filing",
    "issuer_publication",
    "licensed_source",
    "internal_project",
    "system_generated",
    "external_data_room",
  ]),
  sourceClass: taskSourceClassSchema,
  sourceRef: opaqueReferenceSchema,
  integration: z.object({
    status: z.enum(["native", "verified_connector", "unsupported"]),
    connectorId: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/).nullable(),
  }).strict(),
}).strict();
export type DocumentSourceOrigin = z.infer<typeof documentSourceOriginSchema>;

export const immutableSourceSnapshotSchema = z.object({
  state: z.enum(["immutable_bytes", "versioned_object", "mutable_reference"]),
  locatorRef: opaqueReferenceSchema,
  objectVersionRef: opaqueReferenceSchema.nullable(),
  capturedSha256: sha256Schema,
}).strict();
export type ImmutableSourceSnapshot = z.infer<typeof immutableSourceSnapshotSchema>;

const extractedLayerIdentitySchema = z.object({
  layerId: scopedIdSchema,
  layerKind: layerKindSchema,
  contentSha256: sha256Schema,
  sourceBytesSha256: sha256Schema,
  parser: documentToolIdentitySchema.nullable(),
  producedAt: z.iso.datetime({offset: true}),
  parentRefs: z.array(derivativeParentReferenceSchema).max(20),
  coverageRefs: z.array(documentCoverageReferenceSchema).max(100),
}).strict();
export type ExtractedLayerIdentity = z.infer<typeof extractedLayerIdentitySchema>;

const derivativeIdentitySchema = z.object({
  derivativeId: scopedIdSchema,
  kind: z.enum([
    "normalized_layer",
    "retrieval_chunk_set",
    "extraction_candidate_set",
    "profile",
    "evidence_fragment",
    "artifact",
    "other",
  ]),
  contentSha256: sha256Schema,
  producedBy: documentToolIdentitySchema,
  producedAt: z.iso.datetime({offset: true}),
  parentRefs: z.array(derivativeParentReferenceSchema).max(100),
  coverageRefs: z.array(documentCoverageReferenceSchema).max(100),
}).strict();
export type DerivativeIdentity = z.infer<typeof derivativeIdentitySchema>;

export const governedDocumentVersionIdentitySchema = z.object({
  schemaVersion: z.literal(governedDocumentIdentityVersion),
  organizationId: scopedIdSchema,
  projectId: scopedIdSchema,
  documentId: scopedIdSchema,
  version: z.number().int().positive(),
  parentVersion: documentVersionReferenceSchema.nullable(),
  source: documentSourceOriginSchema,
  dataClass: taskDataClassSchema,
  informationClass: informationClassSchema,
  confidentiality: z.enum(["public", "internal", "confidential", "restricted"]),
  actor: documentActorReferenceSchema,
  capturedAt: z.iso.datetime({offset: true}),
  asOf: z.iso.datetime({offset: true}),
  ingestedAt: z.iso.datetime({offset: true}),
  sourceBytes: z.object({
    sha256: sha256Schema,
    byteSize: z.number().int().nonnegative(),
  }).strict(),
  sourceSnapshot: immutableSourceSnapshotSchema,
  parserToolchain: z.array(documentToolIdentitySchema).max(30),
  extractedLayers: z.array(extractedLayerIdentitySchema).max(30),
  coverageRefs: z.array(documentCoverageReferenceSchema).max(500),
  derivatives: z.array(derivativeIdentitySchema).max(500),
  supersession: z.object({
    state: z.enum(["current", "superseded", "withdrawn", "rejected"]),
    supersededBy: documentVersionReferenceSchema.nullable(),
    reasonRef: opaqueReferenceSchema.nullable(),
  }).strict(),
  identityFingerprint: sha256Schema,
}).strict();
export type GovernedDocumentVersionIdentity = z.infer<typeof governedDocumentVersionIdentitySchema>;

export const documentIdentityIssueCodeSchema = z.enum([
  "identity_fingerprint_mismatch",
  "duplicate_version_identity",
  "version_hash_conflict",
  "hash_reused_across_versions",
  "parent_version_not_found",
  "parent_hash_mismatch",
  "parent_scope_mismatch",
  "parent_document_mismatch",
  "parent_version_not_prior",
  "version_lineage_cycle",
  "mutable_source_without_snapshot",
  "source_snapshot_hash_mismatch",
  "versioned_snapshot_identity_missing",
  "origin_source_class_mismatch",
  "source_integration_state_mismatch",
  "external_data_room_not_supported",
  "data_confidentiality_mismatch",
  "capture_after_ingestion",
  "as_of_after_capture",
  "duplicate_derivative_identity",
  "derivative_parent_missing",
  "derivative_parent_not_found",
  "derivative_parent_hash_mismatch",
  "derivative_lineage_cycle",
  "layer_source_hash_mismatch",
  "missing_parser_identity",
  "parser_identity_not_registered",
  "supersession_state_mismatch",
  "supersession_target_not_found",
  "supersession_scope_mismatch",
  "supersession_hash_mismatch",
  "supersession_target_not_newer",
  "supersession_chain_mismatch",
]);
export type DocumentIdentityIssueCode = z.infer<typeof documentIdentityIssueCodeSchema>;

export const documentIdentityIssueSchema = z.object({
  code: documentIdentityIssueCodeSchema,
  recordKey: z.string().min(1),
  path: z.string().min(1),
  relatedRef: z.string().min(1).nullable(),
}).strict();
export type DocumentIdentityIssue = z.infer<typeof documentIdentityIssueSchema>;

export const documentIdentityValidationReportSchema = z.object({
  schemaVersion: z.literal("governed-document-identity-validation.v1"),
  status: z.enum(["valid", "invalid"]),
  recordCount: z.number().int().nonnegative(),
  issues: z.array(documentIdentityIssueSchema),
  validatedRecordFingerprints: z.array(sha256Schema),
  graphFingerprint: sha256Schema,
}).strict();
export type DocumentIdentityValidationReport = z.infer<typeof documentIdentityValidationReportSchema>;

export type CompileGovernedDocumentIdentityInput = Omit<
  z.input<typeof governedDocumentVersionIdentitySchema>,
  "schemaVersion" | "sourceBytes" | "identityFingerprint"
> & {
  immutableSourceBytes: Uint8Array;
  claimedSourceBytesSha256?: string;
};

export class GovernedDocumentIdentityCompileError extends Error {
  constructor(readonly code: "source_bytes_hash_mismatch") {
    super(code);
    this.name = "GovernedDocumentIdentityCompileError";
  }
}

/**
 * Compiles a single immutable version identity. It computes the source digest from bytes instead
 * of trusting uploader metadata, then fingerprints a canonically ordered contract. Persistence,
 * tenant authorization and storage reads are deliberately outside this internal VLT-01 slice.
 */
export function compileGovernedDocumentIdentity(
  input: CompileGovernedDocumentIdentityInput,
): GovernedDocumentVersionIdentity {
  const sourceBytesSha256 = sha256Bytes(input.immutableSourceBytes);
  if (input.claimedSourceBytesSha256 && input.claimedSourceBytesSha256 !== sourceBytesSha256) {
    throw new GovernedDocumentIdentityCompileError("source_bytes_hash_mismatch");
  }

  const {immutableSourceBytes: _bytes, claimedSourceBytesSha256: _claim, ...metadata} = input;
  const body = canonicalizeIdentity({
    schemaVersion: governedDocumentIdentityVersion,
    ...metadata,
    sourceBytes: {sha256: sourceBytesSha256, byteSize: input.immutableSourceBytes.byteLength},
  });
  return governedDocumentVersionIdentitySchema.parse({
    ...body,
    identityFingerprint: fingerprint(body),
  });
}

/**
 * Validates a complete set of document versions and their derivative DAG. The result is
 * content-free: it carries issue codes and opaque refs, never document names, bytes or excerpts.
 */
export function validateGovernedDocumentIdentityGraph(
  rawRecords: readonly GovernedDocumentVersionIdentity[],
): DocumentIdentityValidationReport {
  const records = rawRecords.map((record) => governedDocumentVersionIdentitySchema.parse(record));
  const issues: DocumentIdentityIssue[] = [];
  const add = (
    code: DocumentIdentityIssueCode,
    record: GovernedDocumentVersionIdentity,
    path: string,
    relatedRef: string | null = null,
  ) => issues.push({code, recordKey: versionKey(record), path, relatedRef});

  const versionsByKey = new Map<string, GovernedDocumentVersionIdentity[]>();
  const versionsByDocument = new Map<string, GovernedDocumentVersionIdentity[]>();
  for (const record of records) {
    const key = versionKey(record);
    const documentKey = scopedDocumentKey(record);
    const sameVersion = versionsByKey.get(key) ?? [];
    sameVersion.push(record);
    versionsByKey.set(key, sameVersion);
    const sameDocument = versionsByDocument.get(documentKey) ?? [];
    sameDocument.push(record);
    versionsByDocument.set(documentKey, sameDocument);

    if (fingerprint(stripIdentityFingerprint(record)) !== record.identityFingerprint) {
      add("identity_fingerprint_mismatch", record, "identityFingerprint");
    }
    validateIntrinsicIdentity(record, add);
  }

  for (const [key, duplicates] of versionsByKey) {
    if (duplicates.length < 2) continue;
    const distinctHashes = new Set(duplicates.map((record) => record.sourceBytes.sha256));
    for (const record of duplicates) {
      add(distinctHashes.size > 1 ? "version_hash_conflict" : "duplicate_version_identity", record, "version", key);
    }
  }

  for (const versions of versionsByDocument.values()) {
    const byHash = new Map<string, GovernedDocumentVersionIdentity[]>();
    for (const version of versions) {
      const sameHash = byHash.get(version.sourceBytes.sha256) ?? [];
      sameHash.push(version);
      byHash.set(version.sourceBytes.sha256, sameHash);
    }
    for (const reused of byHash.values()) {
      if (new Set(reused.map((record) => record.version)).size < 2) continue;
      for (const record of reused) add("hash_reused_across_versions", record, "sourceBytes.sha256");
    }
  }

  for (const record of records) {
    validateVersionLinks(record, versionsByKey, add);
    validateDerivatives(record, add);
  }
  detectVersionCycles(records, versionsByKey, add);

  const orderedIssues = [...issues]
    .sort((left, right) => `${left.recordKey}:${left.code}:${left.path}:${left.relatedRef ?? ""}`
      .localeCompare(`${right.recordKey}:${right.code}:${right.path}:${right.relatedRef ?? ""}`));
  const validatedRecordFingerprints = records.map((record) => record.identityFingerprint).sort();
  const payload = {
    schemaVersion: "governed-document-identity-validation.v1" as const,
    status: orderedIssues.length === 0 ? "valid" as const : "invalid" as const,
    recordCount: records.length,
    issues: orderedIssues,
    validatedRecordFingerprints,
  };
  return documentIdentityValidationReportSchema.parse({
    ...payload,
    graphFingerprint: fingerprint(payload),
  });
}

export function assertGovernedDocumentIdentityGraph(
  records: readonly GovernedDocumentVersionIdentity[],
): DocumentIdentityValidationReport {
  const report = validateGovernedDocumentIdentityGraph(records);
  if (report.status === "invalid") {
    throw new Error(`governed_document_identity_invalid:${report.issues.map((issue) => issue.code).join(",")}`);
  }
  return report;
}

function validateIntrinsicIdentity(
  record: GovernedDocumentVersionIdentity,
  add: (code: DocumentIdentityIssueCode, record: GovernedDocumentVersionIdentity, path: string, related?: string | null) => void,
): void {
  if (record.sourceSnapshot.state === "mutable_reference") add("mutable_source_without_snapshot", record, "sourceSnapshot.state");
  if (record.sourceSnapshot.capturedSha256 !== record.sourceBytes.sha256) add("source_snapshot_hash_mismatch", record, "sourceSnapshot.capturedSha256");
  if (record.sourceSnapshot.state === "versioned_object" && record.sourceSnapshot.objectVersionRef === null) {
    add("versioned_snapshot_identity_missing", record, "sourceSnapshot.objectVersionRef");
  }
  if (record.source.origin === "external_data_room"
    && (record.source.integration.status !== "unsupported" || record.source.integration.connectorId !== null)) {
    add("external_data_room_not_supported", record, "source.integration");
  }
  if ((record.source.integration.status === "native" || record.source.integration.status === "unsupported")
    && record.source.integration.connectorId !== null) {
    add("source_integration_state_mismatch", record, "source.integration.connectorId");
  }
  if (record.source.integration.status === "verified_connector" && record.source.integration.connectorId === null) {
    add("source_integration_state_mismatch", record, "source.integration.connectorId");
  }
  const allowedSourceClasses: Record<GovernedDocumentVersionIdentity["source"]["origin"], readonly GovernedDocumentVersionIdentity["source"]["sourceClass"][]> = {
    user_upload: ["provided_documents"],
    public_filing: ["public_company", "public_market"],
    issuer_publication: ["public_company"],
    licensed_source: ["public_company", "public_market", "capital_network"],
    internal_project: ["project_context"],
    system_generated: ["project_context", "house_method"],
    external_data_room: ["provided_documents"],
  };
  if (!allowedSourceClasses[record.source.origin].includes(record.source.sourceClass)) {
    add("origin_source_class_mismatch", record, "source.sourceClass");
  }
  const confidentialityMatches = record.dataClass === "public"
    ? record.confidentiality === "public"
    : record.dataClass === "restricted_personal"
      ? record.confidentiality === "restricted"
      : record.confidentiality !== "public";
  if (!confidentialityMatches) add("data_confidentiality_mismatch", record, "confidentiality");
  if (Date.parse(record.capturedAt) > Date.parse(record.ingestedAt)) add("capture_after_ingestion", record, "capturedAt");
  if (Date.parse(record.asOf) > Date.parse(record.capturedAt)) add("as_of_after_capture", record, "asOf");
  const registeredTools = new Set(record.parserToolchain.map(toolKey));
  for (const layer of record.extractedLayers) {
    if (layer.sourceBytesSha256 !== record.sourceBytes.sha256) add("layer_source_hash_mismatch", record, `extractedLayers.${layer.layerId}.sourceBytesSha256`);
    if (layer.parser === null) add("missing_parser_identity", record, `extractedLayers.${layer.layerId}.parser`);
    else if (!registeredTools.has(toolKey(layer.parser))) add("parser_identity_not_registered", record, `extractedLayers.${layer.layerId}.parser`);
  }
  if (record.supersession.state === "superseded" && record.supersession.supersededBy === null) {
    add("supersession_state_mismatch", record, "supersession.supersededBy");
  }
  if (record.supersession.state !== "superseded" && record.supersession.supersededBy !== null) {
    add("supersession_state_mismatch", record, "supersession.state");
  }
}

function validateVersionLinks(
  record: GovernedDocumentVersionIdentity,
  versionsByKey: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>,
  add: (code: DocumentIdentityIssueCode, record: GovernedDocumentVersionIdentity, path: string, related?: string | null) => void,
): void {
  if (record.parentVersion) {
    const parent = resolveVersion(record.parentVersion, versionsByKey);
    const related = versionReferenceKey(record.parentVersion);
    if (!sameScope(record, record.parentVersion)) add("parent_scope_mismatch", record, "parentVersion", related);
    if (record.documentId !== record.parentVersion.documentId) add("parent_document_mismatch", record, "parentVersion.documentId", related);
    if (record.parentVersion.version >= record.version) add("parent_version_not_prior", record, "parentVersion.version", related);
    if (!parent) add("parent_version_not_found", record, "parentVersion", related);
    else if (parent.sourceBytes.sha256 !== record.parentVersion.sourceBytesSha256) add("parent_hash_mismatch", record, "parentVersion.sourceBytesSha256", related);
  } else if (record.version > 1) {
    add("parent_version_not_found", record, "parentVersion");
  }

  const targetRef = record.supersession.supersededBy;
  if (!targetRef) return;
  const related = versionReferenceKey(targetRef);
  if (!sameScope(record, targetRef) || record.documentId !== targetRef.documentId) add("supersession_scope_mismatch", record, "supersession.supersededBy", related);
  const target = resolveVersion(targetRef, versionsByKey);
  if (!target) add("supersession_target_not_found", record, "supersession.supersededBy", related);
  else {
    if (target.sourceBytes.sha256 !== targetRef.sourceBytesSha256) add("supersession_hash_mismatch", record, "supersession.supersededBy.sourceBytesSha256", related);
    if (target.version <= record.version) add("supersession_target_not_newer", record, "supersession.supersededBy.version", related);
    const targetParent = target.parentVersion;
    if (!targetParent || versionReferenceKey(targetParent) !== versionKey(record) || targetParent.sourceBytesSha256 !== record.sourceBytes.sha256) {
      add("supersession_chain_mismatch", record, "supersession.supersededBy", related);
    }
  }
}

function validateDerivatives(
  record: GovernedDocumentVersionIdentity,
  add: (code: DocumentIdentityIssueCode, record: GovernedDocumentVersionIdentity, path: string, related?: string | null) => void,
): void {
  type Node = {id: string; hash: string; parents: DerivativeParentReference[]};
  const nodes: Node[] = [
    ...record.extractedLayers.map((layer) => ({id: layer.layerId, hash: layer.contentSha256, parents: layer.parentRefs})),
    ...record.derivatives.map((derivative) => ({id: derivative.derivativeId, hash: derivative.contentSha256, parents: derivative.parentRefs})),
  ];
  const byId = new Map<string, Node[]>();
  for (const node of nodes) {
    const same = byId.get(node.id) ?? [];
    same.push(node);
    byId.set(node.id, same);
    if (node.parents.length === 0) add("derivative_parent_missing", record, `derivatives.${node.id}.parentRefs`);
  }
  for (const [id, duplicates] of byId) {
    if (duplicates.length > 1) add("duplicate_derivative_identity", record, `derivatives.${id}`);
  }
  for (const node of nodes) {
    for (const parent of node.parents) {
      if (parent.kind === "source_version") {
        if (!sameScope(record, parent.version) || parent.version.documentId !== record.documentId || parent.version.version !== record.version) {
          add("derivative_parent_not_found", record, `derivatives.${node.id}.parentRefs`, versionReferenceKey(parent.version));
        } else if (parent.version.sourceBytesSha256 !== record.sourceBytes.sha256) {
          add("derivative_parent_hash_mismatch", record, `derivatives.${node.id}.parentRefs`, versionReferenceKey(parent.version));
        }
      } else {
        const candidates = byId.get(parent.derivativeId) ?? [];
        if (candidates.length === 0) add("derivative_parent_not_found", record, `derivatives.${node.id}.parentRefs`, parent.derivativeId);
        else if (!candidates.some((candidate) => candidate.hash === parent.contentSha256)) {
          add("derivative_parent_hash_mismatch", record, `derivatives.${node.id}.parentRefs`, parent.derivativeId);
        }
      }
    }
  }
  detectDerivativeCycles(record, nodes, byId, add);
}

function detectVersionCycles(
  records: readonly GovernedDocumentVersionIdentity[],
  versionsByKey: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>,
  add: (code: DocumentIdentityIssueCode, record: GovernedDocumentVersionIdentity, path: string, related?: string | null) => void,
): void {
  const state = new Map<string, "visiting" | "visited">();
  const cycleMembers = new Set<string>();
  const visit = (record: GovernedDocumentVersionIdentity, trail: string[]) => {
    const key = versionKey(record);
    if (state.get(key) === "visiting") {
      const start = trail.indexOf(key);
      for (const member of trail.slice(Math.max(0, start))) cycleMembers.add(member);
      cycleMembers.add(key);
      return;
    }
    if (state.get(key) === "visited") return;
    state.set(key, "visiting");
    if (record.parentVersion) {
      const parent = resolveVersion(record.parentVersion, versionsByKey);
      if (parent) visit(parent, [...trail, key]);
    }
    state.set(key, "visited");
  };
  for (const record of records) visit(record, []);
  for (const record of records) if (cycleMembers.has(versionKey(record))) add("version_lineage_cycle", record, "parentVersion");
}

function detectDerivativeCycles(
  record: GovernedDocumentVersionIdentity,
  nodes: readonly {id: string; parents: DerivativeParentReference[]}[],
  byId: ReadonlyMap<string, readonly {id: string; parents: DerivativeParentReference[]}[]>,
  add: (code: DocumentIdentityIssueCode, record: GovernedDocumentVersionIdentity, path: string, related?: string | null) => void,
): void {
  const state = new Map<string, "visiting" | "visited">();
  const cycleMembers = new Set<string>();
  const visit = (node: {id: string; parents: DerivativeParentReference[]}, trail: string[]) => {
    if (state.get(node.id) === "visiting") {
      const start = trail.indexOf(node.id);
      for (const member of trail.slice(Math.max(0, start))) cycleMembers.add(member);
      cycleMembers.add(node.id);
      return;
    }
    if (state.get(node.id) === "visited") return;
    state.set(node.id, "visiting");
    for (const parent of node.parents) {
      if (parent.kind !== "derivative") continue;
      const target = byId.get(parent.derivativeId)?.[0];
      if (target) visit(target, [...trail, node.id]);
    }
    state.set(node.id, "visited");
  };
  for (const node of nodes) visit(node, []);
  for (const id of cycleMembers) add("derivative_lineage_cycle", record, `derivatives.${id}.parentRefs`);
}

function canonicalizeIdentity<T extends Omit<GovernedDocumentVersionIdentity, "identityFingerprint"> | Record<string, unknown>>(input: T): T {
  const record = input as Record<string, unknown>;
  const sort = <U>(values: readonly U[]): U[] => [...values].sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  return {
    ...record,
    parserToolchain: sort((record.parserToolchain as readonly unknown[] | undefined) ?? []),
    coverageRefs: sort((record.coverageRefs as readonly unknown[] | undefined) ?? []),
    extractedLayers: sort(((record.extractedLayers as readonly Record<string, unknown>[] | undefined) ?? []).map((layer) => ({
      ...layer,
      parentRefs: sort((layer.parentRefs as readonly unknown[] | undefined) ?? []),
      coverageRefs: sort((layer.coverageRefs as readonly unknown[] | undefined) ?? []),
    }))),
    derivatives: sort(((record.derivatives as readonly Record<string, unknown>[] | undefined) ?? []).map((derivative) => ({
      ...derivative,
      parentRefs: sort((derivative.parentRefs as readonly unknown[] | undefined) ?? []),
      coverageRefs: sort((derivative.coverageRefs as readonly unknown[] | undefined) ?? []),
    }))),
  } as T;
}

function stripIdentityFingerprint(record: GovernedDocumentVersionIdentity): Omit<GovernedDocumentVersionIdentity, "identityFingerprint"> {
  const {identityFingerprint: _fingerprint, ...body} = record;
  return canonicalizeIdentity(body);
}

function versionKey(record: Pick<GovernedDocumentVersionIdentity, "organizationId" | "projectId" | "documentId" | "version">): string {
  return `${record.organizationId}/${record.projectId}/${record.documentId}@${record.version}`;
}

function scopedDocumentKey(record: Pick<GovernedDocumentVersionIdentity, "organizationId" | "projectId" | "documentId">): string {
  return `${record.organizationId}/${record.projectId}/${record.documentId}`;
}

function versionReferenceKey(reference: DocumentVersionReference): string {
  return versionKey(reference);
}

function resolveVersion(
  reference: DocumentVersionReference,
  versionsByKey: ReadonlyMap<string, GovernedDocumentVersionIdentity[]>,
): GovernedDocumentVersionIdentity | null {
  const candidates = versionsByKey.get(versionReferenceKey(reference)) ?? [];
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function sameScope(record: GovernedDocumentVersionIdentity, reference: DocumentVersionReference): boolean {
  return record.organizationId === reference.organizationId && record.projectId === reference.projectId;
}

function toolKey(tool: DocumentToolIdentity): string {
  return `${tool.toolId}@${tool.version}:${tool.configurationSha256 ?? "none"}`;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
