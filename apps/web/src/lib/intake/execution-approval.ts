import type {SupabaseClient} from "@supabase/supabase-js";
import {visibleExecutionBriefSchema, type VisibleExecutionBrief} from "@offroad/work-plan";
import {projectExecutionBriefApproval} from "@/lib/advisor/execution-brief-approval";
import type {Database} from "@/types/database";
import type {IntakeSession} from "./types";

export type IntakeExecutionApprovalState = {
  projectId: string;
  blockReview: boolean;
  active: boolean;
  pending: boolean;
  planning: boolean;
  brief: {id: string; version: number; value: VisibleExecutionBrief; approval: ReturnType<typeof projectExecutionBriefApproval>} | null;
};

export async function loadIntakeExecutionApproval(supabase: SupabaseClient<Database>, session: IntakeSession): Promise<IntakeExecutionApprovalState | null> {
  if (!session.capital_project_id) return null;
  const {data: jobs, error} = await supabase.from("processing_jobs").select("id,kind,status,processing_run_id")
    .eq("organization_id", session.organization_id).eq("intake_session_id", session.id)
    .in("kind", ["case_analysis", "capital_project_analysis", "execution_brief_proposal"]);
  // The explicitly isolated fixture path has no substantive worker history. Once a worker
  // has run, an empty conversational current run can never restore that fallback privilege.
  if (!error && jobs && !jobs.some((job) => job.kind !== "execution_brief_proposal")) return null;
  const active = (jobs ?? []).filter((job) => job.processing_run_id === session.current_run_id && ["queued", "leased"].includes(job.status));
  const state: IntakeExecutionApprovalState = {
    projectId: session.capital_project_id, blockReview: true,
    pending: Boolean(error) || jobs === null || active.length > 0,
    active: active.length > 0,
    planning: active.some((job) => job.kind === "execution_brief_proposal"), brief: null,
  };
  if (error || !jobs) return state;
  const {data: brief} = await supabase.from("capital_project_execution_briefs").select("id,brief_version,visible_snapshot")
    .eq("organization_id", session.organization_id).eq("capital_project_id", session.capital_project_id).order("brief_version", {ascending: false}).limit(1).maybeSingle();
  const parsed = visibleExecutionBriefSchema.safeParse(brief?.visible_snapshot);
  if (!brief || !parsed.success) return state;
  const {data: approval} = await supabase.rpc("read_advisor_execution_brief_approval_v1", {p_project_id: session.capital_project_id, p_execution_brief_id: brief.id});
  const jobId = approval && typeof approval === "object" && !Array.isArray(approval) ? approval.processing_job_id : null;
  const target = jobs.find((job) => job.id === jobId && job.kind !== "execution_brief_proposal");
  if (!target) return state;
  if (jobs.some((job) => job.kind !== "execution_brief_proposal" && job.id !== target.id
    && job.processing_run_id === session.current_run_id && job.status !== "succeeded")) return state;
  const projected = projectExecutionBriefApproval(approval, {id: brief.id, version: brief.brief_version, fingerprint: parsed.data.fingerprint});
  // The canonical RPC verifies the latest brief and current material input fingerprint.
  // A valid completed dispatch survives harmless chat; obsolete held jobs do not override it.
  if (projected.status === "approved" && target.status === "succeeded") return null;
  state.brief = {id: brief.id, version: brief.brief_version, value: parsed.data, approval: projected};
  state.pending ||= projected.status === "awaiting";
  return state;
}
