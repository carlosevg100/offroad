import {describe, expect, it} from "vitest";

import {
  companyDebtDiagnosticSchema,
  dealWorkflowAllows,
  deriveDealWorkflowState,
  initialDealWorkflowState,
  originationMeetingBriefSchema,
  scenarioTermsSchema,
  taskEnvelopeSchema,
  type DealStateObject,
} from "./index";

describe("domain contracts", () => {
  it("rejects a task without a tenant boundary", () => {
    expect(() => taskEnvelopeSchema.parse({taskId: crypto.randomUUID()})).toThrow();
  });

  it("rejects floating or malformed economic inputs", () => {
    expect(() => scenarioTermsSchema.parse({amount: 10.5})).toThrow();
  });

  it("requires public citations and decision-changing questions in an origination brief", () => {
    expect(originationMeetingBriefSchema.safeParse({
      executiveRead: "x".repeat(80),
      companySnapshot: "x".repeat(60),
      debtLensSignals: [{finding: "x".repeat(30), relevance: "x".repeat(30), sourceUrls: [], confidence: "medium"}],
      financingAngles: [],
      meetingQuestions: [],
      unknowns: ["Open item"],
      suggestedOpening: "x".repeat(40),
    }).success).toBe(false);
  });

  it("keeps a public debt diagnostic from claiming calculated capacity", () => {
    const base = {
      executiveRead: "x".repeat(80), companySnapshot: "x".repeat(60),
      evidenceCoverage: {publicDataQuality: "limited", whatCanBeAssessed: [], criticalMissingInputs: ["Complete financial statements"]},
      businessRiskProfile: {businessModel: "x".repeat(40), cashFlowDrivers: ["Revenue recurrence"], sensitivities: ["Demand volatility"], sourceUrls: ["https://example.com"]},
      financialSignals: [], debtAndLiquiditySignals: [], workingCapitalSignals: [], risks: [],
      capacityAssessment: {status: "not_computable", conclusion: "x".repeat(40), bindingUnknowns: ["Debt schedule unavailable"], requiredInputs: ["Audited financial statements"]},
      diagnosticHypotheses: [],
      informationRequests: [{request: "Debt schedule", whyItMatters: "x".repeat(20), decisionImpact: "x".repeat(20), acceptableEvidence: ["Spreadsheet"]}],
      questions: Array.from({length: 3}, (_, index) => ({question: `Question ${index} ${"x".repeat(10)}`, whyItMatters: "x".repeat(20), answerChanges: "x".repeat(20)})),
      unknowns: ["Current debt maturity profile"],
    };
    expect(companyDebtDiagnosticSchema.safeParse(base).success).toBe(true);
    expect(companyDebtDiagnosticSchema.safeParse({...base, capacityAssessment: {...base.capacityAssessment, status: "supported"}}).success).toBe(false);
  });

  it("keeps an unconfirmed case in diagnosis and blocks paid downstream work", () => {
    const state = deriveDealWorkflowState([]);
    expect(state).toEqual(initialDealWorkflowState);
    expect(dealWorkflowAllows(state, "prepare")).toBe(false);
    expect(dealWorkflowAllows(state, "match")).toBe(false);
  });

  it("unlocks prepare only after a decision on the exact current structure option", () => {
    const understanding = object("understanding_snapshot", "confirmed", 1, "a");
    const structureOption = object("structure_option", "pending_confirmation", 1, "c", [
      dependency(understanding),
    ]);
    const structureDecision = object("structure_decision", "confirmed", 1, "d", [
      dependency(structureOption),
    ]);
    const objects = [
      understanding,
      structureOption,
      structureDecision,
    ];
    const state = deriveDealWorkflowState(objects);
    expect(state.stage).toBe("prepare");
    expect(state.gates.structureOptionCurrent).toBe(true);
    expect(state.gates.structureConfirmed).toBe(true);
    expect(state.gates.productionPlanApproved).toBe(false);
    expect(dealWorkflowAllows(state, "prepare")).toBe(true);
    expect(dealWorkflowAllows(state, "match")).toBe(false);
  });

  it("does not resurrect an older confirmation after a terminal latest version", () => {
    const state = deriveDealWorkflowState([
      object("understanding_snapshot", "confirmed", 1, "a"),
      object("understanding_snapshot", "stale", 2, "c"),
    ]);
    expect(state.stage).toBe("diagnose");
    expect(state.gates.understandingConfirmed).toBe(false);
    expect(state.objectFingerprints.understanding_snapshot).toBeUndefined();
  });

  it("keeps changes requested and declined structures outside the prepare gate", () => {
    for (const status of ["changes_requested", "declined"] as const) {
      const understanding = object("understanding_snapshot", "confirmed", 1, "a");
      const structureOption = object("structure_option", "pending_confirmation", 1, "c", [dependency(understanding)]);
      const decision = object("structure_decision", status, 1, "d", [dependency(structureOption)]);
      const state = deriveDealWorkflowState([understanding, structureOption, decision]);
      expect(state.stage).toBe("structure");
      expect(state.gates.structureConfirmed).toBe(false);
    }
  });

  it("unlocks matching only after review of the exact compiled material artifact", () => {
    const understanding = object("understanding_snapshot", "confirmed", 1, "a");
    const structureOption = object("structure_option", "pending_confirmation", 1, "b", [dependency(understanding)]);
    const structureDecision = object("structure_decision", "confirmed", 1, "c", [dependency(structureOption)]);
    const productionPlan = object("production_plan", "approved", 1, "d", [dependency(structureDecision)]);
    const materialArtifact = object("material_artifact", "pending_confirmation", 1, "e", [dependency(productionPlan)]);
    const incompleteReview = object("package_review", "approved", 1, "f", [dependency(productionPlan)]);
    expect(deriveDealWorkflowState([
      understanding, structureOption, structureDecision, productionPlan, materialArtifact, incompleteReview,
    ]).gates.packageApproved).toBe(false);

    const exactReview = object("package_review", "approved", 2, "1", [dependency(productionPlan), dependency(materialArtifact)]);
    const state = deriveDealWorkflowState([
      understanding, structureOption, structureDecision, productionPlan, materialArtifact, incompleteReview, exactReview,
    ]);
    expect(state.gates.packageApproved).toBe(true);
    expect(state.stage).toBe("match");
  });

  it("separates shortlist approval from authorization to contact the market", () => {
    const understanding = object("understanding_snapshot", "confirmed", 1, "a");
    const structureOption = object("structure_option", "pending_confirmation", 1, "b", [dependency(understanding)]);
    const structureDecision = object("structure_decision", "confirmed", 1, "c", [dependency(structureOption)]);
    const productionPlan = object("production_plan", "approved", 1, "d", [dependency(structureDecision)]);
    const materialArtifact = object("material_artifact", "pending_confirmation", 1, "e", [dependency(productionPlan)]);
    const packageReview = object("package_review", "approved", 1, "f", [dependency(productionPlan), dependency(materialArtifact)]);
    const matchScreen = object("match_screen", "approved", 1, "1", [dependency(packageReview), dependency(materialArtifact)]);

    const matched = deriveDealWorkflowState([
      understanding, structureOption, structureDecision, productionPlan, materialArtifact, packageReview, matchScreen,
    ]);
    expect(matched.stage).toBe("match");
    expect(matched.gates.matchApproved).toBe(true);
    expect(matched.gates.releaseAuthorized).toBe(false);

    const staleRelease = object("release_authorization", "approved", 1, "2", [dependency(packageReview)]);
    expect(deriveDealWorkflowState([
      understanding, structureOption, structureDecision, productionPlan, materialArtifact,
      packageReview, matchScreen, staleRelease,
    ]).gates.releaseAuthorized).toBe(false);

    const exactRelease = object("release_authorization", "approved", 2, "3", [dependency(matchScreen)]);
    const released = deriveDealWorkflowState([
      understanding, structureOption, structureDecision, productionPlan, materialArtifact,
      packageReview, matchScreen, staleRelease, exactRelease,
    ]);
    expect(released.gates.releaseAuthorized).toBe(true);
    expect(released.stage).toBe("introduce");
  });
});

function object(
  objectType: DealStateObject["objectType"],
  status: DealStateObject["status"],
  objectVersion: number,
  fingerprintSeed = "a",
  dependencies: DealStateObject["dependencies"] = [],
): DealStateObject {
  return {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    intakeSessionId: crypto.randomUUID(),
    objectType,
    objectVersion,
    status,
    inputFingerprint: "b".repeat(64),
    objectFingerprint: fingerprintSeed.repeat(64),
    payload: {},
    dependencies,
    createdBy: crypto.randomUUID(),
    createdAt: "2026-08-29T12:00:00.000Z",
    supersededAt: null,
  };
}

function dependency(value: DealStateObject): DealStateObject["dependencies"][number] {
  return {objectType: value.objectType, objectFingerprint: value.objectFingerprint};
}
