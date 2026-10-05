import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireWorkspace} from "@/lib/auth/workspace";
import {artifactImportError, artifactImportRpc, readArtifactImport} from "@/lib/artifacts/artifact-import";
import {artifactImportDecisionSchema, importLocaleSchema, importNoStore, importSameOrigin, readImportRequest} from "@/lib/artifacts/artifact-import-request";
type Context = {params: Promise<{locale: string; artifactId: string; candidateId: string}>};
export async function POST(request: Request, {params}: Context) {
  if (!importSameOrigin(request)) return Response.json({ok: false, error: "denied"}, {status: 403, headers: importNoStore});
  const raw = await params, locale = importLocaleSchema.safeParse(raw.locale), parsed = artifactImportDecisionSchema.safeParse(await readImportRequest(request));
  if (!locale.success || !z.uuid().safeParse(raw.artifactId).success || !z.uuid().safeParse(raw.candidateId).success || !parsed.success) return Response.json({ok: false, error: "invalid"}, {status: 400, headers: importNoStore});
  const {supabase} = await requireWorkspace(locale.data);
  const candidate = await readArtifactImport(supabase, {candidateId: raw.candidateId, artifactId: raw.artifactId});
  if (!candidate || candidate.withheld) return Response.json({ok: false, error: "denied"}, {status: 403, headers: importNoStore});
  const c = parsed.data, common = {p_candidate_id: candidate.candidateId, p_command_id: c.commandId};
  const call = c.act === "apply" ? {name: c.configurationId ? "adopt_artifact_import_group_v1" : "adopt_artifact_import_v1", args: {...common, p_expected_head_revision_id: c.expectedHeadRevisionId, p_expected_comparison_fingerprint: c.comparisonFingerprint, p_resolutions: c.choices, p_locale: locale.data, p_self_approval_declared: c.selfApprovalDeclared, p_base_milestone_id: c.continuationBasis.milestoneId, p_base_decision_id: c.continuationBasis.decisionId, p_base_revision: c.continuationBasis.revision, ...(c.configurationId ? {p_configuration_id: c.configurationId, p_rebase_declared: c.rebaseDeclared === true} : {})}}
    : c.act === "keep_source" ? {name: "keep_artifact_import_as_source_v1", args: {...common, p_reason: c.reason}}
    : c.act === "match" ? {name: "match_artifact_import_v1", args: {...common, p_export_receipt_id: c.exportReceiptId, p_expected_head_revision_id: c.expectedHeadRevisionId, p_mappings: c.mappings}}
    : c.act === "discard" ? {name: "discard_artifact_import_v1", args: {...common, p_reason: c.reason}}
    : {name: "recompare_artifact_import_v1", args: {...common, p_expected_head_revision_id: c.expectedHeadRevisionId}};
  const result = await artifactImportRpc(supabase)(call.name, call.args);
  if (result.error) return Response.json({ok: false, error: artifactImportError(result.error.code)}, {status: result.error.code === "42501" ? 403 : 409, headers: importNoStore});
  revalidatePath(`/${locale.data}/app/projects/${candidate.workId}`);
  return Response.json({ok: true, result: result.data}, {headers: importNoStore});
}
