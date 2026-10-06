import {createHash} from "node:crypto";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {artifactImportRpc, artifactImportError} from "@/lib/artifacts/artifact-import";
import {importSameOrigin, importNoStore, importLocaleSchema, readImportRequest, artifactImportMime} from "@/lib/artifacts/artifact-import-request";
import {readArtifactRevision} from "@/lib/artifacts/authorized-artifact-reader";
type Context = {params: Promise<{locale: string; artifactId: string}>};
const requestSchema = z.strictObject({revisionId: z.uuid(), format: z.enum(["xlsx", "docx", "pptx", "pdf"]), variant: z.enum(["default", "teaser", "credit_profile", "package", "credit_memo", "term_sheet", "financial_model", "diligence_qa", "data_room_index"]).default("default"), commandId: z.uuid()});
const receiptSchema = z.object({id: z.uuid(), artifactId: z.uuid(), revisionId: z.uuid(), format: z.enum(["xlsx", "docx", "pptx", "pdf"]), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().min(1).max(104857600), storage: z.object({bucket: z.string(), path: z.string(), objectId: z.uuid()})});
export async function POST(request: Request, {params}: Context) {
  if (!importSameOrigin(request)) return Response.json({ok: false}, {status: 403, headers: importNoStore});
  const raw = await params, locale = importLocaleSchema.safeParse(raw.locale), parsed = requestSchema.safeParse(await readImportRequest(request));
  if (!locale.success || !z.uuid().safeParse(raw.artifactId).success || !parsed.success) return Response.json({ok: false}, {status: 400, headers: importNoStore});
  const {supabase} = await requireWorkspace(locale.data);
  const revision = await readArtifactRevision(supabase, {revisionId: parsed.data.revisionId});
  if (!revision.ok || revision.read.withheld || revision.read.artifact.id !== raw.artifactId) return Response.json({ok: false}, {status: 403, headers: importNoStore});
  const result = await artifactImportRpc(supabase)("request_artifact_export_v1", {p_revision_id: parsed.data.revisionId, p_format: parsed.data.format, p_locale: locale.data, p_command_id: parsed.data.commandId, p_variant: parsed.data.variant});
  return Response.json(result.error ? {ok: false, error: artifactImportError(result.error.code)} : {ok: true, result: result.data}, {status: result.error ? 409 : 202, headers: importNoStore});
}
export async function GET(request: Request, {params}: Context) {
  const raw = await params, locale = importLocaleSchema.safeParse(raw.locale), url = new URL(request.url);
  if (!locale.success || !z.uuid().safeParse(raw.artifactId).success) return Response.json({ok: false}, {status: 404, headers: importNoStore});
  const {supabase} = await requireWorkspace(locale.data), rpc = artifactImportRpc(supabase);
  const taskId = url.searchParams.get("taskId");
  if (taskId) {
    if (!z.uuid().safeParse(taskId).success) return Response.json({ok: false}, {status: 400, headers: importNoStore});
    const result = await rpc("read_artifact_roundtrip_task_v1", {p_task_id: taskId});
    const task = z.object({taskId: z.uuid(), artifactId: z.uuid(), operation: z.literal("export"), status: z.string(), receiptId: z.uuid().nullable(), failureCode: z.string().nullable()}).safeParse(result.data);
    if (result.error || !task.success || task.data.taskId !== taskId || task.data.artifactId !== raw.artifactId) return Response.json({ok: false}, {status: 403, headers: importNoStore});
    return Response.json({ok: true, task: task.data}, {headers: importNoStore});
  }
  const receiptId = url.searchParams.get("receiptId");
  if (!z.uuid().safeParse(receiptId).success) return Response.json({ok: false}, {status: 400, headers: importNoStore});
  const first = await rpc("read_artifact_export_receipt_v1", {p_receipt_id: receiptId});
  if (first.error?.code === "42501") await supabase.rpc("record_artifact_access_denial_v1", {p_receipt_id: receiptId ?? undefined});
  const parsed = receiptSchema.safeParse(first.data);
  if (first.error || !parsed.success || parsed.data.artifactId !== raw.artifactId) return Response.json({ok: false}, {status: 403, headers: importNoStore});
  const receipt = parsed.data, revision = await readArtifactRevision(supabase, {revisionId: receipt.revisionId});
  if (!revision.ok || revision.read.withheld || revision.read.artifact.id !== raw.artifactId) return Response.json({ok: false}, {status: 403, headers: importNoStore});
  const stored = await supabase.storage.from(receipt.storage.bucket).download(receipt.storage.path);
  if (stored.error || !stored.data) return Response.json({ok: false, error: "storageMissing"}, {status: 409, headers: importNoStore});
  if (stored.data.size !== receipt.byteLength) return Response.json({ok: false, error: "storageMismatch"}, {status: 409, headers: importNoStore});
  const bytes = Buffer.from(await stored.data.arrayBuffer());
  if (bytes.length !== receipt.byteLength || createHash("sha256").update(bytes).digest("hex") !== receipt.sha256) return Response.json({ok: false, error: "storageMismatch"}, {status: 409, headers: importNoStore});
  // Rights and revision authority may have changed while Storage was read. Recheck both before
  // serving bytes, without signing a URL that could outlive a revocation.
  const [receiptAfter, revisionAfter] = await Promise.all([rpc("read_artifact_export_receipt_v1", {p_receipt_id: receiptId}), readArtifactRevision(supabase, {revisionId: receipt.revisionId})]);
  if (receiptAfter.error?.code === "42501") await supabase.rpc("record_artifact_access_denial_v1", {p_receipt_id: receiptId ?? undefined});
  const after = receiptSchema.safeParse(receiptAfter.data);
  if (receiptAfter.error || !after.success || JSON.stringify(after.data) !== JSON.stringify(receipt) || !revisionAfter.ok || revisionAfter.read.withheld || revisionAfter.read.artifact.id !== raw.artifactId || revisionAfter.read.summary.manifestFingerprint !== revision.read.summary.manifestFingerprint) return Response.json({ok: false}, {status: 403, headers: importNoStore});
  return new Response(bytes, {headers: {...importNoStore, "content-type": receipt.format === "pdf" ? "application/pdf" : artifactImportMime[receipt.format], "content-length": String(bytes.length), "content-disposition": `attachment; filename="offroad.${receipt.format}"`, "x-content-type-options": "nosniff", "x-artifact-sha256": receipt.sha256, "x-artifact-revision": receipt.revisionId, "x-artifact-manifest-fingerprint": revision.read.summary.manifestFingerprint}});
}
