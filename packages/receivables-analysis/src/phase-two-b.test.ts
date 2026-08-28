import {describe, expect, it} from "vitest";
import {
  resolveReceivablesProviderMandate,
  type ReceivablesCapitalProviderKind,
  type ReceivablesMandateObservation,
  type ReceivablesProviderMandate,
} from "@offroad/fund-mandate";
import type {
  AssertionProvenance,
  ReceivableEligibilityClassification,
  ReceivablesUniverse,
} from "@offroad/financial-core";

import {analyzeReceivablesPhaseTwoB, type ReceivablesProviderMetricSet} from "./phase-two-b";
import type {ReceivablesPhaseTwoReport} from "./phase-two";

const source = {kind: "file" as const, fileId: "tape", fileHash: "a".repeat(64), sheet: "Carteira"};
const coverage = {status: "complete" as const, startDate: "2025-01-01" as const, endDate: "2026-08-27" as const, basis: "synthetic complete history", limitations: []};
const universe: ReceivablesUniverse = {
  id: "receivables-case",
  dates: {reportingDate: "2026-08-27", latestOriginationDate: "2026-08-20", dataStartDate: "2025-01-01", dataEndDate: "2026-08-27"},
  currency: "BRL",
  receivables: [
    {id: "r1", currency: "BRL", faceValue: "8000000", openValue: "8000000", issueDate: "2026-07-01", originalDueDate: "2026-09-01", currentDueDate: "2026-09-01", obligorId: "o1", status: "open", source},
    {id: "r2", currency: "BRL", faceValue: "4000000", openValue: "4000000", issueDate: "2026-07-10", originalDueDate: "2026-10-01", currentDueDate: "2026-10-01", obligorId: "o2", status: "open", source},
  ],
  settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
  obligors: [
    {id: "o1", legalName: "Sacado Um", relatedParty: false, source},
    {id: "o2", legalName: "Sacado Dois", relatedParty: false, source},
  ],
  economicGroups: [],
  eventCoverage: {settlements: coverage, dilutions: coverage, extensions: coverage, repurchases: coverage, assignmentsAndLiens: coverage},
};

const phaseTwoA: ReceivablesPhaseTwoReport = {
  version: "2026.08.27-v1",
  analysisLayer: "deterministic_route_eligibility",
  phaseOne: {version: "phase-one", status: "complete_for_phase_one"},
  universe: {id: universe.id, datasetHash: "b".repeat(64), reportingDate: "2026-08-27"},
  routes: [
    {routeId: "factoring_purchase", label: "Factoring", mechanism: "receivable_purchase", status: "technically_eligible", capitalProviderTypes: ["factoring_company"], serviceProviderTypes: [], criterionResults: [], portfolioAllocation: null, deskCharacteristics: {implementation: "estimated", economics: "estimated", provenanceClass: "estimated", decisionUseAllowed: false}},
    {routeId: "financial_institution_receivables_discount", label: "Desconto", mechanism: "receivable_purchase", status: "technically_eligible", capitalProviderTypes: ["credit_finance_company"], serviceProviderTypes: [], criterionResults: [], portfolioAllocation: null, deskCharacteristics: {implementation: "estimated", economics: "estimated", provenanceClass: "estimated", decisionUseAllowed: false}},
    {routeId: "fidc_multicedent_assignment", label: "FIDC", mechanism: "receivable_purchase", status: "ineligible", capitalProviderTypes: ["fidc"], serviceProviderTypes: [], criterionResults: [], portfolioAllocation: null, deskCharacteristics: {implementation: "estimated", economics: "estimated", provenanceClass: "estimated", decisionUseAllowed: false}},
  ],
  providerUniverse: ["factoring_company", "credit_finance_company", "fidc"],
  quality: {status: "complete_for_route_screening", blockers: [], warnings: []},
  boundaries: {buyerMandateMatched: false, providerRecommendationAllowed: false, externalDirectionAllowed: false, qualifiedIntroductionAllowed: false, creditApprovalExpressed: false},
};

