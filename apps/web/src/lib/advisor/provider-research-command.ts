import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";

type ProviderResearchArgs = Database["public"]["Functions"]["start_provider_research_project_v1"]["Args"];

export function startProviderResearchProject(supabase: SupabaseClient<Database>, args: ProviderResearchArgs) {
  return supabase.rpc("start_provider_research_project_v1", args);
}
