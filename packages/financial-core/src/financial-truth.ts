import Decimal from "decimal.js";

export type NumericInput = Decimal.Value;

export type BridgeLine = {
  id: string;
  value: string;
  operation: "start" | "add" | "subtract";
};

export type BridgeResult = {
  value: string;
  lines: BridgeLine[];
};

export type IdentityResult = {
  id: string;
  left: string;
  right: string;
  difference: string;
  tolerance: string;
  status: "pass" | "fail";
};

const decimal = (value: NumericInput) => new Decimal(value);
const canonical = (value: Decimal) => value.toDecimalPlaces(8).toFixed();

export function sumValues(values: readonly NumericInput[]): string {
  return canonical(values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0)));
}

export function calculateMargin(numerator: NumericInput, denominator: NumericInput): string {
  const base = decimal(denominator);
  if (base.isZero()) throw new RangeError("margin denominator must not be zero");
  return canonical(decimal(numerator).div(base));
}

export function calculateWorkingCapital(input: {
  receivables: NumericInput;
  inventory: NumericInput;
  otherOperatingCurrentAssets?: NumericInput;
  payables: NumericInput;
  otherOperatingCurrentLiabilities?: NumericInput;
}): string {
  return canonical(
    decimal(input.receivables)
      .plus(input.inventory)
      .plus(input.otherOperatingCurrentAssets ?? 0)
      .minus(input.payables)
      .minus(input.otherOperatingCurrentLiabilities ?? 0),
  );
}

export function calculateWorkingCapitalInvestment(current: NumericInput, prior: NumericInput): string {
  return canonical(decimal(current).minus(prior));
}

/**
 * House CFADS bridge. Inputs preserve their economic sign: every item passed here is a
 * positive amount that consumes cash, except approvedCashAdjustments which may be signed.
 */
export function calculateCfads(input: {
  adjustedEbitda: NumericInput;
  cashTaxes: NumericInput;
  maintenanceCapex: NumericInput;
  workingCapitalInvestment: NumericInput;
  fixedCharges: NumericInput;
  approvedCashAdjustments?: NumericInput;
}): BridgeResult {
  const lines: BridgeLine[] = [
    {id: "adjusted_ebitda", value: canonical(decimal(input.adjustedEbitda)), operation: "start"},
    {id: "cash_taxes", value: canonical(decimal(input.cashTaxes)), operation: "subtract"},
    {id: "maintenance_capex", value: canonical(decimal(input.maintenanceCapex)), operation: "subtract"},
    {id: "working_capital_investment", value: canonical(decimal(input.workingCapitalInvestment)), operation: "subtract"},
    {id: "fixed_charges", value: canonical(decimal(input.fixedCharges)), operation: "subtract"},
    {id: "approved_cash_adjustments", value: canonical(decimal(input.approvedCashAdjustments ?? 0)), operation: "add"},
  ];
  const value = decimal(input.adjustedEbitda)
    .minus(input.cashTaxes)
    .minus(input.maintenanceCapex)
    .minus(input.workingCapitalInvestment)
    .minus(input.fixedCharges)
    .plus(input.approvedCashAdjustments ?? 0);
  return {value: canonical(value), lines};
}

export function calculateCashConversion(cfads: NumericInput, adjustedEbitda: NumericInput): string {
  const ebitda = decimal(adjustedEbitda);
  if (ebitda.isZero()) throw new RangeError("cash conversion requires non-zero EBITDA");
  return canonical(decimal(cfads).div(ebitda));
}

export function checkIdentity(input: {
  id: string;
  left: NumericInput;
  right: NumericInput;
  absoluteTolerance?: NumericInput;
}): IdentityResult {
  const left = decimal(input.left);
  const right = decimal(input.right);
  const tolerance = decimal(input.absoluteTolerance ?? 0);
  if (tolerance.isNegative()) throw new RangeError("identity tolerance must not be negative");
  const difference = left.minus(right);
  return {
    id: input.id,
    left: canonical(left),
    right: canonical(right),
    difference: canonical(difference),
    tolerance: canonical(tolerance),
    status: difference.abs().lte(tolerance) ? "pass" : "fail",
  };
}

