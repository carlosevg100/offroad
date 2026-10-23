import {z} from "zod";
import {adoptionBasisEntrySchema} from "@offroad/reconciliation";
import {deferredFinancingScheduleInputSchema, equivalentFinancingCostInputSchema,
  relativeDebtCostBridgeInputSchema, debtCostActionInputSchema, debtCapacityInputSchema,
  investmentProjectInputSchema, investmentProjectPeriodSchema, projectValuationInputSchema,
  companyCounterfactualInputSchema, startupWorkingCapitalInputSchema} from "@offroad/financial-core";
import {adoptedAnalysisContextSchema} from "./adopted-analysis-binding";

const text = z.string().min(1).max(2000), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const date = z.iso.date(), hash = z.string().regex(/^[a-f0-9]{64}$/), version = z.string().min(1).max(160);
const numbers = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map(k => [k, decimal])) as Record<K, typeof decimal>;
const gaps = z.array(z.strictObject({operand: text, reason: text})).max(1024);
const normalization = z.strictObject({schemaVersion: z.literal("adopted-currency-representation.v1"),
  scope: adoptedAnalysisContextSchema.shape.scope, basisFingerprint: hash, status: z.enum(["partial", "resolved"]),
  values: z.array(z.strictObject({decisionId: z.uuid(), type: z.enum(["number", "list"]),
    interpretationDecisionIds: z.array(z.uuid()).max(256), trace: z.strictObject({
      schemaVersion: z.literal("currency-representation.v1"), engineVersion: version,
      operands: z.strictObject({values: z.array(decimal).min(1).max(2000), declaredScale: decimal,
        representation: z.enum(["reported_in_declared_scale", "already_in_currency_units"])}),
      factor: decimal, outputScale: z.literal("1"), values: z.array(decimal).min(1).max(2000), rounding: z.literal("none"),
    }).nullable()})).max(256),
  gaps: z.array(z.strictObject({decisionId: z.uuid(), reason: z.literal("representation_not_adopted")})).max(256),
  contributions: z.array(adoptionBasisEntrySchema).max(256), grantsExecution: z.literal(false),
  classification: z.enum(["working_hypothesis", "working_selection"]), fingerprint: hash,
});
const common = {financialCoreVersion: version, scope: adoptedAnalysisContextSchema.shape.scope,
  entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), basisFingerprint: hash,
  status: z.enum(["missing_inputs", "partial_composition"]), gaps,
  bindings: z.array(z.strictObject({operand: text, decisionId: z.uuid().nullable(),
    interpretationDecisionIds: z.array(z.uuid()).max(256)})).max(1024), normalization: normalization.nullable(),
  contributions: z.array(adoptionBasisEntrySchema).max(256),
  derivedDependencies: z.array(z.strictObject({result: text, decisionIds: z.array(z.uuid()).max(256)})).max(16),
  classification: z.enum(["working_hypothesis", "working_selection"]),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash};

const costBase = {schemaVersion: z.literal("equivalent-financing-cost.v1"), engineVersion: version,
  operands: equivalentFinancingCostInputSchema,
  definition: z.literal("annual multiplicative spread over the dated index curve on net borrower cash flows"),
  regulatoryCet: z.literal(false)};
const bracket = {lowerSpread: decimal, upperSpread: decimal, lowerPresentValue: decimal, upperPresentValue: decimal};
const cost = z.discriminatedUnion("status", [
  z.strictObject({...costBase, status: z.literal("missing_inputs"),
    gaps: z.array(equivalentFinancingCostInputSchema.shape.costInventory.element).min(1).max(4), annualSpread: z.null(), residualPresentValue: z.null(), trace: z.null()}),
  z.strictObject({...costBase, status: z.literal("root_not_bracketed"), gaps: z.array(z.string()).length(0),
    annualSpread: z.null(), residualPresentValue: z.null(), trace: z.strictObject(bracket)}),
  z.strictObject({...costBase, status: z.literal("calculated"), gaps: z.array(z.string()).length(0),
    annualSpread: decimal, residualPresentValue: decimal,
    trace: z.strictObject({...bracket, iterations: z.literal(128), residualTolerance: decimal,
      discountedFlows: z.array(z.strictObject({date, ...numbers(["netAmount", "cumulativeYearFraction", "discountFactor"])})).min(1).max(480)})}),
]);
const schedule = z.strictObject({schemaVersion: z.literal("deferred-financing-schedule.v1"), engineVersion: version,
  operands: deferredFinancingScheduleInputSchema,
  rows: z.array(z.strictObject({periodId: text, startDate: date, endDate: date,
    ...numbers(["openingPrincipal", "openingAccruedInterest", "interestBase", "intervalFactor", "interestAccrued", "interestPaid",
      "principalPaid", "closingPrincipal", "closingAccruedInterest", "cashDebtService"])})).min(1).max(480),
  netFlows: equivalentFinancingCostInputSchema.shape.netFlows,
  finalPaymentDate: date, projectedThroughDate: date, weightedAverageLifeYears: decimal, totalInterestAccrued: decimal,
  rounding: z.literal("60-digit arithmetic; output half-up at 20 decimals")});
