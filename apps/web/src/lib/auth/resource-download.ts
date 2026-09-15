import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
/** Recheck RLS after rendering or storage I/O and before returning private bytes. */
export async function resourceStillReadable(supabase: SupabaseClient<Database>, organizationId: string, resourceId: string, kind: "project" | "session") {
  const {data,error} = await supabase.from(kind === "project" ? "capital_projects" : "document_intake_sessions")
    .select("id").eq("organization_id",organizationId).eq("id",resourceId).maybeSingle();
  return !error && data?.id===resourceId;
}
