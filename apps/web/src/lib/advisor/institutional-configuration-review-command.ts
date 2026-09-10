import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
export type InstitutionalReviewCommand = {p_project_id: string; p_candidate_id: string; p_expected_parent_fingerprint: string | null; p_expected_candidate_fingerprint: string; p_decision: "approved" | "rejected"; p_request_id: string; p_locale: "pt-BR" | "en-US"};
export function reviewInstitutionalConfiguration(client: SupabaseClient<Database>, args: InstitutionalReviewCommand) {
  return (client as unknown as {rpc(name: "review_institutional_configuration_and_calculate_v1", args: InstitutionalReviewCommand): PromiseLike<{data: unknown; error: {message: string; code?: string} | null}>}).rpc("review_institutional_configuration_and_calculate_v1", args);
}