export const adoptedFinancingProposalOutputSchema = z.strictObject({...common,
  schemaVersion: z.literal("adopted-financing-proposal.v1"), adapterVersion: version, proposalId: z.uuid(),
  perimeter: text, scenario: text, openingDate: date, endDate: date, schedule: schedule.nullable(), cost: cost.nullable(),
  exclusions: z.array(z.enum(["company_liquidity", "covenants", "guarantees", "firmness", "additional_cash_costs", "choice_of_counterparty"])).length(6).refine(v => v.join("|") === "company_liquidity|covenants|guarantees|firmness|additional_cash_costs|choice_of_counterparty", "Exact exclusion ledger required")});

const bridge = z.strictObject({schemaVersion: z.literal("relative-debt-cost-bridge.v1"), version,
  operands: relativeDebtCostBridgeInputSchema,
  ...numbers(["grossBps", "knownAdjustmentsBps", "unexplainedAfterKnownAdjustmentsBps"]),
  afterPricingDateBps: decimal.nullable(), residualBps: decimal.nullable(), status: z.enum(["scoped_bridge", "limited_bridge"]),
  steps: z.array(relativeDebtCostBridgeInputSchema.shape.adjustments.element.extend({beforeBps: decimal, afterBps: decimal,
    formula: z.literal("remaining difference minus evidenced adjustment")})).max(32),
  causalAttribution: z.literal(false), creditRating: z.null(), trace: z.strictObject({id: z.literal("relative_cost.bridge"), formula: text, result: decimal})});
const action = z.strictObject({schemaVersion: z.literal("debt-cost-action.v1"), version, operands: debtCostActionInputSchema,
  rows: z.array(debtCostActionInputSchema.shape.exposure.element.extend(numbers(["annualRateDifference", "accruedFactorDifference", "nominalSavings"]))).min(1).max(480),
  nominalSavings: decimal, knownCosts: decimal, netNominalBenefit: decimal.nullable(),
  status: z.enum(["stated_horizon_estimate", "missing_costs"]), isDebtNpv: z.literal(false), guaranteesRepricing: z.literal(false),
  trace: z.strictObject({id: z.literal("relative_cost.action"), formula: text, result: text})});
const price = z.strictObject({spreadBps: decimal.nullable(), indexer: text.nullable(), pricingDate: date.nullable()});
export const adoptedRelativeDebtCostOutputSchema = z.strictObject({...common,
  schemaVersion: z.literal("adopted-relative-debt-cost.v1"), comparisonId: z.uuid(), peerEntityId: z.uuid(), asOfDate: date,
  own: price, peer: price, pricingBasis: relativeDebtCostBridgeInputSchema.shape.pricingBasis.nullable(), bridge: bridge.nullable(), actions: z.array(z.strictObject({actionId: z.uuid(), result: action.nullable()})).max(16),
  exclusions: z.array(z.enum(["causal_credit_attribution", "official_rating", "qualitative_credit_lens", "guaranteed_repricing", "publication_or_contact"])).length(5).refine(v => v.join("|") === "causal_credit_attribution|official_rating|qualitative_credit_lens|guaranteed_repricing|publication_or_contact", "Exact exclusion ledger required")});

const checks = z.array(z.strictObject({scenarioId: text, periodId: text, date, ruleId: text,
  kind: debtCapacityInputSchema.shape.scenarios.element.shape.rules.element.shape.kind, sourceAnchor: text,
  threshold: decimal, numerator: decimal, denominator: decimal.nullable(), metric: decimal.nullable(),
  slackInNumeratorUnits: decimal, applicable: z.boolean(), passed: z.boolean()})).max(23040);
