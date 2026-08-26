import {instrumentVerdicts} from "@offroad/credit-playbook";
import type {DebtTruthSet, FinancialTruthSet, ReconciledFact} from "@offroad/reconciliation";
import {describe, expect, it} from "vitest";

import type {CapacityAssessment} from "./capacity";
import {designCollateralPackage} from "./collateral";
import type {OperationTruthSet} from "./operation";
import {buildStructureTruthSet, type StructurePolicies} from "./structure";
import {buildTermSheet} from "./termsheet";

const f = (fieldPath: string, value: string, valueType: ReconciledFact["valueType"] = "number"): ReconciledFact => ({
  key: {fieldPath}, value, valueType,
  accepted: {fieldPath, normalizedValue: value, valueType, sourceDocument: "gold.xlsx", evidenceRank: 2, informationClass: "company_document", confidence: 1, anchorVerified: true, anchor: {sheet: "Inputs", cell: "A1"}},
  conflicts: [], disputed: false,
});

const capacity: CapacityAssessment = {
  requested: "100000000",
  recommended: "100000000",
  bindingConstraint: "cash_flow",
  walls: [
    {id: "cash_flow", labels: {pt: "Caixa", en: "Cash"}, amount: "120000000", explanation: {pt: "Calculado", en: "Calculated"}, inputs: ["cfads"]},
    {id: "collateral", labels: {pt: "Garantias", en: "Collateral"}, amount: "160000000", explanation: {pt: "Calculado", en: "Calculated"}, inputs: ["collateral"]},
    {id: "market", labels: {pt: "Mercado", en: "Market"}, amount: "140000000", explanation: {pt: "Calculado", en: "Calculated"}, inputs: ["ebitda"]},
  ],
  calculations: [], gaps: [],
};
const policies: StructurePolicies = {
  version: "2026.08.25-gold",
  annualSizingRate: "0.18",
  rateConvention: "effective_annual",
  amortizationFormat: "sac",
  graceInterest: "paid",
  minimumDscr: "1.20",
  minimumCovenantHeadroom: "0.10",
  maturityConcentrationLimit: "0.60",
  constructionDelayMonths: 3,
  reserveMonths: "3",
  collateralPolicyVersion: "2026.08.25-gold",
  minimumCollateralCoverage: "1.30",
  matchedTicketMin: "20000000",
  matchedTicketMax: "200000000",
};
const financialTruth = {statements: [{period: "2025", adjustedEbitda: "50000000"}]} as unknown as FinancialTruthSet;
const debtTruth = {
  views: {grossFinancialDebt: "70000000", unrestrictedCash: "10000000"},
  maturity: {"2027-01-01": "30000000", "2027-12-01": "10000000", "2028-06-01": "30000000"},
  covenants: [],
} as unknown as DebtTruthSet;
const operationTruth = (sourcesAndUses: "pass" | "fail" = "pass"): OperationTruthSet => ({
  request: {amount: "100000000", purpose: "growth_expansion", termMonths: 60, evidence: []},
  calculatedNeed: {value: "100000000", trace: [], divergence: "0", status: "completed"},
  sourcesAndUses: {lines: [], totalSources: "100000000", totalUses: sourcesAndUses === "pass" ? "100000000" : "120000000", difference: sourcesAndUses === "pass" ? "0" : "-20000000", status: sourcesAndUses},
  proForma: {grossDebt: "170000000", unrestrictedCash: "10000000", netDebt: "160000000", leverage: "3.2", dayOneCovenantConflict: false},
  bridgeAndTakeout: {bridgeAmount: null, takeout: null, failureRisk: null, planB: null, status: "not_applicable"},
} as unknown as OperationTruthSet);
const collateral = designCollateralPackage({
  amount: "100000000", coverage: "1.30",
  assets: [{description: "Centro de distribuição", type: "property", value: "300000000", appraised: true, encumbered: "0", haircut: "0.20"}],
});
const instruments = instrumentVerdicts({legalForm: "ltda", archetypeId: "growth_expansion", amount: "100000000"});

