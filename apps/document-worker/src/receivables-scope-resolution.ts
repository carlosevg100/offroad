import {createHash} from "node:crypto";
import {
  identifyReceivablesTapes,
  receivablesEvidenceScopeContextSchema,
  type ReceivablesEvidenceDocument,
  type ReceivablesEvidenceScope,
  type ReceivablesEvidenceSourceManifest,
  type ReceivablesFiscalArchiveEvidence,
} from "@offroad/receivables-analysis";
import {decodeBoundReceivablesEvidence, fingerprintReceivablesEvidence, type ReceivablesEvidenceEnvelope} from "./receivables-evidence";

export function discoverReceivablesEvidence(envelopes: readonly ReceivablesEvidenceEnvelope[], sourceNames: ReadonlyMap<string, string> = new Map()) {
  const documents: ReceivablesEvidenceDocument[] = [];
  const fiscalArchives: ReceivablesFiscalArchiveEvidence[] = [];
  const sourceManifest: ReceivablesEvidenceSourceManifest = {
    schemaVersion: "receivables-evidence-manifest.v1",
    fingerprint: fingerprintReceivablesEvidence(envelopes),
    sources: envelopes.map((envelope) => {
      const decoded = decodeBoundReceivablesEvidence(envelope);
      if (decoded.kind === "document_layer") documents.push(decoded.evidence);
      else fiscalArchives.push(decoded.evidence);
      return {
        sourceDocumentId: envelope.source_document_id,
        documentVersion: envelope.document_version,
        contentKind: envelope.content_kind,
        sourceSha256: envelope.source_sha256,
        contentSha256: envelope.content_sha256,
        schemaVersion: envelope.schema_version,
        fileName: decoded.kind === "document_layer" ? decoded.evidence.fileName : sourceNames.get(envelope.source_document_id) ?? null,
      };
    }).sort((a, b) => a.sourceDocumentId < b.sourceDocumentId ? -1 : a.sourceDocumentId > b.sourceDocumentId ? 1 : 0),
  };
  const candidates = identifyReceivablesTapes(documents);
  const supportSheetCandidates = documents.flatMap((document) => {
    const sheets = document.layer.sheets ?? [];
    return sheets.filter((sheet) => sheets.filter((other) => other.name === sheet.name).length === 1
      && !candidates.some((candidate) => candidate.documentId === document.id && candidate.sheet === sheet.name))
      .map((sheet) => ({documentId: document.id, sheet: sheet.name}));
  }).sort((a, b) => a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : a.sheet < b.sheet ? -1 : a.sheet > b.sheet ? 1 : 0);
  return {documents, fiscalArchives, sourceManifest, candidates, supportSheetCandidates};
}

export type ReceivablesScopeIssueCode = "multiple_receivables_tapes" | "scope_confirmation_required" | "scope_stale" | "reporting_date_conflict";

type ScopeResolution = {
  state: "pending";
  code: ReceivablesScopeIssueCode;
} | {
  state: "current";
  scope: ReceivablesEvidenceScope;
  datasetHash: string;
  documents: ReceivablesEvidenceDocument[];
  fiscalArchives: ReceivablesFiscalArchiveEvidence[];
};

/** Recheck the frozen confirmation against the actual decoded evidence. Selection is an
 * explicit projection: neither another pool nor another tab is admitted as a fallback. */
export function resolveConfirmedReceivablesScope(
  discovery: ReturnType<typeof discoverReceivablesEvidence>,
  input: unknown,
): ScopeResolution {
  if (!input) return {state: "pending", code: discovery.candidates.length > 1 ? "multiple_receivables_tapes" : "scope_confirmation_required"};
  const parsed = receivablesEvidenceScopeContextSchema.safeParse(input);
  if (!parsed.success) return {state: "pending", code: "scope_stale"};
  if (parsed.data.state !== "current" || !parsed.data.scope) return {
    state: "pending",
    code: parsed.data.state === "stale" ? "scope_stale"
      : discovery.candidates.length > 1 ? "multiple_receivables_tapes" : "scope_confirmation_required",
  };
  const scope = parsed.data.scope;
  // Use fresh discovery, not the candidate list supplied beside the confirmation.
  const checked = receivablesEvidenceScopeContextSchema.safeParse({
    state: "current", sourceManifest: discovery.sourceManifest, candidates: discovery.candidates, supportSheetCandidates: discovery.supportSheetCandidates, scope,
  });
  if (!checked.success) return {state: "pending", code: "scope_stale"};
  const primary = discovery.documents.find((document) => document.id === scope.primaryTape.documentId);
  const sheet = primary?.layer.sheets?.find((entry) => entry.name === scope.primaryTape.sheet);
  if (!primary || !sheet) return {state: "pending", code: "scope_stale"};
  const nextHeader = discovery.candidates.filter((candidate) => candidate.documentId === primary.id
    && candidate.sheet === sheet.name && candidate.headerRow > scope.primaryTape.headerRow)
    .reduce((next, candidate) => Math.min(next, candidate.headerRow), Number.POSITIVE_INFINITY);
  const cells = sheet.cells.filter((cell) => {
    const match = /^[A-Z]+([0-9]+)$/.exec(cell.ref);
    const row = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(row) && row >= scope.primaryTape.headerRow && row < nextHeader;
  });
  const selected = new Set(scope.complementDocumentIds);
  const documents: ReceivablesEvidenceDocument[] = [{
    ...primary,
    // Original row addresses and file hash remain unchanged for source tracing.
    layer: {documentId: primary.id, sheets: [{name: sheet.name, cells}, ...(scope.primarySupportSheets ?? []).map((name) => primary.layer.sheets!.find((support) => support.name === name)!)]},
  }, ...discovery.documents.filter((document) => selected.has(document.id)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)];
  const fiscalArchives = discovery.fiscalArchives.filter((archive) => selected.has(archive.archiveId)).sort((a, b) => a.archiveId < b.archiveId ? -1 : a.archiveId > b.archiveId ? 1 : 0);
  const datasetHash = createHash("sha256").update(JSON.stringify({
    schemaVersion: "receivables-analysis-scope.v1",
    scopeFingerprint: scope.fingerprint,
    sourceManifestFingerprint: scope.sourceManifestFingerprint,
    reportingDate: scope.reportingDate,
    primaryTape: scope.primaryTape,
    ...(scope.schemaVersion === "receivables-evidence-scope.v2" ? {primarySupportSheets: scope.primarySupportSheets} : {}),
    sourceRevisions: [...scope.sourceRevisions].sort((a, b) => a.sourceDocumentId < b.sourceDocumentId ? -1 : a.sourceDocumentId > b.sourceDocumentId ? 1 : 0),
  })).digest("hex");
  return {state: "current", scope, datasetHash, documents, fiscalArchives};
}
