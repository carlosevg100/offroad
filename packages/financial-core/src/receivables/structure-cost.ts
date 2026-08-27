import Decimal from "decimal.js";

import type {
  AssertionProvenance,
  CurrencyCode,
  FormulaReference,
  IsoDate,
  MeasuredProvenance,
  SourceAnchor,
} from "./contracts";
import {
  canonicalMetricValue,
  receivablesDaysBetween,
  receivablesUtcDate,
  type MeasuredMetric,
  type MetricPeriod,
} from "./static-metrics";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const DAYS_PER_MONTH = new Decimal(30);
const CALENDAR_DAYS_PER_YEAR = new Decimal(365);
const BUSINESS_DAYS_PER_YEAR = new Decimal(252);

export const receivablesStructureCostFormulaVersion = "2026.08.27-v1";

export type SourcedAmount = {
  value: string;
  source: SourceAnchor;
};

export type SourcedEbitda = SourcedAmount & {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  basis: "reported" | "adjusted_approved";
};

export type AdjustedDebtCategory =
  | "bank_debt"
  | "receivables_assignment_with_recourse"
  | "reverse_factoring"
  | "factoring_with_recourse"
  | "tax_installment"
  | "receivables_assignment_without_recourse"
  | "ordinary_trade_payable"
  | "other_non_debt";

export type AdjustedDebtPosition = {
  id: string;
  creditor: string;
  category: AdjustedDebtCategory;
  principal: string;
  accruedInterest?: string;
  declarationStatus: "company_declared" | "identified_not_declared";
  sources: readonly SourceAnchor[];
};

export type AdjustedDebtBridgeInput = {
  reportingDate: IsoDate;
  currency: CurrencyCode;
  universeId: string;
  datasetHash: string;
  positions: readonly AdjustedDebtPosition[];
  companyDeclaredDebt: SourcedAmount;
  cash: SourcedAmount;
  ebitdaForLeverage: SourcedEbitda;
};

export type AdjustedDebtBridgeLine = AdjustedDebtPosition & {
  totalAmount: string;
  included: boolean;
  treatmentReason: string;
};

export type AdjustedDebtBridge = {
  version: typeof receivablesStructureCostFormulaVersion;
  reportingDate: IsoDate;
  currency: CurrencyCode;
  lines: readonly AdjustedDebtBridgeLine[];
  companyDeclaredDebt: MeasuredMetric;
  declaredPositionSubtotal: MeasuredMetric;
  identifiedNotDeclaredSubtotal: MeasuredMetric;
  declaredPositionMismatch: MeasuredMetric;
  adjustedGrossDebt: MeasuredMetric;
  adjustmentToCompanyDeclaration: MeasuredMetric;
  cash: MeasuredMetric;
  adjustedNetDebt: MeasuredMetric;
  ebitdaForLeverage: MeasuredMetric;
  adjustedNetLeverage: MeasuredMetric;
  quality: {warnings: readonly string[]};
};

export type ReceivablesRateQuote =
  | {regime: "inside_compound_monthly"; monthlyRate: string}
  | {regime: "outside_simple_monthly"; monthlyDiscountRate: string}
  | {regime: "inside_compound_annual_calendar"; annualRates: readonly string[]}
  | {regime: "inside_compound_annual_business"; annualRates: readonly string[]; businessDays: number};

export type ReceivablesRateConversionInput = {
  reportingDate: IsoDate;
  universeId: string;
  datasetHash: string;
  currency: CurrencyCode;
  faceValue: string;
  calendarDays: number;
  quote: ReceivablesRateQuote;
  source: SourceAnchor;
};

export type ReceivablesRateConversion = {
  version: typeof receivablesStructureCostFormulaVersion;
  sourceRegime: ReceivablesRateQuote["regime"];
  calendarDays: number;
  businessDays: number | null;
  acquisitionPrice: MeasuredMetric;
  discountAmount: MeasuredMetric;
  discountShareOfFace: MeasuredMetric;
  effectivePeriodRate: MeasuredMetric;
  effectiveMonthlyRate: MeasuredMetric;
  effectiveAnnualRate: MeasuredMetric;
};

export type ReceivablesCostCashFlow = {
  id: string;
  date: IsoDate;
  amount: string;
  direction: "borrower_inflow" | "borrower_outflow";
  kind: "disbursement" | "principal" | "interest" | "discount" | "fee" | "tax" | "other";
  source: SourceAnchor;
};

export type ReceivablesCetInput = {
  reportingDate: IsoDate;
  universeId: string;
  datasetHash: string;
  currency: CurrencyCode;
  cashFlows: readonly ReceivablesCostCashFlow[];
  taxTreatment:
    | {status: "provided"; source: SourceAnchor}
    | {status: "not_applicable"; source: SourceAnchor}
    | {status: "not_provided"};
};

