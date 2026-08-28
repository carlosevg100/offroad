import type {AssertionProvenance, ReceivablesUniverse, SourceAnchor} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

import {analyzeReceivablesPhaseOne} from "./phase-one";
import {analyzeReceivablesPhaseTwo, type ReceivablesEligibilityFact, type ReceivablesRouteDefinitionInput} from "./phase-two";

const datasetHash = "c".repeat(64);
const source: SourceAnchor = {kind: "file", fileId: "eligibility-tape", fileHash: "d".repeat(64), sheet: "Carteira", row: 2};
const coverage = {status: "complete" as const, startDate: "2025-01-01" as const, endDate: "2026-06-30" as const, basis: "complete ledger", limitations: []};

function universe(): ReceivablesUniverse {
  return {
    id: "phase-two-test",
    dates: {reportingDate: "2026-06-30", latestOriginationDate: "2026-06-01", dataStartDate: "2026-06-01", dataEndDate: "2026-06-01"},
    currency: "BRL",
    receivables: [{id: "r1", currency: "BRL", faceValue: "100", openValue: "100", issueDate: "2026-06-01", originalDueDate: "2026-07-01", currentDueDate: "2026-07-01", obligorId: "o1", status: "open", source}],
    settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [{id: "o1", legalName: "Obligor One", relatedParty: false, source}], economicGroups: [],
    eventCoverage: {settlements: coverage, dilutions: coverage, extensions: coverage, repurchases: coverage, assignmentsAndLiens: coverage},
  };
}

const measured = (id: string): AssertionProvenance => ({
  kind: "measured", datasetHash, anchors: [source], universe: "phase-two-test", reportingDate: "2026-06-30",
  inclusions: [id], exclusions: [], formula: {id: "document-rule", version: "v1"},
});
const fact = (id: ReceivablesEligibilityFact["id"], state: "true" | "false"): ReceivablesEligibilityFact => ({id, state, explanation: `${id}=${state}`, provenance: measured(id)});
const common = [
  {id: "claim", factId: "claim_existence_evidenced", expected: "true" as const, severity: "hard" as const, description: "claim", sourceIds: ["law"]},
  {id: "owner", factId: "cedent_ownership_confirmed", expected: "true" as const, severity: "hard" as const, description: "owner", sourceIds: ["law"]},
  {id: "assignable", factId: "contractual_assignability_confirmed", expected: "true" as const, severity: "hard" as const, description: "assignable", sourceIds: ["law"]},
  {id: "prior", factId: "unresolved_prior_assignment_or_lien", expected: "false" as const, severity: "hard" as const, description: "prior", sourceIds: ["law"]},
  {id: "performance", factId: "performance_or_delivery_evidenced", expected: "true" as const, severity: "remediable" as const, description: "performance", sourceIds: ["law"]},
  {id: "control", factId: "title_control_and_duplicate_check_available", expected: "true" as const, severity: "remediable" as const, description: "control", sourceIds: ["law"]},
  {id: "notice", factId: "debtor_notice_or_acknowledgement_feasible", expected: "true" as const, severity: "remediable" as const, description: "notice", sourceIds: ["law"]},
];
const route = (id: string, capitalProviderTypes: string[], criteria = common, serviceProviderTypes: string[] = []): ReceivablesRouteDefinitionInput => ({
  id, label: id, mechanism: "test", capitalProviderTypes, serviceProviderTypes, criteria,
  deskCharacteristics: {implementation: "test", economics: "test", provenanceClass: "estimated"},
});
const routes: readonly ReceivablesRouteDefinitionInput[] = [
  route("factoring_purchase", ["factoring_company"]),
  route("financial_institution_receivables_discount", ["bank", "credit_finance_investment_company"], [...common, {id: "company", factId: "company_credit_package_available", expected: "true", severity: "remediable", description: "company", sourceIds: ["bcb"]}]),
  route("digital_credit_receivables_purchase", ["direct_credit_company", "bank", "fidc_or_receivables_fund"], [...common, {id: "company-digital", factId: "company_credit_package_available", expected: "true", severity: "remediable", description: "company", sourceIds: ["bcb"]}], ["technology_origination_platform"]),
  route("fidc_multicedent_assignment", ["fidc_or_receivables_fund"], [...common, {id: "tape", factId: "analytical_tape_available", expected: "true", severity: "remediable", description: "tape", sourceIds: ["cvm"]}]),
  route("buyer_confirmed_payables_program", ["obligor_sponsored_program"], [{id: "program", factId: "buyer_confirmed_program_available", expected: "true", severity: "hard", description: "program", sourceIds: ["law"]}]),
  route("secured_revolving_facility", ["bank", "credit_finance_investment_company", "direct_credit_company", "private_credit_fund", "family_office"], [
    {id: "company-secured", factId: "company_credit_package_available", expected: "true", severity: "hard", description: "company", sourceIds: ["bcb"]},
    {id: "collateral", factId: "eligible_collateral_pool_identified", expected: "true", severity: "remediable", description: "collateral", sourceIds: ["law"]},
    {id: "perfection", factId: "security_perfection_feasible", expected: "true", severity: "remediable", description: "perfection", sourceIds: ["law"]},
    {id: "prior-secured", factId: "unresolved_prior_assignment_or_lien", expected: "false", severity: "hard", description: "prior", sourceIds: ["law"]},
  ]),
  route("ccb_with_fiduciary_assignment", ["private_credit_fund"], [
    {id: "company-ccb", factId: "company_credit_package_available", expected: "true", severity: "hard", description: "company", sourceIds: ["law"]},
    {id: "prior-ccb", factId: "unresolved_prior_assignment_or_lien", expected: "false", severity: "hard", description: "prior", sourceIds: ["law"]},
  ]),
  route("dedicated_receivables_vehicle", ["fidc_or_receivables_fund", "institutional_investor"], common),
  route("receivables_certificate_securitisation", ["institutional_investor"], common, ["securitisation_company"]),
];

