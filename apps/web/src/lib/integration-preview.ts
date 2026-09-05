import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database} from "@/types/database";

export type IntegrationPreviewScope = "organization" | "projects";

export type IntegrationPreviewMode = "deterministic" | "live";

export type IntegrationPreviewStatus = {enabled: boolean; scope: IntegrationPreviewScope | null; mode: IntegrationPreviewMode | null; projectIds: string[]; note: string | null};

const disabled: IntegrationPreviewStatus = {enabled: false, scope: null, mode: null, projectIds: [], note: null};

/** Whether this project runs in preview: the whole organization does, or the project is listed. */
export function integrationPreviewCoversProject(status: IntegrationPreviewStatus, projectId: string): boolean {
  return status.enabled && (status.scope === "organization" || status.projectIds.includes(projectId));
}

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
    return disabled;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return disabled;
  const record = data as Record<string, unknown>;
  const projectIds = Array.isArray(record.projectIds) ? record.projectIds.filter((value): value is string => typeof value === "string") : [];
  return {
    enabled: record.enabled === true,
    // A status without a scope comes from the organization-wide grant of the first migration.
    scope: record.scope === "projects" ? "projects" : record.enabled === true ? "organization" : null,
    mode: record.mode === "live" ? "live" : record.enabled === true ? "deterministic" : null,
    projectIds,
    note: typeof record.note === "string" && record.note.trim() ? record.note.trim() : null,
  };
}