const measured = (value: string): {value: string; provenance: AssertionProvenance} => ({
  value,
  provenance: {kind: "measured", datasetHash: "b".repeat(64), anchors: [source], universe: universe.id, reportingDate: "2026-08-27", inclusions: ["open"], exclusions: [], formula: {id: "test", version: "1"}},
});
const metrics: ReceivablesProviderMetricSet = {
  currency: "BRL",
  requestedAmount: measured("20000000"),
  weightedAverageTermDays: measured("75"),
  historyMonths: measured("20"),
  pastDueOver30Ratio: measured("0.01"),
  pastDueOver90Ratio: measured("0.005"),
  dilutionRatio: measured("0.02"),
  adjustedLossRatio: measured("0.015"),
  singleObligorRatio: measured("0.15"),
  topTenObligorRatio: measured("0.55"),
};

const observed = <T>(value: T, sourceKind: ReceivablesMandateObservation<T>["sourceKind"] = "direct_declaration", validUntil = "2026-09-30"): ReceivablesMandateObservation<T> => ({
  value, sourceKind, sourceId: `${sourceKind}-${JSON.stringify(value)}`, sourceLabel: "Synthetic mandate evidence", observedAt: "2026-08-01", validUntil,
});
const threshold = <T>(value: T) => ({mode: "threshold" as const, value});
const provider = (
  programId: string,
  kind: ReceivablesCapitalProviderKind,
  routeId: string,
  overrides: Partial<ReceivablesProviderMandate> = {},
): ReceivablesProviderMandate => ({
  mandateId: `mandate-${programId}`,
  providerId: `provider-${programId}`,
  providerLegalName: `Provedor ${programId}`,
  programId,
  programName: `Programa ${programId}`,
  providerKind: kind,
  version: 1,
  effectiveFrom: "2026-08-01",
  eligibleRoutes: [observed([routeId])],
  currencies: [observed(["BRL"])],
  ticket: [observed(threshold({min: "2000000", max: "15000000"}))],
  weightedAverageTermDays: [observed(threshold({min: "15", max: "180"}))],
  minimumHistoryMonths: [observed(threshold(12))],
  maximumPastDueOver30Ratio: [observed(threshold("0.05"))],
  maximumPastDueOver90Ratio: [observed(threshold("0.02"))],
  maximumDilutionRatio: [observed(threshold("0.04"))],
  maximumAdjustedLossRatio: [observed(threshold("0.03"))],
  maximumSingleObligorRatio: [observed(threshold("0.20"))],
  maximumTopTenObligorRatio: [observed(threshold("0.70"))],
  minimumEligiblePortfolioAmount: [observed(threshold("2000000"))],
  liveAppetite: [observed(true, "relationship_confirmation")],
  availableCapacity: [observed("10000000", "relationship_confirmation")],
  ...overrides,
});

const classifications: ReceivableEligibilityClassification[] = [
  {receivableId: "r1", disposition: "eligible", reason: "policy_pass", provenance: measured("1").provenance},
  {receivableId: "r2", disposition: "conditional", reason: "proof_pending", provenance: measured("1").provenance},
];

