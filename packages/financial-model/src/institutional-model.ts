import {
  aggregateIndexedDebtSchedules,
  buildIndexedDebtSchedule,
  type IndexedDebtInstrumentInput,
} from "@offroad/financial-core";
import Decimal from "decimal.js";

import {assumptionValue, validateAssumptionBook, type AssumptionBook} from "./assumptions";

export type OpeningBalanceSheet = {
  period: string;
  unrestrictedCash: string;
  restrictedCash: string;
  receivables: string;
  inventory: string;
  otherCurrentAssets: string;
  netPpe: string;
  otherAssets: string;
  payables: string;
  otherCurrentLiabilities: string;
  grossDebt: string;
  otherLiabilities: string;
  equity: string;
};

export type RevenueSegmentDriver = {
  id: string;
  baseRevenue: string;
  volumeGrowthAssumptionId: string;
  priceGrowthAssumptionId: string;
  mixEffectAssumptionId: string;
  fxEffectAssumptionId: string;
  inorganicRevenueAssumptionId: string;
};

export type OperatingCostDriver =
  | {id: string; method: "percent_of_revenue"; ratioAssumptionId: string}
  | {id: string; method: "base_and_growth"; baseCost: string; growthAssumptionId: string};

export type CapexDriver = {
  id: string;
  classification: "maintenance" | "growth";
  amountAssumptionId: string;
  usefulLifeYears: number;
  depreciationConvention: "next_period" | "half_year";
};

export type WorkingCapitalDrivers = {
  dsoAssumptionId: string;
  dioAssumptionId: string;
  dpoAssumptionId: string;
  otherCurrentAssetsPctRevenueAssumptionId: string;
  otherCurrentLiabilitiesPctRevenueAssumptionId: string;
};

export type TaxDrivers = {
  cashTaxRateAssumptionId: string;
  interestDeductibilityEbitdaPctAssumptionId?: string;
  openingTaxLossCarryforward?: string;
  openingDisallowedInterestCarryforward?: string;
};

export type DebtRateLineage = {
  instrumentId: string;
  period: string;
  indexationSourceId: string;
  indexationAsOfDate: string;
  indexationMethodology: string;
  couponSourceId: string;
  couponAsOfDate: string;
  couponMethodology: string;
};

export type InstitutionalModelInput = {
  modelId: string;
  currency: string;
  assumptionBook: AssumptionBook;
  openingBalanceSheet: OpeningBalanceSheet;
  revenueSegments: readonly RevenueSegmentDriver[];
  operatingCosts: readonly OperatingCostDriver[];
  capex: readonly CapexDriver[];
  existingAssetDepreciationAssumptionId: string;
  workingCapital: WorkingCapitalDrivers;
  taxes: TaxDrivers;
  debtInstruments: readonly IndexedDebtInstrumentInput[];
  debtRateLineage: readonly DebtRateLineage[];
  distributionsAssumptionId: string;
  minimumOperatingCashAssumptionId: string;
  minimumDscrAssumptionId?: string;
  maximumNetLeverageAssumptionId?: string;
  sectorPackId?: string;
};

export type InstitutionalModelPeriod = {
  period: string;
  revenue: string;
  revenueBySegment: Readonly<Record<string, string>>;
  operatingCosts: string;
  operatingCostsByLine: Readonly<Record<string, string>>;
  ebitda: string;
  depreciation: string;
  ebit: string;
  cashCoupon: string;
  cashIndexation: string;
  capitalizedCoupon: string;
  capitalizedIndexation: string;
  financeExpense: string;
  accountingEbt: string;
  taxableIncome: string;
  cashTax: string;
  netIncome: string;
  receivables: string;
  inventory: string;
  payables: string;
  otherCurrentAssets: string;
  otherCurrentLiabilities: string;
  netWorkingCapital: string;
  changeInNetWorkingCapital: string;
  maintenanceCapex: string;
  growthCapex: string;
  totalCapex: string;
  cfads: string;
  principalPaid: string;
  debtService: string;
  debtDrawdown: string;
  distributions: string;
  openingGrossDebt: string;
  closingGrossDebt: string;
  unrestrictedCash: string;
  restrictedCash: string;
  netPpe: string;
  otherAssets: string;
  otherLiabilities: string;
  equity: string;
  totalAssets: string;
  totalLiabilitiesAndEquity: string;
  balanceCheck: string;
  netDebt: string;
  netDebtToEbitda: string | null;
  dscr: string | null;
  interestCoverage: string | null;
  liquidityHeadroom: string;
  taxLossCarryforward: string;
  disallowedInterestCarryforward: string;
  minimumDscrHeadroom: string | null;
  maximumNetLeverageHeadroom: string | null;
};

