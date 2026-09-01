import {describe, expect, it} from "vitest";
import type {CaseRunReport, CaseStageRecord} from "@offroad/case-runner";
import {caseStageIds} from "@offroad/case-runner";
import {
  compareCaseExecutions,
  decideCapabilityAccreditation,
  decidePromotion,
  evaluateOperatingControls,
  invalidateDependencyGraph,
  summarizeHumanIntervention,
  type CapabilityAccreditation,
  type CaseControlSnapshot,
  type CohortEvidence,
} from "./index";

function report(overrides: Partial<CaseRunReport> = {}, mutate?: (stages: CaseStageRecord[]) => void): CaseRunReport {
  const stages: CaseStageRecord[] = caseStageIds.map((stage) => ({
    stage,
    status: "succeeded",
    output: {stage},
    outputFingerprint: "a".repeat(64),
    usage: {costUsd: 0.1, modelCalls: 1},
    durationMs: 10,
  }));
  mutate?.(stages);
  return {
    schemaVersion: "2026.08.26-v3",
    runId: "run-1",
    caseId: "case-1",
    status: "succeeded",
    startedAt: "2026-08-24T12:00:00.000Z",
    completedAt: "2026-08-24T12:01:00.000Z",
    inputFingerprint: "1".repeat(64),
    stages,
    taskRuns: [],
    usage: {costUsd: 1, modelCalls: 9},
    versions: {runner: "v1"},
    reportFingerprint: "2".repeat(64),
    ...overrides,
  };
}

