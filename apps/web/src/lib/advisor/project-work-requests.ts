import type {SupabaseClient} from "@supabase/supabase-js";
import {projectCapabilityIdSchema, projectWorkSurfaceSchema, type ProjectCapabilityId, type ProjectWorkSurface} from "@offroad/work-plan";
import {z} from "zod";

import type {Database} from "@/types/database";

const dispatchSchema = z.object({
  surface: projectWorkSurfaceSchema.optional(),
  documentaryJob: z.enum(["comparison", "meeting", "review"]).nullable().optional(),
}).loose();

export type ProjectWorkRequestRecord = {
  id: string;
  capability: ProjectCapabilityId;
  objective: string;
  status: "dispatched" | "needs_information";
  surface: ProjectWorkSurface | null;
  originSection: string | null;
  requestedBy: string;
  createdAt: string;
};

type Row = Pick<Database["public"]["Tables"]["capital_project_work_requests"]["Row"], "id" | "capability" | "objective" | "status" | "dispatch" | "origin_section" | "requested_by" | "created_at">;

export function readProjectWorkRequests(rows: readonly Row[]): ProjectWorkRequestRecord[] {
  return rows.flatMap((row) => {
    const capability = projectCapabilityIdSchema.safeParse(row.capability);
    const dispatch = dispatchSchema.safeParse(row.dispatch);
    if (!capability.success || (row.status !== "dispatched" && row.status !== "needs_information")) return [];
    return [{
      id: row.id,
      capability: capability.data,
      objective: row.objective,
      status: row.status,
      surface: dispatch.success ? dispatch.data.surface ?? null : null,
      originSection: row.origin_section,
      requestedBy: row.requested_by,
      createdAt: row.created_at,
    }];
  });
}

/** Recent entries only; the executors' own surfaces remain the source of versions and results. */
export async function loadProjectWorkRequests(client: SupabaseClient<Database>, organizationId: string, projectId: string): Promise<ProjectWorkRequestRecord[]> {
  const {data, error} = await client.from("capital_project_work_requests")
    .select("id, capability, objective, status, dispatch, origin_section, requested_by, created_at")
    .eq("organization_id", organizationId)
    .eq("capital_project_id", projectId)
    .order("created_at", {ascending: false})
    .limit(10);
  return error ? [] : readProjectWorkRequests(data ?? []);
}

/**
 * Facts the project's own review already accepted under the `debt.` field paths of the extraction
 * vocabulary. The debt-structure methods read a debt note, not a balance sheet line, so the entry
 * asks for exactly that: without an accepted debt fact the capability blocks and says so, and no
 * organization allowlist is involved either way.
 */
export function countAcceptedDebtFacts(context: {candidates: readonly {field_path: string; review_state: string; anchor_verified: boolean}[]} | null): number {
  if (!context) return 0;
  return context.candidates.filter((candidate) => candidate.field_path.startsWith("debt.")
    && (candidate.review_state === "accepted" || candidate.review_state === "edited")
    && candidate.anchor_verified).length;
}
