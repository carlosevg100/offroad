import {createHash} from "node:crypto";

import {z} from "zod";

import {analyzeReceivables} from "./analyze";
import {receivablesCaseSchema} from "./schema";

export const receivablesPoolUnderwritingVersion = "2026.09.06-v1" as const;

const currencySchema = z.enum(["BRL", "USD"]);

export const receivablesPoolUnderwritingInputSchema = z.object({
  currency: currencySchema,
  case: receivablesCaseSchema,
}).strict();
export type ReceivablesPoolUnderwritingInput = z.input<typeof receivablesPoolUnderwritingInputSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const metricMoneySchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const eligibilityReasonSchema = z.enum([
  "zero_balance", "defaulted", "past_due", "remaining_term", "seasoning",
  "not_assignable", "evidence_unverified", "anchor_unverified", "registration_missing",
  "registration_conflict", "encumbered", "disputed", "related_party", "sector_outside_policy",
]);

/** Exact result contract consumed by the internal dispatcher and artifact gates. */
export const receivablesPoolUnderwritingSchema = z.object({
  schema_version: z.literal("method.underwrite-receivables-pool.v1"),
  state: z.enum(["ready_for_structuring", "needs_remediation", "not_viable"]),
  case_id: z.string().min(1),
  reference_date: z.iso.date(),
  currency: currencySchema,
  portfolio_summary: z.object({
    receivableCount: z.number().int().nonnegative(),
    debtorCount: z.number().int().nonnegative(),
    debtorGroupCount: z.number().int().nonnegative(),
    totalOutstanding: metricMoneySchema,
    preliminaryEligibleBalance: metricMoneySchema,
    concentrationAdjustedEligibleBalance: metricMoneySchema,
    eligibleShare: metricMoneySchema,
    weightedAverageRemainingDays: metricMoneySchema,
    topDebtorShare: metricMoneySchema,
    topFiveDebtorShare: metricMoneySchema,
    topGroupShare: metricMoneySchema,
    debtorHerfindahl: metricMoneySchema,
  }).strict(),
  eligibility: z.array(z.object({
    receivableId: z.string().min(1), debtorId: z.string().min(1), debtorGroupId: z.string().min(1),
    balance: metricMoneySchema, daysPastDue: z.number().int().nonnegative(),
    seasoningDays: z.number().int().nonnegative(), remainingTermDays: z.number().int().nonnegative(),
    eligible: z.boolean(), reasons: z.array(eligibilityReasonSchema),
  }).strict()),
  aging: z.object({
    current: metricMoneySchema, days_1_30: metricMoneySchema, days_31_60: metricMoneySchema,
    days_61_90: metricMoneySchema, days_91_plus: metricMoneySchema,
  }).strict(),
  performance: z.object({
    delinquency1Share: metricMoneySchema, delinquency30Share: metricMoneySchema,
    delinquency90Share: metricMoneySchema, grossDefaultRate: metricMoneySchema,
    netLossRate: metricMoneySchema, recoveryRate: metricMoneySchema, dilutionRate: metricMoneySchema,
    repurchaseRate: metricMoneySchema, substitutionRate: metricMoneySchema,
  }).strict(),
  evidence_coverage: z.object({
    verifiedBalanceShare: metricMoneySchema, anchoredBalanceShare: metricMoneySchema,
    registrationCoverageShare: metricMoneySchema, assignableBalanceShare: metricMoneySchema,
    freeBalanceShare: metricMoneySchema,
  }).strict(),
  reconciliation: z.object({
    tapeToAccounting: reconciliationLineSchema(),
    tapeCollectionsToAccounting: z.object({
      tape: metricMoneySchema, reported: metricMoneySchema, difference: metricMoneySchema,
      differenceShare: metricMoneySchema, status: z.enum(["tied", "outside_tolerance"]),
    }).strict(),
    collectionsToCash: z.object({
      reported: metricMoneySchema, cash: metricMoneySchema, difference: metricMoneySchema,
      differenceShare: metricMoneySchema, status: z.enum(["tied", "outside_tolerance"]),
    }).strict(),
    cashControls: z.object({
      mappedShare: metricMoneySchema, linkedAccountShare: metricMoneySchema,
      duplicateReceiptIds: z.array(z.string()), unanchoredReceiptIds: z.array(z.string()),
      unknownMappingReceiptIds: z.array(z.string()),
    }).strict(),
  }).strict(),
  borrowing_base: z.object({
    requestedFacility: metricMoneySchema, maximumByAdvanceRate: metricMoneySchema,
    maximumByOvercollateralization: metricMoneySchema, supportedFacility: metricMoneySchema,
    overcollateralizationAtRequest: metricMoneySchema, requiredOvercollateralization: metricMoneySchema,
    actualSubordinationRate: metricMoneySchema, requiredSubordinationRate: metricMoneySchema,
    reserveTarget: metricMoneySchema,
  }).strict(),
  waterfall: z.array(z.object({
    priority: z.number().int().positive(), item: z.string().min(1), due: metricMoneySchema,
    paid: metricMoneySchema, shortfall: metricMoneySchema,
  }).strict()),
  triggers: z.array(z.object({
    id: z.string().min(1), actual: metricMoneySchema, threshold: metricMoneySchema,
    comparison: z.enum(["maximum", "minimum"]), status: z.enum(["within_limit", "breached"]),
    consequence: z.enum(["block", "remediate"]),
  }).strict()),
  gaps: z.array(z.object({
    code: z.string().min(1), severity: z.enum(["blocking", "material", "attention"]),
    scope: z.enum(["portfolio", "cedent", "obligor", "servicing", "structure"]),
    message: z.object({pt: z.string(), en: z.string()}).strict(), evidenceIds: z.array(z.string()),
  }).strict()),
  decision_boundary: z.object({
    status: z.enum(["ready_for_structuring", "needs_remediation", "not_viable"]),
    blockingCodes: z.array(z.string()), remediationCodes: z.array(z.string()),
    refusalCodes: z.array(z.string()), externalDirectionAllowed: z.literal(false),
  }).strict(),
  trace: z.object({
    method_version: z.literal(receivablesPoolUnderwritingVersion),
    engine_version: z.literal("2026.08.24-v1"), input_fingerprint: sha256Schema,
    output_fingerprint: sha256Schema, policy: receivablesCaseSchema.shape.policy,
    source_rows: z.array(z.object({
      receivable_id: z.string().min(1), document_id: z.string().min(1), anchor: z.string().min(1),
    }).strict()),
    cash_rows: z.array(z.object({
      receipt_id: z.string().min(1), document_id: z.string().min(1), anchor: z.string().min(1),
    }).strict()),
  }).strict(),
}).strict();
export type ReceivablesPoolUnderwriting = z.infer<typeof receivablesPoolUnderwritingSchema>;