const financialRows = z.array(z.strictObject({scenarioId: text, rows: z.array(z.strictObject({periodId: text, date,
  ...numbers(["ebitda", "covenantEbitda", "cashTax", "cfads", "cashInterest", "cashDebtService", "closingAvailableCash", "closingDebt"])})).min(1).max(240)})).min(1).max(8);
const capacity = z.strictObject({schemaVersion: z.literal("debt-capacity.v1"), engineVersion: version, operands: debtCapacityInputSchema,
  status: z.enum(["no_feasible_amount", "calibration_only", "calculated"]), maximumFeasibleAmount: decimal.nullable(), monetaryQuantum: decimal,
  requiredDebtHorizon: date, projectionEndDate: date, fullLifeVerified: z.boolean(), boundedBySearchDomain: z.boolean(),
  finalChecks: checks.nullable(), followingAmount: decimal.nullable(), followingChecks: checks.nullable(), financialRowsAtMaximum: financialRows.nullable(),
  viableRegions: z.array(z.strictObject({lower: decimal, upper: decimal, candidate: decimal.nullable()})).max(4096),
  unitSchedules: z.array(z.strictObject({scenarioId: text, rows: z.array(z.strictObject({periodId: text,
    ...numbers(["closingPrincipalPerUnit", "closingAccruedInterestPerUnit", "interestAccruedPerUnit", "interestPaidPerUnit", "netCashPerUnit"])})).min(1).max(240)})).min(1).max(8),
  intraperiodLiquidityVerified: z.literal(false), externalCreditApproval: z.literal(false)});
const fixedReview = z.strictObject({schemaVersion: z.literal("debt-capacity-profile.v1"), engineVersion: version,
  operands: debtCapacityInputSchema, amount: decimal, checks, constraintsPassed: z.boolean(), financialRows,
  requiredDebtHorizon: date, fullLifeVerified: z.boolean(), intraperiodLiquidityVerified: z.literal(false), externalCreditApproval: z.literal(false)});
export const adoptedDebtCapacityOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-debt-capacity.v1"),
  analysisId: z.uuid(), perimeter: text, profile: debtCapacityInputSchema.nullable(), capacity: capacity.nullable(), fixedReview: fixedReview.nullable(),
  exclusions: z.array(z.enum(["intraperiod_cash_certification", "nonlinear_pricing", "contract_extraction", "credit_approval", "method_release"])).length(5).refine(v => v.join("|") === "intraperiod_cash_certification|nonlinear_pricing|contract_extraction|credit_approval|method_release", "Exact exclusion ledger required")});

const project = z.strictObject({schemaVersion: z.literal("investment-project.v1"), engineVersion: version, operands: investmentProjectInputSchema,
  rows: z.array(z.strictObject({periodId: text, startDate: date, endDate: date, operands: investmentProjectPeriodSchema,
    ...numbers(["incrementalEbitda", "incrementalDepreciation", "incrementalCashTax", "maintenanceCapex", "growthCapex", "openingWorkingCapital",
      "closingWorkingCapital", "changeInWorkingCapital", "unleveredCashFlow", "cumulativeUnleveredCashFlow"])})).min(1).max(480),
  totalUnleveredCashFlow: decimal, exclusions: z.array(z.enum(["financing", "tax_law_inference", "automatic_terminal_release", "source_authority"])).length(4).refine(v => v.join("|") === "financing|tax_law_inference|automatic_terminal_release|source_authority", "Exact exclusion ledger required")});
const companyCash = z.strictObject(numbers(["ebitda", "cashTax", "cashBeforeFinancing", "closingAvailableCash"]));
const company = z.strictObject({schemaVersion: z.literal("company-investment-counterfactual.v1"), engineVersion: version,
  operands: companyCounterfactualInputSchema, project, requiredDebtHorizon: date, projectionEndDate: date,
  rows: z.array(z.strictObject({periodId: text, startDate: date, endDate: date, operands: companyCounterfactualInputSchema.shape.periods.element,
    withoutProject: companyCash, withProject: companyCash, incrementalCompanyCash: decimal, closingRestrictedCash: decimal, closingDebtStock: decimal})).min(1).max(480),
  measurement: z.literal("opening_and_period_end_cash"), intraperiodLiquidityVerified: z.literal(false), financingHeldConstant: z.literal(true)});
const startup = z.strictObject({engineVersion: version, operands: startupWorkingCapitalInputSchema,
  ...numbers(["receivables", "inventory", "newPayables", "lostSupplierCredit", "netRequirement"])});