export type DebtLedgerMathRow = {
  id: string;
  principal: NumericInput;
  accruedInterest?: NumericInput;
  pik?: NumericInput;
  indexation?: NumericInput;
  cashEligible?: boolean;
  covenantIncluded?: boolean;
  capacityObligation?: boolean;
  commitment?: NumericInput;
  quasiDebt?: NumericInput;
  currency?: string;
  entity?: string;
  lender?: string;
  maturity?: string;
};

export function debtLedgerBalance(row: DebtLedgerMathRow): string {
  return canonical(
    decimal(row.principal)
      .plus(row.accruedInterest ?? 0)
      .plus(row.pik ?? 0)
      .plus(row.indexation ?? 0),
  );
}

export function aggregateDebtViews(input: {
  rows: readonly DebtLedgerMathRow[];
  cash?: NumericInput;
  restrictedCash?: NumericInput;
}) {
  const total = (predicate: (row: DebtLedgerMathRow) => boolean, extra: (row: DebtLedgerMathRow) => Decimal = () => new Decimal(0)) =>
    input.rows.filter(predicate).reduce((sum, row) => sum.plus(debtLedgerBalance(row)).plus(extra(row)), new Decimal(0));
  const grossFinancialDebt = total(() => true);
  const unrestrictedCash = Decimal.max(decimal(input.cash ?? 0).minus(input.restrictedCash ?? 0), 0);
  const covenantDebt = total((row) => row.covenantIncluded === true);
  const adjustedCapacityObligations = total(
    (row) => row.capacityObligation === true,
    (row) => decimal(row.commitment ?? 0).plus(row.quasiDebt ?? 0),
  );
  const commitmentsAndQuasiDebt = input.rows.reduce(
    (sum, row) => sum.plus(row.commitment ?? 0).plus(row.quasiDebt ?? 0),
    new Decimal(0),
  );
  return {
    grossFinancialDebt: canonical(grossFinancialDebt),
    unrestrictedCash: canonical(unrestrictedCash),
    netFinancialDebt: canonical(grossFinancialDebt.minus(unrestrictedCash)),
    covenantDebt: canonical(covenantDebt),
    adjustedCapacityObligations: canonical(adjustedCapacityObligations),
    commitmentsAndQuasiDebt: canonical(commitmentsAndQuasiDebt),
  };
}

export function maturityBuckets(rows: readonly DebtLedgerMathRow[], referenceDate: string) {
  const reference = new Date(`${referenceDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(reference)) throw new RangeError("invalid reference date");
  const buckets = {within12Months: new Decimal(0), months13To24: new Decimal(0), months25To36: new Decimal(0), beyond36Months: new Decimal(0), undated: new Decimal(0)};
  for (const row of rows) {
    const balance = decimal(debtLedgerBalance(row));
    const maturity = row.maturity ? new Date(`${row.maturity}T00:00:00.000Z`).getTime() : Number.NaN;
    if (!Number.isFinite(maturity)) { buckets.undated = buckets.undated.plus(balance); continue; }
    const months = (maturity - reference) / (365.25 / 12 * 24 * 60 * 60 * 1000);
    if (months <= 12) buckets.within12Months = buckets.within12Months.plus(balance);
    else if (months <= 24) buckets.months13To24 = buckets.months13To24.plus(balance);
    else if (months <= 36) buckets.months25To36 = buckets.months25To36.plus(balance);
    else buckets.beyond36Months = buckets.beyond36Months.plus(balance);
  }
  return Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, canonical(value)])) as Record<keyof typeof buckets, string>;
}

export function groupDebt(rows: readonly DebtLedgerMathRow[], key: "currency" | "entity" | "lender") {
  const groups = new Map<string, Decimal>();
  for (const row of rows) {
    const label = row[key] || "not_informed";
    groups.set(label, (groups.get(label) ?? new Decimal(0)).plus(debtLedgerBalance(row)));
  }
  return [...groups.entries()]
    .map(([label, value]) => ({label, value: canonical(value)}))
    .sort((a, b) => new Decimal(b.value).comparedTo(a.value) || a.label.localeCompare(b.label));
}

export type DatedCashFlow = {
  date: string;
  principal?: NumericInput;
  interest?: NumericInput;
  other?: NumericInput;
};

const dateValue = (value: string): number => {
  const parsed = new Date(`${value}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(parsed)) throw new RangeError(`invalid date: ${value}`);
  return parsed;
};

