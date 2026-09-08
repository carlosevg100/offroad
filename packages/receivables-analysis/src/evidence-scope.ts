import {z} from "zod";

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const receivablesEvidenceSourceRevisionSchema = z.object({
  sourceDocumentId: z.uuid(),
  documentVersion: z.number().int().positive(),
  contentKind: z.enum(["document_layer", "nfe_archive"]),
  sourceSha256: fingerprint,
  contentSha256: fingerprint,
  schemaVersion: z.literal("2026.08.28-v1"),
  fileName: z.string().min(1).nullable(),
}).strict();
export type ReceivablesEvidenceSourceRevision = z.infer<typeof receivablesEvidenceSourceRevisionSchema>;

export const receivablesEvidenceSourceManifestSchema = z.object({
  schemaVersion: z.literal("receivables-evidence-manifest.v1"),
  fingerprint,
  sources: z.array(receivablesEvidenceSourceRevisionSchema),
}).strict().superRefine((manifest, context) => {
  const ids = manifest.sources.map((source) => source.sourceDocumentId.toLowerCase());
  if (new Set(ids).size !== ids.length) context.addIssue({code: "custom", message: "source documents must be unique"});
});
export type ReceivablesEvidenceSourceManifest = z.infer<typeof receivablesEvidenceSourceManifestSchema>;

export const receivablesPrimaryTapeSchema = z.object({
  documentId: z.uuid(),
  sheet: z.string().min(1),
  headerRow: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
export const receivablesTapeCandidateSchema = receivablesPrimaryTapeSchema.extend({fileName: z.string().min(1)});

/** Confirmation records scope and source revisions, never a second ledger of financial facts. */
export const receivablesEvidenceScopeSchema = z.object({
  schemaVersion: z.literal("receivables-evidence-scope.v1"),
  id: z.uuid(),
  fingerprint,
  sourceManifestFingerprint: fingerprint,
  primaryTape: receivablesPrimaryTapeSchema,
  complementDocumentIds: z.array(z.uuid()),
  reportingDate: z.iso.date(),
  sourceRevisions: z.array(receivablesEvidenceSourceRevisionSchema).min(1),
  confirmedBy: z.uuid(),
  confirmedAt: z.iso.datetime({offset: true}),
}).strict().superRefine((scope, context) => {
  const selectedIds = [scope.primaryTape.documentId, ...scope.complementDocumentIds].map((id) => id.toLowerCase());
  const revisionIds = scope.sourceRevisions.map((source) => source.sourceDocumentId.toLowerCase());
  if (new Set(selectedIds).size !== selectedIds.length) context.addIssue({code: "custom", message: "selected sources must be unique"});
  if (new Set(revisionIds).size !== revisionIds.length || revisionIds.length !== selectedIds.length
    || selectedIds.some((id) => !revisionIds.includes(id))) {
    context.addIssue({code: "custom", message: "selected sources must match the revision snapshot exactly"});
  }
  if (scope.sourceRevisions.find((source) => source.sourceDocumentId === scope.primaryTape.documentId)?.contentKind !== "document_layer") {
    context.addIssue({code: "custom", message: "primary tape must be a parsed document"});
  }
});
export type ReceivablesEvidenceScope = z.infer<typeof receivablesEvidenceScopeSchema>;

export const receivablesEvidenceScopeContextSchema = z.object({
  state: z.enum(["unavailable", "unconfirmed", "current", "stale"]),
  sourceManifest: receivablesEvidenceSourceManifestSchema.nullable(),
  candidates: z.array(receivablesTapeCandidateSchema),
  scope: receivablesEvidenceScopeSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.state !== "current") return;
  const {scope, sourceManifest} = value;
  if (!scope || !sourceManifest || scope.sourceManifestFingerprint !== sourceManifest.fingerprint) {
    context.addIssue({code: "custom", message: "current scope requires its matching source manifest"});
    return;
  }
  if (!value.candidates.some((candidate) => candidate.documentId === scope.primaryTape.documentId
    && candidate.sheet === scope.primaryTape.sheet && candidate.headerRow === scope.primaryTape.headerRow)) {
    context.addIssue({code: "custom", message: "current scope requires its discovered primary table"});
  }
  for (const revision of scope.sourceRevisions) {
    const source = sourceManifest.sources.find((entry) => entry.sourceDocumentId === revision.sourceDocumentId);
    if (!source || source.documentVersion !== revision.documentVersion || source.sourceSha256 !== revision.sourceSha256
      || source.contentSha256 !== revision.contentSha256 || source.contentKind !== revision.contentKind
      || source.schemaVersion !== revision.schemaVersion) {
      context.addIssue({code: "custom", message: "current scope contains a stale source revision"});
    }
  }
  if (value.candidates.some((candidate) => scope.complementDocumentIds.includes(candidate.documentId))) {
    context.addIssue({code: "custom", message: "another title tape cannot be supporting evidence for this pool"});
  }
});
export type ReceivablesEvidenceScopeContext = z.infer<typeof receivablesEvidenceScopeContextSchema>;
