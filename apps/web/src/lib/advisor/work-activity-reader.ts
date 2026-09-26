import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

import {liveJobStatuses, workActivity, type WorkActivity} from "./work-activity";

/**
 * Reads what is in progress for a work under the person's own authority (every table read here is
 * readable by whoever reads the work). The scope is the work, its intake session, or both: jobs of
 * an intake session carry the work once the session belongs to one, and older jobs only the session.
 * Waits, update requests and recompute candidates exist only for a work.
 *
 * Read the activity before the results it would produce: a completion between the two reads then
 * costs one extra refresh, and can never leave a missing result without its refresh. A failed read
 * throws; activity is never guessed.
 */
export async function loadWorkActivity(
  supabase: SupabaseClient<Database>,
  scope: {organizationId: string; workId: string | null; sessionId: string | null},
): Promise<WorkActivity> {
  const workId = scope.workId === null ? null : z.uuid().parse(scope.workId);
  const sessionId = scope.sessionId === null ? null : z.uuid().parse(scope.sessionId);
  if (!workId && !sessionId) throw new Error("work_activity_scope_required");
  let jobs = supabase.from("processing_jobs")
    .select("id, kind, status, execution_id, message_id:payload->>message_id, recompute_candidate_id:payload->>institutional_recompute_candidate_id")
    .eq("organization_id", scope.organizationId)
    .in("status", [...liveJobStatuses]);
  jobs = workId && sessionId ? jobs.or(`work_id.eq.${workId},intake_session_id.eq.${sessionId}`)
    : workId ? jobs.eq("work_id", workId) : jobs.eq("intake_session_id", sessionId!);
  const none = Promise.resolve({data: [], error: null});
  const [jobRows, milestones, requests, recomputeCandidates, institutionalCandidates] = await Promise.all([
    jobs.order("created_at").limit(200),
    workId ? supabase.from("work_milestones")
      .select("id, kind, subject_kind, subject_id, label, resolves_milestone_id, supersedes_milestone_id, occurred_at")
      .eq("organization_id", scope.organizationId).eq("work_id", workId).in("kind", ["awaiting_human", "human_resolved"])
      .order("occurred_at").limit(500) : none,
    workId ? supabase.from("work_continuation_requests").select("id, status")
      .eq("organization_id", scope.organizationId).eq("work_id", workId).eq("status", "scheduled").limit(50) : none,
    workId ? supabase.from("work_recompute_candidates").select("id, state, execution_id")
      .eq("organization_id", scope.organizationId).eq("work_id", workId).in("state", ["scheduled", "awaiting_authorization"]).limit(200) : none,
    workId ? supabase.from("institutional_recompute_candidates").select("id, state, result_id")
      .eq("organization_id", scope.organizationId).eq("work_id", workId).eq("state", "scheduled").limit(50) : none,
  ]);
  for (const read of [jobRows, milestones, requests, recomputeCandidates, institutionalCandidates]) {
    if (read.error) throw new Error("work_activity_unavailable");
  }
  return workActivity({
    jobs: jobRows.data ?? [],
    milestones: milestones.data ?? [],
    requests: requests.data ?? [],
    recomputeCandidates: recomputeCandidates.data ?? [],
    institutionalCandidates: institutionalCandidates.data ?? [],
  });
}
