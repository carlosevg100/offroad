import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database,Json} from "@/types/database";
export type ProviderCaseFitCommand={p_request_id:string;p_locale:string;p_project_name:string;p_prompt:string;p_plan:Json;p_case_criteria:Json;p_project_id?:string;p_expected_plan_fingerprint?:string;p_group_id?:string};
/** Generated command signature; no whole-client generic binding is required. */
export function startProviderCaseFitProject(client:SupabaseClient<Database>,args:ProviderCaseFitCommand){
 return client.rpc("start_provider_case_fit_project_v1",args);
}
