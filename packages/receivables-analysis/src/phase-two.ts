import {
  calculateReceivablesEligibilityAllocation,
  type AssertionProvenance,
  type ReceivableEligibilityClassification,
  type ReceivablesUniverse,
  type ReceivablesEligibilityAllocation,
} from "@offroad/financial-core";

import type {ReceivablesPhaseOneReport} from "./phase-one";

export const receivablesPhaseTwoReportVersion = "2026.08.27-v1";

/** Runtime contract compiled from the canonical credit playbook by the case engine. */
export type ReceivablesRouteDefinitionInput = {
  id: string;
  label: string;
  mechanism: string;
  capitalProviderTypes: readonly string[];
  serviceProviderTypes: readonly string[];
  criteria: readonly {
    id: string;
    factId: string;
    expected: "true" | "false";
    severity: "hard" | "remediable";
    description: string;
    sourceIds: readonly string[];
  }[];
  deskCharacteristics: {
    implementation: string;
    economics: string;
    provenanceClass: "estimated";
  };
};

export type ReceivablesEligibilityFact = {
  id: string;
  state: "true" | "false" | "unknown";
  explanation: string;
  provenance?: AssertionProvenance;
};

export type RouteCriterionResult = {
  criterionId: string;
  factId: string;
  severity: "hard" | "remediable";
  status: "pass" | "fail" | "condition" | "not_evaluated";
  reason: string;
  provenance?: AssertionProvenance;
};

export type ReceivablesRouteEligibilityStatus =
  | "technically_eligible"
  | "conditionally_eligible"
  | "not_evaluated"
  | "ineligible";

export type ReceivablesRouteEligibilityResult = {
  routeId: string;
  label: string;
  mechanism: string;
  status: ReceivablesRouteEligibilityStatus;
  capitalProviderTypes: readonly string[];
  serviceProviderTypes: readonly string[];
  criterionResults: readonly RouteCriterionResult[];
  portfolioAllocation: ReceivablesEligibilityAllocation | null;
  deskCharacteristics: {
    implementation: string;
    economics: string;
    provenanceClass: "estimated";
    decisionUseAllowed: false;
  };
};

export type ReceivablesPhaseTwoInput = {
  phaseOne: ReceivablesPhaseOneReport;
  universe: ReceivablesUniverse;
  routes: readonly ReceivablesRouteDefinitionInput[];
  facts: readonly ReceivablesEligibilityFact[];
  /** Optional title-level classifications, one complete set per route. */
  titleClassificationsByRoute?: Readonly<Record<string, readonly ReceivableEligibilityClassification[] | undefined>>;
};

