import {z} from "zod";
import {
  accountingBasisSchema,
  anchorPrecisionSchema,
  documentKindSchema,
  entityRoleSchema,
  entityScopeSchema,
  exceptionOwnerRoleSchema,
  exceptionSeveritySchema,
  exceptionTypeSchema,
  fieldGroupSchema,
  fieldValueTypeSchema,
  informationClassSchema,
  materialitySchema,
  periodKindSchema,
} from "@offroad/credit-ontology";

// ---------------------------------------------------------------------------
// Document layer — the verifiable representation of a document (P1 plan §5.3)
// ---------------------------------------------------------------------------

export const layerKindSchema = z.enum(["pdf", "spreadsheet", "docx", "pptx", "csv", "image"]);
export type LayerKind = z.infer<typeof layerKindSchema>;

const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const layerBlockSchema = z.object({
  /** Stable id, e.g. `p12.b3`, `sl4.b1`, `sec2.p7`. */
  id: z.string().min(1),
  kind: z.enum(["text", "heading", "table_row", "caption", "footer", "header", "note", "other"]),
  text: z.string(),
  bbox: bboxSchema.optional(),
});
export type LayerBlock = z.infer<typeof layerBlockSchema>;

export const layerTableCellSchema = z.object({
  /** e.g. `p12.t1.r4.c3` or `sERP.t1.r4.c2` */
  id: z.string().min(1),
  text: z.string(),
  /** Spreadsheet cell reference when the table comes from a sheet (`B14`). */
  ref: z.string().optional(),
});

export const layerTableRowSchema = z.object({
  id: z.string().min(1),
  cells: z.array(layerTableCellSchema),
});

export const layerTableSchema = z.object({
  id: z.string().min(1),
  header: z.array(z.string()).optional(),
  rows: z.array(layerTableRowSchema),
  bbox: bboxSchema.optional(),
});
export type LayerTable = z.infer<typeof layerTableSchema>;

export const layerPageSchema = z.object({
  n: z.number().int().positive(),
  blocks: z.array(layerBlockSchema),
  tables: z.array(layerTableSchema).default([]),
  /** True when the page had no extractable text and was rendered as an image. */
  scanned: z.boolean().default(false),
});
export type LayerPage = z.infer<typeof layerPageSchema>;

export const layerCellSchema = z.object({
  /** A1-style reference (`B14`). */
  ref: z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,6}$/),
  v: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  /** n = number, s = string, b = boolean, d = date, e = error */
  t: z.enum(["n", "s", "b", "d", "e"]),
  f: z.string().optional(),
  fmt: z.string().optional(),
  merged: z.string().optional(),
});
export type LayerCell = z.infer<typeof layerCellSchema>;

export const layerSheetSchema = z.object({
  name: z.string().min(1),
  hidden: z.boolean().default(false),
  cells: z.array(layerCellSchema),
  tables: z.array(layerTableSchema).default([]),
});
export type LayerSheet = z.infer<typeof layerSheetSchema>;

export const layerSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().optional(),
  paragraphs: z.array(layerBlockSchema),
  tables: z.array(layerTableSchema).default([]),
});

export type LayerSection = z.infer<typeof layerSectionSchema>;

export const layerSlideSchema = z.object({
  n: z.number().int().positive(),
  blocks: z.array(layerBlockSchema),
  tables: z.array(layerTableSchema).default([]),
  notes: z.string().optional(),
});

export type LayerSlide = z.infer<typeof layerSlideSchema>;

export const documentLayerSchema = z.object({
  documentId: z.string().min(1),
  documentVersion: z.number().int().positive(),
  kind: layerKindSchema,
  pages: z.array(layerPageSchema).optional(),
  sheets: z.array(layerSheetSchema).optional(),
  sections: z.array(layerSectionSchema).optional(),
  slides: z.array(layerSlideSchema).optional(),
  /** Scale declarations found deterministically ("em milhares de reais" → 1000) with where they were seen. */
  scaleDeclarations: z
    .array(z.object({scale: z.number().positive(), where: z.string(), text: z.string()}))
    .default([]),
  stats: z
    .object({
      estimatedTokens: z.number().int().nonnegative().optional(),
      pageCount: z.number().int().nonnegative().optional(),
      sheetCount: z.number().int().nonnegative().optional(),
      slideCount: z.number().int().nonnegative().optional(),
    })
    .default({}),
});
export type DocumentLayer = z.infer<typeof documentLayerSchema>;

// ---------------------------------------------------------------------------
// Document profile — output of stage E1
// ---------------------------------------------------------------------------

export const documentProfileSchema = z.object({
  documentId: z.string().min(1),
  kind: documentKindSchema,
  title: z.string().optional(),
  entityName: z.string().optional(),
  entityRole: entityRoleSchema.optional(),
  entityScope: entityScopeSchema.optional(),
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
  fiscalYear: z.number().int().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  /** Declared scale of the numbers in the document (1, 1000, 1000000). */
  scale: z.number().positive().optional(),
  accountingBasis: accountingBasisSchema.optional(),
  informationClass: informationClassSchema,
  evidenceRank: z.number().int().min(1).max(7),
  language: z.enum(["pt", "en", "other"]).optional(),
  quality: z
    .object({
      isScanned: z.boolean().optional(),
      hasTables: z.boolean().optional(),
      pageCount: z.number().int().optional(),
      sheetCount: z.number().int().optional(),
      alerts: z.array(z.string()).default([]),
    })
    .default({alerts: []}),
  summary: z.object({pt: z.string(), en: z.string()}).optional(),
  confidence: z.number().min(0).max(1),
});
export type DocumentProfile = z.infer<typeof documentProfileSchema>;

