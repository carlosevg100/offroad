import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {artifactImportReviewView, readArtifactImport} from "@/lib/artifacts/artifact-import";
import {importLocaleSchema, importNoStore} from "@/lib/artifacts/artifact-import-request";
type Context = {params: Promise<{locale: string; artifactId: string; candidateId: string}>};
export async function GET(_request: Request, {params}: Context) {
  const raw = await params, locale = importLocaleSchema.safeParse(raw.locale);
  if (!locale.success || !z.uuid().safeParse(raw.artifactId).success || !z.uuid().safeParse(raw.candidateId).success) return Response.json({ok: false}, {status: 404, headers: importNoStore});
  const {supabase, userId} = await requireWorkspace(locale.data);
  const candidate = await readArtifactImport(supabase, {candidateId: raw.candidateId, artifactId: raw.artifactId});
  if (!candidate) return Response.json({ok: false}, {status: 404, headers: importNoStore});
  const view = await artifactImportReviewView(supabase, candidate, userId);
  if (!view) return Response.json({ok: false}, {status: 409, headers: importNoStore});
  return Response.json({ok: true, candidate, view}, {headers: importNoStore});
}