const ramp = z.array(z.strictObject({engineVersion: version, operands: z.strictObject({startDate: date, endDate: date, operationStartMonth: date,
  stages: z.array(z.strictObject({months: z.number().int().positive().max(120), load: decimal})).max(24), terminalLoad: decimal, sourceAnchor: text}),
  activeMonths: z.number().int().nonnegative().max(120), activeYearFraction: decimal, loadEquivalentYearFraction: decimal,
  measurement: z.literal("adopted_monthly_load")})).min(1).max(480);
const valuation = z.strictObject({schemaVersion: z.literal("project-valuation.v1"), engineVersion: version, operands: projectValuationInputSchema,
  netPresentValue: decimal, irrStatus: z.enum(["calculated", "nonconventional_stream", "root_not_bracketed"]), annualIrr: decimal.nullable(),
  irrResidualPresentValue: decimal.nullable(), payback: z.strictObject({measuredDate: date, measuredTimeYears: decimal, interpolatedTimeYears: decimal}).nullable(),
  paybackRemainsRecoveredAtEnd: z.boolean(), cashFlowTrace: z.array(z.strictObject({id: text, date, timeYears: decimal, amount: decimal, sourceAnchor: text})).min(2).max(480)});
export const adoptedInvestmentAnalysisOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-investment-analysis.v1"),
  analysisId: z.uuid(), perimeter: text, scenario: text, inheritedScenario: text.nullable(), project: project.nullable(), startupCapital: startup.nullable(), ramp: ramp.nullable(),
  company: company.nullable(), valuation: valuation.nullable(), valuationPerspective: z.enum(["standalone_project", "incremental_company"]).nullable(),
  exclusions: z.array(z.enum(["automatic_terminal_release", "intraperiod_cash_certification", "tax_law_inference", "financing_recommendation", "method_release"])).length(5).refine(v => v.join("|") === "automatic_terminal_release|intraperiod_cash_certification|tax_law_inference|financing_recommendation|method_release", "Exact exclusion ledger required")});

// Engine values keep the kernel's full precision; they are never rounded back into observations.
const engine = z.string().regex(/^-?\d{1,30}(?:\.\d{1,80})?$/);
const comparedProposal = z.strictObject({id: z.uuid(), label: text, equivalentSpread: engine.nullable(),
  costStatus: z.enum(["calculated", "missing_inputs", "root_not_bracketed"]), weightedAverageLifeYears: engine, drawPeriodId: text,
  minimumCash: z.strictObject({amount: engine, periodId: text}), debtServiceByYear: z.record(z.string().regex(/^\d{4}$/), engine),
  covenant: z.strictObject({name: text, limit: engine, worst: z.strictObject({period: text, ratio: engine, headroom: engine}), allComply: z.boolean(),
    rows: z.array(z.strictObject({period: text, netDebt: engine, trailingEbitda: engine, ratio: engine, headroom: engine, complies: z.boolean()})).min(1).max(480)}),
  collateralConsumed: engine, freeReceivablesAfter: engine, horizonFinancingCost: engine, netDebtAtHorizon: engine, taxesInHorizon: engine,
  periods: z.array(z.strictObject({periodId: text, closingAvailable: engine, closingDebt: engine, cashTax: engine,
    proposalInterestAccrued: engine, proposalInterestPaid: engine, proposalPrincipalPaid: engine})).min(1).max(480)});
const comparisonExclusions = ["firmness_and_validity", "prepayment_terms", "reciprocity", "restricted_accounts", "choice_of_counterparty", "intraperiod_liquidity"] as const;
const account = z.enum(["available", "restricted"]);
const comparedInstrument = z.strictObject({instrumentId: text, currency: z.string().regex(/^[A-Z]{3}$/), openingPrincipal: decimal,
  indexer: z.enum(["none", "IPCA", "CDI", "SOFR", "fixed", "other"]), indexationTreatment: z.enum(["not_applicable", "cash_paid", "capitalized_principal"]),
  couponTreatment: z.enum(["cash_paid", "capitalized_principal", "accrued_until_paid"]), couponBase: z.enum(["opening_principal", "indexed_principal", "average_principal"]),
  drawdownAccount: account, paymentAccount: account,
  periods: z.array(z.strictObject({period: text, startDate: date, endDate: date, indexationRate: decimal, couponRate: decimal, drawdown: decimal,
    scheduledPrincipal: decimal, prepayment: decimal, repayAll: z.boolean(), paysAccruedCoupon: z.boolean().optional()})).min(1).max(480)});
