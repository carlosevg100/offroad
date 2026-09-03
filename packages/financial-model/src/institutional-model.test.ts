import {describe, expect, it} from "vitest";

import {applyScenarioOverrides, type AssumptionBook, type GovernedAssumption} from "./assumptions";
import {buildInstitutionalFinancialModel, type InstitutionalModelInput} from "./institutional-model";
import {reviewInstitutionalFinancialModel} from "./review";

const periods = ["2027", "2028"] as const;

function assumption(id: string, first: string, second = first): GovernedAssumption {
  return {
    id,
    label: {pt: id, en: id},
    unit: "percent",
    values: {2027: first, 2028: second},
    sourceType: "normalized_history",
    evidence: [{sourceId: `source-${id}`, title: `Evidence for ${id}`, asOfDate: "2026-12-31", locator: "test fixture"}],
    rationale: `Rationale for ${id}`,
    methodology: `Methodology for ${id}`,
    confidence: "medium",
    editable: true,
    impacts: ["institutional model"],
  };
}

function fixture(): InstitutionalModelInput {
  const assumptions = [
    assumption("volume", "0.02"), assumption("price", "0.03"), assumption("mix", "0"),
    assumption("fx", "0"), assumption("inorganic", "0"), assumption("cogs_pct", "0.60"),
    assumption("sga_growth", "0.03"), assumption("existing_da", "35", "30"),
    assumption("maintenance_capex", "30"), assumption("growth_capex", "20", "10"),
    assumption("dso", "60"), assumption("dio", "90"), assumption("dpo", "60"),
    assumption("oca_pct", "0.03"), assumption("ocl_pct", "0.03"), assumption("tax", "0.34"),
    assumption("interest_limit", "0.30"), assumption("distributions", "0"), assumption("minimum_cash", "50"),
    assumption("minimum_dscr", "1.20"), assumption("maximum_leverage", "3.50"),
  ];
  const assumptionBook: AssumptionBook = {
    scenarioId: "base-2026-12-31",
    scenarioName: "Preliminary base case",
    asOfDate: "2026-12-31",
    periods,
    assumptions,
  };
  return {
    modelId: "institutional-test",
    currency: "BRL",
    assumptionBook,
    openingBalanceSheet: {
      period: "2026",
      unrestrictedCash: "100",
      restrictedCash: "10",
      receivables: "100",
      inventory: "100",
      otherCurrentAssets: "20",
      netPpe: "500",
      otherAssets: "70",
      payables: "80",
      otherCurrentLiabilities: "20",
      grossDebt: "300",
      otherLiabilities: "100",
      equity: "400",
    },
    revenueSegments: [{
      id: "branded-food",
      baseRevenue: "600",
      volumeGrowthAssumptionId: "volume",
      priceGrowthAssumptionId: "price",
      mixEffectAssumptionId: "mix",
      fxEffectAssumptionId: "fx",
      inorganicRevenueAssumptionId: "inorganic",
    }],
    operatingCosts: [
      {id: "cogs", method: "percent_of_revenue", ratioAssumptionId: "cogs_pct"},
      {id: "sga", method: "base_and_growth", baseCost: "120", growthAssumptionId: "sga_growth"},
    ],
    capex: [
      {id: "maintenance", classification: "maintenance", amountAssumptionId: "maintenance_capex", usefulLifeYears: 10, depreciationConvention: "half_year"},
      {id: "expansion", classification: "growth", amountAssumptionId: "growth_capex", usefulLifeYears: 10, depreciationConvention: "half_year"},
    ],
    existingAssetDepreciationAssumptionId: "existing_da",
    workingCapital: {
      dsoAssumptionId: "dso", dioAssumptionId: "dio", dpoAssumptionId: "dpo",
      otherCurrentAssetsPctRevenueAssumptionId: "oca_pct",
      otherCurrentLiabilitiesPctRevenueAssumptionId: "ocl_pct",
    },
    taxes: {
      cashTaxRateAssumptionId: "tax",
      interestDeductibilityEbitdaPctAssumptionId: "interest_limit",
      openingTaxLossCarryforward: "0",
      openingDisallowedInterestCarryforward: "0",
    },
    debtInstruments: [{
      instrumentId: "debenture-ipca",
      openingPrincipal: "300",
      indexer: "IPCA",
      indexationTreatment: "capitalized_principal",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: [
        {period: "2027", indexationRate: "0.04", couponRate: "0.08", scheduledPrincipal: "50"},
        {period: "2028", indexationRate: "0.04", couponRate: "0.08", scheduledPrincipal: "50"},
      ],
    }],
    debtRateLineage: periods.map((period) => ({
      instrumentId: "debenture-ipca",
      period,
      indexationSourceId: "br-ipca-curve-2026-12-31",
      indexationAsOfDate: "2026-12-31",
      indexationMethodology: "Lagged contractual IPCA scenario from the governed curve",
      couponSourceId: "debenture-contract",
      couponAsOfDate: "2026-12-31",
      couponMethodology: "Contractual spread applied to indexed principal",
    })),
    distributionsAssumptionId: "distributions",
    minimumOperatingCashAssumptionId: "minimum_cash",
    minimumDscrAssumptionId: "minimum_dscr",
    maximumNetLeverageAssumptionId: "maximum_leverage",
    sectorPackId: "sector.food-consumer-staples.br-v1",
  };
}