// ---------------------------------------------------------------------------
// Extraction — what the model returns (E3) and what the verifier produces
// ---------------------------------------------------------------------------

export const anchorKindSchema = z.enum(["block", "table_row", "table_cell", "sheet_cell", "paragraph", "slide_block", "page", "document"]);
export type AnchorKind = z.infer<typeof anchorKindSchema>;

export const extractionAnchorSchema = z.object({
  kind: anchorKindSchema,
  /** Layer id (`p12.t1.r4.c3`, `sERP!B14`, `sec2.p7`, `sl3.b2`, `p12` for page-only). */
  id: z.string().min(1),
  page: z.number().int().positive().optional(),
  sheet: z.string().optional(),
});
export type ExtractionAnchor = z.infer<typeof extractionAnchorSchema>;

export const extractionPeriodSchema = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
  kind: periodKindSchema,
});

export const extractionEntitySchema = z.object({
  name: z.string().min(1),
  scope: entityScopeSchema,
});

/** One candidate exactly as the model emits it (structured output; no normalized value). */
export const rawExtractionCandidateSchema = z.object({
  field_path: z.string().regex(/^[a-z0-9_.]+$/),
  value_raw: z.string().min(1),
  value_type: fieldValueTypeSchema,
  unit: z.string().optional(),
  scale: z.number().positive().default(1),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  period: extractionPeriodSchema.optional(),
  entity: extractionEntitySchema.optional(),
  information_class: informationClassSchema,
  anchor: extractionAnchorSchema,
  quote: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(400).optional(),
});
export type RawExtractionCandidate = z.infer<typeof rawExtractionCandidateSchema>;

export const extractorOutputSchema = z.object({
  candidates: z.array(rawExtractionCandidateSchema),
  absent_fields: z.array(z.string()).default([]),
  document_alerts: z.array(z.string()).default([]),
});
export type ExtractorOutput = z.infer<typeof extractorOutputSchema>;

export const verifierFlagSchema = z.enum([
  "anchor_missing",
  "quote_not_in_anchor",
  "value_not_in_quote",
  "digits_not_in_anchor",
  "scale_unverified",
  "scale_conflict",
  "period_outside_document",
  "entity_mismatch",
  "field_unknown",
  "value_unparseable",
  "value_type_mismatch",
  "duplicate",
]);
export type VerifierFlag = z.infer<typeof verifierFlagSchema>;

export const verifiedCandidateSchema = rawExtractionCandidateSchema.extend({
  extractor_key: z.string().regex(/^[a-f0-9]{64}$/),
  source_document_id: z.string().min(1),
  document_version: z.number().int().positive(),
  field_group: fieldGroupSchema,
  materiality: materialitySchema,
  anchor_verified: z.boolean(),
  anchor_precision: anchorPrecisionSchema,
  verifier_flags: z.array(verifierFlagSchema),
  /** Decimal string for numbers (already multiplied by scale); ISO date; text; "true"/"false"; JSON array for lists. */
  normalized_value: z.string(),
  /** Additional anchors merged from duplicates. */
  additional_anchors: z.array(extractionAnchorSchema).default([]),
});
export type VerifiedCandidate = z.infer<typeof verifiedCandidateSchema>;

// ---------------------------------------------------------------------------
// Reconciliation exception (E6) — P1 plan §8.4
// ---------------------------------------------------------------------------

export const exceptionEvidenceSideSchema = z.object({
  label: z.string(),
  candidateKeys: z.array(z.string()),
  value: z.string().optional(),
  anchors: z.array(extractionAnchorSchema).default([]),
});

export const reconciliationExceptionSchema = z.object({
  ruleId: z.string(),
  type: exceptionTypeSchema,
  severity: exceptionSeveritySchema,
  title: z.object({pt: z.string(), en: z.string()}),
  description: z.object({pt: z.string(), en: z.string()}),
  fieldPath: z.string().optional(),
  evidence: z.object({left: exceptionEvidenceSideSchema, right: exceptionEvidenceSideSchema.optional()}),
  proposedResolution: z
    .object({winner: z.enum(["left", "right", "none"]), rationale: z.object({pt: z.string(), en: z.string()})})
    .optional(),
  ownerRole: exceptionOwnerRoleSchema,
  impactedOutputs: z.array(z.string()).default([]),
  blocksExternalOutputs: z.boolean().default(false),
});
export type ReconciliationException = z.infer<typeof reconciliationExceptionSchema>;

// ---------------------------------------------------------------------------
// Case brief skeleton (E7) — claims-first; refined in F4
// ---------------------------------------------------------------------------

export const claimSchema = z.object({
  id: z.string().min(1),
  claimType: z.enum(["fact", "calculation", "assumption", "judgment", "external_observation"]),
  text: z.object({pt: z.string(), en: z.string()}),
  supportIds: z.array(z.string()),
  materiality: materialitySchema,
  validationStatus: z.enum(["supported", "unsupported", "contradicted", "stale"]).default("unsupported"),
});
export type Claim = z.infer<typeof claimSchema>;

export const caseBriefSchema = z.object({
  version: z.number().int().positive(),
  sections: z.array(
    z.object({
      key: z.string().min(1),
      title: z.object({pt: z.string(), en: z.string()}),
      claimIds: z.array(z.string()),
    }),
  ),
  claims: z.array(claimSchema),
  openQuestions: z.array(z.object({id: z.string(), text: z.object({pt: z.string(), en: z.string()}), materiality: materialitySchema})).default([]),
});
export type CaseBrief = z.infer<typeof caseBriefSchema>;
