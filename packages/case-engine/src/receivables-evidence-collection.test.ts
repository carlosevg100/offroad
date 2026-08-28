import {
  receivablesEvidenceCollectionDefinitions,
  receivablesFactResolutionDefinitions,
  receivablesRouteDefinitions,
} from "@offroad/credit-playbook";
import {
  resolveReceivablesProviderMandate,
  type ReceivablesMandateObservation,
  type ReceivablesProviderMandate,
} from "@offroad/fund-mandate";
import type {AssertionProvenance} from "@offroad/financial-core";
import {
  resolveReceivablesContractFacts,
  type ReceivablesEligibilityFact,
  type ReceivablesFactObservation,
  type ReceivablesPhaseTwoReport,
} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {
  buildReceivablesMandateCollectionPlan,
  buildReceivablesOperationCollectionPlan,
} from "./receivables-evidence-collection";

const measured: AssertionProvenance = {
  kind: "measured",
  datasetHash: "a".repeat(64),
  anchors: [{kind: "file", fileId: "registry", fileHash: "b".repeat(64)}],
  universe: "portfolio-1",
  reportingDate: "2026-08-27",
  inclusions: ["observed scope"],
  exclusions: [],
  formula: {id: "evidence_collection_gold", version: "1"},
};

function observation(overrides: Partial<ReceivablesFactObservation> = {}): ReceivablesFactObservation {
  return {
    id: "obs-1",
    factId: "claim_existence_evidenced",
    state: "true",
    scope: {kind: "portfolio"},
    coverage: {status: "complete", coveredCount: 10, totalCount: 10},
    observedAt: "2026-08-27",
    sourceId: "source-1",
    sourceLabel: "Base entregue",
    sourceOwner: "Mesa Offroad",
    explanation: "O fato está documentado.",
    provenance: measured,
    ...overrides,
  };
}

function phaseTwo(facts: readonly ReceivablesEligibilityFact[]): ReceivablesPhaseTwoReport {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  return {
    version: "2026.08.27-v1",
    analysisLayer: "deterministic_route_eligibility",
    phaseOne: {version: "phase-one", status: "complete_for_phase_one"},
    universe: {id: "portfolio-1", datasetHash: "a".repeat(64), reportingDate: "2026-08-27"},
    routes: receivablesRouteDefinitions.map((route) => ({
      routeId: route.id,
      label: route.label,
      mechanism: route.mechanism,
      status: "not_evaluated" as const,
      capitalProviderTypes: route.capitalProviderTypes,
      serviceProviderTypes: route.serviceProviderTypes,
      criterionResults: route.criteria.map((criterion) => ({
        criterionId: criterion.id,
        factId: criterion.factId,
        severity: criterion.severity,
        status: byId.get(criterion.factId)?.state === criterion.expected ? "pass" as const : "not_evaluated" as const,
        reason: "synthetic",
      })),
      portfolioAllocation: null,
      deskCharacteristics: {...route.deskCharacteristics, decisionUseAllowed: false as const},
    })),
    providerUniverse: [],
    quality: {status: "incomplete", blockers: [], warnings: []},
    boundaries: {buyerMandateMatched: false, providerRecommendationAllowed: false, externalDirectionAllowed: false, qualifiedIntroductionAllowed: false, creditApprovalExpressed: false},
  };
}

function operationPlan(observations: readonly ReceivablesFactObservation[]) {
  const resolution = resolveReceivablesContractFacts({
    asOf: "2026-08-28",
    definitions: receivablesFactResolutionDefinitions,
    observations,
  });
  return buildReceivablesOperationCollectionPlan({
    asOf: "2026-08-28",
    definitions: receivablesEvidenceCollectionDefinitions,
    resolutionDefinitions: receivablesFactResolutionDefinitions,
    facts: resolution.facts,
    observations,
    factResolution: resolution,
    phaseTwoA: phaseTwo(resolution.facts),
  });
}

