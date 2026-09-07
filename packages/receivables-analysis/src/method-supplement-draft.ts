import {createHash} from "node:crypto";

import {z} from "zod";

import {eligibilityPolicySchema, receivablesStructureSchema} from "./schema";
import {
  receivablesCashSupplementSchema,
  receivablesMethodEvidenceReferenceSchema,
  receivablesMethodEvidenceSectionSchema,
  receivablesPoolInputSupplementSchema,
  receivablesPoolInputSupplementVersion,
  receivablesTitleSupplementSchema,
  type ReceivablesPoolInputSupplement,
} from "./method-assembly";

export const receivablesSupplementDraftVersion = "2026.09.07-v1" as const;
export const receivablesSupplementPatchVersion = "2026.09.07-v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const cedentSchema = receivablesPoolInputSupplementSchema.shape.cedent;
const accountingSchema = receivablesPoolInputSupplementSchema.shape.accounting;
const findingResolutionSchema = receivablesPoolInputSupplementSchema.shape.findingResolutions.element;

const supplementFieldPaths = [
  "/policy/maxDaysPastDue", "/policy/maxRemainingTermDays", "/policy/minSeasoningDays",
  "/policy/requireAssignable", "/policy/requireEvidenceVerified", "/policy/registrationRule",
  "/policy/excludeDisputed", "/policy/excludeRelatedParties", "/policy/excludeEncumbered",
  "/policy/allowedDebtorSectors", "/policy/maxSingleDebtorShare", "/policy/maxDebtorGroupShare",
  "/policy/minimumEligibleShare", "/policy/minimumEvidenceCoverage", "/policy/minimumRegistrationCoverage",
  "/policy/maximumDelinquency30Share", "/policy/maximumDilutionShare", "/policy/maximumRepurchaseShare",
  "/policy/minimumRecoveryRate", "/policy/maximumAccountingMismatchShare", "/policy/maximumCashMismatchShare",
  "/policy/minimumMappedCashShare", "/policy/minimumLinkedAccountCashShare",
  "/structure/requestedFacility", "/structure/advanceRate", "/structure/requiredOvercollateralization",
  "/structure/requiredSubordinationRate", "/structure/actualSeniorAmount", "/structure/actualMezzanineAmount",
  "/structure/actualSubordinatedAmount", "/structure/reserveRate",
  "/structure/waterfall/availableCash", "/structure/waterfall/servicingFeeDue",
  "/structure/waterfall/seniorInterestDue", "/structure/waterfall/seniorPrincipalDue",
  "/structure/waterfall/reserveOpening", "/structure/waterfall/mezzanineDue",
] as const;
export const receivablesSupplementFieldPathSchema = z.enum(supplementFieldPaths);
export type ReceivablesSupplementFieldPath = z.infer<typeof receivablesSupplementFieldPathSchema>;

const policyFieldSchemas = eligibilityPolicySchema.shape as Record<string, z.ZodType>;
const structureFieldSchemas = receivablesStructureSchema.shape as Record<string, z.ZodType>;
const waterfallFieldSchemas = receivablesStructureSchema.shape.waterfall.shape as Record<string, z.ZodType>;

