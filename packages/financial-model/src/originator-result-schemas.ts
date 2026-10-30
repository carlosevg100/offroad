import {z} from "zod";
import {originatorExclusionReasons} from "@offroad/financial-core";
import {originatorEvidenceKey as key, originatorSourceReferenceSchema} from "./originator-evidence";

// Significant-digit precision does not bound fractional places: a small margin or a deep
// ownership path may carry many leading zeroes. Keep the exact finite decimal, never round to fit.
const decimal = z.string().max(8192).regex(/^-?\d+(?:\.\d+)?$/), date = z.iso.date();
const amounts = <const K extends string>(names: readonly K[]) => Object.fromEntries(names.map(k => [k, decimal])) as {[P in K]: typeof decimal};
export const originatorTraceSchema = z.strictObject({id: key, formula: z.string().min(1).max(2000), operands: z.record(z.string(), z.string()), result: decimal});
const traces = z.array(originatorTraceSchema).max(300000);
export const originatorFinancialResultSchema = z.strictObject({
  version: z.literal("2026.10.30-v1"), status: z.enum(["reconciled", "needs_reconciliation"]), gaps: z.array(key),
  ltm: z.strictObject({start: date, end: date, ...amounts(["grossRevenue", "netRevenue", "ebitda"])}),
  history: z.array(z.strictObject({entityId: key, perimeter: key, currency: z.string().regex(/^[A-Z]{3}$/), scale: z.literal("1"), start: date, end: date, ...amounts(["grossRevenue", "deductions", "netRevenue", "ebitda"]), ebitdaMargin: decimal.nullable(), priorComparableGrossGrowth: decimal.nullable()})).max(103),
  ...amounts(["assets", "liabilitiesAndEquity", "balanceDifference", "utilizedBankDebt", "unusedBankLimits", "utilizedAboveLimits", "bankLinesAgainstBalanceDifference"]),
  bankLinesAgainstScrDifference: decimal.nullable(), traces,
});
const title = {reference: key, debtorId: key, issueDate: date, face: decimal};
export const originatorCreditResultSchema = z.strictObject({
  version: z.literal("2026.10.30-v1"), analysisDate: date, reportingDate: date, operationStartDate: date, requestedTermDays: z.number().int().positive(), decisionAuthority: z.literal("committee"),
  status: z.enum(["not_evaluated", "needs_evidence", "recommend_decline", "no_additional_capacity", "recommend_conditional"]), gaps: z.array(key), vetoes: z.array(key),
  metrics: z.strictObject({rawRows: z.number().int(), uniqueTitles: z.number().int(), duplicateRows: z.number().int(),
    ...amounts(["rawFace", "uniqueFace", "duplicateFace", "originalPastDueFace", "currentPastDueFace", "originalPastDueRatio", "largestGroupFace", "topFiveGroupsFace", "largestGroupRatio", "hhi", "adjustedDebt", "freeCash", "netDebt", "unusedBankLimits"]), netDebtToEbitda: decimal.nullable()}),
  eligibility: z.strictObject({preliminaryFace: decimal, eligibleFace: decimal, accepted: z.array(z.strictObject(title)).max(100000), excluded: z.array(z.strictObject({...title, reason: z.enum([...originatorExclusionReasons, "concentration"])})).max(1000000)}).nullable(),
  rating: z.strictObject({points: z.number().int(), grade: key, totalFaceCap: decimal}).nullable(),
  capacity: z.strictObject({...amounts(["ratingHeadroom", "regulationHeadroom", "collateralHeadroom", "additionalFace", "resultingTotalFace", "minimumCashBeforeNewStress", "stressedMinimumCash", "headroomAboveCashFloor", "severeMinimumCash", "severeDeficit", "requestedFaceCashDeficit", "requestedMinimumCash"]), liquidityHeadroom: decimal.nullable(), maturityCashAfterStress: decimal.nullable(), requestedMaturityCashAfterStress: decimal.nullable()}).nullable(), traces,
});
export const originatorCreditReviewResultSchema = z.strictObject({
  schemaVersion: z.literal("originator-credit-review.v1"), executorVersion: z.literal("2026.10.30-v1"), entityId: key, perimeter: key, currency: z.string().regex(/^[A-Z]{3}$/), analysisDate: date, reportingDate: date, fundProgramId: key,
  policyReference: z.strictObject({sourceId: key, effectiveFrom: date, effectiveUntil: date.nullable()}).nullable(), financials: originatorFinancialResultSchema.nullable(), credit: originatorCreditResultSchema.nullable(),
  reconciliation: z.strictObject({status: z.enum(["reconciled", "needs_reconciliation"]), gaps: z.array(key), revenue: z.strictObject(amounts(["monthlyGross", "salesAbcGross", "monthlyDifference", "abcDifference"])), receivables: z.strictObject(amounts(["recomposedClosing", "difference", "tapeDifference", "balanceDifference"])), impairment: z.strictObject(amounts(["recomposedClosing", "difference", "balanceDifference", "olderWriteoffRecoveries"])), cancellationScenarioEbitda: decimal.nullable(), traces}).nullable(),
  numericReadings: z.array(z.strictObject({operand: key, value: decimal, unit: z.enum(["currency", "ratio", "multiple", "count"]), sourceId: key, contextId: key})).max(200000),
  gaps: z.array(z.strictObject({operand: key, reason: z.string().min(1).max(2000)})), sources: z.array(originatorSourceReferenceSchema).max(200000), traces,
  status: z.enum(["pending_evidence", "prepared_for_committee_review"]), decisionAuthority: z.literal("committee"), grantsCredit: z.literal(false), grantsPurchase: z.literal(false),
});
export const originatorRegistryResultSchema = z.strictObject({
  schemaVersion: z.literal("originator-registry-documentary-review.v1"), executorVersion: z.literal("2026.10.30-v1"), asOf: date, rootEntityId: key,
  ownership: z.strictObject({version: z.literal("2026.10.30-v1"), status: z.enum(["complete", "partial"]), resolvedPersons: z.array(z.strictObject({personId: key, resolvedShare: decimal})), unresolved: z.array(z.strictObject({entityId: key, share: decimal, reason: z.enum(["ownership_missing", "identity_missing", "cycle", "unallocated_share", "depth_limit"])})), traces}),
  signing: z.strictObject({status: z.enum(["documented", "pending"]), action: z.enum(["receivables_assignment", "guarantee", "borrowing"]), powers: z.array(z.strictObject({id: key, signingMode: z.enum(["all", "any"]), signatoryIds: z.array(key), sourceId: key})), signatoryIds: z.array(key)}),
  screenings: z.array(z.strictObject({id: key, kind: z.enum(["pep", "sanctions", "litigation", "negative_news"]), subjectId: key, sourceId: key, attributed: z.boolean(), result: z.enum(["no_hit_reported", "hit_reported", "inconclusive"]), disposition: z.string().min(1).max(4000).nullable()})),
  gaps: z.array(z.strictObject({code: key, subjectId: key.nullable(), sourceId: key.nullable()})), findings: z.array(z.strictObject({code: key, subjectId: key.nullable(), sourceId: key, detail: z.string().min(1).max(4000).nullable()})),
  sources: z.array(originatorSourceReferenceSchema), traces, status: z.enum(["pending_evidence", "prepared_for_registry_decision"]),
  decisions: z.strictObject({registry: z.literal("pending_human_decision"), credit: z.literal("outside_scope"), operation: z.literal("not_authorized")}), documentsAuthenticated: z.literal(false), liveQueriesPerformedByThisExecutor: z.literal(false),
});
