import "server-only";

import type {Material, MaterialBlock, MaterialKind} from "@offroad/case-materials";
import type {ArtifactRevision} from "@offroad/domain-contracts";
import type {SupabaseClient} from "@supabase/supabase-js";

import {resourceStillReadable} from "@/lib/auth/resource-download";
import {requireWorkspace} from "@/lib/auth/workspace";
import {governedMaterial, loadGovernedMaterialPackage, type GovernedMaterialPackage} from "@/lib/deal-state/materials";
import type {Database} from "@/types/database";

import type {MaterialFileFormat} from "./artifact-renderers";
import {
  artifactDownloadCopy,
  artifactNotFound,
  artifactUnavailable,
  legacyRowId,
  refusalText,
  requestedRevision,
  resolveRouteRevision,
  revisionRendererAllowed,
  templateForRevision,
  type ArtifactDownloadCopy,
  type ServedRead,
} from "./artifact-route";
import {artifactResponseHeaders, resolveRenderer, revisionIssuedOn, verifyRenderedBytes} from "./authorized-artifact-reader";
import {renderArtifactRevision} from "./render-artifact-revision";

/**
 * The governed material package of a case as an artifact revision: the materials routes (html,
 * docx, pdf, pptx) and the model route read the artifact of kind `material` and subject
 * `materials:<session>` of the session's work, exact by `?revision=` or the head, and render the
 * `material_artifact` row that revision names. The governance the routes applied before still
 * decides whether that row is served: the confirmed structure, the approved production plan and
 * the material that depends on it. A revision whose row is no longer that package is refused.
 */

export const governedMaterialKinds: readonly MaterialKind[] = ["credit_memo", "term_sheet", "diligence_qa", "teaser", "credit_profile", "package", "data_room_index"];

export type GovernedMaterialRevision = {
  supabase: SupabaseClient<Database>;
  organization: {id: string; name?: string | null};
  lang: "pt" | "en";
  copy: ArtifactDownloadCopy;
  sessionId: string;
  projectId: string;
  read: ServedRead;
  revision: ArtifactRevision;
  governed: GovernedMaterialPackage;
  /** The date of the version the files print, never the date of the request. */
  issuedOn: string;
};

type Outcome = {ok: true; value: GovernedMaterialRevision} | {ok: false; response: Response};

/** The `material_artifact` row the revision renders: the row a legacy revision names, or the fingerprint a pinned rendering names. */
function materialRowOf(revision: ArtifactRevision): {id: string} | {fingerprint: string} | null {
  const rowId = legacyRowId(revision, "deal_state_objects");
  if (rowId) return {id: rowId};
  const renderer = resolveRenderer(revision);
  if (!renderer.ok || renderer.source !== "rendered") return null;
  const fingerprint = renderer.deterministicInputs.materialFingerprint;
  return typeof fingerprint === "string" && /^[a-f0-9]{64}$/.test(fingerprint) ? {fingerprint} : null;
}

export async function resolveGovernedMaterialRevision(
  request: Request,
  params: {locale: string; sessionId: string},
  unavailable: (copy: ArtifactDownloadCopy) => string,
): Promise<Outcome> {
  const revisionParameter = requestedRevision(request);
  if (!revisionParameter.ok) return {ok: false, response: artifactNotFound()};
  const {supabase, organization} = await requireWorkspace(params.locale);
  if (!await resourceStillReadable(supabase, organization.id, params.sessionId, "session")) return {ok: false, response: artifactNotFound()};
  const lang = params.locale === "en-US" ? "en" : "pt";
  const copy = artifactDownloadCopy(lang);
  const {data: session} = await supabase.from("document_intake_sessions").select("capital_project_id")
    .eq("organization_id", organization.id).eq("id", params.sessionId).maybeSingle();
  const projectId = session?.capital_project_id ?? null;
  if (!projectId) return {ok: false, response: revisionParameter.revisionId ? artifactNotFound() : artifactUnavailable(unavailable(copy))};
  const resolved = await resolveRouteRevision(supabase, {workId: projectId, kind: "material", subject: `materials:${params.sessionId}`}, revisionParameter.revisionId);
  if (!resolved.ok) {
    if (resolved.outcome === "not_found") return {ok: false, response: artifactNotFound()};
    return {ok: false, response: artifactUnavailable(resolved.outcome === "refused" ? refusalText(copy, resolved.refusal) : unavailable(copy))};
  }
  const row = materialRowOf(resolved.revision);
  if (!row || !revisionRendererAllowed(resolved.revision, {families: ["material", "html", "institutional_workbook"]})) {
    return {ok: false, response: artifactUnavailable(copy.rendererUnavailable)};
  }
  const governed = await loadGovernedMaterialPackage(supabase, organization.id, params.sessionId);
  if (!governed) return {ok: false, response: artifactUnavailable(unavailable(copy))};
  if ("id" in row ? governed.artifactId !== row.id : governed.artifactFingerprint !== row.fingerprint) {
    return {ok: false, response: artifactUnavailable(copy.revisionReplaced)};
  }
  return {ok: true, value: {
    supabase, organization, lang, copy, sessionId: params.sessionId, projectId, read: resolved.read, revision: resolved.revision, governed,
    issuedOn: revisionIssuedOn(resolved.revision, governed.issuedOn),
  }};
}

