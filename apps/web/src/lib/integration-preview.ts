import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database} from "@/types/database";

export type IntegrationPreviewStatus = {enabled: boolean; note: string | null};

/**
 * Whether the organization runs the internal `integration_preview` mode. The grant is an operator
 * decision stored outside the Data API; this call only asks the database to say yes or no for the
 * caller's own organization. Any failure reads as "not enabled": the mode never turns itself on.
 */
export async function loadIntegrationPreviewStatus(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<IntegrationPreviewStatus> {
  const {data, error} = await supabase.rpc("get_integration_preview_status_v1", {p_organization_id: organizationId});
  if (error) {
    // Content-free: the code and the message name a function or a privilege, never data.
    console.warn(JSON.stringify({event: "integration_preview.status_unavailable", code: error.code ?? null, message: (error.message ?? "").slice(0, 200)}));
    return {enabled: false, note: null};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {enabled: false, note: null};
  const record = data as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    note: typeof record.note === "string" && record.note.trim() ? record.note.trim() : null,
  };
}
