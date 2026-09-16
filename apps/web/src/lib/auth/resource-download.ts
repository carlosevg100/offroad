import {accessExplanationSchema} from "@offroad/access-policy";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
/** Recheck RLS after rendering or storage I/O and before returning private bytes. */
export async function resourceStillReadable(supabase: SupabaseClient<Database>, organizationId: string, resourceId: string, kind: "project" | "session") {
  const {data,error} = await supabase.from(kind === "project" ? "capital_projects" : "document_intake_sessions")
    .select("id").eq("organization_id",organizationId).eq("id",resourceId).maybeSingle();
  if (error || data?.id!==resourceId) return false;
  const decision = await supabase.rpc("explain_my_access_v1", {p_resource_id: resourceId, p_action: "read", p_purpose: "export"});
  if (decision.error) return false;
  const parsed = accessExplanationSchema.safeParse(decision.data);
  return parsed.success && parsed.data.allowed && parsed.data.capabilities.includes("read");
}