describe("receivables evidence collection", () => {
  it("keeps the current request batch short and never treats an attestation as proof", () => {
    const plan = operationPlan([]);
    expect(plan.currentBatch).toHaveLength(5);
    expect(plan.backlog.length).toBeGreaterThan(0);
    expect(plan.summary.factsOpen).toBe(receivablesEvidenceCollectionDefinitions.length);
    expect(plan.currentBatch.every((task) => task.attestationAloneCanComplete === false)).toBe(true);
    expect(plan.boundaries).toMatchObject({manualAttestationDecidesRouteFacts: false, externalVerificationExecuted: false, externalContactAllowed: false});
  });

  it("asks only for remaining coverage after a favourable sample", () => {
    const plan = operationPlan([observation({coverage: {status: "partial", coveredCount: 60, totalCount: 500}})]);
    const task = [...plan.currentBatch, ...plan.backlog].find((candidate) => candidate.factIds.includes("claim_existence_evidenced"));
    expect(task).toMatchObject({action: "complete_remaining_coverage"});
    expect(task?.evidenceAlreadySeen).toEqual([expect.objectContaining({coverage: {status: "partial", coveredCount: 60, totalCount: 500}})]);
  });

  it("turns a confirmed prior lien into a critical segregation or release task", () => {
    const plan = operationPlan([observation({
      factId: "unresolved_prior_assignment_or_lien",
      state: "true",
      scope: {kind: "title", id: "title-1"},
      coverage: {status: "partial", coveredCount: 1, totalCount: 500},
      explanation: "Um título possui cessão anterior não resolvida.",
    })]);
    expect(plan.currentBatch[0]).toMatchObject({
      action: "resolve_or_segregate_adverse_finding",
      priority: "critical",
      factIds: ["unresolved_prior_assignment_or_lien"],
    });
  });

  it("removes a fact from the plan only after complete decision-grade evidence", () => {
    const plan = operationPlan([observation()]);
    expect(plan.completedFactIds).toContain("claim_existence_evidenced");
    expect([...plan.currentBatch, ...plan.backlog].flatMap((task) => task.factIds)).not.toContain("claim_existence_evidenced");
  });

  it("does not accept a pre-resolved safe boolean without provenance", () => {
    const facts: ReceivablesEligibilityFact[] = [{id: "claim_existence_evidenced", state: "true", explanation: "Declarado sem fonte."}];
    const plan = buildReceivablesOperationCollectionPlan({
      asOf: "2026-08-28",
      definitions: receivablesEvidenceCollectionDefinitions,
      resolutionDefinitions: receivablesFactResolutionDefinitions,
      facts,
      factResolution: null,
      phaseTwoA: phaseTwo(facts),
    });
    expect(plan.completedFactIds).not.toContain("claim_existence_evidenced");
    expect([...plan.currentBatch, ...plan.backlog].flatMap((task) => task.factIds)).toContain("claim_existence_evidenced");
  });

  it("requires reconciliation when current material sources disagree", () => {
    const plan = operationPlan([observation(), observation({id: "obs-2", state: "false", explanation: "A segunda fonte diverge."})]);
    expect(plan.currentBatch[0]).toMatchObject({action: "reconcile_conflicting_evidence", priority: "critical"});
  });
});

const policy = <T>(value: T, sourceKind: ReceivablesMandateObservation<T>["sourceKind"] = "direct_declaration", sourceId = "source-1"): ReceivablesMandateObservation<T> => ({
  value,
  sourceKind,
  sourceId,
  sourceLabel: "Fonte de teste",
  recordedBy: "analyst-1",
  observedAt: "2026-08-20",
  validUntil: "2026-09-30",
});

function mandate(): ReceivablesProviderMandate {
  const range = {mode: "threshold" as const, value: {min: "1", max: "100"}};
  const ratio = {mode: "threshold" as const, value: "0.10"};
  return {
    mandateId: "mandate-1",
    providerId: "provider-1",
    providerLegalName: "Provedor Um",
    programId: "program-1",
    programName: "Programa Um",
    providerKind: "factoring_company",
    version: 1,
    effectiveFrom: "2026-08-01",
    eligibleRoutes: [policy(["factoring_purchase"])],
    currencies: [policy(["BRL"])],
    ticket: [policy(range)],
    weightedAverageTermDays: [policy(range)],
    minimumHistoryMonths: [policy({mode: "threshold", value: 12})],
    maximumPastDueOver30Ratio: [policy(ratio)],
    maximumPastDueOver90Ratio: [policy(ratio)],
    maximumDilutionRatio: [policy(ratio)],
    maximumAdjustedLossRatio: [policy(ratio)],
    maximumSingleObligorRatio: [policy(ratio)],
    maximumTopTenObligorRatio: [policy(ratio)],
    minimumEligiblePortfolioAmount: [policy(ratio)],
    liveAppetite: [policy(true, "observed_transaction")],
    availableCapacity: [policy("5000000", "desk_inference")],
  };
}

describe("receivables mandate evidence collection", () => {
  it("does not let observed transactions or desk inference confirm current appetite and capacity", () => {
    const plan = buildReceivablesMandateCollectionPlan({
      asOf: "2026-08-28",
      mandates: [resolveReceivablesProviderMandate(mandate(), "2026-08-28")],
    });
    expect(plan.currentBatch).toEqual([expect.objectContaining({
      action: "confirm_live_appetite_and_capacity",
      providerKind: "factoring_company",
      criterionIds: ["available_capacity", "live_appetite"],
    })]);
    expect(plan.boundaries).toMatchObject({researchObservationConfirmsLiveState: false, automatedProviderContactAllowed: false, identityDisclosureAllowed: false});
  });

  it("surfaces conflicting current policy before any internal shortlist use", () => {
    const input = mandate();
    input.ticket = [policy({mode: "threshold", value: {min: "1", max: "100"}}, "direct_declaration", "direct"), policy({mode: "threshold", value: {min: "2", max: "50"}}, "published_rule", "published")];
    const plan = buildReceivablesMandateCollectionPlan({asOf: "2026-08-28", mandates: [resolveReceivablesProviderMandate(input, "2026-08-28")]});
    expect(plan.currentBatch[0]).toMatchObject({action: "reconcile_policy_sources", criterionIds: ["ticket"]});
  });
});