export type ReceivablesPhaseTwoReport = {
  version: typeof receivablesPhaseTwoReportVersion;
  analysisLayer: "deterministic_route_eligibility";
  phaseOne: {version: string; status: ReceivablesPhaseOneReport["quality"]["status"]};
  universe: {id: string; datasetHash: string; reportingDate: string};
  routes: readonly ReceivablesRouteEligibilityResult[];
  providerUniverse: readonly string[];
  quality: {
    status: "complete_for_route_screening" | "incomplete";
    blockers: readonly string[];
    warnings: readonly string[];
  };
  boundaries: {
    buyerMandateMatched: false;
    providerRecommendationAllowed: false;
    externalDirectionAllowed: false;
    qualifiedIntroductionAllowed: false;
    creditApprovalExpressed: false;
  };
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function evaluateCriterion(criterion: ReceivablesRouteDefinitionInput["criteria"][number], fact: ReceivablesEligibilityFact | undefined): RouteCriterionResult {
  if (!fact || fact.state === "unknown") {
    return {criterionId: criterion.id, factId: criterion.factId, severity: criterion.severity, status: "not_evaluated", reason: fact?.explanation ?? "Fato não fornecido."};
  }
  if (!fact.provenance) {
    return {criterionId: criterion.id, factId: criterion.factId, severity: criterion.severity, status: "not_evaluated", reason: "Fato sem procedência verificável."};
  }
  if (fact.provenance.kind === "estimated") {
    return {criterionId: criterion.id, factId: criterion.factId, severity: criterion.severity, status: "not_evaluated", reason: "Estimativa não decide elegibilidade técnica.", provenance: fact.provenance};
  }
  const matches = fact.state === criterion.expected;
  if (matches) return {criterionId: criterion.id, factId: criterion.factId, severity: criterion.severity, status: "pass", reason: fact.explanation, provenance: fact.provenance};
  return {
    criterionId: criterion.id,
    factId: criterion.factId,
    severity: criterion.severity,
    status: criterion.severity === "hard" ? "fail" : "condition",
    reason: fact.explanation,
    provenance: fact.provenance,
  };
}

function routeStatus(criteria: ReceivablesRouteDefinitionInput["criteria"], results: readonly RouteCriterionResult[]): ReceivablesRouteEligibilityStatus {
  if (results.some((result) => result.status === "fail")) return "ineligible";
  if (results.some((result, index) => result.status === "not_evaluated" && criteria[index]?.severity === "hard")) return "not_evaluated";
  if (results.some((result) => result.status === "condition" || result.status === "not_evaluated")) return "conditionally_eligible";
  return "technically_eligible";
}

export function analyzeReceivablesPhaseTwo(input: ReceivablesPhaseTwoInput): ReceivablesPhaseTwoReport {
  if (input.universe.id !== input.phaseOne.universe.id) throw new RangeError("Phase 2 universe does not match Phase 1");
  if (input.universe.dates.reportingDate !== input.phaseOne.universe.reportingDate) throw new RangeError("Phase 2 reporting date does not match Phase 1");
  const routeIds = new Set<string>();
  for (const route of input.routes) {
    if (routeIds.has(route.id)) throw new RangeError(`duplicate receivables route: ${route.id}`);
    routeIds.add(route.id);
  }
  const allowedFacts = new Set(input.routes.flatMap((route) => route.criteria.map((criterion) => criterion.factId)));
  const facts = new Map<string, ReceivablesEligibilityFact>();
  for (const fact of input.facts) {
    if (!allowedFacts.has(fact.id)) throw new RangeError(`unknown receivables eligibility fact: ${fact.id}`);
    if (facts.has(fact.id)) throw new RangeError(`duplicate receivables eligibility fact: ${fact.id}`);
    facts.set(fact.id, fact);
  }

  const routes = input.routes.map((route): ReceivablesRouteEligibilityResult => {
    const criterionResults = route.criteria.map((criterion) => evaluateCriterion(criterion, facts.get(criterion.factId)));
    const classifications = input.titleClassificationsByRoute?.[route.id];
    const portfolioAllocation = classifications === undefined
      ? null
      : calculateReceivablesEligibilityAllocation({
        universe: input.universe,
        datasetHash: input.phaseOne.universe.datasetHash,
        classifications,
      });
    return {
      routeId: route.id,
      label: route.label,
      mechanism: route.mechanism,
      status: routeStatus(route.criteria, criterionResults),
      capitalProviderTypes: route.capitalProviderTypes,
      serviceProviderTypes: route.serviceProviderTypes,
      criterionResults,
      portfolioAllocation,
      deskCharacteristics: {...route.deskCharacteristics, decisionUseAllowed: false},
    };
  });

  const hardUnknowns = routes.flatMap((route) => route.criterionResults
    .filter((result) => result.status === "not_evaluated" && result.severity === "hard")
    .map((result) => `route:${route.routeId}:fact:${result.factId}:not_evaluated`));
  const blockers = unique([
    ...(input.phaseOne.quality.status === "incomplete" ? ["phase_one_incomplete"] : []),
    ...hardUnknowns,
  ]);
  const warnings = unique(routes.flatMap((route) => [
    ...(route.portfolioAllocation === null ? [`route:${route.routeId}:portfolio_allocation_not_evaluated`] : []),
    ...(route.deskCharacteristics.provenanceClass === "estimated" ? [`route:${route.routeId}:speed_and_economics_are_desk_observations_only`] : []),
  ]));

  return {
    version: receivablesPhaseTwoReportVersion,
    analysisLayer: "deterministic_route_eligibility",
    phaseOne: {version: input.phaseOne.version, status: input.phaseOne.quality.status},
    universe: {id: input.universe.id, datasetHash: input.phaseOne.universe.datasetHash, reportingDate: input.universe.dates.reportingDate},
    routes,
    providerUniverse: unique(routes.flatMap((route) => route.capitalProviderTypes)),
    quality: {status: blockers.length === 0 ? "complete_for_route_screening" : "incomplete", blockers, warnings},
    boundaries: {
      buyerMandateMatched: false,
      providerRecommendationAllowed: false,
      externalDirectionAllowed: false,
      qualifiedIntroductionAllowed: false,
      creditApprovalExpressed: false,
    },
  };
}
