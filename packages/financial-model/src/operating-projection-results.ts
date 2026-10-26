import {z} from "zod";
import {adoptionBasisEntrySchema} from "@offroad/reconciliation";
import {adoptedAnalysisContextSchema} from "./adopted-analysis-binding";

// Output contract of the adopted driver projection (ficha C24). The shared preamble repeats the one in
// ficha-calculation-results.ts, which does not export it; on registration this block moves there.
const text = z.string().min(1).max(2000), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const date = z.iso.date(), hash = z.string().regex(/^[a-f0-9]{64}$/), version = z.string().min(1).max(160);
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


const ratio = decimal.nullable(), origin = z.enum(["document", "informed", "house", "estimate"]);
const driver = z.enum(["volume", "netUnitPrice", "inputCostPerUnit", "otherVariableCostPerUnit", "fixedCosts", "receivableDays", "inventoryDays",
  "payableDays", "maintenanceCapex", "leasePayments", "depreciation", "interestExpense", "taxRate"]);
const row = z.strictObject({periodId: version, startDate: date, endDate: date, volume: decimal, netUnitPrice: decimal, inputCostPerUnit: decimal,
  revenue: decimal, variableCosts: decimal, fixedCosts: decimal, ebitda: decimal, margin: ratio, receivables: decimal, inventory: decimal, payables: decimal,
  workingCapital: decimal, changeInWorkingCapital: decimal, incomeTax: decimal, maintenanceCapex: decimal, cashBeforeLeases: decimal,
  leasePayments: decimal, cashAvailableForDebt: decimal, conversion: ratio});
const effects = z.strictObject({ebitda: decimal, cashAvailableForDebt: decimal, changeInWorkingCapital: decimal});
export const driverOperatingProjectionOutputSchema = z.strictObject({schemaVersion: z.literal("operating-projection.v1"), version, engineVersion: version,
  currency: z.string().regex(/^[A-Z]{3}$/), dayCountBasis: z.number().int().min(360).max(365),
  calibration: z.strictObject({periodId: version, startDate: date, endDate: date, reportedRevenue: decimal, modeledRevenue: decimal, reportedEbitda: decimal,
    modeledEbitda: decimal, revenueRelativeDifference: ratio, ebitdaRelativeDifference: ratio, tolerance: decimal, reproduces: z.boolean()}),
  rounding: z.literal("engine_operands_half_up_8_decimals"),
  exclusions: z.array(z.enum(["financing", "debt_service", "contractual_cfads", "tax_rule_inference", "loss_carryforward", "intraperiod_liquidity"])).length(6)
    .refine(v => v.join("|") === "financing|debt_service|contractual_cfads|tax_rule_inference|loss_carryforward|intraperiod_liquidity", "Exact exclusion ledger required"),
  projection: z.strictObject({
    base: z.array(row).min(1).max(40),
    scenarios: z.array(z.strictObject({id: version, label: text, role: z.enum(["alternative", "informed"]), basedOn: version,
      volumeGrowthRate: decimal.nullable(), volumeFactor: decimal.nullable(), overriddenDrivers: z.array(driver).max(13),
      inputCostShock: z.strictObject({fromPeriodId: version, rate: decimal, passThroughLagMonths: z.number().int().min(0).max(12)}).nullable(),
      rows: z.array(row.extend({effects})).min(1).max(40)})).max(12),
    sensitivities: z.array(z.strictObject({periodId: version, ebitdaPerOnePercentPrice: decimal, ebitdaLossPerOnePercentInputCost: decimal,
      workingCapitalPerReceivableDay: decimal, pricePercentShareOfEbitda: ratio})).min(1).max(40),
    comparisons: z.array(z.strictObject({id: version, label: text, status: z.enum(["approved", "under_review"]), periodId: version, metric: z.enum(["revenue", "ebitda"]),
      companyValue: decimal, projectedValue: decimal, difference: decimal, relativeDifference: ratio, unitPriceEquivalent: ratio})).max(12),
    largestCashReduction: z.strictObject({scenarioId: version, periodId: version, cashEffect: decimal, workingCapitalChangeEffect: decimal}).nullable(),
  }).nullable()});
export const adoptedDriverProjectionOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-operating-projection.v1"),
  analysisId: z.uuid(), perimeter: text, purpose: text.nullable(), projection: driverOperatingProjectionOutputSchema.nullable(),
  origins: z.strictObject({base: z.array(z.strictObject({driver, origins: z.array(origin).max(40).nullable()})).length(13),
    scenarios: z.array(z.strictObject({scenarioId: version, volumeGrowthRate: origin.nullable(), volumeFactor: origin.nullable(),
      overrides: z.array(z.strictObject({driver, origin: origin.nullable()})).max(13), inputCostShock: origin.nullable()})).max(12)}),
  companyVersions: z.array(z.strictObject({versionId: version, origin: origin.nullable(), cause: text.nullable()})).max(12),
  openQuestions: z.array(z.strictObject({versionId: version, question: z.literal("difference_cause_not_stated")})).max(12),
  exclusions: z.array(z.enum(["financing_recommendation", "budget_replacement", "debt_service", "credit_approval", "method_release"])).length(5)
    .refine(v => v.join("|") === "financing_recommendation|budget_replacement|debt_service|credit_approval|method_release", "Exact exclusion ledger required")});
