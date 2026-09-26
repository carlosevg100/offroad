import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

import {dealStateGapTrigger, rowsAnalysisGap} from "./analysis-gap";
import type {DealStateRow} from "./workbench";

/**
 * `resumed`: the analysis of the decision is queued or already running; `awaiting_approval`: an
 * analysis of the case is held until a person approves its execution brief, so nothing starts
 * before that approval; `finished`: it already ran for this decision and nothing new is queued;
 * `current`: no result is missing; `failed`: the database refused or could not be read.
 */
export type ResumeAnalysisOutcome = "resumed" | "awaiting_approval" | "finished" | "current" | "failed";

/**
 * What a call to `enqueue_deal_state_analysis` left. `queued`: a machine takes the analysis;
 * `held`: the analysis of this decision waits for a person to approve its execution brief, which
 * is the first state of every case analysis of a project; `finished`: the decision already has a
 * finished analysis, replayed; `held_by_other`: the analysis of another decision is held, and this
 * one is refused until that approval; `running`: another analysis is queued or leased; `failed`:
 * any other refusal or an unreadable answer.
 */
export type DealStateQueueOutcome = "queued" | "held" | "finished" | "held_by_other" | "running" | "failed";

const enqueueResultSchema = z.object({deduplicated: z.boolean(), job_status: z.string()});

export function dealStateQueueOutcome(data: unknown, error: {code?: string; message?: string} | null): DealStateQueueOutcome {
  if (error) {
    if (error.code !== "55000") return "failed";
    if (error.message?.includes("deal_state_analysis_awaiting_approval")) return "held_by_other";
    return error.message?.includes("deal_state_analysis_already_running") ? "running" : "failed";
  }
  const result = enqueueResultSchema.safeParse(data);
  if (!result.success) return "failed";
  if (result.data.job_status === "awaiting_approval") return "held";
  return result.data.deduplicated && result.data.job_status === "succeeded" ? "finished" : "queued";
}

/**
 * Resumes the case analysis of the decision whose result is missing. The gap, and so the trigger,
 * is decided here from the stored rows, never from the form. `enqueue_deal_state_analysis` checks
 * the decision again, never duplicates held, queued, leased or finished work for the same
 * decision, refuses another decision while one is held or running, and retries only a failed one.
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
  const outcome = dealStateQueueOutcome(data, error);
  if (outcome === "held" || outcome === "held_by_other") return "awaiting_approval";
  if (outcome === "finished" || outcome === "failed") return outcome;
  return "resumed";
}