describe("institutional financial model", () => {
  it("integrates P&L, working capital, cash, debt, taxes and the balance sheet", () => {
    const input = fixture();
    const model = buildInstitutionalFinancialModel(input);
    expect(model.periods).toHaveLength(2);
    expect(model.periods.every((period) => period.balanceCheck === "0")).toBe(true);
    expect(model.periods[0]).toMatchObject({
      revenue: "630.36",
      capitalizedIndexation: "12",
      cashIndexation: "0",
      closingGrossDebt: "262",
    });
    expect(Number(model.periods[0]?.debtService)).toBeGreaterThan(50);
    expect(model.lineage.revenue).toContain("volume");
  });

  it("keeps an edited scenario separate and recalculates deterministically", () => {
    const base = fixture();
    const stressedBook = applyScenarioOverrides(base.assumptionBook, {
      scenarioId: "downside-1",
      scenarioName: "Volume downside",
      overrides: [{
        assumptionId: "volume",
        values: {2027: "-0.05", 2028: "-0.02"},
        rationale: "User-requested demand downside",
        requestedBy: "credit committee",
        createdAt: "2027-01-02T10:00:00Z",
      }],
    });
    const downside = buildInstitutionalFinancialModel({...base, assumptionBook: stressedBook});
    const original = buildInstitutionalFinancialModel(base);
    expect(downside.scenarioId).toBe("downside-1");
    expect(Number(downside.periods[0]?.revenue)).toBeLessThan(Number(original.periods[0]?.revenue));
    expect(base.assumptionBook.scenarioId).toBe("base-2026-12-31");
  });

  it("propagates cash-paid versus principal-capitalized IPCA through all statements", () => {
    const capitalizedInput = fixture();
    const cashPaidInput: InstitutionalModelInput = {
      ...capitalizedInput,
      modelId: "cash-paid-ipca",
      debtInstruments: capitalizedInput.debtInstruments.map((instrument) => ({
        ...instrument,
        indexationTreatment: "cash_paid" as const,
      })),
    };
    const capitalized = buildInstitutionalFinancialModel(capitalizedInput);
    const cashPaid = buildInstitutionalFinancialModel(cashPaidInput);
    expect(capitalized.periods[0]).toMatchObject({capitalizedIndexation: "12", cashIndexation: "0", closingGrossDebt: "262"});
    expect(cashPaid.periods[0]).toMatchObject({capitalizedIndexation: "0", cashIndexation: "12", closingGrossDebt: "250"});
    expect(Number(cashPaid.periods[0]?.unrestrictedCash)).toBeLessThan(Number(capitalized.periods[0]?.unrestrictedCash));
    expect(cashPaid.periods.every((period) => period.balanceCheck === "0")).toBe(true);
  });

  it("fails closed when the opening debt ledger does not reconcile", () => {
    const input = fixture();
    expect(() => buildInstitutionalFinancialModel({
      ...input,
      openingBalanceSheet: {...input.openingBalanceSheet, grossDebt: "290", equity: "410"},
    })).toThrow("opening gross debt");
  });

  it("fails closed when an instrument rate has no dated lineage", () => {
    const input = fixture();
    expect(() => buildInstitutionalFinancialModel({...input, debtRateLineage: []})).toThrow("debt rate lineage is required");
  });

  it("fails closed when assumption evidence is dated after the model", () => {
    const input = fixture();
    const assumptions = input.assumptionBook.assumptions.map((item, index) => index === 0
      ? {...item, evidence: [{...item.evidence[0]!, asOfDate: "2027-01-01"}]}
      : item);
    expect(() => buildInstitutionalFinancialModel({
      ...input,
      assumptionBook: {...input.assumptionBook, assumptions},
    })).toThrow("cannot be dated after the model");
  });

  it("requires independent review and never self-promotes to expert", () => {
    const input = fixture();
    const model = buildInstitutionalFinancialModel(input);
    const review = reviewInstitutionalFinancialModel(input, model);
    expect(review.status).toBe("review_required");
    expect(review.promotionEligible).toBe(false);
    expect(review.findings.some((finding) => finding.severity === "blocker")).toBe(false);
    expect(review.findings).toContainEqual(expect.objectContaining({id: "sector.not-expert"}));
    expect(review.coverage.every((item) => item.status === "covered")).toBe(true);
  });
});
