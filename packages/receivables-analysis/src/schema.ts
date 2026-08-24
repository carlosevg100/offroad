import {z} from "zod";

export const receivablesAnalysisVersion = "2026.08.24-v1" as const;

export const moneySchema = z.string().regex(/^\d+(?:\.\d+)?$/);
export const rateSchema = z.string().regex(/^\d+(?:\.\d+)?$/).refine((value) => Number(value) >= 0 && Number(value) <= 1, "rate must be between zero and one");

export const receivableSchema = z.object({
  id: z.string().min(1),
  debtorId: z.string().min(1),
  debtorGroupId: z.string().min(1).optional(),
  debtorSector: z.string().min(1),
  originDate: z.iso.date(),
  dueDate: z.iso.date(),
  originalAmount: moneySchema,
  outstandingBalance: moneySchema,
  paidAmount: moneySchema.default("0"),
  collectedInPeriod: moneySchema.default("0"),
  defaultedBalance: moneySchema.default("0"),
  recoveredInPeriod: moneySchema.default("0"),
  dilutionInPeriod: moneySchema.default("0"),
  repurchasedInPeriod: moneySchema.default("0"),
  substitutedInPeriod: moneySchema.default("0"),
  assignable: z.boolean(),
  evidenceVerified: z.boolean(),
  registration: z.enum(["registered", "not_required", "missing", "conflict"]),
  encumbrance: z.enum(["free", "pledged", "assigned", "unknown"]),
  disputed: z.boolean().default(false),
  relatedParty: z.boolean().default(false),
  sourceDocumentId: z.string().min(1),
  sourceAnchor: z.string().min(1),
  anchorVerified: z.boolean(),
}).superRefine((item, context) => {
  const original = Number(item.originalAmount);
  const outstanding = Number(item.outstandingBalance);
  const paid = Number(item.paidAmount);
  const defaulted = Number(item.defaultedBalance);
  if (original < 0 || outstanding < 0 || paid < 0 || defaulted < 0) context.addIssue({code: "custom", message: "monetary balances cannot be negative"});
  if (original <= 0) context.addIssue({code: "custom", path: ["originalAmount"], message: "original amount must be positive"});
  if (outstanding > original) context.addIssue({code: "custom", path: ["outstandingBalance"], message: "outstanding balance cannot exceed original amount"});
  if (defaulted > outstanding) context.addIssue({code: "custom", path: ["defaultedBalance"], message: "defaulted balance cannot exceed outstanding balance"});
  if (item.dueDate < item.originDate) context.addIssue({code: "custom", path: ["dueDate"], message: "due date cannot precede origin date"});
});
export type Receivable = z.infer<typeof receivableSchema>;

export const cashReceiptSchema = z.object({
  id: z.string().min(1),
  receivedAt: z.iso.date(),
  amount: moneySchema,
  receivableId: z.string().min(1).nullable(),
  debtorId: z.string().min(1).nullable(),
  linkedAccount: z.boolean(),
  duplicateOf: z.string().min(1).nullable().default(null),
  sourceDocumentId: z.string().min(1),
  sourceAnchor: z.string().min(1),
  anchorVerified: z.boolean(),
}).superRefine((receipt, context) => {
  if (Number(receipt.amount) <= 0) context.addIssue({code: "custom", path: ["amount"], message: "cash receipt amount must be positive"});
});
export type CashReceipt = z.infer<typeof cashReceiptSchema>;

export const eligibilityPolicySchema = z.object({
  maxDaysPastDue: z.number().int().nonnegative(),
  maxRemainingTermDays: z.number().int().positive(),
  minSeasoningDays: z.number().int().nonnegative(),
  requireAssignable: z.boolean(),
  requireEvidenceVerified: z.boolean(),
  registrationRule: z.enum(["required", "required_when_applicable", "not_required"]),
  excludeDisputed: z.boolean(),
  excludeRelatedParties: z.boolean(),
  excludeEncumbered: z.boolean(),
  allowedDebtorSectors: z.array(z.string().min(1)).default([]),
  maxSingleDebtorShare: rateSchema,
  maxDebtorGroupShare: rateSchema,
  minimumEligibleShare: rateSchema,
  minimumEvidenceCoverage: rateSchema,
  minimumRegistrationCoverage: rateSchema,
  maximumDelinquency30Share: rateSchema,
  maximumDilutionShare: rateSchema,
  maximumRepurchaseShare: rateSchema,
  minimumRecoveryRate: rateSchema,
  maximumAccountingMismatchShare: rateSchema,
  maximumCashMismatchShare: rateSchema,
  minimumMappedCashShare: rateSchema,
  minimumLinkedAccountCashShare: rateSchema,
});
export type EligibilityPolicy = z.infer<typeof eligibilityPolicySchema>;