export function weightedAverageLife(flows: readonly DatedCashFlow[], referenceDate: string): string | null {
  const reference = dateValue(referenceDate);
  let weighted = new Decimal(0);
  let principal = new Decimal(0);
  for (const flow of flows) {
    const amount = decimal(flow.principal ?? 0);
    if (amount.lte(0)) continue;
    const years = new Decimal(dateValue(flow.date) - reference).div(365.25 * 24 * 60 * 60 * 1000);
    weighted = weighted.plus(amount.mul(Decimal.max(years, 0)));
    principal = principal.plus(amount);
  }
  return principal.isZero() ? null : canonical(weighted.div(principal));
}

export function buildDebtBalanceBridge(input: {
  openingBalance: NumericInput;
  drawdowns?: NumericInput;
  accruedInterest?: NumericInput;
  pik?: NumericInput;
  indexation?: NumericInput;
  foreignExchange?: NumericInput;
  acquisitions?: NumericInput;
  otherAdditions?: NumericInput;
  amortizations?: NumericInput;
  prepayments?: NumericInput;
  writeOffs?: NumericInput;
}): BridgeResult {
  const lines: BridgeLine[] = [
    {id: "opening_balance", value: canonical(decimal(input.openingBalance)), operation: "start"},
    {id: "drawdowns", value: canonical(decimal(input.drawdowns ?? 0)), operation: "add"},
    {id: "accrued_interest", value: canonical(decimal(input.accruedInterest ?? 0)), operation: "add"},
    {id: "pik", value: canonical(decimal(input.pik ?? 0)), operation: "add"},
    {id: "indexation", value: canonical(decimal(input.indexation ?? 0)), operation: "add"},
    {id: "foreign_exchange", value: canonical(decimal(input.foreignExchange ?? 0)), operation: "add"},
    {id: "acquisitions", value: canonical(decimal(input.acquisitions ?? 0)), operation: "add"},
    {id: "other_additions", value: canonical(decimal(input.otherAdditions ?? 0)), operation: "add"},
    {id: "amortizations", value: canonical(decimal(input.amortizations ?? 0)), operation: "subtract"},
    {id: "prepayments", value: canonical(decimal(input.prepayments ?? 0)), operation: "subtract"},
    {id: "write_offs", value: canonical(decimal(input.writeOffs ?? 0)), operation: "subtract"},
  ];
  const value = lines.slice(1).reduce(
    (total, line) => line.operation === "subtract" ? total.minus(line.value) : total.plus(line.value),
    decimal(input.openingBalance),
  );
  return {value: canonical(value), lines};
}

export type InterestExpenseComponent = {
  id: string;
  calculated: NumericInput;
  accounting: NumericInput;
};

export function reconcileInterestExpense(components: readonly InterestExpenseComponent[]) {
  const rows = components.map((component) => {
    const calculated = decimal(component.calculated);
    const accounting = decimal(component.accounting);
    return {
      id: component.id,
      calculated: canonical(calculated),
      accounting: canonical(accounting),
      difference: canonical(accounting.minus(calculated)),
    };
  });
  return {
    rows,
    calculatedTotal: sumValues(rows.map((row) => row.calculated)),
    accountingTotal: sumValues(rows.map((row) => row.accounting)),
    difference: canonical(decimal(sumValues(rows.map((row) => row.accounting))).minus(sumValues(rows.map((row) => row.calculated)))),
  };
}