export type ReceivablesCet = {
  version: typeof receivablesStructureCostFormulaVersion;
  status: "calculated_complete" | "calculated_with_missing_tax_input";
  startDate: IsoDate;
  endDate: IsoDate;
  elapsedCalendarDays: number;
  netInitialProceeds: MeasuredMetric;
  totalBorrowerInflows: MeasuredMetric;
  totalBorrowerOutflows: MeasuredMetric;
  financeCost: MeasuredMetric;
  fees: MeasuredMetric;
  taxes: MeasuredMetric;
  effectiveMonthlyRate: MeasuredMetric;
  effectiveAnnualRate: MeasuredMetric;
  quality: {warnings: readonly string[]};
};

export type ReceivablesProposalCharge =
  | {id: string; kind: "fixed_fee"; amount: string; source: SourceAnchor}
  | {id: string; kind: "ad_valorem_face_fee"; rate: string; source: SourceAnchor}
  | {id: string; kind: "per_title_fee"; amountPerTitle: string; titleCount: number; source: SourceAnchor}
  | {id: string; kind: "tax"; amount: string; source: SourceAnchor};

export type SingleMaturityReceivablesProposalInput = Omit<ReceivablesRateConversionInput, "calendarDays"> & {
  startDate: IsoDate;
  maturityDate: IsoDate;
  charges: readonly ReceivablesProposalCharge[];
  taxTreatment: ReceivablesCetInput["taxTreatment"];
};

export type SingleMaturityReceivablesProposal = {
  version: typeof receivablesStructureCostFormulaVersion;
  rateConversion: ReceivablesRateConversion;
  chargeAmounts: readonly {
    id: string;
    kind: ReceivablesProposalCharge["kind"];
    amount: string;
    source: SourceAnchor;
  }[];
  cet: ReceivablesCet;
};

export type GovernedRateAssumption = {
  id: string;
  value: string;
  basis: string;
  provenance: AssertionProvenance;
};

export type GovernedMultiplierAssumption = GovernedRateAssumption;

export type GovernedCalculatedMetric = {
  id: string;
  value: string | null;
  status: "calculated" | "not_evaluable";
  unit: "ratio";
  period: MetricPeriod;
  universe: string;
  formula: FormulaReference;
  inputs: readonly {
    id: string;
    value: string;
    basis: string;
    provenance: AssertionProvenance;
  }[];
  warnings: readonly string[];
};

export type ImplicitAdvanceRateInput = {
  reportingDate: IsoDate;
  periodStart: IsoDate;
  universeId: string;
  expectedDilution?: GovernedRateAssumption;
  dilutionStressMultiplier?: GovernedMultiplierAssumption;
  expectedLossRate?: GovernedRateAssumption;
  lossStressMultiplier?: GovernedMultiplierAssumption;
  operationalReserve?: GovernedRateAssumption;
  additionalReserves?: readonly GovernedRateAssumption[];
};

export type ImplicitAdvanceRate = {
  version: typeof receivablesStructureCostFormulaVersion;
  status: "calculated" | "not_evaluable";
  stressedDilutionReserve: GovernedCalculatedMetric;
  stressedLossReserve: GovernedCalculatedMetric;
  operationalReserve: GovernedCalculatedMetric;
  additionalReserve: GovernedCalculatedMetric;
  totalReserve: GovernedCalculatedMetric;
  implicitAdvanceRate: GovernedCalculatedMetric;
  quality: {warnings: readonly string[]};
};

const decimal = (value: Decimal.Value) => new Decimal(value);

function sum(values: Iterable<Decimal.Value>): Decimal {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}