function cohort(kind: "wave_1" | "wave_2", offset: number): CohortEvidence {
  return {
    cohortId: `${offset === 0 ? "10000000" : "20000000"}-0000-4000-8000-000000000001`,
    kind,
    realCaseIds: Array.from({length: 10}, (_, index) =>
      `${offset === 0 ? "10000000" : "20000000"}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
    completedComparisons: 10,
    criticalRegressions: 0,
    unresolvedWarnings: 0,
    accepted: true,
  };
}

function capability(overrides: Partial<CapabilityAccreditation> = {}): CapabilityAccreditation {
  return {
    scopeId: "debt-advisory:receivables:br",
    stage: "external_release",
    claimedMaturity: "production",
    evidence: {
      procedureVersion: "house-playbook-v2",
      implementationFingerprint: "a".repeat(64),
      ownerId: "credit-governance",
      goldCasesRequired: 12,
      goldCasesPassed: 12,
      adversarialCasesRequired: 8,
      adversarialCasesPassed: 8,
      realCaseIds: Array.from({length: 20}, (_, index) => `real-case-${index + 1}`),
      realCaseEvidenceSource: "controlled_execution_ledger",
      criticalRegressions: 0,
      openCriticalFindings: 0,
      evaluatedAt: "2026-09-01T12:00:00.000Z",
      validThrough: "2027-03-01T12:00:00.000Z",
    },
    ...overrides,
  };
}

function controlSnapshot(): CaseControlSnapshot {
  return {
    snapshotAt: "2026-09-01T12:00:00.000Z",
    mandate: {status: "satisfied", objectiveCaptured: true, decisionContextCaptured: true},
    sources: {status: "satisfied", materialClaims: 10, sourceBoundMaterialClaims: 10, entityPeriodValidMaterialClaims: 10, staleMaterialClaims: 0},
    calculations: {status: "satisfied", criticalCalculations: 8, deterministicCalculations: 8, reconciledCalculations: 8, unresolvedExceptions: 0},
    coverage: {status: "satisfied", requiredItems: 12, coveredItems: 12, materialGaps: 1, gapsWithReasonAndNextAction: 1},
    judgment: {status: "satisfied", maturity: "internal_decision_valid", uncertaintyDisclosed: true, alternativesCompared: true, downsideTested: true},
    artifacts: {status: "satisfied", generatedArtifacts: 3, consistentArtifacts: 3, staleArtifacts: 0, approvedForExternalUse: true},
    market: {status: "satisfied", applicable: true, currentMandates: true, explainableFit: true},
    security: {status: "satisfied", retrievalBounded: true, tenantIsolationVerified: true, providerPolicyEnforced: true, externalToolsAllowlisted: true},
    authority: {status: "satisfied", externalActionRequested: true, exactAuthorizationCaptured: true, authorizedTargetsFingerprint: "b".repeat(64)},
    freshness: {status: "satisfied", transitiveInvalidationEnabled: true, staleDependents: 0},
    economics: {status: "satisfied", costWithinBudget: true, manualMinutes: 4, untrackedManualMinutes: 0, repeatedManualRootCauses: 0},
    outcome: {status: "satisfied", decisionLinked: true, outcomeTaxonomyApplied: true},
  };
}

describe("controlled execution comparison", () => {
  it("passes a byte-stable replay of the same frozen input and versions", () => {
    const baseline = report();
    const result = compareCaseExecutions({mode: "replay", baseline, candidate: report()});
    expect(result).toMatchObject({comparable: true, passed: true, criticalCount: 0});
  });

  it("makes replay output drift critical but keeps shadow phrasing drift visible as a warning", () => {
    const baseline = report();
    const candidate = report({}, (stages) => { stages[6]!.outputFingerprint = "b".repeat(64); });
    expect(compareCaseExecutions({mode: "replay", baseline, candidate})).toMatchObject({passed: false, criticalCount: 1});
    expect(compareCaseExecutions({mode: "shadow", baseline, candidate})).toMatchObject({passed: true, warningCount: 1});
  });

  it("fails closed when the frozen input changes or a stage regresses", () => {
    const baseline = report();
    const candidate = report({inputFingerprint: "3".repeat(64), status: "failed"}, (stages) => {
      stages[2] = {...stages[2]!, status: "failed", failureKind: "contract", code: "invalid_stage_output", output: undefined, outputFingerprint: undefined};
      for (let index = 3; index < stages.length; index += 1) stages[index] = {...stages[index]!, status: "skipped", output: undefined, outputFingerprint: undefined};
    });
    const result = compareCaseExecutions({mode: "shadow", baseline, candidate});
    expect(result.comparable).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.differences.some((entry) => entry.code === "frozen_input_changed")).toBe(true);
    expect(result.criticalCount).toBeGreaterThan(0);
  });
});

describe("rollout promotion", () => {
  it("allows canary only after ten distinct real cases in wave one", () => {
    expect(decidePromotion({from: "shadow", to: "canary", wave1: cohort("wave_1", 0)}).allowed).toBe(true);
    expect(decidePromotion({from: "shadow", to: "canary", wave1: {...cohort("wave_1", 0), realCaseIds: []}}).reasons)
      .toContain("wave_1_requires_exactly_ten_real_cases");
  });

  it("requires a disjoint second wave and explicit approval before active", () => {
    const wave1 = cohort("wave_1", 0);
    const wave2 = cohort("wave_2", 1);
    expect(decidePromotion({from: "canary", to: "active", wave1, wave2, externalReleaseApproved: true, operatingControlsApproved: true}).allowed).toBe(true);
    expect(decidePromotion({from: "canary", to: "active", wave1, wave2}).reasons)
      .toContain("external_release_approval_required");
    expect(decidePromotion({from: "canary", to: "active", wave1, wave2, externalReleaseApproved: true}).reasons)
      .toContain("operating_controls_approval_required");
    expect(decidePromotion({from: "canary", to: "active", wave1, wave2: {...wave2, realCaseIds: wave1.realCaseIds}, externalReleaseApproved: true, operatingControlsApproved: true}).reasons)
      .toContain("cohort_cases_must_not_overlap");
  });

  it("always permits an emergency pause and rejects skipped promotion states", () => {
    expect(decidePromotion({from: "active", to: "paused"}).allowed).toBe(true);
    expect(decidePromotion({from: "off", to: "active", externalReleaseApproved: true}).allowed).toBe(false);
  });
});

describe("capability accreditation and operating controls", () => {
  it("does not call a capability production without procedures, adversarial evidence and twenty distinct real cases", () => {
    const weak = capability({
      evidence: {
        ...capability().evidence,
        procedureVersion: null,
        adversarialCasesPassed: 0,
        realCaseIds: ["case-1", "case-1"],
      },
    });
    const decision = decideCapabilityAccreditation(weak, new Date("2026-09-01T13:00:00.000Z"));
    expect(decision.accredited).toBe(false);
    expect(decision.effectiveMaturity).toBe("unsupported");
    expect(decision.blockers).toEqual(expect.arrayContaining([
      "canonical_procedure_required",
      "adversarial_case_evidence_incomplete",
      "real_case_evidence_contains_duplicates",
      "production_requires_twenty_distinct_real_cases",
    ]));
  });

  it("permits external action only with production competence, consistent artifacts, current market fit and exact authority", () => {
    const accredited = decideCapabilityAccreditation(capability(), new Date("2026-09-01T13:00:00.000Z"));
    const allowed = evaluateOperatingControls({requestedUse: "external_action", snapshot: controlSnapshot(), capability: accredited});
    expect(allowed).toMatchObject({allowed: true, highestAllowedUse: "external_action", blockers: []});

    const unsafe = controlSnapshot();
    unsafe.authority = {...unsafe.authority, exactAuthorizationCaptured: false, authorizedTargetsFingerprint: null};
    unsafe.artifacts = {...unsafe.artifacts, staleArtifacts: 1};
    unsafe.sources = {...unsafe.sources, sourceBoundMaterialClaims: 9};
    const blocked = evaluateOperatingControls({requestedUse: "external_action", snapshot: unsafe, capability: accredited});
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "exact_external_authority_missing",
      "external_artifacts_not_consistent_current_and_approved",
      "material_claims_not_fully_grounded",
    ]));
    expect(blocked.blockers.every((entry) => entry.failureClass === "explosive")).toBe(true);
  });

  it("blocks decision use when critical math, material coverage or judgment is incomplete", () => {
    const recommend = decideCapabilityAccreditation(capability({stage: "recommend", claimedMaturity: "tested"}), new Date("2026-09-01T13:00:00.000Z"));
    const snapshot = controlSnapshot();
    snapshot.calculations = {...snapshot.calculations, deterministicCalculations: 7};
    snapshot.coverage = {...snapshot.coverage, coveredItems: 11};
    snapshot.judgment = {...snapshot.judgment, maturity: "hypothesis"};
    const decision = evaluateOperatingControls({requestedUse: "internal_decision", snapshot, capability: recommend});
    expect(decision.blockers.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "critical_math_not_deterministic_and_reconciled",
      "material_coverage_incomplete",
      "judgment_not_valid_for_internal_decision",
    ]));
  });
});

describe("transitive invalidation", () => {
  it("invalidates every dependent calculation, claim, artifact, approval and lender match after new evidence", () => {
    const result = invalidateDependencyGraph({
      nodes: [
        {id: "itr-2026q2", kind: "source", dependsOn: [], version: "v1"},
        {id: "net-debt", kind: "calculation", dependsOn: ["itr-2026q2"], version: "v1"},
        {id: "debt-capacity", kind: "calculation", dependsOn: ["net-debt"], version: "v1"},
        {id: "structure-claim", kind: "claim", dependsOn: ["debt-capacity"], version: "v1"},
        {id: "term-sheet", kind: "artifact", dependsOn: ["structure-claim"], version: "v1"},
        {id: "client-approval", kind: "approval", dependsOn: ["term-sheet"], version: "v1"},
        {id: "lender-match", kind: "lender_match", dependsOn: ["structure-claim", "client-approval"], version: "v1"},
      ],
      changedNodeIds: ["itr-2026q2"],
    });
    expect(result.invalidatedIds).toEqual([
      "client-approval", "debt-capacity", "itr-2026q2", "lender-match", "net-debt", "structure-claim", "term-sheet",
    ]);
    expect(result.invalidated.find((entry) => entry.nodeId === "lender-match")?.changedRoots).toEqual(["itr-2026q2"]);
  });
});

describe("human intervention economics", () => {
  it("exposes hidden recurring analyst work instead of presenting it as automation", () => {
    const summary = summarizeHumanIntervention({
      events: [
        {caseId: "case-1", taskId: "extract", cause: "model_quality_failure", minutes: 35, captured: false, changedCanonicalState: true, reviewed: false},
        {caseId: "case-2", taskId: "extract", cause: "model_quality_failure", minutes: 30, captured: true, changedCanonicalState: false, reviewed: true},
      ],
      maxMinutesPerCase: 20,
      recurringCauseThreshold: 2,
    });
    expect(summary.falseVictoryRisk).toBe(true);
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "uncaptured_human_intervention_present",
      "manual_minutes_per_case_above_limit",
      "recurring_product_or_quality_work_is_manual",
      "unreviewed_manual_canonical_change",
    ]));
  });
});
