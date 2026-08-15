import Decimal from "decimal.js";

Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

export type DecimalInput = Decimal.Value;

export type CalculationResult = {
  value: string;
  trace: Array<{label: string; value: string}>;
  warnings: string[];
};

const d = (value: DecimalInput) => new Decimal(value);
const canonical = (value: Decimal) => value.toDecimalPlaces(8).toFixed();

function result(value: Decimal, trace: CalculationResult["trace"], warnings: string[] = []): CalculationResult {
  return {value: canonical(value), trace, warnings};
}

export function calculateAdjustedEbitda(reportedEbitda: DecimalInput, adjustments: DecimalInput[]): CalculationResult {
  const base = d(reportedEbitda);
  const adjustmentTotal = adjustments.reduce<Decimal>((sum, item) => sum.plus(item), new Decimal(0));
  return result(base.plus(adjustmentTotal), [
    {label: "reported_ebitda", value: canonical(base)},
    {label: "approved_adjustments", value: canonical(adjustmentTotal)},
  ]);
}

export function calculateLeverage(netDebt: DecimalInput, adjustedEbitda: DecimalInput): CalculationResult {
  const debt = d(netDebt);
  const ebitda = d(adjustedEbitda);
  if (ebitda.lte(0)) {
    throw new RangeError("adjusted EBITDA must be positive");
  }
  return result(debt.div(ebitda), [
    {label: "net_debt", value: canonical(debt)},
    {label: "adjusted_ebitda", value: canonical(ebitda)},
  ]);
}

export function calculateDscr(cfads: DecimalInput, debtService: DecimalInput): CalculationResult {
  const cash = d(cfads);
  const service = d(debtService);
  if (service.lte(0)) {
    throw new RangeError("debt service must be positive");
  }
  return result(cash.div(service), [
    {label: "cfads", value: canonical(cash)},
    {label: "debt_service", value: canonical(service)},
  ]);
}

export function applyCollateralHaircuts(
  items: Array<{name: string; grossValue: DecimalInput; haircutRate: DecimalInput}>,
): CalculationResult {
  const trace: CalculationResult["trace"] = [];
  const value = items.reduce((total, item) => {
    const gross = d(item.grossValue);
    const haircut = d(item.haircutRate);
    if (haircut.lt(0) || haircut.gt(1)) {
      throw new RangeError("haircut rate must be between zero and one");
    }
    const eligible = gross.mul(new Decimal(1).minus(haircut));
    trace.push({label: item.name, value: canonical(eligible)});
    return total.plus(eligible);
  }, new Decimal(0));
  return result(value, trace);
}

export function solveMaximumDebtByDscr(
  cfads: DecimalInput,
  minimumDscr: DecimalInput,
  annualDebtServiceFactor: DecimalInput,
): CalculationResult {
  const cash = d(cfads);
  const dscr = d(minimumDscr);
  const factor = d(annualDebtServiceFactor);
  if (dscr.lte(0) || factor.lte(0)) {
    throw new RangeError("minimum DSCR and debt service factor must be positive");
  }
  return result(cash.div(dscr).div(factor), [
    {label: "cfads", value: canonical(cash)},
    {label: "minimum_dscr", value: canonical(dscr)},
    {label: "annual_debt_service_factor", value: canonical(factor)},
  ]);
}

export function calculateAllInCost(
  annualCashRate: DecimalInput,
  upfrontFeeRate: DecimalInput,
  termYears: DecimalInput,
): CalculationResult {
  const rate = d(annualCashRate);
  const fee = d(upfrontFeeRate);
  const term = d(termYears);
  if (term.lte(0)) {
    throw new RangeError("term must be positive");
  }
  return result(rate.plus(fee.div(term)), [
    {label: "annual_cash_rate", value: canonical(rate)},
    {label: "annualized_upfront_fee", value: canonical(fee.div(term))},
  ], ["Simplified annualized cost; cash-flow IRR remains the approval metric."]);
}

export function calculateCapacityEnvelope(input: {
  requested: DecimalInput;
  cashFlowCapacity: DecimalInput;
  collateralCapacity: DecimalInput;
  marketCapacity: DecimalInput;
}) {
  const constraints = {
    cash_flow: d(input.cashFlowCapacity),
    collateral: d(input.collateralCapacity),
    market: d(input.marketCapacity),
  };
  const binding = (Object.entries(constraints) as Array<[keyof typeof constraints, Decimal]>).reduce(
    (lowest, current) => current[1].lt(lowest[1]) ? current : lowest,
  );
  return {
    requested: canonical(d(input.requested)),
    recommended: canonical(binding[1]),
    bindingConstraint: binding[0],
    capacities: Object.fromEntries(Object.entries(constraints).map(([key, value]) => [key, canonical(value)])),
  };
}
