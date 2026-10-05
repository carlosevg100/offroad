import {serveRoundtripDownload} from "@/lib/artifacts/roundtrip-download";
import {deliverableFormatBlockCopy} from "@offroad/case-export/deliverable-formats";

import {loadInstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {institutionalResultMaterial} from "@/lib/advisor/institutional-result-material";
import {institutionalResultDeliverableContext, institutionalResultDeliverableTypes} from "@/lib/advisor/institutional-result-formats";
import {artifactRenderers} from "@/lib/artifacts/artifact-renderers";
import {
  artifactDownloadCopy,
  artifactNotFound,
  artifactUnavailable,
  refusalText,
  requestedRevision,
  resolveRouteRevision,
  revisionRendererAllowed,
  templateForRevision,
} from "@/lib/artifacts/artifact-route";
import {revisionIssuedOn, verifyRenderedBytes} from "@/lib/artifacts/authorized-artifact-reader";
import {renderArtifactRevision} from "@/lib/artifacts/render-artifact-revision";
import {resourceStillReadable} from "@/lib/auth/resource-download";
import {requireWorkspace} from "@/lib/auth/workspace";

const formats = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
} as const;
type Params = {params: Promise<{locale: string; projectId: string; resultId: string; format: string}>};

/**
 * The approved institutional result in four formats, for one exact artifact revision of kind
 * `model_result` and subject `institutional-workbook` (`?revision=`, or the head), read through the
 * authorized reader. The revision must name the result in the path, and that result must still be
 * the established one the database returns: the workbook is replayed against its approved hashes
 * before any file, and dates and identity come from the version, never from the request.
 */
export async function GET(request: Request, {params}: Params) {
  const {locale, projectId, resultId, format} = await params;
  if (!Object.hasOwn(formats, format)) return new Response("Not found", {status: 404});
  const revisionParameter = requestedRevision(request);
  if (!revisionParameter.ok) return artifactNotFound();
  const {supabase, organization} = await requireWorkspace(locale);
  if (!await resourceStillReadable(supabase,organization.id,projectId,"project")) return artifactNotFound();
  const lang = locale === "en-US" ? "en" : "pt";
  const copy = artifactDownloadCopy(lang);
  const result = await loadInstitutionalModelResult(supabase, projectId);
  if (!result || result.id !== resultId) return artifactUnavailable(revisionParameter.revisionId ? copy.revisionReplaced : copy.financialResult.unavailable);
  if (result.nativeRevisionId && revisionParameter.revisionId && revisionParameter.revisionId !== result.nativeRevisionId) return artifactNotFound();
  const target = {workId: projectId, kind: "model_result" as const, subject: result.nativeRevisionId ? `institutional-native:${result.id}` : "institutional-workbook"};
  const resolved = await resolveRouteRevision(supabase, target, result.nativeRevisionId ?? revisionParameter.revisionId);
  if (!resolved.ok) {
    if (resolved.outcome === "not_found") return artifactNotFound();
    return artifactUnavailable(resolved.outcome === "refused" ? refusalText(copy, resolved.refusal) : copy.financialResult.unavailable);
  }
  const {revision, read} = resolved;
  if (!revisionRendererAllowed(revision, {families: ["institutional_workbook", "material"]})) return artifactUnavailable(copy.rendererUnavailable);
  const artifact = result.artifact;
  const template = format === "xlsx" ? {ok: true as const, template: undefined} : await templateForRevision(supabase, projectId, revision, "project");
  if (!template.ok) return artifactUnavailable(copy.templateUnavailable);
  // The same policy the surface showed and the same replay for every format: a copied link never
  // reaches a format the delivery does not allow, and a superseded result is never served as current.
  const rendered = await renderArtifactRevision({
    revision: {issuedOn: revisionIssuedOn(revision, result.createdAt), ...(template.template ? {template: template.template} : {})},
    format,
    lang,
    policy: {types: institutionalResultDeliverableTypes, context: institutionalResultDeliverableContext(result)},
    // The registered replay of this artifact version: the workbook is rebuilt and must carry the approved hash of the locale.
    reproduce: async () => artifact ? artifactRenderers[artifact.version].produce(artifact, lang) : null,
    material: () => institutionalResultMaterial(artifact!, lang),
  });
  if (!rendered.ok) return artifactUnavailable(deliverableFormatBlockCopy[rendered.block][lang], rendered.block === "format_not_in_policy" ? 404 : 409);
  // The revision must be the version of exactly this established result; another one is not served in its name.
  if (revision.manifest.institutionalResult?.id !== result.id) {
    return artifactUnavailable(resolved.exact ? copy.revisionReplaced : copy.financialResult.unavailable);
  }
  const verification = verifyRenderedBytes(revision, rendered.bytes, {format: rendered.format, selectors: {locale: lang}});
  if (verification.status === "mismatch") return artifactUnavailable(copy.bytesMismatch);
  if (!await resourceStillReadable(supabase,organization.id,projectId,"project")) return artifactNotFound();
  // Rendering is outside the database transaction. Re-read the exact revision and result after it.
  const final = await resolveRouteRevision(supabase, target, revision.id);
  const current = await loadInstitutionalModelResult(supabase, projectId);
  if (!final.ok || final.revision.manifestFingerprint !== revision.manifestFingerprint || final.read.release !== read.release
    || final.read.freshness !== read.freshness || !current || current.id !== result.id || current.status !== "completed"
    || current.nativeRevisionId !== result.nativeRevisionId || current.artifact?.fingerprint !== artifact?.fingerprint) return artifactUnavailable(copy.sourceRestricted);
  return serveRoundtripDownload(request, {supabase, locale, artifactId: read.artifact.id, revisionId: revision.id, format, variant: "default"});
}