function fieldValueSchema(path: ReceivablesSupplementFieldPath): z.ZodType {
  const parts = path.split("/").filter(Boolean);
  const schema = parts[0] === "policy"
    ? policyFieldSchemas[parts[1]!]
    : parts[1] === "waterfall"
    ? waterfallFieldSchemas[parts[2]!]
    : structureFieldSchemas[parts[1]!];
  if (!schema) throw new Error(`receivables_supplement_field_schema_missing:${path}`);
  return schema;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function sectionPatch<T extends z.ZodType>(schema: T) {
  return z.object({
    value: schema,
    supersedesFingerprint: sha256Schema.optional(),
  }).strict();
}

const fieldPatchSchema = z.object({
  path: receivablesSupplementFieldPathSchema,
  value: z.unknown(),
  supersedesFingerprint: sha256Schema.optional(),
}).strict().superRefine((field, context) => {
  const parsed = fieldValueSchema(field.path).safeParse(field.value);
  if (!parsed.success) context.addIssue({code: "custom", path: ["value"], message: `invalid value for ${field.path}`});
});

const evidencePatchSchema = z.object({
  cedentAndServicing: receivablesMethodEvidenceSectionSchema.optional(),
  titleLegalControls: receivablesMethodEvidenceSectionSchema.optional(),
  performanceHistory: receivablesMethodEvidenceSectionSchema.optional(),
  cashReconciliation: receivablesMethodEvidenceSectionSchema.optional(),
  accountingReconciliation: receivablesMethodEvidenceSectionSchema.optional(),
  eligibilityPolicy: receivablesMethodEvidenceSectionSchema.optional(),
  facilityAndWaterfall: receivablesMethodEvidenceSectionSchema.optional(),
}).strict();

export const receivablesSupplementPatchSchema = z.object({
  schemaVersion: z.literal(receivablesSupplementPatchVersion),
  patchId: z.string().min(1).max(160),
  sourceDatasetHash: sha256Schema,
  suppliedBy: z.object({
    actorType: z.enum(["document_worker", "user", "system"]),
    actorId: z.string().min(1),
    suppliedAt: z.string().datetime({offset: true}),
    evidence: z.array(receivablesMethodEvidenceReferenceSchema).min(1),
  }).strict(),
  sections: z.object({
    cedent: sectionPatch(cedentSchema).optional(),
    titles: sectionPatch(z.array(receivablesTitleSupplementSchema).min(1)).optional(),
    cashReceipts: sectionPatch(z.array(receivablesCashSupplementSchema)).optional(),
    accounting: sectionPatch(accountingSchema).optional(),
    policy: sectionPatch(eligibilityPolicySchema).optional(),
    structure: sectionPatch(receivablesStructureSchema).optional(),
    findingResolutions: sectionPatch(z.array(findingResolutionSchema)).optional(),
  }).strict(),
  fields: z.array(fieldPatchSchema).max(supplementFieldPaths.length).default([]),
  evidence: evidencePatchSchema,
}).strict().superRefine((patch, context) => {
  const has = (key: keyof typeof patch.evidence) => patch.evidence[key] !== undefined;
  const requireEvidence = (condition: boolean, keys: (keyof typeof patch.evidence)[], path: string) => {
    if (condition && keys.some((key) => !has(key))) {
      context.addIssue({code: "custom", path: ["evidence", path], message: `section ${path} requires its governed evidence`});
    }
  };
  requireEvidence(Boolean(patch.sections.cedent), ["cedentAndServicing"], "cedentAndServicing");
  requireEvidence(Boolean(patch.sections.titles), ["titleLegalControls", "performanceHistory"], "titleLegalControls");
  requireEvidence(Boolean(patch.sections.cashReceipts), ["cashReconciliation"], "cashReconciliation");
  requireEvidence(Boolean(patch.sections.accounting), ["accountingReconciliation"], "accountingReconciliation");
  requireEvidence(Boolean(patch.sections.policy), ["eligibilityPolicy"], "eligibilityPolicy");
  requireEvidence(Boolean(patch.sections.structure), ["facilityAndWaterfall"], "facilityAndWaterfall");
  requireEvidence(patch.fields.some((field) => field.path.startsWith("/policy/")), ["eligibilityPolicy"], "eligibilityPolicy");
  requireEvidence(patch.fields.some((field) => field.path.startsWith("/structure/")), ["facilityAndWaterfall"], "facilityAndWaterfall");
  if (new Set(patch.fields.map((field) => field.path)).size !== patch.fields.length) {
    context.addIssue({code: "custom", path: ["fields"], message: "one value per field path is allowed in a patch"});
  }
  if (Object.keys(patch.sections).length === 0 && patch.fields.length === 0) {
    context.addIssue({code: "custom", path: ["sections"], message: "a patch must contribute at least one section"});
  }
});
export type ReceivablesSupplementPatch = z.infer<typeof receivablesSupplementPatchSchema>;

const sectionNames = ["cedent", "titles", "cashReceipts", "accounting", "policy", "structure", "findingResolutions"] as const;
type SectionName = typeof sectionNames[number];

const storedSectionSchema = z.object({
  value: z.unknown(),
  fingerprint: sha256Schema,
  patchIds: z.array(z.string().min(1)).min(1),
  sources: z.array(receivablesMethodEvidenceReferenceSchema).min(1),
}).strict();

export const receivablesSupplementDraftSchema = z.object({
  schemaVersion: z.literal(receivablesSupplementDraftVersion),
  sourceDatasetHash: sha256Schema,
  revision: z.number().int().nonnegative(),
  appliedPatchIds: z.array(z.string().min(1)),
  sections: z.object({
    cedent: storedSectionSchema.optional(),
    titles: storedSectionSchema.optional(),
    cashReceipts: storedSectionSchema.optional(),
    accounting: storedSectionSchema.optional(),
    policy: storedSectionSchema.optional(),
    structure: storedSectionSchema.optional(),
    findingResolutions: storedSectionSchema.optional(),
  }).strict(),
  fields: z.partialRecord(receivablesSupplementFieldPathSchema, storedSectionSchema).default({}),
  evidence: evidencePatchSchema,
  conflicts: z.array(z.object({
    id: sha256Schema,
    section: z.union([z.enum(sectionNames), receivablesSupplementFieldPathSchema]),
    status: z.enum(["open", "resolved"]),
    existingFingerprint: sha256Schema,
    incomingFingerprint: sha256Schema,
    incomingPatchId: z.string().min(1),
    resolvedByPatchId: z.string().min(1).nullable(),
  }).strict()),
}).strict();
export type ReceivablesSupplementDraft = z.infer<typeof receivablesSupplementDraftSchema>;

export function newReceivablesSupplementDraft(sourceDatasetHash: string): ReceivablesSupplementDraft {
  return receivablesSupplementDraftSchema.parse({
    schemaVersion: receivablesSupplementDraftVersion,
    sourceDatasetHash,
    revision: 0,
    appliedPatchIds: [],
    sections: {},
    fields: {},
    evidence: {},
    conflicts: [],
  });
}

function mergeEvidence(
  current: ReceivablesSupplementDraft["evidence"],
  incoming: ReceivablesSupplementPatch["evidence"],
): ReceivablesSupplementDraft["evidence"] {
  const merged: Record<string, unknown> = {...current};
  for (const [key, references] of Object.entries(incoming)) {
    const existing = (current as Record<string, unknown>)[key];
    const combined = [...(Array.isArray(existing) ? existing : []), ...(references ?? [])];
    merged[key] = [...new Map(combined.map((reference) => [stableJson(reference), reference])).values()]
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  }
  return evidencePatchSchema.parse(merged);
}

/**
 * Applies sparse document or conversation facts without last-write-wins. A changed value becomes
 * an open conflict unless the patch names the exact fingerprint it supersedes. This lets a later
 * chat turn correct a premise while preserving who changed what and why.
 */
export function applyReceivablesSupplementPatch(input: {
  draft: unknown;
  patch: unknown;
}): ReceivablesSupplementDraft {
  const draft = receivablesSupplementDraftSchema.parse(input.draft);
  const patch = receivablesSupplementPatchSchema.parse(input.patch);
  if (patch.sourceDatasetHash !== draft.sourceDatasetHash) throw new Error("receivables_supplement_patch_dataset_mismatch");
  if (draft.appliedPatchIds.includes(patch.patchId)) return draft;

  const next = structuredClone(draft);
  next.revision += 1;
  next.appliedPatchIds.push(patch.patchId);
  next.appliedPatchIds.sort();
  next.evidence = mergeEvidence(next.evidence, patch.evidence);

  for (const section of sectionNames) {
    const incoming = patch.sections[section];
    if (!incoming) continue;
    if ((section === "policy" || section === "structure")
      && Object.keys(next.fields).some((path) => path.startsWith(`/${section}/`))) {
      throw new Error(`receivables_supplement_${section}_has_incremental_fields`);
    }
    const incomingFingerprint = fingerprint(incoming.value);
    const existing = next.sections[section];
    if (!existing) {
      next.sections[section] = {
        value: incoming.value,
        fingerprint: incomingFingerprint,
        patchIds: [patch.patchId],
        sources: patch.suppliedBy.evidence,
      };
      continue;
    }
    if (existing.fingerprint === incomingFingerprint) {
      existing.patchIds = [...new Set([...existing.patchIds, patch.patchId])].sort();
      existing.sources = [...new Map([...existing.sources, ...patch.suppliedBy.evidence]
        .map((reference) => [stableJson(reference), reference])).values()]
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
      continue;
    }
    if (incoming.supersedesFingerprint === existing.fingerprint) {
      next.sections[section] = {
        value: incoming.value,
        fingerprint: incomingFingerprint,
        patchIds: [patch.patchId],
        sources: patch.suppliedBy.evidence,
      };
      next.conflicts = next.conflicts.map((conflict) => conflict.section === section && conflict.status === "open"
        ? {...conflict, status: "resolved" as const, resolvedByPatchId: patch.patchId}
        : conflict);
      continue;
    }
    const conflictId = fingerprint({section, existing: existing.fingerprint, incoming: incomingFingerprint, patchId: patch.patchId});
    if (!next.conflicts.some((conflict) => conflict.id === conflictId)) {
      next.conflicts.push({
        id: conflictId,
        section,
        status: "open",
        existingFingerprint: existing.fingerprint,
        incomingFingerprint,
        incomingPatchId: patch.patchId,
        resolvedByPatchId: null,
      });
    }
  }
  for (const incoming of patch.fields) {
    const section = incoming.path.startsWith("/policy/") ? "policy" : "structure";
    if (next.sections[section]) throw new Error(`receivables_supplement_${section}_already_complete`);
    const incomingFingerprint = fingerprint(incoming.value);
    const existing = next.fields[incoming.path];
    if (!existing) {
      next.fields[incoming.path] = {
        value: incoming.value,
        fingerprint: incomingFingerprint,
        patchIds: [patch.patchId],
        sources: patch.suppliedBy.evidence,
      };
      continue;
    }
    if (existing.fingerprint === incomingFingerprint) {
      existing.patchIds = [...new Set([...existing.patchIds, patch.patchId])].sort();
      existing.sources = [...new Map([...existing.sources, ...patch.suppliedBy.evidence]
        .map((reference) => [stableJson(reference), reference])).values()]
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
      continue;
    }
    if (incoming.supersedesFingerprint === existing.fingerprint) {
      next.fields[incoming.path] = {
        value: incoming.value,
        fingerprint: incomingFingerprint,
        patchIds: [patch.patchId],
        sources: patch.suppliedBy.evidence,
      };
      next.conflicts = next.conflicts.map((conflict) => conflict.section === incoming.path && conflict.status === "open"
        ? {...conflict, status: "resolved" as const, resolvedByPatchId: patch.patchId}
        : conflict);
      continue;
    }
    const conflictId = fingerprint({section: incoming.path, existing: existing.fingerprint, incoming: incomingFingerprint, patchId: patch.patchId});
    if (!next.conflicts.some((conflict) => conflict.id === conflictId)) {
      next.conflicts.push({
        id: conflictId,
        section: incoming.path,
        status: "open",
        existingFingerprint: existing.fingerprint,
        incomingFingerprint,
        incomingPatchId: patch.patchId,
        resolvedByPatchId: null,
      });
    }
  }
  next.conflicts.sort((left, right) => left.id.localeCompare(right.id));
  return receivablesSupplementDraftSchema.parse(next);
}

export type ReceivablesSupplementDraftStatus = {
  state: "complete" | "incomplete" | "conflicted";
  missingSections: readonly string[];
  openConflictIds: readonly string[];
  supplement: ReceivablesPoolInputSupplement | null;
};

function incrementalGroup(draft: ReceivablesSupplementDraft, group: "policy" | "structure"): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [path, field] of Object.entries(draft.fields)) {
    if (!path.startsWith(`/${group}/`) || !field) continue;
    const parts = path.split("/").filter(Boolean).slice(1);
    if (group === "structure" && parts[0] === "waterfall") {
      const waterfall = value.waterfall && typeof value.waterfall === "object" && !Array.isArray(value.waterfall)
        ? value.waterfall as Record<string, unknown>
        : {};
      waterfall[parts[1]!] = field.value;
      value.waterfall = waterfall;
    } else {
      value[parts[0]!] = field.value;
    }
  }
  return value;
}