export type InstitutionalFinancialModel = {
  modelId: string;
  currency: string;
  scenarioId: string;
  asOfDate: string;
  sectorPackId?: string;
  openingBalanceCheck: string;
  debtOpeningCheck: string;
  periods: readonly InstitutionalModelPeriod[];
  lineage: Readonly<Record<string, readonly string[]>>;
  limitations: readonly string[];
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const sum = (values: readonly Decimal[]) => values.reduce((total, value) => total.plus(value), new Decimal(0));
const safeRatio = (numerator: Decimal, denominator: Decimal): string | null =>
  denominator.lte(0) ? null : out(numerator.div(denominator));

function balanceTotalAssets(balance: OpeningBalanceSheet): Decimal {
  return sum([
    d(balance.unrestrictedCash), d(balance.restrictedCash), d(balance.receivables), d(balance.inventory),
    d(balance.otherCurrentAssets), d(balance.netPpe), d(balance.otherAssets),
  ]);
}

function balanceTotalLiabilitiesAndEquity(balance: OpeningBalanceSheet): Decimal {
  return sum([
    d(balance.payables), d(balance.otherCurrentLiabilities), d(balance.grossDebt),
    d(balance.otherLiabilities), d(balance.equity),
  ]);
}

function depreciationFromNewCapex(
  driver: CapexDriver,
  capexByPeriod: readonly Decimal[],
  currentPeriodIndex: number,
): Decimal {
  const life = d(driver.usefulLifeYears);
  return capexByPeriod.reduce((total, amount, vintageIndex) => {
    if (vintageIndex > currentPeriodIndex) return total;
    if (driver.depreciationConvention === "next_period" && vintageIndex === currentPeriodIndex) return total;
    const factor = driver.depreciationConvention === "half_year" && vintageIndex === currentPeriodIndex ? d("0.5") : d(1);
    return total.plus(amount.div(life).mul(factor));
  }, d(0));
}

export function buildInstitutionalFinancialModel(input: InstitutionalModelInput): InstitutionalFinancialModel {
  if (!input.modelId.trim()) throw new RangeError("model id is required");
  if (input.revenueSegments.length === 0) throw new RangeError("at least one revenue segment is required");
  if (input.operatingCosts.length === 0) throw new RangeError("at least one operating cost line is required");
  if (input.capex.length === 0) throw new RangeError("at least one capex line is required");
  const assumptionBlockers = validateAssumptionBook(input.assumptionBook).filter((issue) => issue.severity === "blocker");
  if (assumptionBlockers.length > 0) throw new RangeError(assumptionBlockers.map((issue) => issue.message).join("; "));
  const periods = [...input.assumptionBook.periods];
  if (input.debtInstruments.length === 0) throw new RangeError("instrument-level debt schedules are required");
  for (const debt of input.debtInstruments) {
    if (debt.periods.map((period) => period.period).join("|") !== periods.join("|")) {
      throw new RangeError(`debt periods do not match the model horizon: ${debt.instrumentId}`);
    }
    for (const period of debt.periods) {
      const rateLineage = input.debtRateLineage.find((candidate) => candidate.instrumentId === debt.instrumentId && candidate.period === period.period);
      if (!rateLineage) throw new RangeError(`debt rate lineage is required: ${debt.instrumentId}:${period.period}`);
      if (!rateLineage.indexationSourceId.trim() || !rateLineage.indexationMethodology.trim() || !rateLineage.couponSourceId.trim() || !rateLineage.couponMethodology.trim()) {
        throw new RangeError(`debt rate lineage is incomplete: ${debt.instrumentId}:${period.period}`);
      }
      if (rateLineage.indexationAsOfDate > input.assumptionBook.asOfDate || rateLineage.couponAsOfDate > input.assumptionBook.asOfDate) {
        throw new RangeError(`debt rate lineage is dated after the model: ${debt.instrumentId}:${period.period}`);
      }
    }
  }
  for (const capex of input.capex) {
    if (!Number.isInteger(capex.usefulLifeYears) || capex.usefulLifeYears <= 0) throw new RangeError(`invalid useful life: ${capex.id}`);
  }

  const debtSchedules = input.debtInstruments.map(buildIndexedDebtSchedule);
  const debtRows = aggregateIndexedDebtSchedules(debtSchedules);
  const debtOpening = sum(input.debtInstruments.map((instrument) => d(instrument.openingPrincipal)));
  const openingBalanceCheck = balanceTotalAssets(input.openingBalanceSheet).minus(balanceTotalLiabilitiesAndEquity(input.openingBalanceSheet));
  const debtOpeningCheck = d(input.openingBalanceSheet.grossDebt).minus(debtOpening);
  if (!openingBalanceCheck.abs().lte("0.01")) throw new RangeError("opening balance sheet does not balance");
  if (!debtOpeningCheck.abs().lte("0.01")) throw new RangeError("opening gross debt does not reconcile to the instrument ledger");

  const revenueState = new Map(input.revenueSegments.map((segment) => [segment.id, d(segment.baseRevenue)]));
  const costState = new Map(input.operatingCosts.flatMap((cost) => cost.method === "base_and_growth" ? [[cost.id, d(cost.baseCost)] as const] : []));
  const capexSchedules = new Map(input.capex.map((driver) => [driver.id, periods.map((period) => assumptionValue(input.assumptionBook, driver.amountAssumptionId, period))]));
  const result: InstitutionalModelPeriod[] = [];

  let priorNwc = sum([
    d(input.openingBalanceSheet.receivables), d(input.openingBalanceSheet.inventory), d(input.openingBalanceSheet.otherCurrentAssets),
    d(input.openingBalanceSheet.payables).neg(), d(input.openingBalanceSheet.otherCurrentLiabilities).neg(),
  ]);
  let cash = d(input.openingBalanceSheet.unrestrictedCash);
  let ppe = d(input.openingBalanceSheet.netPpe);
  let equity = d(input.openingBalanceSheet.equity);
  let taxLossCarryforward = d(input.taxes.openingTaxLossCarryforward ?? 0);
  let disallowedInterestCarryforward = d(input.taxes.openingDisallowedInterestCarryforward ?? 0);

  periods.forEach((period, periodIndex) => {
    const revenueBySegment: Record<string, string> = {};
    for (const segment of input.revenueSegments) {
      const prior = revenueState.get(segment.id);
      if (!prior) throw new RangeError(`missing revenue state: ${segment.id}`);
      const organicFactor = d(1)
        .plus(assumptionValue(input.assumptionBook, segment.volumeGrowthAssumptionId, period))
        .mul(d(1).plus(assumptionValue(input.assumptionBook, segment.priceGrowthAssumptionId, period)))
        .mul(d(1).plus(assumptionValue(input.assumptionBook, segment.mixEffectAssumptionId, period)))
        .mul(d(1).plus(assumptionValue(input.assumptionBook, segment.fxEffectAssumptionId, period)));
      const current = prior.mul(organicFactor).plus(assumptionValue(input.assumptionBook, segment.inorganicRevenueAssumptionId, period));
      revenueState.set(segment.id, current);
      revenueBySegment[segment.id] = out(current);
    }
    const revenue = sum(Object.values(revenueBySegment).map(d));

    const operatingCostsByLine: Record<string, string> = {};
    for (const cost of input.operatingCosts) {
      let current: Decimal;
      if (cost.method === "percent_of_revenue") {
        current = revenue.mul(assumptionValue(input.assumptionBook, cost.ratioAssumptionId, period));
      } else {
        const prior = costState.get(cost.id);
        if (!prior) throw new RangeError(`missing cost state: ${cost.id}`);
        current = prior.mul(d(1).plus(assumptionValue(input.assumptionBook, cost.growthAssumptionId, period)));
        costState.set(cost.id, current);
      }
      operatingCostsByLine[cost.id] = out(current);
    }
    const operatingCosts = sum(Object.values(operatingCostsByLine).map(d));
    const ebitda = revenue.minus(operatingCosts);

    const currentCapex = input.capex.map((driver) => ({driver, amount: capexSchedules.get(driver.id)?.[periodIndex] ?? d(0)}));
    const maintenanceCapex = sum(currentCapex.filter(({driver}) => driver.classification === "maintenance").map(({amount}) => amount));
    const growthCapex = sum(currentCapex.filter(({driver}) => driver.classification === "growth").map(({amount}) => amount));
    const totalCapex = maintenanceCapex.plus(growthCapex);
    const newAssetDepreciation = sum(input.capex.map((driver) => depreciationFromNewCapex(driver, capexSchedules.get(driver.id) ?? [], periodIndex)));
    const depreciation = assumptionValue(input.assumptionBook, input.existingAssetDepreciationAssumptionId, period).plus(newAssetDepreciation);
    const ebit = ebitda.minus(depreciation);

    const debtRow = debtRows[periodIndex];
    if (!debtRow || debtRow.period !== period) throw new RangeError(`missing aggregate debt row for ${period}`);
    const cashCoupon = d(debtRow.couponPaid);
    const cashIndexation = d(debtRow.indexationPaid);
    const capitalizedCoupon = d(debtRow.couponCapitalized);
    const capitalizedIndexation = d(debtRow.indexationCapitalized);
    const financeExpense = d(debtRow.financeExpense);
    const accountingEbt = ebit.minus(financeExpense);

    const interestCapacity = input.taxes.interestDeductibilityEbitdaPctAssumptionId
      ? Decimal.max(ebitda, 0).mul(assumptionValue(input.assumptionBook, input.taxes.interestDeductibilityEbitdaPctAssumptionId, period))
      : financeExpense.plus(disallowedInterestCarryforward);
    const deductibleCurrentInterest = Decimal.min(financeExpense, interestCapacity);
    const unusedCapacity = Decimal.max(interestCapacity.minus(deductibleCurrentInterest), 0);
    const priorDisallowedUsed = Decimal.min(disallowedInterestCarryforward, unusedCapacity);
    disallowedInterestCarryforward = disallowedInterestCarryforward.plus(financeExpense).minus(deductibleCurrentInterest).minus(priorDisallowedUsed);
    const preNolTaxableIncome = Decimal.max(ebit.minus(deductibleCurrentInterest).minus(priorDisallowedUsed), 0);
    const currentLoss = Decimal.max(ebit.minus(deductibleCurrentInterest).minus(priorDisallowedUsed).neg(), 0);
    const nolUtilized = Decimal.min(taxLossCarryforward, preNolTaxableIncome);
    const taxableIncome = preNolTaxableIncome.minus(nolUtilized);
    taxLossCarryforward = taxLossCarryforward.minus(nolUtilized).plus(currentLoss);
    const cashTax = taxableIncome.mul(assumptionValue(input.assumptionBook, input.taxes.cashTaxRateAssumptionId, period));
    const netIncome = accountingEbt.minus(cashTax);

    const dso = assumptionValue(input.assumptionBook, input.workingCapital.dsoAssumptionId, period);
    const dio = assumptionValue(input.assumptionBook, input.workingCapital.dioAssumptionId, period);
    const dpo = assumptionValue(input.assumptionBook, input.workingCapital.dpoAssumptionId, period);
    const receivables = revenue.mul(dso).div(365);
    const inventory = operatingCosts.mul(dio).div(365);
    const payables = operatingCosts.mul(dpo).div(365);
    const otherCurrentAssets = revenue.mul(assumptionValue(input.assumptionBook, input.workingCapital.otherCurrentAssetsPctRevenueAssumptionId, period));
    const otherCurrentLiabilities = revenue.mul(assumptionValue(input.assumptionBook, input.workingCapital.otherCurrentLiabilitiesPctRevenueAssumptionId, period));
    const nwc = receivables.plus(inventory).plus(otherCurrentAssets).minus(payables).minus(otherCurrentLiabilities);
    const changeInNwc = nwc.minus(priorNwc);
    priorNwc = nwc;

    const cfads = ebitda.minus(cashTax).minus(changeInNwc).minus(totalCapex);
    const principalPaid = d(debtRow.scheduledPrincipal).plus(debtRow.prepayment);
    const debtService = cashCoupon.plus(cashIndexation).plus(principalPaid);
    const debtDrawdown = d(debtRow.drawdown);
    const distributions = assumptionValue(input.assumptionBook, input.distributionsAssumptionId, period);
    cash = cash.plus(ebitda).minus(cashTax).minus(changeInNwc).minus(totalCapex)
      .minus(cashCoupon).minus(cashIndexation).plus(debtDrawdown).minus(principalPaid).minus(distributions);
    ppe = ppe.plus(totalCapex).minus(depreciation);
    equity = equity.plus(netIncome).minus(distributions);
    const closingGrossDebt = d(debtRow.closingPrincipal);
    const restrictedCash = d(input.openingBalanceSheet.restrictedCash);
    const otherAssets = d(input.openingBalanceSheet.otherAssets);
    const otherLiabilities = d(input.openingBalanceSheet.otherLiabilities);
    const totalAssets = sum([cash, restrictedCash, receivables, inventory, otherCurrentAssets, ppe, otherAssets]);
    const totalLiabilitiesAndEquity = sum([payables, otherCurrentLiabilities, closingGrossDebt, otherLiabilities, equity]);
    const balanceCheck = totalAssets.minus(totalLiabilitiesAndEquity);
    const netDebt = closingGrossDebt.minus(cash);
    const minimumCash = assumptionValue(input.assumptionBook, input.minimumOperatingCashAssumptionId, period);
    const dscr = safeRatio(cfads, debtService);
    const leverage = safeRatio(netDebt, ebitda);
    const minimumDscr = input.minimumDscrAssumptionId ? assumptionValue(input.assumptionBook, input.minimumDscrAssumptionId, period) : null;
    const maximumLeverage = input.maximumNetLeverageAssumptionId ? assumptionValue(input.assumptionBook, input.maximumNetLeverageAssumptionId, period) : null;

    result.push({
      period, revenue: out(revenue), revenueBySegment, operatingCosts: out(operatingCosts), operatingCostsByLine,
      ebitda: out(ebitda), depreciation: out(depreciation), ebit: out(ebit), cashCoupon: out(cashCoupon),
      cashIndexation: out(cashIndexation), capitalizedCoupon: out(capitalizedCoupon), capitalizedIndexation: out(capitalizedIndexation),
      financeExpense: out(financeExpense), accountingEbt: out(accountingEbt), taxableIncome: out(taxableIncome),
      cashTax: out(cashTax), netIncome: out(netIncome), receivables: out(receivables), inventory: out(inventory),
      payables: out(payables), otherCurrentAssets: out(otherCurrentAssets), otherCurrentLiabilities: out(otherCurrentLiabilities),
      netWorkingCapital: out(nwc), changeInNetWorkingCapital: out(changeInNwc), maintenanceCapex: out(maintenanceCapex),
      growthCapex: out(growthCapex), totalCapex: out(totalCapex), cfads: out(cfads), principalPaid: out(principalPaid),
      debtService: out(debtService), debtDrawdown: out(debtDrawdown), distributions: out(distributions),
      openingGrossDebt: debtRow.openingPrincipal, closingGrossDebt: out(closingGrossDebt), unrestrictedCash: out(cash),
      restrictedCash: out(restrictedCash), netPpe: out(ppe), otherAssets: out(otherAssets), otherLiabilities: out(otherLiabilities),
      equity: out(equity), totalAssets: out(totalAssets), totalLiabilitiesAndEquity: out(totalLiabilitiesAndEquity),
      balanceCheck: out(balanceCheck), netDebt: out(netDebt), netDebtToEbitda: leverage, dscr,
      interestCoverage: safeRatio(ebitda, cashCoupon.plus(cashIndexation)), liquidityHeadroom: out(cash.minus(minimumCash)),
      taxLossCarryforward: out(taxLossCarryforward), disallowedInterestCarryforward: out(disallowedInterestCarryforward),
      minimumDscrHeadroom: minimumDscr && dscr !== null ? out(d(dscr).minus(minimumDscr)) : null,
      maximumNetLeverageHeadroom: maximumLeverage && leverage !== null ? out(maximumLeverage.minus(d(leverage))) : null,
    });
  });

  const lineage: Record<string, readonly string[]> = {
    revenue: input.revenueSegments.flatMap((segment) => [segment.volumeGrowthAssumptionId, segment.priceGrowthAssumptionId, segment.mixEffectAssumptionId, segment.fxEffectAssumptionId, segment.inorganicRevenueAssumptionId]),
    operatingCosts: input.operatingCosts.map((cost) => cost.method === "percent_of_revenue" ? cost.ratioAssumptionId : cost.growthAssumptionId),
    workingCapital: Object.values(input.workingCapital),
    capexAndDepreciation: [input.existingAssetDepreciationAssumptionId, ...input.capex.map((driver) => driver.amountAssumptionId)],
    taxes: [input.taxes.cashTaxRateAssumptionId, ...(input.taxes.interestDeductibilityEbitdaPctAssumptionId ? [input.taxes.interestDeductibilityEbitdaPctAssumptionId] : [])],
    debt: [
      ...input.debtInstruments.map((instrument) => instrument.instrumentId),
      ...input.debtRateLineage.flatMap((lineage) => [lineage.indexationSourceId, lineage.couponSourceId]),
    ],
    distributions: [input.distributionsAssumptionId],
    liquidity: [input.minimumOperatingCashAssumptionId],
  };

  return {
    modelId: input.modelId,
    currency: input.currency,
    scenarioId: input.assumptionBook.scenarioId,
    asOfDate: input.assumptionBook.asOfDate,
    ...(input.sectorPackId ? {sectorPackId: input.sectorPackId} : {}),
    openingBalanceCheck: out(openingBalanceCheck),
    debtOpeningCheck: out(debtOpeningCheck),
    periods: result,
    lineage,
    limitations: [
      "Forecasts are scenarios, not company guidance, unless an assumption is explicitly sourced as company guidance or budget.",
      "Restricted cash is excluded from net debt and liquidity headroom.",
      "Instrument-level legal, tax and covenant definitions still require document and specialist review before external use.",
    ],
  };
}
