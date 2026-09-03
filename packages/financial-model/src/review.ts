import Decimal from "decimal.js";

import {validateAssumptionBook, type AssumptionBook} from "./assumptions";
import type {InstitutionalFinancialModel, InstitutionalModelInput} from "./institutional-model";
import {sectorModelPack} from "./sector-packs";

export type ModelReviewFinding = {
  id: string;
  severity: "blocker" | "warning" | "observation";
  period?: string;
  message: string;
  remediation: string;
};

export type InstitutionalModelReview = {
  status: "blocked" | "review_required" | "ready_for_human_review";
  promotionEligible: false;
  findings: readonly ModelReviewFinding[];
  coverage: readonly {
    domain: string;
    status: "covered" | "partial" | "not_examined";
    evidence: readonly string[];
  }[];
};

const d = (value: string) => new Decimal(value);

function assumptionCoverage(book: AssumptionBook, domain: string, ids: readonly string[]) {
  const present = ids.filter((id) => book.assumptions.some((assumption) => assumption.id === id));
  return {
    domain,
    status: present.length === ids.length ? "covered" as const : present.length > 0 ? "partial" as const : "not_examined" as const,
    evidence: present,
  };
}

/**
 * Independent fail-closed review. Passing this function means the arithmetic and declared
 * coverage are internally coherent. It never promotes a model to expert: that still requires
 * benchmark comparison, adversarial tests and named human approval.
 */
export function reviewInstitutionalFinancialModel(
  input: InstitutionalModelInput,
  model: InstitutionalFinancialModel,
): InstitutionalModelReview {
  const findings: ModelReviewFinding[] = [];
  for (const issue of validateAssumptionBook(input.assumptionBook)) {
    findings.push({
      id: `assumption.${issue.assumptionId ?? "book"}`,
      severity: issue.severity,
      message: issue.message,
      remediation: "Complete or correct the governed assumption before relying on the affected output.",
    });
  }
  if (model.scenarioId !== input.assumptionBook.scenarioId) {
    findings.push({id: "scenario.mismatch", severity: "blocker", message: "model and assumption book use different scenario ids", remediation: "Recalculate the model from one immutable scenario version."});
  }
  if (model.asOfDate !== input.assumptionBook.asOfDate) {
    findings.push({id: "asof.mismatch", severity: "blocker", message: "model and assumption book use different as-of dates", remediation: "Align all inputs to a single as-of date."});
  }
  if (d(model.openingBalanceCheck).abs().gt("0.01")) {
    findings.push({id: "balance.opening", severity: "blocker", message: "opening balance sheet does not balance", remediation: "Reconcile opening assets, liabilities and equity to primary evidence."});
  }
  if (d(model.debtOpeningCheck).abs().gt("0.01")) {
    findings.push({id: "debt.opening", severity: "blocker", message: "instrument ledger does not reconcile to opening gross debt", remediation: "Map every debt instrument and resolve the residual explicitly."});
  }
  for (const period of model.periods) {
    if (d(period.balanceCheck).abs().gt("0.01")) {
      findings.push({id: "balance.forecast", severity: "blocker", period: period.period, message: "forecast balance sheet does not balance", remediation: "Repair the cash flow, debt, PP&E, tax or equity roll-forward."});
    }
    if (d(period.closingGrossDebt).lt(0)) {
      findings.push({id: "debt.negative", severity: "blocker", period: period.period, message: "closing gross debt is negative", remediation: "Correct amortization and prepayment constraints."});
    }
    if (d(period.unrestrictedCash).lt(0)) {
      findings.push({id: "liquidity.shortfall", severity: "warning", period: period.period, message: "forecast cash is negative and an unfunded requirement exists", remediation: "Add a financing source, reduce uses or present the funding gap explicitly."});
    }
    if (period.dscr === null) {
      findings.push({id: "coverage.no-service", severity: "observation", period: period.period, message: "DSCR is not meaningful because cash debt service is zero", remediation: "Do not present a numeric DSCR for this period."});
    }
    if (period.minimumDscrHeadroom !== null && d(period.minimumDscrHeadroom).lt(0)) {
      findings.push({id: "covenant.dscr", severity: "warning", period: period.period, message: "minimum DSCR is breached in the scenario", remediation: "Rework sizing, amortization, liquidity support or covenant terms."});
    }
    if (period.maximumNetLeverageHeadroom !== null && d(period.maximumNetLeverageHeadroom).lt(0)) {
      findings.push({id: "covenant.leverage", severity: "warning", period: period.period, message: "maximum net leverage is breached in the scenario", remediation: "Rework debt quantum, deleveraging path, cure mechanics or covenant terms."});
    }
  }
  for (const instrument of input.debtInstruments) {
    const hasIndexation = instrument.periods.some((period) => !d(String(period.indexationRate)).isZero());
    if (hasIndexation && instrument.indexationTreatment === "not_applicable") {
      findings.push({id: "debt.indexation-treatment", severity: "blocker", message: `${instrument.instrumentId} has indexation without a cash or principal-capitalization treatment`, remediation: "Read the instrument and classify how monetary correction is settled."});
    }
  }
  if (input.sectorPackId) {
    const pack = sectorModelPack(input.sectorPackId);
    if (pack.maturity !== "expert") {
      findings.push({id: "sector.not-expert", severity: "observation", message: `${pack.id} is ${pack.maturity}, not expert`, remediation: "Complete gold-case, adversarial, benchmark and named-human homologation gates."});
    }
  } else {
    findings.push({id: "sector.missing", severity: "warning", message: "no sector model pack is active", remediation: "Activate a sector pack or mark sector-specific analysis not examined."});
  }

  const coverage = [
    assumptionCoverage(input.assumptionBook, "revenue drivers", input.revenueSegments.flatMap((driver) => [driver.volumeGrowthAssumptionId, driver.priceGrowthAssumptionId, driver.mixEffectAssumptionId, driver.fxEffectAssumptionId, driver.inorganicRevenueAssumptionId])),
    assumptionCoverage(input.assumptionBook, "operating cost drivers", input.operatingCosts.map((driver) => driver.method === "percent_of_revenue" ? driver.ratioAssumptionId : driver.growthAssumptionId)),
    assumptionCoverage(input.assumptionBook, "working capital", Object.values(input.workingCapital)),
    assumptionCoverage(input.assumptionBook, "capex and depreciation", [input.existingAssetDepreciationAssumptionId, ...input.capex.map((driver) => driver.amountAssumptionId)]),
    assumptionCoverage(input.assumptionBook, "tax", [input.taxes.cashTaxRateAssumptionId, ...(input.taxes.interestDeductibilityEbitdaPctAssumptionId ? [input.taxes.interestDeductibilityEbitdaPctAssumptionId] : [])]),
    {domain: "instrument-level debt", status: input.debtInstruments.length > 0 ? "covered" as const : "not_examined" as const, evidence: input.debtInstruments.map((instrument) => instrument.instrumentId)},
    assumptionCoverage(input.assumptionBook, "liquidity", [input.minimumOperatingCashAssumptionId]),
    assumptionCoverage(input.assumptionBook, "covenants", [input.minimumDscrAssumptionId, input.maximumNetLeverageAssumptionId].filter((value): value is string => Boolean(value))),
  ];
  const hasBlocker = findings.some((finding) => finding.severity === "blocker");
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  return {
    status: hasBlocker ? "blocked" : hasWarning ? "review_required" : "ready_for_human_review",
    promotionEligible: false,
    findings,
    coverage,
  };
}
