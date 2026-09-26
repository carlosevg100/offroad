import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {dealStateAnalysisGap, dealStateGapTrigger, rowsAnalysisGap, workbenchAnalysisGap} from "./analysis-gap";
import {resumeDealStateAnalysis} from "./resume-analysis";
import type {DealStateRow, DealStateWorkbench} from "./workbench";

const none = {understandingStatus: null, structureCreatedAt: null, decision: null, productionPlanStatus: null, materialsPresent: false};

describe("a missing case result is a gap, never work in progress", () => {
  it("names the most advanced decision whose result is missing", () => {
    expect(dealStateAnalysisGap(none)).toBeNull();
    expect(dealStateAnalysisGap({...none, understandingStatus: "pending_confirmation"})).toBeNull();
    expect(dealStateAnalysisGap({...none, understandingStatus: "confirmed"})).toBe("structure");
    expect(dealStateAnalysisGap({...none, understandingStatus: "confirmed", structureCreatedAt: "2026-09-26T10:00:00Z"})).toBeNull();
    const changes = {status: "changes_requested", createdAt: "2026-09-26T11:00:00Z"};
    expect(dealStateAnalysisGap({...none, understandingStatus: "confirmed", structureCreatedAt: "2026-09-26T10:00:00Z", decision: changes})).toBe("structure_revision");
    expect(dealStateAnalysisGap({...none, understandingStatus: "confirmed", structureCreatedAt: "2026-09-26T12:00:00Z", decision: changes})).toBeNull();
    const confirmed = {status: "confirmed", createdAt: "2026-09-26T11:00:00Z"};
    expect(dealStateAnalysisGap({...none, structureCreatedAt: "2026-09-26T10:00:00Z", decision: confirmed})).toBe("production_plan");
    expect(dealStateAnalysisGap({...none, decision: confirmed, productionPlanStatus: "pending_confirmation"})).toBeNull();
    expect(dealStateAnalysisGap({...none, decision: confirmed, productionPlanStatus: "approved"})).toBe("materials");
    expect(dealStateAnalysisGap({...none, decision: confirmed, productionPlanStatus: "approved", materialsPresent: true})).toBeNull();
    expect(dealStateAnalysisGap({...none, decision: {status: "declined", createdAt: "2026-09-26T11:00:00Z"}, structureCreatedAt: "2026-09-26T10:00:00Z"})).toBeNull();
  });

  it("resumes each gap from the decision the analysis starts from", () => {
    expect(dealStateGapTrigger).toEqual({structure: "understanding_confirmed", structure_revision: "structure_changes_requested",
      production_plan: "structure_confirmed", materials: "production_plan_approved"});
  });

  it("shows no gap while the case analysis runs", () => {
    const workbench = {understanding: {row: {status: "confirmed"}}, structure: null, structureDecision: null, productionPlan: null,
      packageReview: null, matchScreen: null} as unknown as DealStateWorkbench;
    expect(workbenchAnalysisGap({...workbench, isProcessing: false}, false)).toBe("structure");
    expect(workbenchAnalysisGap({...workbench, isProcessing: true}, false)).toBeNull();
  });
});

const row = (objectType: string, status: string, payload: unknown = {}): DealStateRow => ({
  id: `${objectType}-1`, organization_id: "org", intake_session_id: "session", object_type: objectType, object_version: 1, status,
  input_fingerprint: "a".repeat(64), object_fingerprint: "b".repeat(64), payload, dependencies: [], created_by: null, created_by_kind: "worker",
  created_at: "2026-09-26T10:00:00Z", updated_at: "2026-09-26T10:00:00Z", superseded_at: null,
} as unknown as DealStateRow);
const understanding = row("understanding_snapshot", "confirmed", {readiness: {state: "ready", score: 1, components: [], blockers: []}, reconciliation: {exceptions: [], gaps: [], questions: []}});

describe("resuming the analysis of a missing result", () => {
  function client(result: {data?: unknown; error?: {code: string; message: string} | null}) {
    const rpc = vi.fn().mockResolvedValue({data: result.data ?? null, error: result.error ?? null});
    return {rpc, supabase: {rpc} as never};
  }

  it("decides the trigger from the stored rows and resumes it", async () => {
    expect(rowsAnalysisGap([understanding])).toBe("structure");
    const {rpc, supabase} = client({data: {deduplicated: false, job_status: "queued"}});
    expect(await resumeDealStateAnalysis(supabase, "org", "session", [understanding])).toBe("resumed");
    expect(rpc).toHaveBeenCalledWith("enqueue_deal_state_analysis", {p_organization_id: "org", p_session_id: "session", p_trigger_source: "understanding_confirmed"});
  });

  it("does not call the database when no result is missing", async () => {
    const {rpc, supabase} = client({});
    expect(await resumeDealStateAnalysis(supabase, "org", "session", [])).toBe("current");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports an analysis that already finished for the decision, and a refusal, without claiming a resume", async () => {
    expect(await resumeDealStateAnalysis(client({data: {deduplicated: true, job_status: "succeeded"}}).supabase, "org", "session", [understanding])).toBe("finished");
    expect(await resumeDealStateAnalysis(client({data: {deduplicated: true, job_status: "leased"}}).supabase, "org", "session", [understanding])).toBe("resumed");
    expect(await resumeDealStateAnalysis(client({error: {code: "55000", message: "deal_state_analysis_already_running"}}).supabase, "org", "session", [understanding])).toBe("resumed");
    expect(await resumeDealStateAnalysis(client({error: {code: "55000", message: "current_deal_state_trigger_required"}}).supabase, "org", "session", [understanding])).toBe("failed");
    expect(await resumeDealStateAnalysis(client({data: {unexpected: true}}).supabase, "org", "session", [understanding])).toBe("failed");
  });
});