const comparedCharge = z.strictObject({id: text, economicId: text, instrumentId: text, category: z.enum(["origination_fee", "recurring_fee", "tax", "other"]),
  period: text, date, amount: decimal, treatment: z.literal("cash_paid"), account: z.literal("available")});
const comparisonOperands = z.strictObject({currency: z.string().regex(/^[A-Z]{3}$/), openingDate: date, endDate: date, openingAvailable: decimal,
  periods: z.array(z.strictObject({id: text, startDate: date, endDate: date, ...numbers(["ebitda", "leasePayments", "depreciationAndAmortization",
    "workingCapitalCashFlow", "maintenanceCapexPaid", "growthCapexPaid"])})).min(1).max(480),
  commonInstruments: z.array(comparedInstrument).max(15), commonCharges: z.array(comparedCharge).max(512), commonNonDeductibleChargeIds: z.array(text).max(512),
  covenantHistory: z.array(z.strictObject({period: text, ebitda: decimal, leasePayments: decimal})).max(24),
  tax: z.strictObject({rate: decimal, lossTreatment: z.literal("no_cash_benefit")}), freeReceivablesPool: decimal,
  proposals: z.array(z.strictObject({id: z.uuid(), label: text,
    cost: z.strictObject({schedule: deferredFinancingScheduleInputSchema, lowerSpread: decimal, upperSpread: decimal,
      chargesAfterHorizon: z.array(z.strictObject({id: text, category: z.enum(["origination_fee", "recurring_fee", "tax", "other"]), date, amount: decimal})).max(240).optional()}),
    charges: z.array(comparedCharge).max(64), nonDeductibleChargeIds: z.array(text).max(64), collateralConsumed: decimal,
    covenant: z.strictObject({name: text, leaseLiabilityInDebt: z.boolean(), leaseLiability: decimal, ebitdaExcludesLeases: z.boolean(),
      trailingPeriods: z.number().int().min(1).max(24), measurementPeriods: z.array(text).min(1).max(480), limit: decimal, comparator: z.enum(["lte", "lt"])})})).min(1).max(8)});
const comparison = z.strictObject({schemaVersion: z.literal("financing-proposal-comparison.v2"), engineVersion: version, operands: comparisonOperands, currency: z.string().regex(/^[A-Z]{3}$/),
  openingDate: date, endDate: date, proposals: z.array(comparedProposal).min(1).max(8),
  exclusions: z.array(z.enum(comparisonExclusions)).length(6).refine(v => v.join("|") === comparisonExclusions.join("|"), "Exact exclusion ledger required")});
const adapterExclusions = [...comparisonExclusions, "tax_law_inference"] as const;
export const adoptedFinancingComparisonOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-financing-comparison.v1"), adapterVersion: version,
  comparisonId: z.uuid(), perimeter: text, scenario: text, inheritedScenario: text.nullable(), openingDate: date, endDate: date, comparison: comparison.nullable(),
  policies: z.strictObject({minimumCash: decimal.nullable(), maximumCollateralShare: decimal.nullable()}), incompleteProposalIds: z.array(z.uuid()).max(8),
  exclusions: z.array(z.enum(adapterExclusions)).length(7).refine(v => v.join("|") === adapterExclusions.join("|"), "Exact exclusion ledger required")});

const nullableDecimal = decimal.nullable(), component = z.enum(["principal", "accrued_interest", "unamortized_cost", "drawn_credit_lines", "lease", "supplier_finance", "guarantee_given"]);
const crossDefaultTerm = z.strictObject({threshold: decimal.nullable(), acceleration: z.enum(["automatic", "non_automatic"]), scope: text,
  scopeKind: z.enum(["any_financial_debt", "named_creditors"]), creditors: z.array(text).max(12), thresholdBasis: z.enum(["amount_in_default", "outstanding_principal"])});
