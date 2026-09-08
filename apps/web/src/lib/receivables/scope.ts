import {receivablesEvidenceScopeContextSchema, type ReceivablesEvidenceScopeContext} from "@offroad/receivables-analysis";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
export async function loadReceivablesScope(supabase: SupabaseClient<Database>, sessionId: string): Promise<ReceivablesEvidenceScopeContext> {
  const {data, error} = await supabase.rpc("read_receivables_evidence_scope_v1", {p_session_id: sessionId});
  const parsed = receivablesEvidenceScopeContextSchema.safeParse(data);
  return !error && parsed.success ? parsed.data : {state: "unavailable", sourceManifest: null, candidates: [], scope: null};
}
