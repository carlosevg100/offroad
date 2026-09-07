import {createHash} from "node:crypto";

import type {SourceAnchor} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

import {
  eligibilityPolicySchema,
  moneySchema,
  receivablesStructureSchema,
} from "./schema";
import type {ReceivablesPhaseOneInput} from "./phase-one";
import {
  receivablesPoolInputAssemblySchema,
  receivablesPoolInputAssemblyVersion,
  type ReceivablesPoolInputAssembly,
} from "./method-readiness";

export const receivablesPoolInputSupplementVersion = "2026.09.07-v1" as const;

const evidenceReferenceSchema = z.object({
  sourceClass: z.enum(["provided_document", "project_context", "house_method", "user_confirmation"]),
  sourceId: z.string().min(1),
  anchor: z.string().min(1),
}).strict();
const evidenceSectionSchema = z.array(evidenceReferenceSchema).min(1);

const titleSupplementSchema = z.object({
  sourceReceivableId: z.string().min(1),
  debtorSector: z.string().min(1),
  collectedInPeriod: moneySchema,
  defaultedBalance: moneySchema,
  recoveredInPeriod: moneySchema,
  dilutionInPeriod: moneySchema,
  repurchasedInPeriod: moneySchema,
  substitutedInPeriod: moneySchema,
  assignable: z.boolean(),
  evidenceVerified: z.boolean(),
  registration: z.enum(["registered", "not_required", "missing", "conflict"]),
  encumbrance: z.enum(["free", "pledged", "assigned", "unknown"]),
  disputed: z.boolean(),
  relatedParty: z.boolean(),
}).strict();

const cashSupplementSchema = z.object({
  id: z.string().min(1),
  receivedAt: z.iso.date(),
  amount: moneySchema,
  sourceReceivableId: z.string().min(1).nullable(),
  debtorId: z.string().min(1).nullable(),
  linkedAccount: z.boolean(),
  duplicateOf: z.string().min(1).nullable(),
  sourceDocumentId: z.string().min(1),
  sourceAnchor: z.string().min(1),
  anchorVerified: z.boolean(),
}).strict();

export const receivablesPoolInputSupplementSchema = z.object({
  schemaVersion: z.literal(receivablesPoolInputSupplementVersion),
  sourceDatasetHash: z.string().regex(/^[a-f0-9]{64}$/),
  cedent: z.object({
    id: z.string().min(1),
    legalName: z.string().min(2),
    servicingRole: z.enum(["cedent", "third_party", "shared"]),
  }).strict(),
  titles: z.array(titleSupplementSchema).min(1),
  cashReceipts: z.array(cashSupplementSchema),
  accounting: z.object({
    grossReceivablesBalance: moneySchema,
    allowanceBalance: moneySchema,
    reportedCollectionsInPeriod: moneySchema,
  }).strict(),
  policy: eligibilityPolicySchema,
  structure: receivablesStructureSchema,
  evidence: z.object({
    cedentAndServicing: evidenceSectionSchema,
    titleLegalControls: evidenceSectionSchema,
    performanceHistory: evidenceSectionSchema,
    cashReconciliation: evidenceSectionSchema,
    accountingReconciliation: evidenceSectionSchema,
    eligibilityPolicy: evidenceSectionSchema,
    facilityAndWaterfall: evidenceSectionSchema,
  }).strict(),
  findingResolutions: z.array(z.object({
    findingId: z.string().min(1),
    disposition: z.enum(["remediated", "false_positive", "incorporated_in_method_input"]),
    rationale: z.string().min(10),
    evidence: evidenceSectionSchema,
  }).strict()),
}).strict().superRefine((supplement, context) => {
  const titleIds = supplement.titles.map((item) => item.sourceReceivableId);
  if (new Set(titleIds).size !== titleIds.length) {
    context.addIssue({code: "custom", path: ["titles"], message: "one supplement per source receivable is required"});
  }
  const receiptIds = supplement.cashReceipts.map((item) => item.id);
  if (new Set(receiptIds).size !== receiptIds.length) {
    context.addIssue({code: "custom", path: ["cashReceipts"], message: "cash receipt ids must be unique"});
  }
  const findingIds = supplement.findingResolutions.map((item) => item.findingId);
  if (new Set(findingIds).size !== findingIds.length) {
    context.addIssue({code: "custom", path: ["findingResolutions"], message: "finding resolutions must be unique"});
  }
});
export type ReceivablesPoolInputSupplement = z.infer<typeof receivablesPoolInputSupplementSchema>;

function methodReceivableId(sourceReceivableId: string): string {
  return `r-${createHash("sha256").update(sourceReceivableId).digest("hex").slice(0, 24)}`;
}

function sourceReference(anchor: SourceAnchor): {documentId: string; locator: string} {
  if (anchor.kind === "file") {
    const locators = [anchor.sheet ? `sheet:${anchor.sheet}` : null, anchor.row ? `row:${anchor.row}` : null, anchor.column ? `column:${anchor.column}` : null, anchor.cell ? `cell:${anchor.cell}` : null].filter(Boolean);
    return {documentId: anchor.fileId, locator: locators.join(";") || `file:${anchor.fileId}`};
  }
  if (anchor.kind === "document") {
    const locators = [anchor.page ? `page:${anchor.page}` : null, anchor.clause ? `clause:${anchor.clause}` : null, anchor.paragraph ? `paragraph:${anchor.paragraph}` : null].filter(Boolean);
    return {documentId: anchor.documentId, locator: locators.join(";") || `document:${anchor.documentId}`};
  }
  return {documentId: anchor.sourceSystem, locator: `event:${anchor.eventId};at:${anchor.occurredAt}`};
}

