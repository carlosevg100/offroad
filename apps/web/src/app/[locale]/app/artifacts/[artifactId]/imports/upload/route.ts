import {randomUUID} from "node:crypto";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {prepareAdvisorDocumentUpload} from "@/app/[locale]/app/advisor-actions";
import {readArtifactRevision} from "@/lib/artifacts/authorized-artifact-reader";
import {artifactImportUploadSchema, importLocaleSchema, importNoStore, importSameOrigin, readImportRequest} from "@/lib/artifacts/artifact-import-request";
import {safeObjectName} from "@/lib/intake/upload-client";
type Context = {params: Promise<{locale: string; artifactId: string}>};
export async function POST(request: Request, {params}: Context) {
  if (!importSameOrigin(request)) return Response.json({ok: false, error: "denied"}, {status: 403, headers: importNoStore});
  const raw = await params, locale = importLocaleSchema.safeParse(raw.locale), input = artifactImportUploadSchema.safeParse(await readImportRequest(request));
  if (!locale.success || !z.uuid().safeParse(raw.artifactId).success || !input.success) return Response.json({ok: false, error: "invalid"}, {status: 400, headers: importNoStore});
  const {supabase, organization, userId} = await requireWorkspace(locale.data);
  const revision = await readArtifactRevision(supabase, {revisionId: input.data.headRevisionId});
  if (!revision.ok || revision.read.artifact.id !== raw.artifactId || revision.read.artifact.workId !== input.data.workId || !revision.read.isHead) return Response.json({ok: false, error: "changed"}, {status: 409, headers: importNoStore});
  const acceptance = await supabase.rpc("accept_private_workspace_terms", {p_locale: locale.data, p_signatory_name: input.data.terms.signatoryName, p_signatory_title: input.data.terms.signatoryTitle, p_terms_agreed: input.data.terms.termsAgreed, p_information_rights_declared: input.data.terms.informationRightsDeclared});
  if (acceptance.error) return Response.json({ok: false, error: "denied"}, {status: 403, headers: importNoStore});
  const scope = await prepareAdvisorDocumentUpload({locale: locale.data, projectId: input.data.workId});
  if (!scope.ok || scope.organizationId !== organization.id || scope.userId !== userId) return Response.json({ok: false, error: "denied"}, {status: 403, headers: importNoStore});
  const sourceVersionId = randomUUID();
  return Response.json({ok: true, organizationId: organization.id, sessionId: scope.sessionId, sourceVersionId, bucket: "opportunity-documents", objectPath: `${organization.id}/${scope.sessionId}/${sourceVersionId}-${safeObjectName(input.data.fileName)}`}, {headers: importNoStore});
}
