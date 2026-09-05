import Decimal from "decimal.js";

export const financialCoreVersion = "2026.09.05-v9";

export * from "./financial-truth";
export * from "./indexed-debt";
export * from "./operation";
export * from "./receivables/contracts";
export * from "./receivables/eligibility-allocation";
export * from "./receivables/provider-allocation";
export * from "./receivables/dynamic-metrics";
export * from "./receivables/static-metrics";
export * from "./receivables/structure-cost";
export * from "./structure";

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

/**
 * Brazilian business-day accrual: the factor an annual effective rate accumulates over `businessDays`
 * of a 252-day year, as indentures state it ((1 + rate)^(DU/252) - 1). Rates are decimals.
 */
export function businessDayAccrual(annualRate: DecimalInput, businessDays: number): CalculationResult {
  if (!Number.isInteger(businessDays) || businessDays < 0) throw new RangeError("business days must be a non-negative integer");
  const rate = d(annualRate);
  if (rate.lte(-1)) throw new RangeError("an annual rate below -100% has no accrual factor");
  const factor = rate.plus(1).pow(new Decimal(businessDays).div(252)).minus(1);
  return result(factor, [
    {label: "annual_rate", value: canonical(rate)},
    {label: "business_days", value: String(businessDays)},
  ]);
}

/**
 * The DI factor of a "p% of DI" remuneration over `businessDays`, with a flat annual DI: each day accrues
 * p times the daily DI rate and the days compound ((1 + ((1 + DI)^(1/252) - 1) * p)^DU - 1).
 */
export function diPercentAccrual(annualDi: DecimalInput, percentOfDi: DecimalInput, businessDays: number): CalculationResult {
  if (!Number.isInteger(businessDays) || businessDays < 0) throw new RangeError("business days must be a non-negative integer");
  const di = d(annualDi);
  const percent = d(percentOfDi);
  if (di.lte(-1) || percent.lt(0)) throw new RangeError("the DI must be above -100% and the percentage non-negative");
  const daily = di.plus(1).pow(new Decimal(1).div(252)).minus(1).times(percent);
  const factor = daily.plus(1).pow(businessDays).minus(1);
  return result(factor, [
    {label: "annual_di", value: canonical(di)},
    {label: "percent_of_di", value: canonical(percent)},
    {label: "business_days", value: String(businessDays)},
  ]);
}

/** The EBITDA a reported leverage implies for a given net debt: netDebt / index. The caller marks it derived, never a fact. */
export function calculateImpliedEbitda(netDebt: DecimalInput, reportedIndex: DecimalInput): CalculationResult {
  const debt = d(netDebt);
  const index = d(reportedIndex);
  if (index.lte(0)) {
    throw new RangeError("a reported index must be positive to imply an EBITDA");
  }
  return result(debt.div(index), [
    {label: "net_debt", value: canonical(debt)},
    {label: "reported_index", value: canonical(index)},
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

/**
 * Stable identifiers for deterministic calculations that depth packs may require.
 *
 * The registry is intentionally metadata-only: packs bind to a governed calculation id while
 * the runtime continues to call the typed functions exported by this package. Renaming or
 * removing a calculation therefore becomes a failing registry test instead of a silent prompt
 * regression.
 */
export const financialCalculationRegistry = {
  "financial.adjusted_ebitda": "calculateAdjustedEbitda",
  "financial.net_leverage": "calculateLeverage",
  "financial.dscr": "calculateDscr",
  "financial.collateral_haircuts": "applyCollateralHaircuts",
  "financial.maximum_debt_by_dscr": "solveMaximumDebtByDscr",
  "financial.all_in_cost": "calculateAllInCost",
  "financial.capacity_envelope": "calculateCapacityEnvelope",
  "financial.working_capital": "calculateWorkingCapital",
  "financial.working_capital_investment": "calculateWorkingCapitalInvestment",
  "financial.cfads": "calculateCfads",
  "financial.cash_conversion": "calculateCashConversion",
  "financial.accounting_identity": "checkIdentity",
  "financial.debt_ledger_balance": "debtLedgerBalance",
  "financial.debt_views": "aggregateDebtViews",
  "financial.maturity_buckets": "maturityBuckets",
  "financial.debt_grouping": "groupDebt",
  "financial.weighted_average_life": "weightedAverageLife",
  "financial.debt_balance_bridge": "buildDebtBalanceBridge",
  "financial.interest_expense_bridge": "reconcileInterestExpense",
  "financial.indexed_debt_schedule": "buildIndexedDebtSchedule",
  "financial.indexed_debt_aggregation": "aggregateIndexedDebtSchedules",
  "financial.liquidity_coverage": "calculateLiquidityCoverage",
  "financial.rate_shock": "applyRateShock",
  "financial.cross_default_propagation": "propagateDefaults",
  "financial.seasonality": "calculateSeasonality",
  "financial.concentration": "calculateConcentration",
  "financial.currency_exposure": "calculateCurrencyExposure",
  "operation.transaction_need": "calculateTransactionNeed",
  "operation.sources_and_uses": "reconcileSourcesAndUses",
  "operation.pro_forma_position": "calculateProFormaPosition",
  "operation.incremental_working_capital": "calculateIncrementalWorkingCapital",
  "operation.excess_funding_carry": "calculateExcessFundingCarry",
  "operation.disbursement_coverage": "testDisbursementCoverage",
  "structure.periodic_rate": "periodicRate",
  "structure.debt_service_schedule": "buildDebtServiceSchedule",
  "structure.coverage_series": "calculateCoverageSeries",
  "structure.covenant_headroom": "calculateCovenantHeadroom",
  "structure.maturity_concentration": "maturityConcentration",
} as const;

export type FinancialCalculationId = keyof typeof financialCalculationRegistry;

export function isFinancialCalculationId(value: string): value is FinancialCalculationId {
  return Object.hasOwn(financialCalculationRegistry, value);
}