function reconciliationLineSchema() {
  return z.object({
    tape: metricMoneySchema, accounting: metricMoneySchema, difference: metricMoneySchema,
    differenceShare: metricMoneySchema, status: z.enum(["tied", "outside_tolerance"]),
  }).strict();
}

/**
 * Produces the governed method result for a receivables pool. The model never calculates an
 * eligibility amount, concentration cap, borrowing base, trigger or waterfall. It supplies no
 * missing policy either: every threshold is part of the validated input and is echoed in trace.
 */
export function underwriteReceivablesPool(raw: ReceivablesPoolUnderwritingInput): ReceivablesPoolUnderwriting {
  const input = receivablesPoolUnderwritingInputSchema.parse(raw);
  const analysis = analyzeReceivables(input.case);
  const sourceRows = input.case.portfolio
    .map((row) => ({receivable_id: row.id, document_id: row.sourceDocumentId, anchor: row.sourceAnchor}))
    .sort((left, right) => left.receivable_id.localeCompare(right.receivable_id));
  const cashRows = input.case.cashReceipts
    .map((row) => ({receipt_id: row.id, document_id: row.sourceDocumentId, anchor: row.sourceAnchor}))
    .sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
  const canonicalInput = {
    currency: input.currency,
    case: {
      ...input.case,
      portfolio: [...input.case.portfolio].sort((left, right) => left.id.localeCompare(right.id)),
      cashReceipts: [...input.case.cashReceipts].sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
  const resultWithoutTrace = {
    schema_version: "method.underwrite-receivables-pool.v1" as const,
    state: analysis.decision.status,
    case_id: analysis.caseId,
    reference_date: input.case.referenceDate,
    currency: input.currency,
    portfolio_summary: analysis.metrics.portfolio,
    eligibility: [...analysis.analyzedReceivables].sort((left, right) => left.receivableId.localeCompare(right.receivableId)),
    aging: analysis.metrics.aging,
    performance: analysis.metrics.performance,
    evidence_coverage: analysis.metrics.evidence,
    reconciliation: analysis.reconciliation,
    borrowing_base: {
      requestedFacility: analysis.structure.requestedFacility,
      maximumByAdvanceRate: analysis.structure.maximumByAdvanceRate,
      maximumByOvercollateralization: analysis.structure.maximumByOvercollateralization,
      supportedFacility: analysis.structure.supportedFacility,
      overcollateralizationAtRequest: analysis.structure.overcollateralizationAtRequest,
      requiredOvercollateralization: analysis.structure.requiredOvercollateralization,
      actualSubordinationRate: analysis.structure.actualSubordinationRate,
      requiredSubordinationRate: analysis.structure.requiredSubordinationRate,
      reserveTarget: analysis.structure.reserveTarget,
    },
    waterfall: [...analysis.structure.waterfall].sort((left, right) => left.priority - right.priority),
    triggers: [...analysis.triggers].sort((left, right) => left.id.localeCompare(right.id)),
    gaps: [...analysis.gaps].sort((left, right) => left.code.localeCompare(right.code)),
    decision_boundary: analysis.decision,
  };
  const inputFingerprint = hash(canonicalInput);
  const outputFingerprint = hash({
    ...resultWithoutTrace,
    method_version: receivablesPoolUnderwritingVersion,
    engine_version: analysis.version,
    input_fingerprint: inputFingerprint,
    policy: input.case.policy,
    source_rows: sourceRows,
    cash_rows: cashRows,
  });
  return receivablesPoolUnderwritingSchema.parse({
    ...resultWithoutTrace,
    trace: {
      method_version: receivablesPoolUnderwritingVersion,
      engine_version: analysis.version,
      input_fingerprint: inputFingerprint,
      output_fingerprint: outputFingerprint,
      policy: input.case.policy,
      source_rows: sourceRows,
      cash_rows: cashRows,
    },
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