function uniqueAnchors(anchors: readonly SourceAnchor[]): SourceAnchor[] {
  const result = new Map<string, SourceAnchor>();
  for (const anchor of anchors) {
    const key = anchor.kind === "file"
      ? `file:${anchor.fileId}:${anchor.fileHash}:${anchor.sheet ?? ""}:${anchor.row ?? ""}:${anchor.cell ?? ""}`
      : anchor.kind === "document"
        ? `document:${anchor.documentId}:${anchor.documentHash ?? ""}:${anchor.page ?? ""}:${anchor.clause ?? ""}`
        : `event:${anchor.sourceSystem}:${anchor.eventId}`;
    result.set(key, anchor);
  }
  return [...result.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function period(reportingDate: IsoDate, startDate: IsoDate = reportingDate, endDate: IsoDate = reportingDate): MetricPeriod {
  return {reportingDate, startDate, endDate};
}

function measuredMetric(input: {
  id: string;
  value: Decimal;
  unit: MeasuredMetric["unit"];
  period: MetricPeriod;
  datasetHash: string;
  anchors: readonly SourceAnchor[];
  universe: string;
  formulaId: string;
  numerator?: string;
  denominator?: string;
  inclusions?: readonly string[];
  exclusions?: readonly string[];
  warnings?: readonly string[];
}): MeasuredMetric {
  const provenance: MeasuredProvenance = {
    kind: "measured",
    datasetHash: input.datasetHash,
    anchors: uniqueAnchors(input.anchors),
    universe: input.universe,
    reportingDate: input.period.reportingDate,
    inclusions: input.inclusions ?? [],
    exclusions: input.exclusions ?? [],
    formula: {id: input.formulaId, version: receivablesStructureCostFormulaVersion},
    ...(input.numerator === undefined ? {} : {numerator: input.numerator}),
    ...(input.denominator === undefined ? {} : {denominator: input.denominator}),
    unit: input.unit,
    rounding: "Decimal ROUND_HALF_UP, maximum 8 decimal places; presentation rounding is separate",
  };
  return {
    id: input.id,
    value: canonicalMetricValue(input.value),
    status: "measured",
    unit: input.unit,
    period: input.period,
    provenance,
    warnings: input.warnings ?? [],
  };
}

function assertPositive(value: Decimal, label: string): void {
  if (!value.isFinite() || value.lte(0)) throw new RangeError(`${label} must be positive`);
}

function assertNonNegative(value: Decimal, label: string): void {
  if (!value.isFinite() || value.lt(0)) throw new RangeError(`${label} must be non-negative`);
}

function assertRate(value: Decimal, label: string): void {
  if (!value.isFinite() || value.lt(0) || value.gte(1)) throw new RangeError(`${label} must be between zero and one`);
}

const INCLUDED_DEBT_CATEGORIES = new Set<AdjustedDebtCategory>([
  "bank_debt",
  "receivables_assignment_with_recourse",
  "reverse_factoring",
  "factoring_with_recourse",
  "tax_installment",
]);

const DEBT_TREATMENT: Record<AdjustedDebtCategory, string> = {
  bank_debt: "contractual financial debt",
  receivables_assignment_with_recourse: "receivables transfer retains recourse to the company",
  reverse_factoring: "supplier payable has been converted into a direct financial obligation",
  factoring_with_recourse: "repurchase or substitution obligation preserves economic recourse",
  tax_installment: "contracted tax installment is an interest-bearing obligation",
  receivables_assignment_without_recourse: "excluded unless the accounting transfer-of-risk test fails",
  ordinary_trade_payable: "ordinary operating payable without a financing feature",
  other_non_debt: "classified as non-debt under the supplied facts",
};

export function calculateAdjustedDebtBridge(input: AdjustedDebtBridgeInput): AdjustedDebtBridge {
  receivablesUtcDate(input.reportingDate);
  if (input.positions.length === 0) throw new RangeError("adjusted debt bridge requires at least one position");
  const seen = new Set<string>();
  const lines = [...input.positions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((position): AdjustedDebtBridgeLine => {
      if (seen.has(position.id)) throw new RangeError(`duplicate debt position id: ${position.id}`);
      seen.add(position.id);
      if (position.sources.length === 0) throw new RangeError(`debt position ${position.id} requires at least one source anchor`);
      const principal = decimal(position.principal);
      const accrued = decimal(position.accruedInterest ?? 0);
      assertNonNegative(principal, `${position.id} principal`);
      assertNonNegative(accrued, `${position.id} accrued interest`);
      return {
        ...position,
        totalAmount: canonicalMetricValue(principal.plus(accrued)),
        included: INCLUDED_DEBT_CATEGORIES.has(position.category),
        treatmentReason: DEBT_TREATMENT[position.category],
      };
    });
  const declared = decimal(input.companyDeclaredDebt.value);
  const cash = decimal(input.cash.value);
  receivablesUtcDate(input.ebitdaForLeverage.periodStart);
  receivablesUtcDate(input.ebitdaForLeverage.periodEnd);
  if (input.ebitdaForLeverage.periodStart > input.ebitdaForLeverage.periodEnd) throw new RangeError("EBITDA period start cannot follow period end");
  const ebitda = decimal(input.ebitdaForLeverage.value);
  assertNonNegative(declared, "company-declared debt");
  assertNonNegative(cash, "cash");
  assertPositive(ebitda, "adjusted EBITDA");

  const included = lines.filter((line) => line.included);
  const declaredPositionSubtotal = sum(included.filter((line) => line.declarationStatus === "company_declared").map((line) => line.totalAmount));
  const notDeclaredSubtotal = sum(included.filter((line) => line.declarationStatus === "identified_not_declared").map((line) => line.totalAmount));
  const grossDebt = declaredPositionSubtotal.plus(notDeclaredSubtotal);
  const declaredMismatch = declaredPositionSubtotal.minus(declared);
  const totalAdjustment = grossDebt.minus(declared);
  const netDebt = grossDebt.minus(cash);
  const leverage = netDebt.div(ebitda);
  const anchors = [
    ...lines.flatMap((line) => line.sources),
    input.companyDeclaredDebt.source,
    input.cash.source,
    input.ebitdaForLeverage.source,
  ];
  const metricInput = {
    period: period(input.reportingDate),
    datasetHash: input.datasetHash,
    anchors,
    universe: input.universeId,
  };
  const warnings = [
    ...(declaredMismatch.isZero() ? [] : ["declared debt does not reconcile to positions identified as company-declared"]),
    ...(notDeclaredSubtotal.isZero() ? [] : ["financial obligations identified outside the company-declared debt amount"]),
  ];
  return {
    version: receivablesStructureCostFormulaVersion,
    reportingDate: input.reportingDate,
    currency: input.currency,
    lines,
    companyDeclaredDebt: measuredMetric({...metricInput, id: "adjusted_debt.company_declared", value: declared, unit: "BRL", formulaId: "receivables.adjusted_debt.company_declared"}),
    declaredPositionSubtotal: measuredMetric({...metricInput, id: "adjusted_debt.declared_position_subtotal", value: declaredPositionSubtotal, unit: "BRL", formulaId: "receivables.adjusted_debt.position_subtotal", inclusions: ["included positions marked company_declared"]}),
    identifiedNotDeclaredSubtotal: measuredMetric({...metricInput, id: "adjusted_debt.identified_not_declared", value: notDeclaredSubtotal, unit: "BRL", formulaId: "receivables.adjusted_debt.position_subtotal", inclusions: ["included positions marked identified_not_declared"]}),
    declaredPositionMismatch: measuredMetric({...metricInput, id: "adjusted_debt.declared_position_mismatch", value: declaredMismatch, unit: "BRL", formulaId: "receivables.adjusted_debt.declared_position_mismatch", numerator: "declared position subtotal - company-declared debt"}),
    adjustedGrossDebt: measuredMetric({...metricInput, id: "adjusted_debt.gross", value: grossDebt, unit: "BRL", formulaId: "receivables.adjusted_debt.gross", inclusions: [...INCLUDED_DEBT_CATEGORIES], exclusions: ["receivables_assignment_without_recourse", "ordinary_trade_payable", "other_non_debt"]}),
    adjustmentToCompanyDeclaration: measuredMetric({...metricInput, id: "adjusted_debt.adjustment_to_company_declaration", value: totalAdjustment, unit: "BRL", formulaId: "receivables.adjusted_debt.adjustment", numerator: "adjusted gross debt - company-declared debt"}),
    cash: measuredMetric({...metricInput, id: "adjusted_debt.cash", value: cash, unit: "BRL", formulaId: "receivables.adjusted_debt.cash"}),
    adjustedNetDebt: measuredMetric({...metricInput, id: "adjusted_debt.net", value: netDebt, unit: "BRL", formulaId: "receivables.adjusted_debt.net", numerator: "adjusted gross debt - cash"}),
    ebitdaForLeverage: measuredMetric({
      ...metricInput,
      id: "adjusted_debt.ebitda_for_leverage",
      value: ebitda,
      unit: "BRL",
      period: period(input.reportingDate, input.ebitdaForLeverage.periodStart, input.ebitdaForLeverage.periodEnd),
      formulaId: "receivables.adjusted_debt.ebitda_for_leverage",
      inclusions: [`basis:${input.ebitdaForLeverage.basis}`],
    }),
    adjustedNetLeverage: measuredMetric({...metricInput, id: "adjusted_debt.net_leverage", value: leverage, unit: "ratio", formulaId: "receivables.adjusted_debt.net_leverage", numerator: "adjusted net debt at reporting date", denominator: `${input.ebitdaForLeverage.basis} EBITDA for ${input.ebitdaForLeverage.periodStart} through ${input.ebitdaForLeverage.periodEnd}`}),
    quality: {warnings},
  };
}

function validateDayCount(value: number, label: string): Decimal {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`);
  return decimal(value);
}

export function convertReceivablesRate(input: ReceivablesRateConversionInput): ReceivablesRateConversion {
  receivablesUtcDate(input.reportingDate);
  const face = decimal(input.faceValue);
  assertPositive(face, "face value");
  const calendarDays = validateDayCount(input.calendarDays, "calendar days");
  let factor: Decimal;
  let businessDays: number | null = null;

  if (input.quote.regime === "inside_compound_monthly") {
    const rate = decimal(input.quote.monthlyRate);
    assertRate(rate, "monthly compound rate");
    factor = ONE.plus(rate).pow(calendarDays.div(DAYS_PER_MONTH));
  } else if (input.quote.regime === "outside_simple_monthly") {
    const rate = decimal(input.quote.monthlyDiscountRate);
    assertRate(rate, "monthly outside discount rate");
    const discountShare = rate.mul(calendarDays).div(DAYS_PER_MONTH);
    if (discountShare.gte(1)) throw new RangeError("outside discount consumes the entire face value");
    factor = ONE.div(ONE.minus(discountShare));
  } else if (input.quote.regime === "inside_compound_annual_calendar") {
    if (input.quote.annualRates.length === 0) throw new RangeError("annual calendar quote requires at least one rate component");
    factor = input.quote.annualRates.reduce((total, component, index) => {
      const rate = decimal(component);
      assertRate(rate, `annual calendar rate component ${index + 1}`);
      return total.mul(ONE.plus(rate).pow(calendarDays.div(CALENDAR_DAYS_PER_YEAR)));
    }, ONE);
  } else {
    if (input.quote.annualRates.length === 0) throw new RangeError("annual business-day quote requires at least one rate component");
    businessDays = input.quote.businessDays;
    const businessDayCount = validateDayCount(input.quote.businessDays, "business days");
    if (businessDayCount.gt(calendarDays)) throw new RangeError("business days cannot exceed calendar days");
    factor = input.quote.annualRates.reduce((total, component, index) => {
      const rate = decimal(component);
      assertRate(rate, `annual business-day rate component ${index + 1}`);
      return total.mul(ONE.plus(rate).pow(businessDayCount.div(BUSINESS_DAYS_PER_YEAR)));
    }, ONE);
  }

  const acquisitionPrice = face.div(factor);
  const discount = face.minus(acquisitionPrice);
  const periodRate = factor.minus(ONE);
  const monthlyRate = factor.pow(DAYS_PER_MONTH.div(calendarDays)).minus(ONE);
  const annualRate = factor.pow(CALENDAR_DAYS_PER_YEAR.div(calendarDays)).minus(ONE);
  const metricInput = {
    period: period(input.reportingDate),
    datasetHash: input.datasetHash,
    anchors: [input.source],
    universe: input.universeId,
  };
  return {
    version: receivablesStructureCostFormulaVersion,
    sourceRegime: input.quote.regime,
    calendarDays: input.calendarDays,
    businessDays,
    acquisitionPrice: measuredMetric({...metricInput, id: "rate_conversion.acquisition_price", value: acquisitionPrice, unit: "BRL", formulaId: `receivables.rate.${input.quote.regime}.price`, numerator: "face value", denominator: "source-regime accumulation factor"}),
    discountAmount: measuredMetric({...metricInput, id: "rate_conversion.discount_amount", value: discount, unit: "BRL", formulaId: `receivables.rate.${input.quote.regime}.discount`, numerator: "face value - acquisition price"}),
    discountShareOfFace: measuredMetric({...metricInput, id: "rate_conversion.discount_share_of_face", value: discount.div(face), unit: "ratio", formulaId: "receivables.rate.discount_share_of_face", numerator: "discount amount", denominator: "face value"}),
    effectivePeriodRate: measuredMetric({...metricInput, id: "rate_conversion.effective_period_rate", value: periodRate, unit: "ratio", formulaId: "receivables.rate.effective_period", numerator: "face value - acquisition price", denominator: "acquisition price"}),
    effectiveMonthlyRate: measuredMetric({...metricInput, id: "rate_conversion.effective_monthly_rate", value: monthlyRate, unit: "ratio", formulaId: "receivables.rate.effective_monthly", numerator: "period accumulation factor^(30/calendar days) - 1"}),
    effectiveAnnualRate: measuredMetric({...metricInput, id: "rate_conversion.effective_annual_rate", value: annualRate, unit: "ratio", formulaId: "receivables.rate.effective_annual", numerator: "period accumulation factor^(365/calendar days) - 1"}),
  };
}

type AggregatedCashFlow = {date: IsoDate; net: Decimal};

function aggregateCashFlows(cashFlows: readonly ReceivablesCostCashFlow[]): AggregatedCashFlow[] {
  const byDate = new Map<IsoDate, Decimal>();
  for (const cashFlow of cashFlows) {
    receivablesUtcDate(cashFlow.date);
    const amount = decimal(cashFlow.amount);
    assertPositive(amount, `cash flow ${cashFlow.id} amount`);
    const signed = cashFlow.direction === "borrower_inflow" ? amount : amount.negated();
    byDate.set(cashFlow.date, (byDate.get(cashFlow.date) ?? ZERO).plus(signed));
  }
  return [...byDate.entries()]
    .map(([date, net]) => ({date, net}))
    .filter((item) => !item.net.isZero())
    .sort((left, right) => left.date.localeCompare(right.date));
}

function solveConventionalXirr(flows: readonly AggregatedCashFlow[]): Decimal {
  if (flows.length < 2) throw new RangeError("CET requires cash flows on at least two dates");
  if (flows[0]!.net.lte(0)) throw new RangeError("the earliest net cash flow must be a borrower inflow");
  if (flows.slice(1).some((item) => item.net.gt(0))) {
    throw new RangeError("non-conventional cash flows require a separately governed return solver");
  }
  const start = flows[0]!.date;
  const npv = (rate: Decimal) => flows.reduce((total, flow) => {
    const days = decimal(receivablesDaysBetween(start, flow.date));
    return total.plus(flow.net.div(ONE.plus(rate).pow(days.div(CALENDAR_DAYS_PER_YEAR))));
  }, ZERO);

  let lower = new Decimal("-0.999999999999");
  let upper = ONE;
  let lowerNpv = npv(lower);
  let upperNpv = npv(upper);
  while (lowerNpv.mul(upperNpv).gt(0) && upper.lt("1000000")) {
    upper = upper.mul(2).plus(ONE);
    upperNpv = npv(upper);
  }
  if (lowerNpv.mul(upperNpv).gt(0)) throw new RangeError("CET root could not be bracketed");
  for (let iteration = 0; iteration < 256; iteration += 1) {
    const midpoint = lower.plus(upper).div(2);
    const midpointNpv = npv(midpoint);
    if (midpointNpv.abs().lte("1e-24") || upper.minus(lower).abs().lte("1e-24")) return midpoint;
    if (lowerNpv.mul(midpointNpv).lte(0)) {
      upper = midpoint;
      upperNpv = midpointNpv;
    } else {
      lower = midpoint;
      lowerNpv = midpointNpv;
    }
  }
  return lower.plus(upper).div(2);
}

export function calculateReceivablesCet(input: ReceivablesCetInput): ReceivablesCet {
  receivablesUtcDate(input.reportingDate);
  if (input.cashFlows.length === 0) throw new RangeError("CET requires cash flows");
  const ids = new Set<string>();
  for (const cashFlow of input.cashFlows) {
    if (ids.has(cashFlow.id)) throw new RangeError(`duplicate cash flow id: ${cashFlow.id}`);
    ids.add(cashFlow.id);
  }
  const aggregated = aggregateCashFlows(input.cashFlows);
  const startDate = aggregated[0]?.date;
  const endDate = aggregated.at(-1)?.date;
  if (startDate === undefined || endDate === undefined) throw new RangeError("CET cash flows net to zero on every date");
  const elapsed = receivablesDaysBetween(startDate, endDate);
  if (elapsed <= 0) throw new RangeError("CET requires a positive elapsed term");
  const annualRate = solveConventionalXirr(aggregated);
  const monthlyRate = ONE.plus(annualRate).pow(DAYS_PER_MONTH.div(CALENDAR_DAYS_PER_YEAR)).minus(ONE);
  const inflows = sum(input.cashFlows.filter((item) => item.direction === "borrower_inflow").map((item) => item.amount));
  const outflows = sum(input.cashFlows.filter((item) => item.direction === "borrower_outflow").map((item) => item.amount));
  const fees = sum(input.cashFlows.filter((item) => item.kind === "fee").map((item) => item.amount));
  const taxes = sum(input.cashFlows.filter((item) => item.kind === "tax").map((item) => item.amount));
  const taxFlowCount = input.cashFlows.filter((item) => item.kind === "tax").length;
  if (input.taxTreatment.status === "provided" && taxFlowCount === 0) {
    throw new RangeError("tax treatment is provided but no tax cash flow was supplied");
  }
  if (input.taxTreatment.status === "not_applicable" && taxFlowCount > 0) {
    throw new RangeError("tax cash flows cannot be supplied when tax treatment is not applicable");
  }
  if (input.taxTreatment.status === "not_provided" && taxFlowCount > 0) {
    throw new RangeError("tax cash flows require an explicit provided tax treatment");
  }
  const netInitial = aggregated[0]!.net;
  const anchors = [
    ...input.cashFlows.map((item) => item.source),
    ...(input.taxTreatment.status === "not_provided" ? [] : [input.taxTreatment.source]),
  ];
  const missingTaxWarning = "tax treatment was not supplied; the calculated rate is not a complete CET and no tax was imputed";
  const qualityWarnings = input.taxTreatment.status === "not_provided" ? [missingTaxWarning] : [];
  const metricInput = {
    period: period(input.reportingDate, startDate, endDate),
    datasetHash: input.datasetHash,
    anchors,
    universe: input.universeId,
  };
  return {
    version: receivablesStructureCostFormulaVersion,
    status: input.taxTreatment.status === "not_provided" ? "calculated_with_missing_tax_input" : "calculated_complete",
    startDate,
    endDate,
    elapsedCalendarDays: elapsed,
    netInitialProceeds: measuredMetric({...metricInput, id: "cet.net_initial_proceeds", value: netInitial, unit: "BRL", formulaId: "receivables.cet.net_initial_proceeds", inclusions: ["all borrower inflows and outflows on the earliest date"]}),
    totalBorrowerInflows: measuredMetric({...metricInput, id: "cet.total_inflows", value: inflows, unit: "BRL", formulaId: "receivables.cet.total_inflows"}),
    totalBorrowerOutflows: measuredMetric({...metricInput, id: "cet.total_outflows", value: outflows, unit: "BRL", formulaId: "receivables.cet.total_outflows"}),
    financeCost: measuredMetric({...metricInput, id: "cet.finance_cost", value: outflows.minus(inflows), unit: "BRL", formulaId: "receivables.cet.finance_cost", numerator: "total borrower outflows - total borrower inflows"}),
    fees: measuredMetric({...metricInput, id: "cet.fees", value: fees, unit: "BRL", formulaId: "receivables.cet.fees", inclusions: ["cash flows classified as fee"]}),
    taxes: measuredMetric({...metricInput, id: "cet.taxes", value: taxes, unit: "BRL", formulaId: "receivables.cet.taxes", inclusions: ["cash flows classified as tax"], warnings: qualityWarnings}),
    effectiveMonthlyRate: measuredMetric({...metricInput, id: "cet.effective_monthly_rate", value: monthlyRate, unit: "ratio", formulaId: "receivables.cet.xirr_monthly", numerator: "(1 + annual XIRR)^(30/365) - 1"}),
    effectiveAnnualRate: measuredMetric({...metricInput, id: "cet.effective_annual_rate", value: annualRate, unit: "ratio", formulaId: "receivables.cet.xirr_annual_365", numerator: "XIRR of borrower cash flows on actual calendar dates"}),
    quality: {warnings: qualityWarnings},
  };
}

export function calculateSingleMaturityReceivablesProposal(
  input: SingleMaturityReceivablesProposalInput,
): SingleMaturityReceivablesProposal {
  receivablesUtcDate(input.startDate);
  receivablesUtcDate(input.maturityDate);
  const calendarDays = receivablesDaysBetween(input.startDate, input.maturityDate);
  if (calendarDays <= 0) throw new RangeError("proposal maturity must follow its start date");
  const rateConversion = convertReceivablesRate({...input, calendarDays});
  const face = decimal(input.faceValue);
  const chargeIds = new Set<string>();
  const chargeAmounts = [...input.charges]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((charge) => {
      if (chargeIds.has(charge.id)) throw new RangeError(`duplicate proposal charge id: ${charge.id}`);
      chargeIds.add(charge.id);
      let amount: Decimal;
      if (charge.kind === "fixed_fee" || charge.kind === "tax") {
        amount = decimal(charge.amount);
        assertNonNegative(amount, `proposal charge ${charge.id}`);
      } else if (charge.kind === "ad_valorem_face_fee") {
        const rate = decimal(charge.rate);
        assertRate(rate, `proposal charge ${charge.id} rate`);
        amount = face.mul(rate);
      } else {
        const amountPerTitle = decimal(charge.amountPerTitle);
        assertNonNegative(amountPerTitle, `proposal charge ${charge.id} amount per title`);
        if (!Number.isInteger(charge.titleCount) || charge.titleCount < 0) throw new RangeError(`proposal charge ${charge.id} title count must be a non-negative integer`);
        amount = amountPerTitle.mul(charge.titleCount);
      }
      return {id: charge.id, kind: charge.kind, amount: canonicalMetricValue(amount), source: charge.source};
    });
  const cashFlows: ReceivablesCostCashFlow[] = [
    {
      id: "acquisition-price",
      date: input.startDate,
      amount: rateConversion.acquisitionPrice.value!,
      direction: "borrower_inflow",
      kind: "disbursement",
      source: input.source,
    },
    ...chargeAmounts.filter((charge) => decimal(charge.amount).gt(0)).map((charge): ReceivablesCostCashFlow => ({
      id: `charge:${charge.id}`,
      date: input.startDate,
      amount: charge.amount,
      direction: "borrower_outflow",
      kind: charge.kind === "tax" ? "tax" : "fee",
      source: charge.source,
    })),
    {
      id: "receivable-at-maturity",
      date: input.maturityDate,
      amount: input.faceValue,
      direction: "borrower_outflow",
      kind: "principal",
      source: input.source,
    },
  ];
  return {
    version: receivablesStructureCostFormulaVersion,
    rateConversion,
    chargeAmounts,
    cet: calculateReceivablesCet({
      reportingDate: input.reportingDate,
      universeId: input.universeId,
      datasetHash: input.datasetHash,
      currency: input.currency,
      cashFlows,
      taxTreatment: input.taxTreatment,
    }),
  };
}

function calculatedMetric(input: {
  id: string;
  value: Decimal | null;
  period: MetricPeriod;
  universe: string;
  formulaId: string;
  inputs: readonly GovernedRateAssumption[];
  warnings?: readonly string[];
}): GovernedCalculatedMetric {
  return {
    id: input.id,
    value: input.value === null ? null : canonicalMetricValue(input.value),
    status: input.value === null ? "not_evaluable" : "calculated",
    unit: "ratio",
    period: input.period,
    universe: input.universe,
    formula: {id: input.formulaId, version: receivablesStructureCostFormulaVersion},
    inputs: input.inputs,
    warnings: input.warnings ?? [],
  };
}

export function calculateImplicitAdvanceRate(input: ImplicitAdvanceRateInput): ImplicitAdvanceRate {
  receivablesUtcDate(input.reportingDate);
  receivablesUtcDate(input.periodStart);
  if (input.periodStart > input.reportingDate) throw new RangeError("advance-rate period start cannot follow reporting date");
  const required = [
    ["expectedDilution", input.expectedDilution],
    ["dilutionStressMultiplier", input.dilutionStressMultiplier],
    ["expectedLossRate", input.expectedLossRate],
    ["lossStressMultiplier", input.lossStressMultiplier],
    ["operationalReserve", input.operationalReserve],
  ] as const;
  const missing = required.filter(([, value]) => value === undefined).map(([name]) => name);
  const metricPeriod = period(input.reportingDate, input.periodStart, input.reportingDate);
  if (missing.length > 0) {
    const warning = `missing governed assumptions: ${missing.join(", ")}`;
    const unavailable = (id: string, formulaId: string) => calculatedMetric({id, value: null, period: metricPeriod, universe: input.universeId, formulaId, inputs: [], warnings: [warning]});
    return {
      version: receivablesStructureCostFormulaVersion,
      status: "not_evaluable",
      stressedDilutionReserve: unavailable("advance_rate.stressed_dilution_reserve", "receivables.advance_rate.stressed_dilution"),
      stressedLossReserve: unavailable("advance_rate.stressed_loss_reserve", "receivables.advance_rate.stressed_loss"),
      operationalReserve: unavailable("advance_rate.operational_reserve", "receivables.advance_rate.operational_reserve"),
      additionalReserve: unavailable("advance_rate.additional_reserve", "receivables.advance_rate.additional_reserve"),
      totalReserve: unavailable("advance_rate.total_reserve", "receivables.advance_rate.total_reserve"),
      implicitAdvanceRate: unavailable("advance_rate.implicit", "receivables.advance_rate.implicit"),
      quality: {warnings: [warning]},
    };
  }

  const expectedDilution = input.expectedDilution!;
  const dilutionStress = input.dilutionStressMultiplier!;
  const expectedLoss = input.expectedLossRate!;
  const lossStress = input.lossStressMultiplier!;
  const operational = input.operationalReserve!;
  const additions = input.additionalReserves ?? [];
  const dilutionRate = decimal(expectedDilution.value);
  const dilutionMultiplier = decimal(dilutionStress.value);
  const lossRate = decimal(expectedLoss.value);
  const lossMultiplier = decimal(lossStress.value);
  const operationalRate = decimal(operational.value);
  assertRate(dilutionRate, "expected dilution");
  assertRate(lossRate, "expected loss rate");
  assertRate(operationalRate, "operational reserve");
  if (dilutionMultiplier.lt(1) || !dilutionMultiplier.isFinite()) throw new RangeError("dilution stress multiplier must be at least one");
  if (lossMultiplier.lt(1) || !lossMultiplier.isFinite()) throw new RangeError("loss stress multiplier must be at least one");
  for (const reserve of additions) assertRate(decimal(reserve.value), `additional reserve ${reserve.id}`);
  const stressedDilution = dilutionRate.mul(dilutionMultiplier);
  const stressedLoss = lossRate.mul(lossMultiplier);
  const additional = sum(additions.map((item) => item.value));
  const totalReserve = stressedDilution.plus(stressedLoss).plus(operationalRate).plus(additional);
  if (totalReserve.gte(1)) throw new RangeError("total reserve must remain below one");
  const advanceRate = ONE.minus(totalReserve);
  const allInputs = [expectedDilution, dilutionStress, expectedLoss, lossStress, operational, ...additions];
  return {
    version: receivablesStructureCostFormulaVersion,
    status: "calculated",
    stressedDilutionReserve: calculatedMetric({id: "advance_rate.stressed_dilution_reserve", value: stressedDilution, period: metricPeriod, universe: input.universeId, formulaId: "receivables.advance_rate.stressed_dilution", inputs: [expectedDilution, dilutionStress]}),
    stressedLossReserve: calculatedMetric({id: "advance_rate.stressed_loss_reserve", value: stressedLoss, period: metricPeriod, universe: input.universeId, formulaId: "receivables.advance_rate.stressed_loss", inputs: [expectedLoss, lossStress]}),
    operationalReserve: calculatedMetric({id: "advance_rate.operational_reserve", value: operationalRate, period: metricPeriod, universe: input.universeId, formulaId: "receivables.advance_rate.operational_reserve", inputs: [operational]}),
    additionalReserve: calculatedMetric({id: "advance_rate.additional_reserve", value: additional, period: metricPeriod, universe: input.universeId, formulaId: "receivables.advance_rate.additional_reserve", inputs: additions}),
    totalReserve: calculatedMetric({id: "advance_rate.total_reserve", value: totalReserve, period: metricPeriod, universe: input.universeId, formulaId: "receivables.advance_rate.total_reserve", inputs: allInputs}),
    implicitAdvanceRate: calculatedMetric({id: "advance_rate.implicit", value: advanceRate, period: metricPeriod, universe: input.universeId, formulaId: "receivables.advance_rate.implicit", inputs: allInputs}),
    quality: {warnings: []},
  };
}