export type LiquidityPeriod = {
  period: string;
  openingCash: NumericInput;
  cfads: NumericInput;
  contractedSources?: NumericInput;
  principal: NumericInput;
  interest: NumericInput;
  leases?: NumericInput;
  taxInstallments?: NumericInput;
  otherObligations?: NumericInput;
};

export function calculateLiquidityCoverage(periods: readonly LiquidityPeriod[]) {
  let priorClosing: Decimal | null = null;
  return periods.map((period) => {
    const opening = priorClosing ?? decimal(period.openingCash);
    const sources = opening.plus(period.cfads).plus(period.contractedSources ?? 0);
    const service = decimal(period.principal)
      .plus(period.interest)
      .plus(period.leases ?? 0)
      .plus(period.taxInstallments ?? 0)
      .plus(period.otherObligations ?? 0);
    const closing = sources.minus(service);
    priorClosing = closing;
    return {
      period: period.period,
      openingCash: canonical(opening),
      sources: canonical(sources),
      debtService: canonical(service),
      coverage: service.isZero() ? null : canonical(sources.div(service)),
      closingCash: canonical(closing),
      deficit: canonical(Decimal.max(closing.negated(), 0)),
    };
  });
}

export function applyRateShock(input: {
  averageBalance: NumericInput;
  baseRate: NumericInput;
  shock: NumericInput;
  hedgeOffset?: NumericInput;
}): {baseInterest: string; stressedInterest: string; delta: string} {
  const balance = decimal(input.averageBalance);
  const baseInterest = balance.mul(input.baseRate);
  const stressedInterest = balance.mul(decimal(input.baseRate).plus(input.shock)).minus(input.hedgeOffset ?? 0);
  return {
    baseInterest: canonical(baseInterest),
    stressedInterest: canonical(stressedInterest),
    delta: canonical(stressedInterest.minus(baseInterest)),
  };
}

export type DefaultEdge = {
  from: string;
  to: string;
  type: "cross_default" | "cross_acceleration";
  thresholdSatisfied: boolean;
  cureExpired: boolean;
};

export function propagateDefaults(initial: readonly string[], edges: readonly DefaultEdge[]) {
  const defaulted = new Set(initial);
  const accelerated = new Set<string>();
  const queue = [...initial];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges.filter((candidate) => candidate.from === current && candidate.thresholdSatisfied && candidate.cureExpired)) {
      if (edge.type === "cross_acceleration") accelerated.add(edge.to);
      if (!defaulted.has(edge.to)) {
        defaulted.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return {defaulted: [...defaulted].sort(), accelerated: [...accelerated].sort()};
}

export function calculateSeasonality(values: readonly NumericInput[]) {
  if (values.length === 0) return null;
  const decimals = values.map(decimal);
  const average = decimals.reduce((sum, value) => sum.plus(value), new Decimal(0)).div(decimals.length);
  if (average.isZero()) return null;
  const indices = decimals.map((value) => canonical(value.div(average)));
  const peak = Decimal.max(...decimals);
  const trough = Decimal.min(...decimals);
  return {
    average: canonical(average),
    peak: canonical(peak),
    trough: canonical(trough),
    amplitude: canonical(peak.minus(trough).div(average)),
    indices,
  };
}

export function calculateConcentration(shares: readonly NumericInput[]) {
  const ordered = shares.map(decimal).sort((a, b) => b.comparedTo(a));
  const top = (count: number) => canonical(ordered.slice(0, count).reduce((sum, value) => sum.plus(value), new Decimal(0)));
  return {top1: top(1), top5: top(5), top10: top(10)};
}

export function calculateCurrencyExposure(input: {
  currency: string;
  revenue: NumericInput;
  cost: NumericInput;
  debtService: NumericInput;
  hedge?: NumericInput;
}) {
  const exposure = decimal(input.revenue).minus(input.cost).minus(input.debtService).plus(input.hedge ?? 0);
  return {currency: input.currency, exposure: canonical(exposure)};
}
