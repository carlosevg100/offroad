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
  own: price, peer: price, bridge: bridge.nullable(), actions: z.array(z.strictObject({actionId: z.uuid(), result: action.nullable()})).max(16),
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
  analysisId: z.uuid(), perimeter: text, scenario: text, project: project.nullable(), startupCapital: startup.nullable(), ramp: ramp.nullable(),
  company: company.nullable(), valuation: valuation.nullable(), valuationPerspective: z.enum(["standalone_project", "incremental_company"]).nullable(),
  exclusions: z.array(z.enum(["automatic_terminal_release", "intraperiod_cash_certification", "tax_law_inference", "financing_recommendation", "method_release"])).length(5).refine(v => v.join("|") === "automatic_terminal_release|intraperiod_cash_certification|tax_law_inference|financing_recommendation|method_release", "Exact exclusion ledger required")});