describe("receivables Phase 2B provider mandate fit", () => {
  it("shortlists a factoring and a finance company without requiring a FIDC", () => {
    const mandates = [
      resolveReceivablesProviderMandate(provider("factoring", "factoring_company", "factoring_purchase"), "2026-08-27"),
      resolveReceivablesProviderMandate(provider("financeira", "credit_finance_company", "financial_institution_receivables_discount"), "2026-08-27"),
      resolveReceivablesProviderMandate(provider("fidc", "fidc", "fidc_multicedent_assignment"), "2026-08-27"),
    ];
    const report = analyzeReceivablesPhaseTwoB({
      phaseTwoA, universe, asOf: "2026-08-27", metrics, mandates,
      titleClassificationsByProgram: {factoring: classifications, financeira: classifications, fidc: classifications},
    });
    expect(report.providers.find((entry) => entry.programId === "factoring")?.status).toBe("live_appetite_confirmed");
    expect(report.providers.find((entry) => entry.programId === "financeira")?.status).toBe("live_appetite_confirmed");
    expect(report.providers.find((entry) => entry.programId === "fidc")?.status).toBe("ineligible");
    expect(report.boundaries).toMatchObject({internalShortlistAllowed: true, externalDirectionAllowed: false, qualifiedIntroductionAllowed: false});
    expect(JSON.stringify(report)).not.toMatch(/score|percentage|ranking/);
  });

  it("keeps a partial cheque as a valid allocation condition instead of excluding it", () => {
    const mandate = resolveReceivablesProviderMandate(provider("factoring", "factoring_company", "factoring_purchase"), "2026-08-27");
    const report = analyzeReceivablesPhaseTwoB({phaseTwoA, universe, asOf: "2026-08-27", metrics, mandates: [mandate], titleClassificationsByProgram: {factoring: classifications}});
    expect(report.providers[0]?.allocationEnvelope).toMatchObject({maximumConfirmedAllocation: "8000000.00", wholeRequestCovered: false, minimumTicketMet: true});
    expect(report.providers[0]?.conditions).toContain("provider_covers_part_of_request_only");
    expect(report.providers[0]?.status).toBe("live_appetite_confirmed");
  });

  it("does not call appetite confirmed when the minimum cheque depends on conditional titles", () => {
    const mandate = resolveReceivablesProviderMandate(provider("factoring", "factoring_company", "factoring_purchase", {
      ticket: [observed(threshold({min: "10000000", max: "15000000"}))],
    }), "2026-08-27");
    const report = analyzeReceivablesPhaseTwoB({phaseTwoA, universe, asOf: "2026-08-27", metrics, mandates: [mandate], titleClassificationsByProgram: {factoring: classifications}});
    expect(report.providers[0]?.allocationEnvelope).toMatchObject({
      maximumConfirmedAllocation: "8000000.00",
      maximumAllocationIncludingConditional: "10000000.00",
      minimumTicketMet: false,
      minimumTicketMetIncludingConditional: true,
    });
    expect(report.providers[0]?.status).toBe("conditionally_eligible");
    expect(report.providers[0]?.conditions).toContain("minimum_ticket_depends_on_conditional_titles");
    expect(report.boundaries.internalShortlistAllowed).toBe(false);
  });

  it("does not allow an internal shortlist when capacity is stale or inferred", () => {
    const mandate = resolveReceivablesProviderMandate(provider("financeira", "credit_finance_company", "financial_institution_receivables_discount", {
      availableCapacity: [observed("10000000", "desk_inference", "2026-12-31")],
    }), "2026-08-27");
    const report = analyzeReceivablesPhaseTwoB({phaseTwoA, universe, asOf: "2026-08-27", metrics, mandates: [mandate], titleClassificationsByProgram: {financeira: classifications}});
    expect(report.providers[0]?.status).toBe("policy_fit_confirmed");
    expect(report.providers[0]?.blockers).toContain("available_capacity_not_current_and_confirmed");
    expect(report.boundaries.internalShortlistAllowed).toBe(false);
  });

  it("abstains when a case metric is estimated rather than manufacturing an exclusion", () => {
    const mandate = resolveReceivablesProviderMandate(provider("factoring", "factoring_company", "factoring_purchase"), "2026-08-27");
    const estimatedMetrics: ReceivablesProviderMetricSet = {
      ...metrics,
      dilutionRatio: {value: "0.20", provenance: {kind: "estimated", method: "desk proxy", sources: ["partial tape"], asOf: "2026-08-27", owner: "receivables desk", confidence: "low", validUntil: "2026-09-01"}},
    };
    const report = analyzeReceivablesPhaseTwoB({phaseTwoA, universe, asOf: "2026-08-27", metrics: estimatedMetrics, mandates: [mandate], titleClassificationsByProgram: {factoring: classifications}});
    expect(report.providers[0]?.criterionResults.find((entry) => entry.criterionId === "maximum_dilution_ratio")?.status).toBe("not_evaluated");
    expect(report.providers[0]?.status).toBe("not_evaluated");
  });

  it("rejects two active mandates for the same program", () => {
    const first = resolveReceivablesProviderMandate(provider("factoring", "factoring_company", "factoring_purchase"), "2026-08-27");
    const second = {...first, mandateId: "mandate-factoring-v2"};
    expect(() => analyzeReceivablesPhaseTwoB({
      phaseTwoA,
      universe,
      asOf: "2026-08-27",
      metrics,
      mandates: [first, second],
      titleClassificationsByProgram: {factoring: classifications},
    })).toThrow("duplicate active receivables program");
  });
});