function sumSettlements(input: ReceivablesPhaseOneInput, sourceReceivableId: string): string {
  return input.universe.settlements
    .filter((event) => event.receivableId === sourceReceivableId)
    .reduce((total, event) => total.plus(event.amount), new Decimal(0))
    .toDecimalPlaces(2)
    .toFixed(2);
}

/**
 * Compiles the missing governed facts into the exact specialist method input. Economic title
 * fields and paid-to-date values come only from the immutable Phase 1 universe. The supplement
 * cannot override them; it supplies only the legal, operational, accounting, policy and structure
 * facts that the title tape cannot establish by itself.
 */
export function assembleReceivablesPoolMethodInput(input: {
  phaseOne: ReceivablesPhaseOneInput;
  supplement: unknown;
}): ReceivablesPoolInputAssembly {
  const supplement = receivablesPoolInputSupplementSchema.parse(input.supplement);
  const universe = input.phaseOne.universe;
  if (supplement.sourceDatasetHash !== input.phaseOne.datasetHash) {
    throw new Error("receivables_supplement_dataset_mismatch");
  }
  if (universe.currency !== "BRL" && universe.currency !== "USD") {
    throw new Error("receivables_method_currency_not_supported");
  }
  const supplementByTitle = new Map(supplement.titles.map((item) => [item.sourceReceivableId, item]));
  const sourceIds = new Set(universe.receivables.map((item) => item.id));
  const missing = universe.receivables.filter((item) => !supplementByTitle.has(item.id)).map((item) => item.id).sort();
  const extra = supplement.titles.filter((item) => !sourceIds.has(item.sourceReceivableId)).map((item) => item.sourceReceivableId).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`receivables_supplement_title_partition_invalid:missing=${missing.join("|")}:extra=${extra.join("|")}`);
  }
  const methodIdBySource = new Map(universe.receivables.map((item) => [item.id, methodReceivableId(item.id)]));
  const portfolio = universe.receivables.map((title) => {
    const supplied = supplementByTitle.get(title.id)!;
    const source = sourceReference(title.source);
    return {
      id: methodIdBySource.get(title.id)!,
      debtorId: title.obligorId,
      ...(title.economicGroupId ? {debtorGroupId: title.economicGroupId} : {}),
      debtorSector: supplied.debtorSector,
      originDate: title.issueDate,
      dueDate: title.currentDueDate,
      originalAmount: title.faceValue,
      outstandingBalance: title.openValue,
      paidAmount: sumSettlements(input.phaseOne, title.id),
      collectedInPeriod: supplied.collectedInPeriod,
      defaultedBalance: supplied.defaultedBalance,
      recoveredInPeriod: supplied.recoveredInPeriod,
      dilutionInPeriod: supplied.dilutionInPeriod,
      repurchasedInPeriod: supplied.repurchasedInPeriod,
      substitutedInPeriod: supplied.substitutedInPeriod,
      assignable: supplied.assignable,
      evidenceVerified: supplied.evidenceVerified,
      registration: supplied.registration,
      encumbrance: supplied.encumbrance,
      disputed: supplied.disputed,
      relatedParty: supplied.relatedParty,
      sourceDocumentId: source.documentId,
      sourceAnchor: source.locator,
      anchorVerified: true,
    };
  });
  const cashReceipts = supplement.cashReceipts.map(({sourceReceivableId, ...receipt}) => ({
    ...receipt,
    receivableId: sourceReceivableId === null ? null : methodIdBySource.get(sourceReceivableId) ?? null,
  }));
  const unknownCashLinks = supplement.cashReceipts.filter((receipt) => receipt.sourceReceivableId !== null && !methodIdBySource.has(receipt.sourceReceivableId));
  if (unknownCashLinks.length > 0) {
    throw new Error(`receivables_cash_link_not_in_source:${unknownCashLinks.map((item) => item.id).sort().join("|")}`);
  }
  return receivablesPoolInputAssemblySchema.parse({
    schemaVersion: receivablesPoolInputAssemblyVersion,
    source: {
      universeId: universe.id,
      datasetHash: input.phaseOne.datasetHash,
      titleMapping: universe.receivables.map((title) => ({sourceReceivableId: title.id, methodReceivableId: methodIdBySource.get(title.id)!})),
    },
    evidence: supplement.evidence,
    findingResolutions: supplement.findingResolutions,
    input: {
      currency: universe.currency,
      case: {
        schemaVersion: "2026.08.24-v1",
        id: universe.id,
        referenceDate: universe.dates.reportingDate,
        cedent: supplement.cedent,
        portfolio,
        cashReceipts,
        accounting: supplement.accounting,
        policy: supplement.policy,
        structure: supplement.structure,
      },
    },
  });
}
