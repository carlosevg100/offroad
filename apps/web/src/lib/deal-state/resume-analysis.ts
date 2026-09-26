import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

import {dealStateGapTrigger, rowsAnalysisGap} from "./analysis-gap";
import type {DealStateRow} from "./workbench";

/**
 * `resumed`: the analysis of the decision is queued or already running; `finished`: it already
 * ran for this decision and nothing new is queued; `current`: no result is missing; `failed`: the
 * database refused or could not be read.
 */
export type ResumeAnalysisOutcome = "resumed" | "finished" | "current" | "failed";

const enqueueResultSchema = z.object({deduplicated: z.boolean(), job_status: z.string()});

/**
 * Resumes the case analysis of the decision whose result is missing. The gap, and so the trigger,
 * is decided here from the stored rows, never from the form. `enqueue_deal_state_analysis` checks
 * the decision again, never duplicates queued, leased or finished work for the same decision and
 * retries only a failed one.
 */
export async function resumeDealStateAnalysis(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
  rows: readonly DealStateRow[],
): Promise<ResumeAnalysisOutcome> {
  const gap = rowsAnalysisGap(rows);
  if (!gap) return "current";
  const {data, error} = await supabase.rpc("enqueue_deal_state_analysis", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_trigger_source: dealStateGapTrigger[gap],
  });
  if (error) return error.code === "55000" && error.message.includes("deal_state_analysis_already_running") ? "resumed" : "failed";
  const result = enqueueResultSchema.safeParse(data);
  if (!result.success) return "failed";
  return result.data.deduplicated && result.data.job_status === "succeeded" ? "finished" : "resumed";
}
