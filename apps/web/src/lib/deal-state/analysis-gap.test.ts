import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {dealStateAnalysisGap, dealStateGapTrigger, rowsAnalysisGap, workbenchAnalysisGap} from "./analysis-gap";
import {resumeDealStateAnalysis} from "./resume-analysis";
import type {DealStateRow, DealStateWorkbench} from "./workbench";

const none = {understandingStatus: null, structureCreatedAt: null, decision: null, productionPlanStatus: null, materialsPresent: false,
  packageReviewStatus: null, matchScreenPresent: false};

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
      production_plan: "structure_confirmed", materials: "production_plan_approved", match_screen: "material_package_approved"});
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

describe("the financier screening of an approved package", () => {
  const confirmedDecision = {status: "confirmed", createdAt: "2026-09-26T11:00:00Z"};
  const approvedPackage = {...none, understandingStatus: "confirmed", structureCreatedAt: "2026-09-26T10:00:00Z", decision: confirmedDecision,
    productionPlanStatus: "approved", materialsPresent: true, packageReviewStatus: "approved"};

  it("is a gap while no screening exists, and only once the package is approved", () => {
    expect(dealStateAnalysisGap(approvedPackage)).toBe("match_screen");
    expect(dealStateAnalysisGap({...approvedPackage, matchScreenPresent: true})).toBeNull();
    expect(dealStateAnalysisGap({...approvedPackage, packageReviewStatus: null})).toBeNull();
    expect(dealStateAnalysisGap({...approvedPackage, packageReviewStatus: "changes_requested"})).toBeNull();
    expect(dealStateGapTrigger.match_screen).toBe("material_package_approved");
  });

  it("is absent while the case analysis runs and once the screening exists", () => {
    const workbench = {understanding: {row: {status: "confirmed"}}, structure: {row: {created_at: "2026-09-26T10:00:00Z"}},
      structureDecision: {status: "confirmed", created_at: "2026-09-26T11:00:00Z"}, productionPlan: {row: {status: "approved"}},
      packageReview: {status: "approved"}, matchScreen: null} as unknown as DealStateWorkbench;
    expect(workbenchAnalysisGap({...workbench, isProcessing: false}, true)).toBe("match_screen");
    expect(workbenchAnalysisGap({...workbench, isProcessing: true}, true)).toBeNull();
    expect(workbenchAnalysisGap({...workbench, isProcessing: false, matchScreen: {row: {}, value: {}}} as unknown as DealStateWorkbench, true)).toBeNull();
  });

  const fingerprint = (character: string) => character.repeat(64);
  const stateRow = (objectType: string, status: string, objectFingerprint: string, payload: unknown, dependencies: unknown[] = []): DealStateRow => ({
    ...row(objectType, status, payload), object_fingerprint: objectFingerprint, dependencies,
  } as unknown as DealStateRow);
  const packageReview = stateRow("package_review", "approved", fingerprint("c"), {approval: {scope: "internal_material_package"}});
  const materialArtifact = stateRow("material_artifact", "pending_confirmation", fingerprint("d"), {});
  const screen = (packageFingerprint: string) => stateRow("match_screen", "pending_confirmation", fingerprint("e"), {
    schemaVersion: "2026.08.29-v3", status: "no_eligible_mandates", packageReviewFingerprint: packageFingerprint,
    materialArtifactFingerprint: fingerprint("d"), materialTruthFingerprint: fingerprint("f"), matchingFingerprint: fingerprint("a"),
    candidates: [], summary: {screened: 0, eligible: 0, possible: 0, excluded: 0, blockedByGovernance: 0}, structuralExclusions: [],
    noContactAuthorized: true,
  }, [{objectType: "package_review", objectFingerprint: packageFingerprint}, {objectType: "material_artifact", objectFingerprint: fingerprint("d")}]);

  it("is read from the stored rows, where only the screening of the current package counts", () => {
    expect(rowsAnalysisGap([materialArtifact, packageReview])).toBe("match_screen");
    expect(rowsAnalysisGap([materialArtifact, packageReview, screen(fingerprint("9"))])).toBe("match_screen");
    expect(rowsAnalysisGap([materialArtifact, packageReview, screen(fingerprint("c"))])).toBeNull();
  });

  it("resumes the analysis from the package approval", async () => {
    const rpc = vi.fn().mockResolvedValue({data: {deduplicated: false, job_status: "queued"}, error: null});
    expect(await resumeDealStateAnalysis({rpc} as never, "org", "session", [understanding, materialArtifact, packageReview])).toBe("resumed");
    expect(rpc).toHaveBeenCalledWith("enqueue_deal_state_analysis", {p_organization_id: "org", p_session_id: "session", p_trigger_source: "material_package_approved"});
  });
});