export const debtTableOutputSchema = z.strictObject({schemaVersion: z.literal("debt-table.v1"), version, referenceDate: date, currency: z.string().regex(/^[A-Z]{3}$/),
  rows: z.array(z.strictObject({id: version, label: text, creditor: text, borrower: text, principal: decimal, accountingBalance: decimal, indexer: version,
    spread: nullableDecimal, nominalRate: nullableDecimal, finalPayment: date, scheduleMatchesPrincipal: z.boolean(), guarantee: text, covenant: text.nullable(),
    crossDefault: crossDefaultTerm.nullable(), prepayment: text.nullable()})).min(1).max(32),
  reconciliation: z.strictObject({principal: decimal, accruedInterest: decimal, unamortizedCost: decimal, accounting: decimal, reported: nullableDecimal, difference: nullableDecimal,
    status: z.enum(["exact", "difference", "not_reported"])}),
  creditLines: z.array(z.strictObject({id: version, label: text, creditor: text, limit: decimal, drawn: decimal, unused: decimal})).max(32),
  views: z.array(z.strictObject({id: version, label: text, components: z.array(component).min(1).max(7), total: decimal,
    bridgeFromBase: z.array(z.strictObject({component, amount: decimal})).max(7), netDebt: nullableDecimal})).min(1).max(8),
  outsideEveryView: z.array(z.strictObject({id: version, kind: z.enum(["lease", "supplier_finance", "guarantee_given"]), label: text, creditor: text.nullable(), amount: decimal})).max(64),
  unusedLimits: decimal,
  profile: z.strictObject({scheduleByYear: z.array(z.strictObject({year: z.number().int().min(1000).max(9999), principal: decimal})).max(100),
    dueWithinTwelveMonths: decimal, dueWithinTwelveMonthsShare: nullableDecimal, twelveMonthHorizon: date, weightedAverageLifeYears: nullableDecimal,
    largestCreditor: z.strictObject({creditor: text, principal: decimal, share: nullableDecimal}).nullable(), averageNominalCost: nullableDecimal}),
  negativePledgeBaskets: z.array(z.strictObject({holderId: version, basket: decimal, occupied: decimal, remaining: decimal, exceeded: z.boolean(), usedBy: z.array(version).max(32)})).max(32),
  crossDefault: z.strictObject({chain: z.array(z.strictObject({instrumentId: version, threshold: decimal, acceleration: z.enum(["automatic", "non_automatic"]), scope: text,
    scopeKind: z.enum(["any_financial_debt", "named_creditors"]), thresholdBasis: z.enum(["amount_in_default", "outstanding_principal"]),
    hypothesis: z.literal("whole_outstanding_in_default"), potentiallyTriggeredBy: z.array(version).max(128), complete: z.boolean(), unresolved: z.array(version).max(64)})).max(32),
    lowestThreshold: z.strictObject({instrumentId: version, threshold: decimal}).nullable()}),
  leverage: z.array(z.strictObject({viewId: version, label: text, netDebt: nullableDecimal, ebitda: decimal, ebitdaDeduction: decimal, denominator: decimal, ratio: nullableDecimal})).max(8),
  completeness: z.strictObject({status: z.enum(["proven", "unproven"]), evidence: text, request: z.literal("external_register_of_financial_institution_operations").nullable()}),
  categoryCoverage: z.array(z.strictObject({kind: z.enum(["lease", "supplier_finance", "guarantee_given"]), status: z.enum(["present", "confirmed_absent", "not_examined"])})).length(3),
  gaps: z.array(z.strictObject({item: text, reason: text})).max(64)});
export const adoptedDebtTableOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-debt-table.v1"),
  analysisId: z.uuid(), perimeter: text, referenceDate: date, table: debtTableOutputSchema.nullable(),
  exclusions: z.array(z.enum(["contract_extraction", "covenant_measurement", "credit_approval", "structure_opinion", "method_release"])).length(5)
    .refine(v => v.join("|") === "contract_extraction|covenant_measurement|credit_approval|structure_opinion|method_release", "Exact exclusion ledger required")});

const covenantTest = z.strictObject({limitId: version, kind: z.enum(["contractual", "board_policy"]), maximumRatio: decimal, breached: z.boolean(),
  ebitdaHeadroom: decimal, netDebtHeadroom: decimal, unrealizedEbitdaLossToLimit: decimal.nullable()});