function missingPaths(prefix: string, result: z.ZodSafeParseError<unknown>): string[] {
  return [...new Set(result.error.issues.map((issue) => `${prefix}.${issue.path.join(".") || "required"}`))].sort();
}

export function compileReceivablesSupplementDraft(input: unknown): ReceivablesSupplementDraftStatus {
  const draft = receivablesSupplementDraftSchema.parse(input);
  const openConflictIds = draft.conflicts.filter((conflict) => conflict.status === "open").map((conflict) => conflict.id).sort();
  const requiredSections: SectionName[] = ["cedent", "titles", "cashReceipts", "accounting"];
  const missingSections: string[] = requiredSections.filter((section) => !draft.sections[section]);
  const policy = eligibilityPolicySchema.safeParse(draft.sections.policy?.value ?? incrementalGroup(draft, "policy"));
  const structure = receivablesStructureSchema.safeParse(draft.sections.structure?.value ?? incrementalGroup(draft, "structure"));
  if (!policy.success) missingSections.push(...missingPaths("policy", policy));
  if (!structure.success) missingSections.push(...missingPaths("structure", structure));
  const requiredEvidence = [
    "cedentAndServicing", "titleLegalControls", "performanceHistory", "cashReconciliation",
    "accountingReconciliation", "eligibilityPolicy", "facilityAndWaterfall",
  ] as const;
  missingSections.push(...requiredEvidence.filter((section) => !draft.evidence[section]).map((section) => `evidence.${section}`));
  const uniqueMissingSections = [...new Set(missingSections)].sort();
  if (openConflictIds.length > 0) return {state: "conflicted", missingSections: uniqueMissingSections, openConflictIds, supplement: null};
  if (uniqueMissingSections.length > 0) return {state: "incomplete", missingSections: uniqueMissingSections, openConflictIds, supplement: null};

  const supplement = receivablesPoolInputSupplementSchema.parse({
    schemaVersion: receivablesPoolInputSupplementVersion,
    sourceDatasetHash: draft.sourceDatasetHash,
    cedent: draft.sections.cedent!.value,
    titles: draft.sections.titles!.value,
    cashReceipts: draft.sections.cashReceipts!.value,
    accounting: draft.sections.accounting!.value,
    policy: policy.success ? policy.data : null,
    structure: structure.success ? structure.data : null,
    evidence: draft.evidence,
    findingResolutions: draft.sections.findingResolutions?.value ?? [],
  });
  return {state: "complete", missingSections: [], openConflictIds: [], supplement};
}
