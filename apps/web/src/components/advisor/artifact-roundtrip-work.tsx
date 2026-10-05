import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {getTranslations} from "next-intl/server";
import {readArtifactRevision} from "@/lib/artifacts/authorized-artifact-reader";
import {ArtifactImportPanel} from "./artifact-import-panel";
/** Native identities rather than historical preview ids connect Office edits to the work. */
export async function ArtifactRoundtripWork({supabase, workId, locale}: {supabase: SupabaseClient<Database>; workId: string; locale: "pt-BR" | "en-US"}) {
  const result = await supabase.from("artifacts").select("id,head_revision_id").eq("work_id", workId).order("created_at", {ascending: false}).limit(50);
  if (result.error) return null;
  const reads = await Promise.all((result.data ?? []).map(async artifact => artifact.head_revision_id ? readArtifactRevision(supabase, {revisionId: artifact.head_revision_id}) : null));
  const t = await getTranslations({locale, namespace: "ArtifactImportPanel"});
  return <div>{reads.map((result, index) => result?.ok && !result.read.withheld ? <details key={result.read.artifact.id}><summary>{result.read.artifact.subject}</summary><ArtifactImportPanel locale={locale} workId={workId} artifactId={result.read.artifact.id}/></details> : result?.ok && result.read.withheld ? <p key={index}>{t("restricted")}</p> : null)}</div>;
}
