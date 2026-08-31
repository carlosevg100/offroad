import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";
import {createQueueClient, type CaseAnalysisJob} from "./queue";

const job: CaseAnalysisJob = {
  claimed: true,
  kind: "case_analysis",
  job_id: "10000000-0000-4000-8000-000000000001",
  capability_token: "capability-token-with-at-least-32-characters",
  lease_expires_at: "2026-08-29T18:00:00.000Z",
  attempt: 1,
  organization_id: "20000000-0000-4000-8000-000000000001",
  intake_session_id: "30000000-0000-4000-8000-000000000001",
  processing_run_id: "40000000-0000-4000-8000-000000000001",
  payload: {execution_mode: "primary", analysis_scope: "full_case"},
};

describe("case input loading", () => {
  it("freezes live case data before attaching the prior report cache", async () => {
    const prior = {schemaVersion: "2026.08.29-v4", reportFingerprint: "prior"};
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "worker_load_case_input") return {data: {session: {id: "case"}}, error: null};
      if (name === "worker_load_claim_decisions") return {data: [{id: "decision"}], error: null};
      if (name === "worker_freeze_case_input") {
        const liveInput = args.p_live_input as Record<string, unknown>;
        expect(liveInput).toEqual({session: {id: "case"}, claim_decisions: [{id: "decision"}]});
        expect(liveInput).not.toHaveProperty("prior_case_report");
        return {data: {...liveInput, _execution: {id: "execution"}}, error: null};
      }
      if (name === "worker_load_prior_case_report") return {data: prior, error: null};
      throw new Error(`unexpected RPC ${name}`);
    });
    const supabase = {rpc} as unknown as SupabaseClient;

    const result = await createQueueClient(supabase, {workerToken: "worker", leaseSeconds: 60}).loadCaseInput(job);

    expect(result).toMatchObject({
      session: {id: "case"},
      prior_case_report: prior,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "worker_load_case_input",
      "worker_load_claim_decisions",
      "worker_freeze_case_input",
      "worker_load_prior_case_report",
    ]);
  });
});
