import {
  calculateAdjustedDebtBridge,
  calculateImplicitAdvanceRate,
  calculateReceivablesCet,
  calculateSingleMaturityReceivablesProposal,
  convertReceivablesRate,
  receivablesStructureCostFormulaVersion,
  type AssertionProvenance,
  type SourceAnchor,
} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

const reportingDate = "2026-06-30" as const;
const datasetHash = "a".repeat(64);
const universeId = "unit-test-receivables";
const source = (fileId: string, row = 1): SourceAnchor => ({
  kind: "file",
  fileId,
  fileHash: datasetHash,
  sheet: "Test",
  row,
});

const measuredProvenance = (fileId: string): AssertionProvenance => ({
  kind: "measured",
  datasetHash,
  anchors: [source(fileId)],
  universe: universeId,
  reportingDate,
  inclusions: [],
  exclusions: [],
  formula: {id: "test.input", version: "v1"},
});

const estimatedProvenance = (method: string): AssertionProvenance => ({
  kind: "estimated",
  method,
  sources: ["approved scenario assumption"],
  asOf: reportingDate,
  owner: "credit desk",
  confidence: "medium",
  validUntil: "2026-09-30",
});

describe("receivables structure and cost", () => {
  it("reconciles adjusted debt without hiding the gap in company-declared debt", () => {
    const result = calculateAdjustedDebtBridge({
      reportingDate,
      currency: "BRL",
      universeId,
      datasetHash,
      companyDeclaredDebt: {value: "12000000", source: source("intake", 1)},
      cash: {value: "1320000", source: source("balance-sheet", 2)},
      ebitdaForLeverage: {value: "4160000", source: source("income-statement", 3), periodStart: "2025-01-01", periodEnd: "2025-12-31", basis: "adjusted_approved"},
      positions: [
        {id: "bank-working-capital", creditor: "Bank A", category: "bank_debt", principal: "8400000", declarationStatus: "company_declared", sources: [source("bank-position", 1)]},
        {id: "overdraft", creditor: "Bank B", category: "bank_debt", principal: "2100000", declarationStatus: "company_declared", sources: [source("bank-position", 2)]},
        {id: "finame", creditor: "Bank C", category: "bank_debt", principal: "2000000", declarationStatus: "company_declared", sources: [source("bank-position", 3)]},
        {id: "discount", creditor: "Bank D", category: "receivables_assignment_with_recourse", principal: "4180000", declarationStatus: "identified_not_declared", sources: [source("debt-balance"), source("discount-contract")]},
        {id: "reverse-factoring", creditor: "Bank E", category: "reverse_factoring", principal: "2960000", declarationStatus: "identified_not_declared", sources: [source("debt-balance"), source("reverse-factoring-contract")]},
        {id: "factoring", creditor: "Factor F", category: "factoring_with_recourse", principal: "1740000", declarationStatus: "identified_not_declared", sources: [source("debt-balance"), source("factoring-contract")]},
        {id: "tax", creditor: "Tax authority", category: "tax_installment", principal: "880000", declarationStatus: "identified_not_declared", sources: [source("tax-schedule")]},
        {id: "non-recourse", creditor: "Fund G", category: "receivables_assignment_without_recourse", principal: "250000", declarationStatus: "identified_not_declared", sources: [source("non-recourse-contract")]},
      ],
    });

    expect(result.version).toBe(receivablesStructureCostFormulaVersion);
    expect(result.companyDeclaredDebt.value).toBe("12000000");
    expect(result.declaredPositionSubtotal.value).toBe("12500000");
    expect(result.identifiedNotDeclaredSubtotal.value).toBe("9760000");
    expect(result.declaredPositionMismatch.value).toBe("500000");
    expect(result.adjustedGrossDebt.value).toBe("22260000");
    expect(result.adjustmentToCompanyDeclaration.value).toBe("10260000");
    expect(result.adjustedNetDebt.value).toBe("20940000");
    expect(result.adjustedNetLeverage.value).toBe("5.03365385");
    expect(result.lines.find((line) => line.id === "non-recourse")?.included).toBe(false);
    expect(result.quality.warnings).toEqual([
      "declared debt does not reconcile to positions identified as company-declared",
      "financial obligations identified outside the company-declared debt amount",
    ]);
    expect(result.adjustedGrossDebt.provenance.anchors.length).toBe(12);
  });

  it("normalizes inside and outside monthly quotes without treating discount on face as effective cost", () => {
    const common = {
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      faceValue: "100000",
      calendarDays: 61,
      source: source("proposal"),
    } as const;
    const inside = convertReceivablesRate({...common, quote: {regime: "inside_compound_monthly", monthlyRate: "0.018"}});
    const outside = convertReceivablesRate({...common, quote: {regime: "outside_simple_monthly", monthlyDiscountRate: "0.018"}});

    expect(inside.acquisitionPrice.value).toBe("96437.55358748");
    expect(inside.effectiveMonthlyRate.value).toBe("0.018");
    expect(outside.acquisitionPrice.value).toBe("96340");
    expect(outside.discountShareOfFace.value).toBe("0.0366");
    expect(outside.effectiveMonthlyRate.value).toBe("0.01850683");
    expect(Number(outside.effectiveMonthlyRate.value)).toBeGreaterThan(Number(inside.effectiveMonthlyRate.value));
  });

  it("compounds annual CDI and spread independently on a 252-business-day basis", () => {
    const result = convertReceivablesRate({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      faceValue: "100000",
      calendarDays: 61,
      quote: {regime: "inside_compound_annual_business", annualRates: ["0.1365", "0.06"], businessDays: 42},
      source: source("proposal"),
    });
    expect(result.acquisitionPrice.value).toBe("96943.96591253");
    expect(result.discountAmount.value).toBe("3056.03408747");
    expect(result.effectiveMonthlyRate.value).toBe("0.01538121");
    expect(result.effectiveAnnualRate.value).toBe("0.2040772");
    expect(result.businessDays).toBe(42);
  });

  it("calculates CET from actual dated flows and produces the same result for economically equivalent formats", () => {
    const compact = calculateReceivablesCet({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      taxTreatment: {status: "not_provided"},
      cashFlows: [
        {id: "net-proceeds", date: "2026-01-01", amount: "94570", direction: "borrower_inflow", kind: "disbursement", source: source("factoring-proposal")},
        {id: "title-settlement", date: "2026-02-12", amount: "100000", direction: "borrower_outflow", kind: "principal", source: source("factoring-proposal")},
      ],
    });
    const decomposed = calculateReceivablesCet({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      taxTreatment: {status: "not_provided"},
      cashFlows: [
        {id: "gross-proceeds", date: "2026-01-01", amount: "100000", direction: "borrower_inflow", kind: "disbursement", source: source("factoring-proposal")},
        {id: "outside-discount", date: "2026-01-01", amount: "4830", direction: "borrower_outflow", kind: "discount", source: source("factoring-proposal")},
        {id: "ad-valorem", date: "2026-01-01", amount: "600", direction: "borrower_outflow", kind: "fee", source: source("factoring-proposal")},
        {id: "title-settlement", date: "2026-02-12", amount: "100000", direction: "borrower_outflow", kind: "principal", source: source("factoring-proposal")},
      ],
    });

    expect(compact.netInitialProceeds.value).toBe("94570");
    expect(compact.effectiveMonthlyRate.value).toBe("0.04068431");
    expect(compact.effectiveAnnualRate.value).toBe("0.62448085");
    expect(decomposed.effectiveAnnualRate.value).toBe(compact.effectiveAnnualRate.value);
    expect(decomposed.netInitialProceeds.value).toBe(compact.netInitialProceeds.value);
    expect(decomposed.fees.value).toBe("600");
    expect(decomposed.taxes.value).toBe("0");
    expect(decomposed.status).toBe("calculated_with_missing_tax_input");
    expect(decomposed.quality.warnings).toContain("tax treatment was not supplied; the calculated rate is not a complete CET and no tax was imputed");
  });

  it("includes per-title charges and explicit tax cash flows in CET", () => {
    const withoutCharges = calculateReceivablesCet({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      taxTreatment: {status: "not_provided"},
      cashFlows: [
        {id: "proceeds", date: "2026-01-01", amount: "97000", direction: "borrower_inflow", kind: "disbursement", source: source("proposal")},
        {id: "settlement", date: "2026-02-10", amount: "100000", direction: "borrower_outflow", kind: "principal", source: source("proposal")},
      ],
    });
    const withCharges = calculateReceivablesCet({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      taxTreatment: {status: "provided", source: source("tax-calculation")},
      cashFlows: [
        {id: "gross-proceeds", date: "2026-01-01", amount: "100000", direction: "borrower_inflow", kind: "disbursement", source: source("proposal")},
        {id: "discount", date: "2026-01-01", amount: "3000", direction: "borrower_outflow", kind: "discount", source: source("proposal")},
        {id: "100-title-fee", date: "2026-01-01", amount: "700", direction: "borrower_outflow", kind: "fee", source: source("proposal")},
        {id: "iof-supplied", date: "2026-01-01", amount: "250", direction: "borrower_outflow", kind: "tax", source: source("tax-calculation")},
        {id: "settlement", date: "2026-02-10", amount: "100000", direction: "borrower_outflow", kind: "principal", source: source("proposal")},
      ],
    });
    expect(withCharges.fees.value).toBe("700");
    expect(withCharges.taxes.value).toBe("250");
    expect(withCharges.netInitialProceeds.value).toBe("96050");
    expect(withCharges.status).toBe("calculated_complete");
    expect(Number(withCharges.effectiveAnnualRate.value)).toBeGreaterThan(Number(withoutCharges.effectiveAnnualRate.value));
    expect(withCharges.quality.warnings).toEqual([]);
  });

  it("builds proposal cash flows without duplicating rate or fee arithmetic in orchestration", () => {
    const result = calculateSingleMaturityReceivablesProposal({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      faceValue: "100000",
      startDate: "2026-01-01",
      maturityDate: "2026-02-12",
      quote: {regime: "outside_simple_monthly", monthlyDiscountRate: "0.0345"},
      charges: [
        {id: "ad-valorem", kind: "ad_valorem_face_fee", rate: "0.006", source: source("factoring-contract")},
        {id: "registration", kind: "per_title_fee", amountPerTitle: "3.80", titleCount: 25, source: source("fee-schedule")},
      ],
      taxTreatment: {status: "not_provided"},
      source: source("factoring-contract"),
    });
    expect(result.rateConversion.acquisitionPrice.value).toBe("95170");
    expect(result.chargeAmounts).toEqual([
      {id: "ad-valorem", kind: "ad_valorem_face_fee", amount: "600", source: source("factoring-contract")},
      {id: "registration", kind: "per_title_fee", amount: "95", source: source("fee-schedule")},
    ]);
    expect(result.cet.netInitialProceeds.value).toBe("94475");
    expect(result.cet.fees.value).toBe("695");
    expect(Number(result.cet.effectiveAnnualRate.value)).toBeGreaterThan(0.62448085);
  });

  it("fails closed for non-conventional or incomplete CET inputs", () => {
    expect(() => calculateReceivablesCet({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      taxTreatment: {status: "not_provided"},
      cashFlows: [
        {id: "outflow-first", date: "2026-01-01", amount: "100", direction: "borrower_outflow", kind: "fee", source: source("proposal")},
        {id: "inflow-later", date: "2026-02-01", amount: "100", direction: "borrower_inflow", kind: "disbursement", source: source("proposal")},
      ],
    })).toThrow("earliest net cash flow must be a borrower inflow");
  });

  it("keeps every advance-rate assumption visible and fails closed when one is absent", () => {
    const complete = calculateImplicitAdvanceRate({
      reportingDate,
      periodStart: "2024-07-01",
      universeId,
      expectedDilution: {id: "expected-dilution", value: "0.02447267", basis: "measured dilution as a share of origination", provenance: measuredProvenance("dynamic-metrics")},
      dilutionStressMultiplier: {id: "dilution-stress", value: "1.5", basis: "governed scenario multiplier", provenance: estimatedProvenance("credit-desk stress scenario")},
      expectedLossRate: {id: "expected-loss", value: "0.01616655", basis: "governed expected loss assumption", provenance: measuredProvenance("dynamic-metrics")},
      lossStressMultiplier: {id: "loss-stress", value: "1.5", basis: "governed scenario multiplier", provenance: estimatedProvenance("credit-desk stress scenario")},
      operationalReserve: {id: "operational-reserve", value: "0.01", basis: "governed operating reserve", provenance: estimatedProvenance("operational reserve scenario")},
    });
    expect(complete.status).toBe("calculated");
    expect(complete.stressedDilutionReserve.value).toBe("0.03670901");
    expect(complete.stressedLossReserve.value).toBe("0.02424983");
    expect(complete.totalReserve.value).toBe("0.07095883");
    expect(complete.implicitAdvanceRate.value).toBe("0.92904117");
    expect(complete.implicitAdvanceRate.inputs).toHaveLength(5);
    expect(complete.implicitAdvanceRate.inputs.map((item) => item.provenance.kind)).toEqual([
      "measured",
      "estimated",
      "measured",
      "estimated",
      "estimated",
    ]);

    const incomplete = calculateImplicitAdvanceRate({
      reportingDate,
      periodStart: "2024-07-01",
      universeId,
      expectedDilution: {id: "expected-dilution", value: "0.02", basis: "test basis", provenance: measuredProvenance("dynamic-metrics")},
    });
    expect(incomplete.status).toBe("not_evaluable");
    expect(incomplete.implicitAdvanceRate.value).toBeNull();
    expect(incomplete.quality.warnings[0]).toContain("missing governed assumptions");
  });

  it("rejects rate and reserve inputs that could produce nonsensical economics", () => {
    expect(() => convertReceivablesRate({
      reportingDate,
      universeId,
      datasetHash,
      currency: "BRL",
      faceValue: "100",
      calendarDays: 400,
      quote: {regime: "outside_simple_monthly", monthlyDiscountRate: "0.10"},
      source: source("proposal"),
    })).toThrow("outside discount consumes the entire face value");
    expect(() => calculateImplicitAdvanceRate({
      reportingDate,
      periodStart: "2024-07-01",
      universeId,
      expectedDilution: {id: "d", value: "0.5", basis: "test basis", provenance: measuredProvenance("d")},
      dilutionStressMultiplier: {id: "ds", value: "1.5", basis: "test basis", provenance: estimatedProvenance("stress")},
      expectedLossRate: {id: "l", value: "0.2", basis: "test basis", provenance: measuredProvenance("l")},
      lossStressMultiplier: {id: "ls", value: "1.5", basis: "test basis", provenance: estimatedProvenance("stress")},
      operationalReserve: {id: "o", value: "0.1", basis: "test basis", provenance: estimatedProvenance("reserve")},
    })).toThrow("total reserve must remain below one");
  });
});
