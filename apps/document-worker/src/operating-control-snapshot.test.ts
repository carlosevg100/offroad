import type {CaseEngineState} from "@offroad/case-engine";
import {evaluateOperatingControls} from "@offroad/release-governance";
import {describe, expect, it, vi} from "vitest";

import {loadCaseWorkFreshness} from "./case-analysis";
import {buildCaseOperatingControlSnapshot} from "./operating-control-snapshot";
import {caseAnalysisJobSchema, workFreshnessSchema} from "./queue";

function provenState(): CaseEngineState {
  return {
    claimRegistry: {
      claims: [{material: true, supportIds: ["financials.revenue"], status: "verified"}],
    },
    reconciliation: {
      facts: [{disputed: false, key: {fieldPath: "financials.revenue"}}],
      calculations: [{id: "net_debt", inputs: ["financials.revenue"]}],
      exceptions: [],
      gaps: [],
    },
    readiness: {components: [{id: "data_sufficiency"}], blockers: []},
    structureAlternatives: {
      alternatives: [
        {assumptions: ["subject to lender diligence"], missingInputs: []},
        {assumptions: ["subject to final documentation"], missingInputs: []},
      ],
    },
    structureDecision: {status: "confirmed"},
    stress: [{scenario: "downside"}],
    materialTruth: {
      artifacts: [{
        templateCurrent: true,
        templateSectionsComplete: true,
        conductStatus: "pass",
        unsupportedMaterialClaims: [],
        bilingualComplete: true,
      }],
      releaseDecision: "ready_for_authorization",
    },
    matching: {screened: false, marketTruth: {status: "partial", shortlist: []}},
  } as unknown as CaseEngineState;
}

describe("case operating-control snapshot", () => {
  it("compiles proof-bearing internal controls without treating external authority as implicit", () => {
    const snapshot = buildCaseOperatingControlSnapshot({
      state: provenState(),
      session: {capital_objective: "Refinance", company_profile: {name: "Example"}},
      snapshotAt: "2026-09-01T15:00:00.000Z",
      costUsd: 0.2,
      maxCostUsd: 0.5,
      security: {providerPolicyEnforced: true, externalToolsAllowlisted: true},
      freshness: {staleDependents: 0},
    });

    expect(snapshot.mandate.status).toBe("satisfied");
    expect(snapshot.freshness).toEqual({status: "satisfied", transitiveInvalidationEnabled: true, staleDependents: 0});
    expect(snapshot.sources).toMatchObject({status: "satisfied", materialClaims: 1, staleMaterialClaims: 0});
    expect(snapshot.calculations.status).toBe("satisfied");
    expect(snapshot.judgment).toMatchObject({status: "satisfied", maturity: "internal_decision_valid"});
    expect(snapshot.security.status).toBe("satisfied");
    expect(snapshot.authority).toMatchObject({status: "not_applicable", externalActionRequested: false});
  });

  it("fails closed when provider policy, budget evidence or reconciled math is absent", () => {
    const state = provenState();
    state.reconciliation.facts[0]!.disputed = true;
    const snapshot = buildCaseOperatingControlSnapshot({
      state,
      session: {},
      snapshotAt: "2026-09-01T15:00:00.000Z",
      costUsd: 0.2,
      maxCostUsd: null,
      security: {providerPolicyEnforced: false, externalToolsAllowlisted: true},
      freshness: {staleDependents: 0},
    });

    expect(snapshot.mandate.status).toBe("failed");
    expect(snapshot.calculations).toMatchObject({status: "failed", reconciledCalculations: 0});
    expect(snapshot.security.status).toBe("failed");
    expect(snapshot.economics).toMatchObject({status: "failed", costWithinBudget: false});
  });
});