function baseFacts(): ReceivablesEligibilityFact[] {
  return [
    fact("claim_existence_evidenced", "true"),
    fact("cedent_ownership_confirmed", "true"),
    fact("contractual_assignability_confirmed", "true"),
    fact("unresolved_prior_assignment_or_lien", "false"),
    fact("performance_or_delivery_evidenced", "true"),
    fact("title_control_and_duplicate_check_available", "true"),
    fact("debtor_notice_or_acknowledgement_feasible", "true"),
    fact("company_credit_package_available", "true"),
    fact("eligible_collateral_pool_identified", "true"),
    fact("security_perfection_feasible", "true"),
    fact("buyer_confirmed_program_available", "false"),
  ];
}

describe("receivables Phase 2 route eligibility", () => {
  it("screens multiple financing routes and never treats FIDC as the only buyer", () => {
    const u = universe();
    const phaseOne = analyzeReceivablesPhaseOne({universe: u, datasetHash});
    const report = analyzeReceivablesPhaseTwo({phaseOne, universe: u, routes, facts: baseFacts()});
    const route = (id: string) => report.routes.find((item) => item.routeId === id)!;

    expect(route("factoring_purchase").status).toBe("technically_eligible");
    expect(route("factoring_purchase").capitalProviderTypes).toEqual(["factoring_company"]);
    expect(route("financial_institution_receivables_discount").status).toBe("technically_eligible");
    expect(route("financial_institution_receivables_discount").capitalProviderTypes).toEqual(["bank", "credit_finance_investment_company"]);
    expect(route("digital_credit_receivables_purchase").capitalProviderTypes).toContain("direct_credit_company");
    expect(route("fidc_multicedent_assignment").status).toBe("conditionally_eligible");
    expect(route("buyer_confirmed_payables_program").status).toBe("ineligible");
    expect(route("secured_revolving_facility").status).toBe("technically_eligible");
    expect(report.providerUniverse).toEqual(expect.arrayContaining([
      "bank", "credit_finance_investment_company", "direct_credit_company", "factoring_company",
      "fidc_or_receivables_fund", "private_credit_fund", "family_office", "institutional_investor",
    ]));
    expect(report.boundaries.providerRecommendationAllowed).toBe(false);
    expect(route("digital_credit_receivables_purchase").serviceProviderTypes).toContain("technology_origination_platform");
  });

  it("blocks double assignment and refuses estimated facts as hard evidence", () => {
    const u = universe();
    const phaseOne = analyzeReceivablesPhaseOne({universe: u, datasetHash});
    const doubleAssigned = baseFacts().map((item) => item.id === "unresolved_prior_assignment_or_lien" ? fact(item.id, "true") : item);
    const blocked = analyzeReceivablesPhaseTwo({phaseOne, universe: u, routes, facts: doubleAssigned});
    expect(blocked.routes.find((item) => item.routeId === "factoring_purchase")?.status).toBe("ineligible");
    expect(blocked.routes.find((item) => item.routeId === "ccb_with_fiduciary_assignment")?.status).toBe("ineligible");

    const estimatedOwnership = baseFacts().map((item) => item.id === "cedent_ownership_confirmed" ? {
      ...item,
      provenance: {kind: "estimated" as const, method: "management statement", sources: ["call"], asOf: "2026-06-30" as const, owner: "desk", confidence: "medium" as const, validUntil: "2026-07-31" as const},
    } : item);
    const notEvaluated = analyzeReceivablesPhaseTwo({phaseOne, universe: u, routes, facts: estimatedOwnership});
    expect(notEvaluated.routes.find((item) => item.routeId === "factoring_purchase")?.status).toBe("not_evaluated");
  });

  it("computes a route allocation only from a complete exclusive title classification", () => {
    const u = universe();
    const phaseOne = analyzeReceivablesPhaseOne({universe: u, datasetHash});
    const report = analyzeReceivablesPhaseTwo({
      phaseOne, universe: u, routes, facts: baseFacts(),
      titleClassificationsByRoute: {
        factoring_purchase: [{receivableId: "r1", disposition: "eligible", reason: "title evidenced", provenance: measured("r1")}],
      },
    });
    const factoring = report.routes.find((item) => item.routeId === "factoring_purchase")!;
    expect(factoring.portfolioAllocation?.denominatorValue).toBe("100");
    expect(factoring.portfolioAllocation?.shares.eligible).toBe("1");
    expect(report.routes.find((item) => item.routeId === "fidc_multicedent_assignment")?.portfolioAllocation).toBeNull();
  });
});
