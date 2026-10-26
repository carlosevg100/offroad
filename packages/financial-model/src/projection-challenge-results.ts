import {z} from "zod";
import {adoptedWeeklyCashOutputSchema} from "./ficha-calculation-results";

// The common adopted-result fields, taken from an existing adopted result so the shapes never drift.
const {schemaVersion: _s, analysisId: _a, perimeter: _p, weekly: _w, exclusions: _e, ...common} = adoptedWeeklyCashOutputSchema.shape;
const text = z.string().min(1).max(2000), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/), version = z.string().min(1).max(160);
const driver = z.enum(["quantity", "netUnitPrice", "variableUnitCost", "fixedCosts", "interestExpense", "receivableDays", "inventoryDays", "payableDays", "maintenanceCapex", "leasePayments", "depreciation", "taxRate"]);
const row = z.strictObject({periodId: version, quantity: decimal, netUnitPrice: decimal, revenue: decimal, variableCost: decimal, fixedCosts: decimal, ebitda: decimal,
  margin: decimal.nullable(), unitMargin: decimal, workingCapital: decimal, workingCapitalChange: decimal.nullable(), tax: decimal, cashAvailable: decimal.nullable()});
const pair = z.strictObject({ebitda: decimal, cash: decimal});

export const projectionChallengeOutputSchema = z.strictObject({schemaVersion: z.literal("projection-challenge.v1"), version, currency: z.string().regex(/^[A-Z]{3}$/),
  dayBasis: z.enum(["360", "365"]), targetPeriodId: version, convention: text,
  reference: z.array(row).min(2).max(20), plan: z.array(row).min(2).max(20),
  gap: z.strictObject({revenue: decimal, ebitda: decimal, cash: decimal, margin: decimal.nullable()}),
  effects: z.array(z.strictObject({assumptionId: version, label: text,
    drivers: z.array(z.strictObject({driver, plan: decimal, reference: decimal, planGrowth: decimal.nullable(), referenceGrowth: decimal.nullable()})).min(1).max(12),
    fromReference: pair, fromPlan: pair})).min(1).max(12),
  order: z.array(z.strictObject({assumptionId: version, cumulativeShareOfEbitdaGap: decimal.nullable()})).min(1).max(12),
  interaction: z.strictObject({fromReference: pair, fromPlan: pair}),
  unitMargin: z.strictObject({planFirst: decimal, planTarget: decimal, referenceTarget: decimal, planChange: decimal.nullable()}),
  capacity: z.strictObject({maximumQuantity: decimal, investmentInPlan: z.boolean(), periodsAbove: z.array(z.strictObject({periodId: version, quantity: decimal, excess: decimal})).max(20),
    firstPeriodAbove: version.nullable(), aboveWithoutInvestment: z.boolean()}).nullable(),
  receivables: z.strictObject({cashPerDayAtPlanRevenue: decimal, cashPerDayAtReferenceRevenue: decimal, planDays: decimal, requestedDays: decimal.nullable(), cashAtRequestedDays: decimal.nullable()}),
  premiumMix: z.strictObject({premiumOverAverage: decimal, priceRatio: decimal, shareNeededAtTarget: decimal, sharePerPeriod: decimal}).nullable()});

export const projectionChallengeExclusions = ["scenario_execution", "model_rebuild", "material_production", "credit_approval", "method_release"] as const;
const exclusions = z.array(z.enum(projectionChallengeExclusions)).length(5)
  .refine(v => v.join("|") === projectionChallengeExclusions.join("|"), "Exact exclusion ledger required");

export const adoptedProjectionChallengeOutputSchema = z.strictObject({...common, schemaVersion: z.literal("adopted-projection-challenge.v1"),
  analysisId: z.uuid(), perimeter: text, unitConvention: text.nullable(), challenge: projectionChallengeOutputSchema.nullable(),
  assumptions: z.array(z.strictObject({assumptionId: version, ruler: text.nullable(), evidenceThatWouldSustain: z.array(text).max(8).nullable(),
    evidenceStatus: z.enum(["documented", "not_presented"]).nullable()})).max(12),
  capacitySource: text.nullable(), marginCause: text.nullable(), exclusions});
