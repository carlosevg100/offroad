import {describe, expect, it} from "vitest";

import {
  analyzeReceivables,
  diversifiedReceivablesCase,
  receivablesAnchorCandidates,
  receivablesCaseSchema,
  receivablesParametricScenarios,
  receivablesPlaybook,
} from "./index";

describe("receivables and FIDC vertical", () => {
  it("keeps the FIDC as capital vehicle and the assigned receivables as the economic obligation", () => {
    expect(receivablesPlaybook.economicObject).toMatchObject({
      capitalVehicle: "fidc",
      obligationInstrument: "receivables_assignment",
      repaymentSource: "receivables_collection",
    });
    expect(receivablesPlaybook.stages.map((stage) => stage.id)).toEqual([
      "guided_intake", "read_and_classify", "reconcile", "portfolio_analysis", "eligibility", "indicative_structure", "materials", "mandate_screen",
    ]);
    expect(receivablesPlaybook.boundary.pt).toContain("introdução qualificada");
    expect(receivablesPlaybook.boundary.pt).toContain("não aprova crédito");
    expect(receivablesPlaybook.boundary.pt).toContain("não executa cobrança");
  });

  it("calculates a clean diversified portfolio, reconciliation, enhancement and waterfall exactly", () => {
    const result = analyzeReceivables(diversifiedReceivablesCase());
    expect(result.decision.status).toBe("ready_for_structuring");
    expect(result.decision.refusalCodes).toEqual([]);
    expect(result.decision.externalDirectionAllowed).toBe(false);
    expect(result.metrics.portfolio).toMatchObject({
      receivableCount: 60,
      debtorCount: 30,
      debtorGroupCount: 10,
      totalOutstanding: "6000000.00",
      preliminaryEligibleBalance: "6000000.00",
      concentrationAdjustedEligibleBalance: "6000000.00",
      eligibleShare: "1.00000000",
      topDebtorShare: "0.03333333",
      topGroupShare: "0.10000000",
    });
    expect(result.staticMetrics.portfolio.totalOpenValue.value).toBe("6000000");
    expect(result.staticMetrics.portfolio.totalOpenValue.provenance.kind).toBe("measured");
    expect(result.staticMetrics.aging.past_due_31_60.value).toBe("0");
    expect(result.reconciliation.tapeToAccounting).toMatchObject({difference: "0.00", status: "tied"});
    expect(result.reconciliation.tapeCollectionsToAccounting).toMatchObject({difference: "0.00", status: "tied"});
    expect(result.reconciliation.collectionsToCash).toMatchObject({difference: "0.00", status: "tied"});
    expect(result.structure).toMatchObject({
      maximumByAdvanceRate: "4800000.00",
      maximumByOvercollateralization: "4800000.00",
      supportedFacility: "4800000.00",
      actualSubordinationRate: "0.20000000",
      reserveTarget: "90000.00",
    });
    expect(result.structure.waterfall).toEqual([
      {priority: 1, item: "servicing_fee", due: "10000.00", paid: "10000.00", shortfall: "0.00"},
      {priority: 2, item: "senior_interest", due: "100000.00", paid: "100000.00", shortfall: "0.00"},
      {priority: 3, item: "reserve_top_up", due: "60000.00", paid: "60000.00", shortfall: "0.00"},
      {priority: 4, item: "senior_principal", due: "200000.00", paid: "200000.00", shortfall: "0.00"},
      {priority: 5, item: "mezzanine", due: "0.00", paid: "0.00", shortfall: "0.00"},
      {priority: 6, item: "subordinated_residual", due: "30000.00", paid: "30000.00", shortfall: "0.00"},
    ]);
    expect(result.structure.residualCash).toBe("0.00");
  });

  it.each(receivablesParametricScenarios)("returns the declared decision for $id", ({input, expected}) => {
    expect(analyzeReceivables(input).decision.status).toBe(expected);
  });

  it("refuses a portfolio with no eligible receivables and states why", () => {
    const scenario = receivablesParametricScenarios.find((item) => item.id === "r19-no-eligible-base")!;
    const result = analyzeReceivables(scenario.input);
    expect(result.metrics.portfolio.concentrationAdjustedEligibleBalance).toBe("0.00");
    expect(result.decision.blockingCodes).toContain("trigger_eligible_share");
    expect(result.decision.blockingCodes).toContain("facility_above_borrowing_base");
    expect(result.decision.refusalCodes).toContain("no_economically_eligible_receivables");
    expect(result.analyzedReceivables.every((item) => item.reasons.includes("not_assignable"))).toBe(true);
  });

  it("keeps reconciliation and evidence gaps separate from portfolio performance", () => {
    const accounting = analyzeReceivables(receivablesParametricScenarios.find((item) => item.id === "r02-accounting-mismatch")!.input);
    const evidence = analyzeReceivables(receivablesParametricScenarios.find((item) => item.id === "r04-evidence-gap")!.input);
    expect(accounting.reconciliation.tapeToAccounting.status).toBe("outside_tolerance");
    expect(accounting.decision.blockingCodes).toContain("trigger_accounting_reconciliation");
    expect(evidence.decision.blockingCodes).toContain("trigger_evidence_coverage");
    expect(evidence.reconciliation.tapeToAccounting.status).toBe("tied");
  });

  it("does not claim specialist review before it occurs", () => {
    expect(receivablesAnchorCandidates).toHaveLength(2);
    expect(receivablesAnchorCandidates.every((anchor) => anchor.kind === "handcrafted_review_candidate")).toBe(true);
    expect(receivablesAnchorCandidates.every((anchor) => anchor.specialistReview.status === "pending")).toBe(true);
  });

  it("distinguishes remediable information gaps from economic refusal", () => {
    const evidenceGap = analyzeReceivables(receivablesParametricScenarios.find((item) => item.id === "r04-evidence-gap")!.input);
    expect(evidenceGap.decision.status).toBe("needs_remediation");
    expect(evidenceGap.decision.refusalCodes).toEqual([]);
    expect(evidenceGap.decision.blockingCodes).toContain("trigger_evidence_coverage");
  });

  it("rejects duplicate row identity and inconsistent debtor groups at the contract boundary", () => {
    const duplicate = diversifiedReceivablesCase("contract-duplicate-anchor");
    duplicate.portfolio[1]!.sourceAnchor = duplicate.portfolio[0]!.sourceAnchor;
    expect(() => receivablesCaseSchema.parse(duplicate)).toThrow(/source anchor/);

    const inconsistent = diversifiedReceivablesCase("contract-inconsistent-group");
    inconsistent.portfolio[30]!.debtorGroupId = "GROUP-OTHER";
    expect(() => receivablesCaseSchema.parse(inconsistent)).toThrow(/multiple economic groups/);
  });
});
