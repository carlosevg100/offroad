import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {artifactImportCandidateSchema, artifactImportReviewView, artifactImportError, artifactImportRpc} from "@/lib/artifacts/artifact-import";
import {readArtifactRevision} from "@/lib/artifacts/authorized-artifact-reader";
import {artifactImportMime, artifactImportSubmitSchema, importLocaleSchema, importNoStore, importSameOrigin, readImportRequest} from "@/lib/artifacts/artifact-import-request";
import {workUpdateViewSchema} from "@/lib/advisor/work-update-view";
import {safeObjectName} from "@/lib/intake/upload-client";
type Context = {params: Promise<{locale: string; artifactId: string}>};
export async function POST(request: Request, {params}: Context) {
  if (!importSameOrigin(request)) return Response.json({ok: false, error: "denied"}, {status: 403, headers: importNoStore});
  const raw = await params, locale = importLocaleSchema.safeParse(raw.locale), input = artifactImportSubmitSchema.safeParse(await readImportRequest(request));
  if (!locale.success || !z.uuid().safeParse(raw.artifactId).success || !input.success) return Response.json({ok: false, error: "invalid"}, {status: 400, headers: importNoStore});
  const {supabase, organization} = await requireWorkspace(locale.data), c = input.data;
  const revision = await readArtifactRevision(supabase, {revisionId: c.headRevisionId});
  if (!revision.ok || revision.read.artifact.id !== raw.artifactId || revision.read.artifact.workId !== c.workId || !revision.read.isHead) return Response.json({ok: false, error: "changed"}, {status: 409, headers: importNoStore});
  const session = await supabase.from("document_intake_sessions").select("id").eq("id", c.sessionId).eq("organization_id", organization.id).eq("capital_project_id", c.workId).maybeSingle();
  if (session.error || !session.data) return Response.json({ok: false, error: "denied"}, {status: 403, headers: importNoStore});
  const objectPath = `${organization.id}/${c.sessionId}/${c.sourceVersionId}-${safeObjectName(c.fileName)}`;
  const registered = await supabase.rpc("register_intake_document_command", {p_organization_id: organization.id, p_session_id: c.sessionId, p_event_id: c.commandId, p_document_id: c.sourceVersionId, p_bucket_id: "opportunity-documents", p_object_path: objectPath, p_original_name: c.fileName, p_mime_type: artifactImportMime[c.format], p_byte_size: c.byteLength, p_sha256: c.sha256});
  if (registered.error) return Response.json({ok: false, error: artifactImportError(registered.error.code)}, {status: 409, headers: importNoStore});
  const receipt = z.object({id: z.uuid()}).safeParse(registered.data);
  if (!receipt.success) return Response.json({ok: false, error: "save"}, {status: 502, headers: importNoStore});
  // Registering an upload is not a verification. Only the bounded scan worker may attest bytes
  // and queue the comparison. The general case-processing entry point is deliberately absent.
  const queued = await artifactImportRpc(supabase)("request_artifact_import_upload_v1", {p_candidate_id: c.candidateId, p_work_id: c.workId, p_artifact_id: raw.artifactId, p_export_receipt_id: c.exportReceiptId, p_source_version_id: receipt.data.id, p_expected_head_revision_id: c.headRevisionId, p_format: c.format, p_locale: locale.data, p_command_id: c.commandId});
  if (queued.error) return Response.json({ok: false, error: artifactImportError(queued.error.code)}, {status: 409, headers: importNoStore});
  const queuedResult = z.object({candidateId: z.uuid()}).safeParse(queued.data);
  if (!queuedResult.success) return Response.json({ok: false, error: "save"}, {status: 502, headers: importNoStore});
  return Response.json({ok: true, candidateId: queuedResult.data.candidateId, result: queued.data}, {status: 202, headers: importNoStore});
}

export async function GET(_request: Request, {params}: Context) {
  const raw = await params, locale = importLocaleSchema.safeParse(raw.locale);
  if (!locale.success || !z.uuid().safeParse(raw.artifactId).success) return Response.json({ok: false}, {status: 404, headers: importNoStore});
  const {supabase, organization, userId} = await requireWorkspace(locale.data);
  const artifact = await supabase.from("artifacts").select("id,work_id,head_revision_id").eq("id", raw.artifactId).eq("organization_id", organization.id).maybeSingle();
  if (artifact.error || !artifact.data) return Response.json({ok: false}, {status: 404, headers: importNoStore});
  const currentArtifact = artifact.data;
  const rpc = artifactImportRpc(supabase);
  const [imports, receipts, terms, updates] = await Promise.all([rpc("list_work_artifact_imports_v1", {p_work_id: artifact.data.work_id}), rpc("list_artifact_export_receipts_v1", {p_artifact_id: raw.artifactId}), supabase.rpc("get_workspace_project_setup", {p_locale: locale.data}), supabase.rpc("work_update_view_v1", {p_work_id: artifact.data.work_id})]);
  if (imports.error || receipts.error || terms.error || updates.error) return Response.json({ok: false}, {status: 409, headers: importNoStore});
  const list = z.object({workId: z.uuid(), candidates: z.array(z.unknown()).max(100)}).safeParse(imports.data);
  const receiptList = z.object({artifactId: z.uuid(), receipts: z.array(z.unknown()).max(100)}).safeParse(receipts.data);
  if (!list.success || list.data.workId !== artifact.data.work_id || !receiptList.success || receiptList.data.artifactId !== raw.artifactId) return Response.json({ok: false}, {status: 502, headers: importNoStore});
  const candidates = list.data.candidates.map(value => artifactImportCandidateSchema.safeParse(value)).flatMap(parsed => parsed.success && "artifactId" in parsed.data && parsed.data.artifactId === raw.artifactId && parsed.data.workId === currentArtifact.work_id ? [parsed.data] : []);
  const reviews = await Promise.all(candidates.map(async candidate => ({candidate, view: await artifactImportReviewView(supabase, candidate, userId)})));
  const updateView = workUpdateViewSchema.safeParse(updates.data);
  if (!updateView.success || updateView.data.workId !== artifact.data.work_id) return Response.json({ok: false}, {status: 502, headers: importNoStore});
  const current = artifact.data.head_revision_id ? await readArtifactRevision(supabase, {revisionId: artifact.data.head_revision_id}) : null;
  const blockKeys = current?.ok && !current.read.withheld ? current.read.blocks.map(block => block.blockKey) : [];
  return Response.json({ok: true, blockKeys, workId: artifact.data.work_id, headRevisionId: artifact.data.head_revision_id, candidates: reviews.filter(review => review.view !== null), receipts: receiptList.data.receipts, terms: terms.data, bases: updateView.data.bases}, {headers: importNoStore});
}