/** A cited id reads as its path and period, exactly as the persisted version wrote it. */
function citationLabel(id: string): string {
  const match = /^(.*) \((\d{4}-\d{2}-\d{2})\)$/.exec(id);
  return match ? `${match[1]} · ${match[2]}` : id;
}

/** Every support id the persisted blocks carry, in reading order; the renderer numbers only those it prints. */
function citedIds(blocks: readonly MaterialBlock[]): string[] {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        if (key === "supportIds" && Array.isArray(inner)) inner.forEach((id) => typeof id === "string" && ids.add(id));
        else walk(inner);
      }
    }
  };
  walk(blocks);
  return [...ids];
}

/**
 * The sources appendix of the printable material, from the revision and never from the current
 * case state: every reference the persisted version cites, and the documents of the source
 * versions the revision links. A revision without source links says that its sources were not
 * recorded with it instead of borrowing today's documents.
 */
export async function materialSourcesFromRevision(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  revision: ArtifactRevision,
  material: Material,
): Promise<{ok: true; material: Material; sources: Array<{id: string; label: string}>} | {ok: false}> {
  const cited = citedIds(material.blocks);
  const sources = cited.map((id) => ({id, label: citationLabel(id)}));
  const pt = artifactDownloadCopy("pt").materials;
  const en = artifactDownloadCopy("en").materials;
  const versionIds = revision.manifest.sources.map((source) => source.sourceVersionId);
  if (versionIds.length === 0) {
    const note: MaterialBlock[] = cited.length > 0 ? [{type: "paragraph", text: {pt: pt.sourcesNotRecorded, en: en.sourcesNotRecorded}}] : [];
    return {ok: true, material: {...material, blocks: [...material.blocks, ...note]}, sources};
  }
  const {data, error} = await supabase.from("source_versions").select("id, original_name, version_no")
    .eq("organization_id", organizationId).in("id", versionIds);
  const byId = new Map((data ?? []).map((version) => [version.id, version]));
  if (error || versionIds.some((id) => !byId.has(id))) return {ok: false};
  const documents = versionIds.map((id) => {
    const version = byId.get(id)!;
    return {pt: `${version.original_name} · v${version.version_no}`, en: `${version.original_name} · v${version.version_no}`};
  });
  const linked: MaterialBlock[] = [{type: "heading", text: {pt: pt.linkedDocuments, en: en.linkedDocuments}}, {type: "list", items: documents}];
  return {ok: true, material: {...material, blocks: [...material.blocks, ...linked]}, sources};
}

const fileMedia: Record<MaterialFileFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * One governed material as a Word, PDF or PowerPoint file, built deterministically from the exact
 * revision's persisted blocks through the single serializer: the same revision yields the same
 * bytes on any day, and a revision that pins its bytes is served only when they match.
 */
export async function serveGovernedMaterialFile(
  request: Request,
  params: {locale: string; sessionId: string; kind: string},
  format: MaterialFileFormat,
): Promise<Response> {
  if (!governedMaterialKinds.includes(params.kind as MaterialKind)) return new Response("Not found", {status: 404});
  const resolved = await resolveGovernedMaterialRevision(request, params, (copy) => copy.materials.packageUnavailable);
  if (!resolved.ok) return resolved.response;
  const {supabase, organization, lang, copy, governed, revision, read, issuedOn, projectId, sessionId} = resolved.value;
  const kind = params.kind as MaterialKind;
  const material = governedMaterial(governed, kind);
  if (!material) return artifactUnavailable(copy.materials.outsidePlan);
  const template = await templateForRevision(supabase, projectId, revision, "house");
  if (!template.ok) return artifactUnavailable(copy.templateUnavailable);
  const rendered = await renderArtifactRevision({
    revision: {issuedOn, ...(template.template ? {template: template.template} : {})},
    format,
    lang,
    material: () => material,
    // The Word file has always printed the company on its title line; the PDF and the deck never did, and their bytes stay as they were.
    meta: format === "docx" && organization.name ? {companyName: organization.name} : {},
  });
  if (!rendered.ok) return artifactNotFound();
  const verification = verifyRenderedBytes(revision, rendered.bytes, {format, selectors: {locale: lang, materialKind: kind}});
  if (verification.status === "mismatch") return artifactUnavailable(copy.bytesMismatch);
  if (!await resourceStillReadable(supabase, organization.id, sessionId, "session")) return artifactNotFound();
  return new Response(Buffer.from(rendered.bytes), {
    headers: {
      "content-type": fileMedia[format],
      "content-disposition": `attachment; filename="${kind}-${sessionId.slice(0, 8)}.${format}"`,
      "cache-control": "private, no-store",
      ...artifactResponseHeaders(read, verification),
    },
  });
}