describe("freshness from the recorded facts (stage 18, increment 5A)", () => {
  const base = {
    session: {capital_objective: "Refinance", company_profile: {name: "Example"}},
    snapshotAt: "2026-09-01T15:00:00.000Z",
    costUsd: 0.2,
    maxCostUsd: 0.5,
    security: {providerPolicyEnforced: true, externalToolsAllowlisted: true},
  };
  const capability = {
    accredited: true, scopeId: "case-analysis:test", stage: "analyze" as const, claimedMaturity: "tested" as const,
    effectiveMaturity: "tested" as const, blockers: [], evidenceFingerprint: "c".repeat(64),
  };

  it("reports the stale dependents the database counted and the gate keeps blocking on them", () => {
    const snapshot = buildCaseOperatingControlSnapshot({...base, state: provenState(), freshness: {staleDependents: 2}});
    expect(snapshot.freshness).toEqual({status: "failed", transitiveInvalidationEnabled: true, staleDependents: 2});
    const blocked = evaluateOperatingControls({requestedUse: "preliminary", snapshot, capability});
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers).toContainEqual({code: "stale_or_non_invalidated_state", failureClass: "explosive"});

    const fresh = buildCaseOperatingControlSnapshot({...base, state: provenState(), freshness: {staleDependents: 0}});
    expect(evaluateOperatingControls({requestedUse: "preliminary", snapshot: fresh, capability}).blockers)
      .not.toContainEqual({code: "stale_or_non_invalidated_state", failureClass: "explosive"});
  });

  it("fails closed when the count was not read, instead of declaring zero", () => {
    for (const freshness of [null, {staleDependents: -1}, {staleDependents: 1.5}]) {
      const snapshot = buildCaseOperatingControlSnapshot({...base, state: provenState(), freshness});
      expect(snapshot.freshness).toEqual({status: "failed", transitiveInvalidationEnabled: false, staleDependents: 0});
      expect(evaluateOperatingControls({requestedUse: "preliminary", snapshot, capability}).blockers)
        .toContainEqual({code: "stale_or_non_invalidated_state", failureClass: "explosive"});
    }
  });

  it("reads the count through the case job and returns null when it cannot", async () => {
    const job = caseAnalysisJobSchema.parse({
      claimed: true, job_id: "80000000-0000-4000-8000-000000000501", capability_token: "x".repeat(64),
      lease_expires_at: "2026-09-26T12:00:00Z", attempt: 1, kind: "case_analysis",
      organization_id: "20000000-0000-4000-8000-000000000501", intake_session_id: "40000000-0000-4000-8000-000000000501",
      processing_run_id: "70000000-0000-4000-8000-000000000501", payload: {},
    });
    const log = vi.fn();
    const counted = workFreshnessSchema.parse({schemaVersion: "work-freshness.v1", workId: "30000000-0000-4000-8000-000000000501",
      staleDependents: 3, staleExecutions: 1, staleInstitutionalResults: 2});
    const reader = vi.fn(async () => counted);
    await expect(loadCaseWorkFreshness(job, {loadWorkFreshness: reader}, log)).resolves.toEqual({staleDependents: 3});
    expect(reader).toHaveBeenCalledWith(job);
    await expect(loadCaseWorkFreshness(job, {}, log)).resolves.toBeNull();
    await expect(loadCaseWorkFreshness(job, {loadWorkFreshness: async () => { throw new Error("function public.worker_load_work_freshness_v1 does not exist"); }}, log))
      .resolves.toBeNull();
    expect(log).toHaveBeenCalledWith("case_analysis.work_freshness_unavailable", expect.objectContaining({job: job.job_id}));
  });

  it("accepts only a consistent work-freshness.v1 body", () => {
    const body = {schemaVersion: "work-freshness.v1", workId: null, staleDependents: 0, staleExecutions: 0, staleInstitutionalResults: 0};
    expect(workFreshnessSchema.parse(body)).toEqual(body);
    expect(workFreshnessSchema.safeParse({...body, staleDependents: 1}).success).toBe(false);
    expect(workFreshnessSchema.safeParse({...body, schemaVersion: "work-freshness.v2"}).success).toBe(false);
    expect(workFreshnessSchema.safeParse({...body, extra: true}).success).toBe(false);
  });
});