export const covenantHeadroomOutputSchema = z.strictObject({schemaVersion: z.literal("covenant-headroom.v1"), version, currency: z.string().regex(/^[A-Z]{3}$/), readingDate: date,
  limits: z.array(z.strictObject({id: version, label: text, kind: z.enum(["contractual", "board_policy"]), status: z.enum(["in_force", "superseded"]), maximumRatio: decimal, source: text,
    testDates: z.array(date).max(24)})).min(1).max(8),
  measurements: z.array(z.strictObject({id: version, label: text, date, scenario: text, role: z.enum(["test", "contrast"]), debt: decimal, cash: decimal, netDebt: decimal,
    reportedEbitda: decimal, adjustments: z.array(z.strictObject({label: text, amount: decimal})).max(16), ebitda: decimal, ratio: decimal.nullable(),
    unrealizedEbitda: decimal.nullable(), tests: z.array(covenantTest).max(8), tightestLimitId: version.nullable()})).min(1).max(24),
  effects: z.array(z.strictObject({id: version, label: text, measurementId: version, withoutEffectMeasurementId: version, ratioEffect: decimal.nullable(), netDebtEffect: decimal})).max(8),
  worst: z.strictObject({measurementId: version, limitId: version, ebitdaHeadroom: decimal}).nullable(), anyBreach: z.boolean()});
export const adoptedCovenantHeadroomOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-covenant-headroom.v1"),
  analysisId: z.uuid(), perimeter: text, readingDate: date, headroom: covenantHeadroomOutputSchema.nullable(),
  definitions: z.array(z.strictObject({limitId: version, definition: text.nullable()})).max(8),
  openQuestions: z.array(z.strictObject({limitId: version, question: z.literal("ebitda_definition_not_written")})).max(8),
  consequence: z.strictObject({acceleration: z.enum(["automatic", "non_automatic"]).nullable(), process: text.nullable(), crossDefault: text.nullable()}),
  exclusions: z.array(z.enum(["projection", "contract_extraction", "waiver_negotiation", "credit_approval", "method_release"])).length(5)
    .refine(v => v.join("|") === "projection|contract_extraction|waiver_negotiation|credit_approval|method_release", "Exact exclusion ledger required")});

const weekRow = z.strictObject({weekStart: date, inflows: decimal, outflows: decimal, closing: decimal, belowMinimum: z.boolean(),
  largestOutflows: z.array(z.strictObject({label: text, amount: decimal})).max(3), outflowsByStream: z.array(z.strictObject({streamId: version, label: text, category: z.enum(["debt", "statutory", "operating", "action"]), amount: decimal})).max(64)});
export const weeklyCashOutputSchema = z.strictObject({schemaVersion: z.literal("weekly-cash.v1"), version, currency: z.string().regex(/^[A-Z]{3}$/),
  firstMonday: date, horizonEnd: date, openingCash: decimal, minimumCash: decimal,
  cases: z.array(z.strictObject({id: version, label: text, role: z.enum(["informed", "alternative"]), rows: z.array(weekRow).min(1).max(104),
    minimum: z.strictObject({weekStart: date, closing: decimal}), weeksBelowMinimum: z.array(date).max(104), closing: decimal, shortfallToMinimum: decimal})).min(1).max(8),
  calendar: z.array(z.strictObject({date, label: text, category: z.enum(["debt", "statutory"]), amount: decimal})).max(2000),
  actions: z.array(z.strictObject({id: version, label: text, cases: z.array(version).max(8), isolatedCases: z.array(version).max(8), amount: decimal, days: z.number().int().min(1).max(3660),
    interest: decimal, iof: decimal, fee: decimal, cost: decimal, openAtCovenantTest: z.boolean().nullable(),
    covenantEffect: z.strictObject({grossDebt: decimal, cash: decimal, netDebt: z.literal("0")}).nullable()})).max(8),
  reconciliation: z.strictObject({date, weekly: decimal, projection: decimal, difference: decimal}).nullable(),
  coverage: z.array(z.strictObject({obligation: z.enum(["payroll", "thirteenth_salary", "payroll_charges", "sales_taxes", "income_taxes", "debt_service"]),
    status: z.enum(["included", "not_applicable", "not_examined"])})).length(6),
  gaps: z.array(z.strictObject({item: text, reason: z.literal("obligation_not_examined")})).max(6)});
export const adoptedWeeklyCashOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-weekly-cash.v1"),
  analysisId: z.uuid(), perimeter: text, weekly: weeklyCashOutputSchema.nullable(),
  exclusions: z.array(z.enum(["business_day_inference", "intraday_liquidity", "receivables_assignment_eligibility", "credit_approval", "method_release"])).length(5)
    .refine(v => v.join("|") === "business_day_inference|intraday_liquidity|receivables_assignment_eligibility|credit_approval|method_release", "Exact exclusion ledger required")});