function baseFacts(options: {bullet?: boolean; incompleteDownside?: boolean; negativePledge?: boolean} = {}) {
  const facts: ReconciledFact[] = [
    f("transaction.requested_amount", "100000000"),
    f("structure.term_months", "60"),
    f("structure.grace_months", "6"),
    f("structure.amortization_format", options.bullet ? "bullet" : "sac", "text"),
    f("structure.sizing_annual_rate", "0.18"),
    f("structure.rate_convention", "effective_annual", "text"),
    f("structure.grace_interest", "paid", "text"),
    f("structure.day_one.negative_pledge_compliant", String(options.negativePledge ?? true), "boolean"),
    f("structure.day_one.corporate_authority_complete", "true", "boolean"),
    f("structure.mandate.ticket_min", "20000000"),
    f("structure.mandate.ticket_max", "200000000"),
    f("structure.issuer.entity", "Operating Company Ltda", "text"),
    f("structure.issuer.justification", "The operating company owns the cash flow and the assets.", "text"),
  ];
  for (const [scenarioIndex, scenario, cfads] of [["1", "base", "6000000"], ["2", "downside", "4500000"]] as const) {
    facts.push(f(`structure.cfads_scenarios.${scenarioIndex}.name`, scenario, "text"));
    const periods = options.incompleteDownside && scenario === "downside" ? 59 : 60;
    for (let period = 1; period <= periods; period += 1) {
      facts.push(f(`structure.cfads_scenarios.${scenarioIndex}.periods.${period}.period`, String(period)));
      facts.push(f(`structure.cfads_scenarios.${scenarioIndex}.periods.${period}.cfads`, cfads));
    }
  }
  return facts;
}

describe("M5 Structure Truth Set", () => {
  it("produces exact ES-01 through ES-45 coverage and a traceable repayment proposal", () => {
    const termSheet = buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 60, requestedGraceMonths: 6});
    const truth = buildStructureTruthSet({
      archetypeId: "growth_expansion", facts: baseFacts(), financialTruth, debtTruth,
      operationTruth: operationTruth(), capacity, termSheet, collateral, instruments,
      referenceDate: "2026-08-25", policies,
    });
    expect(truth.procedureCoverage).toHaveLength(45);
    expect(truth.procedureCoverage.map((item) => item.procedureId)).toEqual(Array.from({length: 45}, (_, index) => `ES-${String(index + 1).padStart(2, "0")}`));
    expect(truth.proposal).toMatchObject({amount: "100000000", termMonths: 60, graceMonths: 6, amortizationFormat: "sac", dayOneCompatible: true});
    expect(truth.repayment.schedule?.rows).toHaveLength(60);
    expect(truth.repayment.schedule?.rows.at(-1)?.closingBalance).toBe("0");
    expect(truth.finalSizing.proposed).toBe("100000000");
    expect(truth.exceptions.map((item) => item.id)).not.toContain("incomplete-coverage-series");
  });

  it("fails closed when the case does not tie, downside coverage is incomplete and day-one compatibility fails", () => {
    const adverseCapacity = {...capacity, recommended: "50000000", walls: capacity.walls.map((wall) => wall.id === "cash_flow" ? {...wall, amount: "50000000"} : wall)};
    const termSheet = buildTermSheet({archetypeId: "growth_expansion", capacity: adverseCapacity, requestedTermMonths: 60});
    const truth = buildStructureTruthSet({
      archetypeId: "growth_expansion", facts: baseFacts({bullet: true, incompleteDownside: true, negativePledge: false}),
      financialTruth, debtTruth, operationTruth: operationTruth("fail"), capacity: adverseCapacity,
      termSheet, collateral, instruments, referenceDate: "2026-08-25", policies: {...policies, amortizationFormat: "bullet"},
    });
    expect(truth.status).toBe("blocked");
    expect(truth.exceptions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "sources-uses-not-closed", "incomplete-coverage-series", "bullet-without-repayment-source", "day-one-incompatibility",
    ]));
    expect(truth.procedureCoverage.find((item) => item.procedureId === "ES-42")?.status).toBe("blocked");
    expect(truth.finalSizing.proposed).toBe("50000000");
  });
});
