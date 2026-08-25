import Decimal from "decimal.js";

export type OperationLine = {id: string; amount: Decimal.Value};

const decimal = (value: Decimal.Value) => new Decimal(value);
const canonical = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const total = (lines: readonly OperationLine[]) => lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));

export function calculateTransactionNeed(input: {
  capex: Decimal.Value;
  incrementalWorkingCapital: Decimal.Value;
  transactionCosts: Decimal.Value;
  executionBuffer: Decimal.Value;
  selfFunding: Decimal.Value;
}) {
  const usesBeforeFunding = decimal(input.capex)
    .plus(input.incrementalWorkingCapital)
    .plus(input.transactionCosts)
    .plus(input.executionBuffer);
  const calculatedNeed = Decimal.max(usesBeforeFunding.minus(input.selfFunding), 0);
  return {
    calculatedNeed: canonical(calculatedNeed),
    usesBeforeFunding: canonical(usesBeforeFunding),
    trace: [
      {label: "capex", value: canonical(decimal(input.capex))},
      {label: "incremental_working_capital", value: canonical(decimal(input.incrementalWorkingCapital))},
      {label: "transaction_costs", value: canonical(decimal(input.transactionCosts))},
      {label: "execution_buffer", value: canonical(decimal(input.executionBuffer))},
      {label: "self_funding", value: canonical(decimal(input.selfFunding).negated())},
    ],
  };
}

export function reconcileSourcesAndUses(input: {
  sources: readonly OperationLine[];
  uses: readonly OperationLine[];
  tolerance: Decimal.Value;
}) {
  const sources = total(input.sources);
  const uses = total(input.uses);
  const difference = sources.minus(uses);
  return {
    totalSources: canonical(sources),
    totalUses: canonical(uses),
    difference: canonical(difference),
    status: difference.abs().lte(input.tolerance) ? "pass" as const : "fail" as const,
  };
}

export function calculateProFormaPosition(input: {
  grossDebt: Decimal.Value;
  unrestrictedCash: Decimal.Value;
  newDebt: Decimal.Value;
  refinancedDebt: Decimal.Value;
  feesPaidFromCash: Decimal.Value;
  cashContribution: Decimal.Value;
  adjustedEbitda?: Decimal.Value;
}) {
  const proFormaGrossDebt = decimal(input.grossDebt).plus(input.newDebt).minus(input.refinancedDebt);
  const proFormaCash = decimal(input.unrestrictedCash).minus(input.feesPaidFromCash).minus(input.cashContribution);
  const proFormaNetDebt = proFormaGrossDebt.minus(proFormaCash);
  const adjustedEbitda = input.adjustedEbitda === undefined ? null : decimal(input.adjustedEbitda);
  return {
    grossDebt: canonical(proFormaGrossDebt),
    unrestrictedCash: canonical(proFormaCash),
    netDebt: canonical(proFormaNetDebt),
    leverage: adjustedEbitda?.gt(0) ? canonical(proFormaNetDebt.div(adjustedEbitda)) : null,
  };
}

export function calculateIncrementalWorkingCapital(input: Array<{
  period: string;
  incrementalRevenue: Decimal.Value;
  incrementalCogs: Decimal.Value;
  dsoDays: Decimal.Value;
  dioDays: Decimal.Value;
  dpoDays: Decimal.Value;
  taxesAndOtherOperating: Decimal.Value;
  daysInPeriod: Decimal.Value;
}>) {
  const periods = input.map((item) => {
    const days = decimal(item.daysInPeriod);
    if (days.lte(0)) throw new RangeError("days in period must be positive");
    const receivables = decimal(item.incrementalRevenue).div(days).mul(item.dsoDays);
    const inventory = decimal(item.incrementalCogs).div(days).mul(item.dioDays);
    const payables = decimal(item.incrementalCogs).div(days).mul(item.dpoDays);
    const requirement = receivables.plus(inventory).minus(payables).plus(item.taxesAndOtherOperating);
    return {
      period: item.period,
      receivables: canonical(receivables),
      inventory: canonical(inventory),
      payables: canonical(payables),
      taxesAndOtherOperating: canonical(decimal(item.taxesAndOtherOperating)),
      requirement: canonical(requirement),
    };
  });
  const peak = periods.reduce((highest, item) => Decimal.max(highest, item.requirement), new Decimal(0));
  return {periods, peakRequirement: canonical(peak)};
}

export function calculateExcessFundingCarry(input: {
  requested: Decimal.Value;
  calculatedNeed: Decimal.Value;
  authorizedBuffer: Decimal.Value;
  annualDebtCost: Decimal.Value;
  annualCashYield: Decimal.Value;
}) {
  const excess = Decimal.max(decimal(input.requested).minus(input.calculatedNeed).minus(input.authorizedBuffer), 0);
  const annualCarry = excess.mul(decimal(input.annualDebtCost).minus(input.annualCashYield));
  return {excess: canonical(excess), annualCarry: canonical(annualCarry)};
}

export function testDisbursementCoverage(input: Array<{
  period: string;
  openingLiquidity: Decimal.Value;
  scheduledSources: Decimal.Value;
  scheduledUses: Decimal.Value;
}>) {
  let closing = new Decimal(0);
  const periods = input.map((item, index) => {
    const opening = index === 0 ? decimal(item.openingLiquidity) : closing;
    closing = opening.plus(item.scheduledSources).minus(item.scheduledUses);
    return {period: item.period, opening: canonical(opening), closing: canonical(closing), uncovered: canonical(Decimal.max(closing.negated(), 0))};
  });
  return {periods, status: periods.every((item) => decimal(item.uncovered).eq(0)) ? "pass" as const : "fail" as const};
}
