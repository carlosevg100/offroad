import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
export type InstitutionalReviewCommand = {p_project_id: string; p_candidate_id: string; p_expected_parent_fingerprint: string; p_expected_candidate_fingerprint: string; p_decision: "approved" | "rejected"};
export function reviewInstitutionalConfiguration(client: SupabaseClient<Database>, args: InstitutionalReviewCommand) {
  return client.rpc("review_institutional_configuration_v1", args);
}
