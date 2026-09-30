import type {Material, MaterialBlock} from "@offroad/case-materials";

import {
  artifactDownloadCopy,
  artifactNotFound,
  artifactUnavailable,
  legacyRowId,
  refusalText,
  renderedRevisionStillAuthorized,
  requestedRevision,
  resolvePreferredRouteRevision,
  revisionRendererAllowed,
  type RouteRevisionTarget,
} from "@/lib/artifacts/artifact-route";
import {
  artifactResponseHeaders,
  readGovernedObject,
  resolveRenderer,
  revisionIssuedOn,
  storedRevisionObject,
  verifyRenderedBytes,
  type BytesVerification,
  type GovernedObject,
} from "@/lib/artifacts/authorized-artifact-reader";
import {renderArtifactRevision} from "@/lib/artifacts/render-artifact-revision";
import {resourceStillReadable} from "@/lib/auth/resource-download";
import {requireWorkspace} from "@/lib/auth/workspace";
import {integrationPreviewCoversProject, loadIntegrationPreviewStatus} from "@/lib/integration-preview";
import {decisionContractBoundSha256, resolveGovernedMaterialDownload} from "@/lib/integration-preview/governed-material-download";

/**
 * Authenticated retrieval for governed presentation/workbook bytes plus the basic internal Word
 * preview. Office decision surfaces are never regenerated here: their fingerprinted manifest, private
 * object, exact SHA and binding in the latest Decision Artifact must all agree. Internal
 * validation only; the project must run in integration_preview and every read remains scoped.
 *
 * Each file is one exact artifact revision (`?revision=`, or the head), read through the authorized
 * reader with the same release evaluation as every download: a version for an external audience is
 * never served before it is released. The presentation and the spreadsheet are, first, the revision
 * the worker writes with the stored object pinned (kind `presentation` or `workbook`, subject
 * `integration-preview:<surface>`); a preview older than those revisions has only the projection of
 * its receipt row, served as before and unpinned. A stored file is served only while the latest
 * decision contract binds its exact bytes to its surface, as the receipt had to be. The Word preview
 * is issued on the date of its version and composed of the tables that existed when that version was
 * created. Stored bytes are read at the address of their upload grant, and a missing object or other
 * bytes are refused with a reason, never served and never answered as a server failure.
 */
type Params = {params: Promise<{locale: string; projectId: string}>};

type ArtifactRow = {id: string; artifact_type: string; artifact_version: number; status: string; artifact_fingerprint: string; content: unknown; created_at: string};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRecord(value) && typeof value.value === "string") return value.value;
  if (isRecord(value) && typeof value.document === "string") return `${value.document}${value.page ? ` p. ${String(value.page)}` : ""}`;
  if (Array.isArray(value)) return `[${value.length}]`;
  return "";
};

function tableRows(output: Record<string, unknown>, key: string): {head: string[]; rows: string[][]} | null {
  const value = output[key];
  if (!Array.isArray(value) || value.length === 0 || !isRecord(value[0])) return null;
  const head = Object.keys(value[0] as Record<string, unknown>).filter((column) => {
    const sample = (value[0] as Record<string, unknown>)[column];
    return typeof sample !== "object" || sample === null || (isRecord(sample) && (typeof sample.value === "string" || typeof sample.document === "string"));
  }).slice(0, 10);
  return {head, rows: value.slice(0, 60).map((row) => head.map((column) => formatCell((row as Record<string, unknown>)[column])))};
}

const tableKeys: Record<string, {key: string; caption: {pt: string; en: string}}[]> = {
  preview_debt_ledger: [{key: "ledger_rows", caption: {pt: "Dívida instrumento a instrumento", en: "Debt instrument by instrument"}}],
  preview_maturity_wall: [{key: "walls", caption: {pt: "Vencimentos", en: "Maturities"}}],
  preview_interest_schedule: [{key: "schedule_by_series", caption: {pt: "Juros e correção por série", en: "Interest and indexation by series"}}],
  preview_exit_costs: [{key: "exit_costs", caption: {pt: "Custo de saída por série", en: "Exit cost by series"}}],
  preview_alternatives: [{key: "alternatives", caption: {pt: "Alternativas antes e depois", en: "Alternatives before and after"}}],
  preview_covenants: [{key: "covenants", caption: {pt: "Covenants", en: "Covenants"}}],
};