export const receivablesStructureSchema = z.object({
  requestedFacility: moneySchema.refine((value) => Number(value) > 0, "requested facility must be positive"),
  advanceRate: rateSchema,
  requiredOvercollateralization: z.string().regex(/^\d+(?:\.\d+)?$/).refine((value) => Number(value) >= 1, "overcollateralization must be at least one"),
  requiredSubordinationRate: rateSchema,
  actualSeniorAmount: moneySchema,
  actualMezzanineAmount: moneySchema.default("0"),
  actualSubordinatedAmount: moneySchema,
  reserveRate: rateSchema,
  waterfall: z.object({
    availableCash: moneySchema,
    servicingFeeDue: moneySchema,
    seniorInterestDue: moneySchema,
    seniorPrincipalDue: moneySchema,
    reserveOpening: moneySchema,
    mezzanineDue: moneySchema.default("0"),
  }),
}).superRefine((structure, context) => {
  const capital = Number(structure.actualSeniorAmount) + Number(structure.actualMezzanineAmount) + Number(structure.actualSubordinatedAmount);
  if (capital <= 0) context.addIssue({code: "custom", message: "actual capital stack must be positive"});
});
export type ReceivablesStructure = z.infer<typeof receivablesStructureSchema>;

export const receivablesCaseSchema = z.object({
  schemaVersion: z.literal(receivablesAnalysisVersion),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,99}$/),
  referenceDate: z.iso.date(),
  cedent: z.object({
    id: z.string().min(1),
    legalName: z.string().min(2),
    servicingRole: z.enum(["cedent", "third_party", "shared"]),
  }),
  portfolio: z.array(receivableSchema).min(1),
  cashReceipts: z.array(cashReceiptSchema),
  accounting: z.object({
    grossReceivablesBalance: moneySchema,
    allowanceBalance: moneySchema,
    reportedCollectionsInPeriod: moneySchema,
  }),
  policy: eligibilityPolicySchema,
  structure: receivablesStructureSchema,
}).superRefine((input, context) => {
  if (Number(input.accounting.allowanceBalance) > Number(input.accounting.grossReceivablesBalance)) {
    context.addIssue({code: "custom", path: ["accounting", "allowanceBalance"], message: "allowance cannot exceed gross receivables"});
  }
  const receivableIds = new Set<string>();
  const receivableAnchors = new Set<string>();
  const debtorGroups = new Map<string, string>();
  for (const [index, item] of input.portfolio.entries()) {
    if (receivableIds.has(item.id)) context.addIssue({code: "custom", path: ["portfolio", index, "id"], message: "receivable id must be unique"});
    receivableIds.add(item.id);
    const anchor = `${item.sourceDocumentId}:${item.sourceAnchor}`;
    if (receivableAnchors.has(anchor)) context.addIssue({code: "custom", path: ["portfolio", index, "sourceAnchor"], message: "receivable source anchor must identify one row"});
    receivableAnchors.add(anchor);
    const group = item.debtorGroupId ?? item.debtorId;
    const priorGroup = debtorGroups.get(item.debtorId);
    if (priorGroup !== undefined && priorGroup !== group) context.addIssue({code: "custom", path: ["portfolio", index, "debtorGroupId"], message: "one debtor cannot belong to multiple economic groups in the same snapshot"});
    debtorGroups.set(item.debtorId, group);
  }
  const receiptIds = new Set<string>();
  const receiptAnchors = new Set<string>();
  for (const [index, receipt] of input.cashReceipts.entries()) {
    if (receiptIds.has(receipt.id)) context.addIssue({code: "custom", path: ["cashReceipts", index, "id"], message: "cash receipt id must be unique"});
    receiptIds.add(receipt.id);
    const anchor = `${receipt.sourceDocumentId}:${receipt.sourceAnchor}`;
    if (receiptAnchors.has(anchor)) context.addIssue({code: "custom", path: ["cashReceipts", index, "sourceAnchor"], message: "cash receipt source anchor must identify one row"});
    receiptAnchors.add(anchor);
  }
  for (const [index, receipt] of input.cashReceipts.entries()) {
    if (receipt.duplicateOf === receipt.id) context.addIssue({code: "custom", path: ["cashReceipts", index, "duplicateOf"], message: "a cash receipt cannot duplicate itself"});
    if (receipt.duplicateOf !== null && !receiptIds.has(receipt.duplicateOf)) context.addIssue({code: "custom", path: ["cashReceipts", index, "duplicateOf"], message: "duplicate receipt must reference another receipt in the snapshot"});
  }
});
export type ReceivablesCase = z.infer<typeof receivablesCaseSchema>;

export type EligibilityReason =
  | "zero_balance"
  | "defaulted"
  | "past_due"
  | "remaining_term"
  | "seasoning"
  | "not_assignable"
  | "evidence_unverified"
  | "anchor_unverified"
  | "registration_missing"
  | "registration_conflict"
  | "encumbered"
  | "disputed"
  | "related_party"
  | "sector_outside_policy";

export type ReceivablesDecision = "ready_for_structuring" | "needs_remediation" | "not_viable";