const artifactTypeFor = {docx: "preview_material", pptx: "preview_presentation_material", xlsx: "preview_workbook_material"} as const;
const surfaceFor = {pptx: "presentation", xlsx: "workbook"} as const;

export async function GET(request: Request, {params}: Params) {
  const {locale, projectId} = await params;
  const lang = locale === "en-US" ? "en" : "pt";
  const requestedFormat = new URL(request.url).searchParams.get("format");
  const format = requestedFormat === "xlsx" || requestedFormat === "pptx" ? requestedFormat : "docx";
  const revisionParameter = requestedRevision(request);
  if (!revisionParameter.ok) return artifactNotFound();
  const {supabase, organization} = await requireWorkspace(locale);
  if (!await resourceStillReadable(supabase,organization.id,projectId,"project")) return artifactNotFound();
  const status = await loadIntegrationPreviewStatus(supabase, organization.id);
  if (!integrationPreviewCoversProject(status, projectId)) return new Response("Not found", {status: 404});
  const copy = artifactDownloadCopy(lang);
  const notReady = format === "pptx" ? copy.preview.presentationNotReady : format === "xlsx" ? copy.preview.workbookNotReady : copy.preview.synthesisMissing;

  const artifactType = artifactTypeFor[format];
  // A file resolves first the revision that pins its stored object; a preview without one keeps the
  // projection of its receipt row. A revision of another work, kind or subject is not this file's.
  const receiptTarget: RouteRevisionTarget = {workId: projectId, kind: "work_product", subject: artifactType};
  const targets: RouteRevisionTarget[] = format === "docx" ? [receiptTarget]
    : [{workId: projectId, kind: surfaceFor[format], subject: `integration-preview:${surfaceFor[format]}`}, receiptTarget];
  const resolved = await resolvePreferredRouteRevision(supabase, targets, revisionParameter.revisionId);
  if (!resolved.ok) {
    if (resolved.outcome === "not_found") return artifactNotFound();
    return artifactUnavailable(resolved.outcome === "refused" ? refusalText(copy, resolved.refusal) : notReady);
  }
  const {revision, read} = resolved;
  if (!revisionRendererAllowed(revision, {storage: format !== "docx", families: []})) return artifactUnavailable(copy.rendererUnavailable);

  // Every preview row of the project, superseded ones included: the Word preview is composed as of its version.
  const {data} = await supabase.from("capital_project_artifacts")
    .select("id, artifact_type, artifact_version, status, artifact_fingerprint, content, created_at")
    .eq("organization_id", organization.id).eq("capital_project_id", projectId)
    .like("artifact_type", "preview\\_%")
    .order("created_at", {ascending: false});
  const history = (data ?? []) as ArtifactRow[];
  const latestByType = new Map<string, ArtifactRow>();
  for (const artifact of history) if (artifact.status !== "superseded" && !latestByType.has(artifact.artifact_type)) latestByType.set(artifact.artifact_type, artifact);
  const current = latestByType.get(artifactType);
  const rowId = legacyRowId(revision, "capital_project_artifacts");
  const renderer = resolveRenderer(revision);
  const stored = renderer.ok && renderer.source === "storage" ? storedRevisionObject(revision, {organizationId: organization.id, workId: projectId}) : null;
  if (stored && stored.format !== format) return artifactUnavailable(copy.rendererUnavailable);
  // A legacy revision is served only while its row is the one this preview serves; a stored revision
  // carries its own object; anything else has no content this route can produce.
  if (!stored) {
    if (rowId === null) return artifactUnavailable(copy.rendererUnavailable);
    if (!current) return artifactUnavailable(notReady);
    if (rowId !== current.id) return artifactUnavailable(copy.revisionReplaced);
  }

  if (format === "pptx" || format === "xlsx") {
    let object: GovernedObject;
    let legacyHeaders: Record<string, string> = {};
    let mimeType: string;
    let fileName: string;
    let manifest: ReturnType<typeof resolveGovernedMaterialDownload> | null = null;
    if (stored) {
      // A stored file is current only while the latest decision contract binds exactly its bytes: after a
      // newer contract recorded without files the head is not ready, and an older revision was replaced.
      if (decisionContractBoundSha256(latestByType.get("preview_decision_contract")?.content, format) !== stored.sha256) {
        return artifactUnavailable(read.isHead ? notReady : copy.revisionReplaced);
      }
      object = stored;
      mimeType = format === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      fileName = `material-preview-${projectId.slice(0, 8)}-r${revision.revisionNo}.${format}`;
    } else {
      try {
        manifest = resolveGovernedMaterialDownload({
          materialContent: current!.content,
          decisionContractContent: latestByType.get("preview_decision_contract")?.content,
          format,
          organizationId: organization.id,
          projectId,
        });
      } catch {
        return artifactUnavailable(notReady);
      }
      object = {organizationId: organization.id, workId: projectId, bucket: manifest.storage.bucket, path: manifest.storage.objectPath,
        sha256: manifest.contentSha256, byteLength: manifest.byteLength, format: manifest.format};
      mimeType = manifest.mimeType;
      fileName = manifest.fileName;
      legacyHeaders = {"x-material-sha256": manifest.contentSha256, "x-material-manifest-fingerprint": manifest.manifestFingerprint, "x-material-release-state": manifest.release.state};
    }
    const storedObject = await readGovernedObject(supabase, object);
    if (!storedObject.ok) {
      if (storedObject.error === "artifact_object_unavailable") return artifactUnavailable(copy.preview.storageUnavailable, 502);
      return artifactUnavailable(storedObject.error === "artifact_object_missing" ? copy.preview.storageMissing : copy.preview.storageMismatch);
    }
    const bytes = storedObject.bytes;
    const verification: BytesVerification = verifyRenderedBytes(revision, bytes, {format});
    if (verification.status === "mismatch") return artifactUnavailable(copy.preview.storageMismatch);
    if (!await resourceStillReadable(supabase,organization.id,projectId,"project")) return artifactNotFound();
    // Storage may take long enough for the decision contract or its receipt to change. Re-read
    // both under the caller's scope; the earlier snapshot cannot authorize delivery of these bytes.
    let bindingCurrent = false;
    try {
      const {data: currentData, error} = await supabase.from("capital_project_artifacts")
        .select("id, artifact_type, artifact_version, status, artifact_fingerprint, content, created_at")
        .eq("organization_id", organization.id).eq("capital_project_id", projectId)
        .in("artifact_type", [artifactType, "preview_decision_contract"])
        .neq("status", "superseded")
        .order("created_at", {ascending: false});
      if (!error && currentData) {
        const currentRows = currentData as ArtifactRow[];
        const currentContract = currentRows.find((entry) => entry.artifact_type === "preview_decision_contract");
        if (stored) {
          bindingCurrent = decisionContractBoundSha256(currentContract?.content, format) === stored.sha256;
        } else {
          const currentReceipt = currentRows.find((entry) => entry.artifact_type === artifactType);
          if (currentReceipt?.id === rowId && currentReceipt.artifact_fingerprint === current!.artifact_fingerprint) {
            const currentManifest = resolveGovernedMaterialDownload({
              materialContent: currentReceipt.content, decisionContractContent: currentContract?.content,
              format, organizationId: organization.id, projectId,
            });
            bindingCurrent = JSON.stringify(currentManifest) === JSON.stringify(manifest);
          }
        }
      }
    } catch {
      // Missing, malformed or failed reads never restore the pre-download binding.
    }
    if (!bindingCurrent) return artifactUnavailable(notReady);
    if (!await renderedRevisionStillAuthorized(supabase, read)) return artifactUnavailable(copy.sourceRestricted);
    return new Response(bytes, {headers: {
      "content-type": mimeType,
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "private, no-store",
      ...legacyHeaders,
      ...artifactResponseHeaders(read, verification),
    }});
  }

  const material = current!;
  const materialContent = isRecord(material.content) ? material.content : {};
  const synthesis = isRecord(materialContent.output) ? materialContent.output : {};
  const sections = Array.isArray(synthesis.sections) ? synthesis.sections as Array<{id: string; title: string; paragraphs: Array<{text: string; references: string[]}>}> : [];
  const source = isRecord(synthesis.source) ? synthesis.source : {};
  const numbers = isRecord(synthesis.numbers) ? synthesis.numbers : {};
  const changeNote = Array.isArray(synthesis.change_note) ? synthesis.change_note as string[] : [];

  const blocks: MaterialBlock[] = [
    {type: "callout", title: {pt: "Validação interna", en: "Internal validation"}, items: [
      {label: {pt: "Modo", en: "Mode"}, value: {pt: "integration_preview", en: "integration_preview"}},
      {label: {pt: "Fonte da síntese", en: "Synthesis source"}, value: {pt: String(source.kind ?? ""), en: String(source.kind ?? "")}},
      {label: {pt: "Modelo", en: "Model"}, value: {pt: String(source.model ?? "nenhum"), en: String(source.model ?? "none")}},
      {label: {pt: "Números verificados", en: "Numbers verified"}, value: {pt: String(numbers.verified ?? 0), en: String(numbers.verified ?? 0)}},
      {label: {pt: "Frases removidas", en: "Sentences removed"}, value: {pt: String(Array.isArray(numbers.removed) ? numbers.removed.length : 0), en: String(Array.isArray(numbers.removed) ? numbers.removed.length : 0)}},
      {label: {pt: "Versão do artefato", en: "Artifact version"}, value: {pt: String(material.artifact_version), en: String(material.artifact_version)}},
    ]},
    ...sections.flatMap((section): MaterialBlock[] => [
      {type: "heading", text: {pt: section.title, en: section.title}},
      ...section.paragraphs.map((paragraph): MaterialBlock => ({type: "paragraph", text: {pt: paragraph.text, en: paragraph.text}, supportIds: paragraph.references})),
    ]),
    ...(changeNote.length ? [{type: "list" as const, items: changeNote.map((note) => ({pt: note, en: note}))}] : []),
  ];
  // The tables that existed when this version was created, never newer ones: the same revision
  // always composes the same document.
  const createdAt = Date.parse(material.created_at);
  for (const [type, tables] of Object.entries(tableKeys)) {
    const artifact = history.find((candidate) => candidate.artifact_type === type && Date.parse(candidate.created_at) <= createdAt);
    const output = artifact && isRecord(artifact.content) && isRecord(artifact.content.output) ? artifact.content.output : null;
    if (!output) continue;
    for (const table of tables) {
      const rows = tableRows(output, table.key);
      if (rows) blocks.push({type: "table", caption: table.caption, head: rows.head.map((column) => ({pt: column, en: column})), rows: rows.rows.slice(0, 25)});
    }
  }
  blocks.push({type: "disclaimer", text: {
    pt: "Validação interna. Métodos em estágio implemented, sem revisão independente aprovada; nada aqui é liberação, parecer ou aprovação. Toda frase com número que os objetos não sustentam foi removida antes da emissão.",
    en: "Internal validation. Methods in the implemented rung, without an approved independent review; nothing here is a release, an opinion or an approval. Every sentence with a number the objects do not hold was removed before issue.",
  }});
  const document: Material = {kind: "credit_memo", title: {pt: "Síntese interna do Caso 01 (validação)", en: "Case 01 internal synthesis (validation)"}, blocks, dependsOn: [material.artifact_fingerprint]};
  const rendered = await renderArtifactRevision({
    // The date of the version, never the day of the download: the same revision is the same file.
    revision: {issuedOn: revisionIssuedOn(revision, material.created_at)},
    format: "docx",
    lang,
    material: () => document,
    meta: {preparedBy: "Offroad Capital, validação interna"},
  });
  if (!rendered.ok) return artifactNotFound();
  const verification = verifyRenderedBytes(revision, rendered.bytes, {format: "docx", selectors: {locale: lang}});
  if (verification.status === "mismatch") return artifactUnavailable(copy.bytesMismatch);
  if (!await resourceStillReadable(supabase,organization.id,projectId,"project")) return artifactNotFound();
  if (!await renderedRevisionStillAuthorized(supabase, read)) return artifactUnavailable(copy.sourceRestricted);
  return new Response(new Uint8Array(rendered.bytes), {headers: {
    "x-preview-artifact-version": String(material.artifact_version),
    "x-preview-artifact-fingerprint": material.artifact_fingerprint,
    "cache-control": "private, no-store",
    "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "content-disposition": `attachment; filename="material-preview-${projectId.slice(0, 8)}-v${material.artifact_version}.docx"`,
    ...artifactResponseHeaders(read, verification),
  }});
}
