import {existsSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {z} from "zod";
import {caseOutcomeStateSchema} from "@offroad/case-understanding";
import {documentKindSchema, informationClassSchema, materialitySchema, transactionRouteSchema} from "@offroad/credit-ontology";

/**
 * Gold set format (P1 plan §14.1). A gold case is a directory:
 *   manifest.json                — case metadata + document list (+ where the originals live)
 *   expected/profiles.json       — expected classification per document
 *   expected/fields.json         — expected field values with materiality and tolerance
 *   expected/exceptions.json     — expected reconciliation exceptions / red flags
 *   expected/calculations.json   — expected deterministic outputs (financial-core, F3+)
 *   expected/acceptance.json     — acceptance criteria and how they are evaluated
 * Synthetic by default. Real documents enter only when they are public filings (CVM, RI) with their
 * provenance recorded in the manifest; client data never does without documented permission.
 */

export const toleranceSchema = z.union([z.object({kind: z.literal("absolute"), value: z.string()}), z.object({kind: z.literal("relative"), value: z.string()}), z.object({kind: z.literal("exact")})]);
export type Tolerance = z.infer<typeof toleranceSchema>;

export const goldManifestSchema = z.object({
  caseId: z.string().min(1),
  title: z.string(),
  synthetic: z.boolean(),
  /** The operation the room is for; drives the reconciliation's gaps and the archetype questions. */
  archetypeId: z.string().optional(),
  language: z.enum(["pt", "en", "mixed"]),
  documentsDir: z.string(),
  documents: z.array(z.object({name: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()})),
  provenance: z.string(),
  version: z.string(),
});
export type GoldManifest = z.infer<typeof goldManifestSchema>;

export const goldProfileSchema = z.object({
  document: z.string(),
  kind: documentKindSchema,
  informationClass: informationClassSchema,
  evidenceRank: z.number().int().min(1).max(7),
  entityName: z.string().optional(),
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
  scale: z.number().positive().optional(),
});
export type GoldProfile = z.infer<typeof goldProfileSchema>;

export const goldFieldSchema = z.object({
  fieldPath: z.string(),
  /** Canonical normalized value: Decimal string for numbers, ISO date, text, "true"/"false", JSON array for lists. */
  value: z.string(),
  valueType: z.enum(["text", "number", "date", "boolean", "list"]),
  materiality: materialitySchema,
  sourceDocument: z.string().optional(),
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
  tolerance: toleranceSchema.default({kind: "exact"}),
  note: z.string().optional(),
});
export type GoldField = z.infer<typeof goldFieldSchema>;

export const goldExceptionSchema = z.object({
  id: z.string(),
  ruleId: z.string().optional(),
  type: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  description: z.string(),
  /** Any of these (normalized) substrings in a produced exception counts as a match. */
  keywords: z.array(z.string()).min(1),
  evidenceDocuments: z.array(z.string()).default([]),
  expectedTreatment: z.string().optional(),
});
export type GoldException = z.infer<typeof goldExceptionSchema>;

export const goldCalculationSchema = z.object({
  id: z.string(),
  definition: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  periodEnd: z.iso.date().optional(),
  tolerance: toleranceSchema.default({kind: "relative", value: "0.005"}),
  note: z.string().optional(),
});
export type GoldCalculation = z.infer<typeof goldCalculationSchema>;

export const goldAcceptanceSchema = z.object({
  id: z.string(),
  criterion: z.string(),
  weight: z.number(),
  minimum: z.string(),
  critical: z.boolean(),
  howToValidate: z.string(),
  /** Field paths that must all be matched for the criterion to pass (empty → not evaluated by fields). */
  fieldPaths: z.array(z.string()).default([]),
  /** Calculation ids that must all be matched. */
  calculationIds: z.array(z.string()).default([]),
  /** Exception ids that must all be detected. */
  exceptionIds: z.array(z.string()).default([]),
  /** Minimum number of distinct information classes among produced candidates (AC-09). */
  minInformationClasses: z.number().int().optional(),
});
export type GoldAcceptance = z.infer<typeof goldAcceptanceSchema>;

export const goldStructureSchema = z.object({
  id: z.string().min(1),
  classification: z.enum(["preferred", "viable", "ineligible"]),
  route: transactionRouteSchema,
  amount: z.string().optional(),
  termMonths: z.number().int().positive().optional(),
  graceMonths: z.number().int().min(0).optional(),
  amortization: z.string().optional(),
  pricing: z.string().optional(),
  rationale: z.array(z.string()).default([]),
  hardExclusions: z.array(z.string()).default([]),
});
export type GoldStructure = z.infer<typeof goldStructureSchema>;

export const goldClaimSchema = z.object({
  id: z.string().min(1),
  material: z.boolean(),
  kind: z.enum(["fact", "calculation", "judgment", "public_source"]),
  requiredSupportIds: z.array(z.string()),
  expectedMeaning: z.string().min(1),
  forbiddenMeanings: z.array(z.string()).default([]),
});
export type GoldClaim = z.infer<typeof goldClaimSchema>;

export const goldMaterialSchema = z.object({
  kind: z.enum(["teaser", "credit_memo", "term_sheet", "diligence_qa", "data_room_index"]),
  locale: z.enum(["pt-BR", "en-US"]),
  requiredSectionIds: z.array(z.string()).default([]),
  requiredClaimIds: z.array(z.string()).default([]),
  forbiddenClaimIds: z.array(z.string()).default([]),
});
export type GoldMaterial = z.infer<typeof goldMaterialSchema>;

export const goldMatchSchema = z.object({
  capitalProviderId: z.string().min(1),
  expected: z.enum(["eligible", "ineligible", "unknown"]),
  reasons: z.array(z.string()).default([]),
  hardConstraints: z.array(z.string()).default([]),
});
export type GoldMatch = z.infer<typeof goldMatchSchema>;

export const goldOutcomeSchema = z.object({
  state: caseOutcomeStateSchema,
  externalDirectionAllowed: z.boolean(),
  reasonsInclude: z.array(z.string()).default([]),
}).superRefine((outcome, context) => {
  const shouldAllow = outcome.state === "ready_for_qualified_direction";
  if (outcome.externalDirectionAllowed === shouldAllow) return;
  context.addIssue({
    code: "custom",
    path: ["externalDirectionAllowed"],
    message: "external direction must be allowed only for ready_for_qualified_direction",
  });
});
export type GoldOutcome = z.infer<typeof goldOutcomeSchema>;

export type GoldCase = {
  directory: string;
  manifest: GoldManifest;
  profiles: GoldProfile[];
  fields: GoldField[];
  exceptions: GoldException[];
  calculations: GoldCalculation[];
  structures: GoldStructure[];
  claims: GoldClaim[];
  materials: GoldMaterial[];
  matches: GoldMatch[];
  outcome: GoldOutcome | null;
  acceptance: GoldAcceptance[];
};

function readJson<T>(path: string, schema: z.ZodType<T>, fallback?: T): T {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`gold file missing: ${path}`);
  }
  return schema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function loadGoldCase(directory: string): GoldCase {
  const dir = resolve(directory);
  const manifest = readJson(join(dir, "manifest.json"), goldManifestSchema);
  return {
    directory: dir,
    manifest,
    profiles: readJson(join(dir, "expected", "profiles.json"), z.array(goldProfileSchema), []),
    fields: readJson(join(dir, "expected", "fields.json"), z.array(goldFieldSchema)),
    exceptions: readJson(join(dir, "expected", "exceptions.json"), z.array(goldExceptionSchema), []),
    calculations: readJson(join(dir, "expected", "calculations.json"), z.array(goldCalculationSchema), []),
    structures: readJson(join(dir, "expected", "structures.json"), z.array(goldStructureSchema), []),
    claims: readJson(join(dir, "expected", "claims.json"), z.array(goldClaimSchema), []),
    materials: readJson(join(dir, "expected", "materials.json"), z.array(goldMaterialSchema), []),
    matches: readJson(join(dir, "expected", "matches.json"), z.array(goldMatchSchema), []),
    outcome: readJson(join(dir, "expected", "outcome.json"), goldOutcomeSchema.nullable(), null),
    acceptance: readJson(join(dir, "expected", "acceptance.json"), z.array(goldAcceptanceSchema), []),
  };
}

/** Absolute path of an original document of the gold case. */
export function goldDocumentPath(gold: GoldCase, name: string): string {
  return resolve(gold.directory, gold.manifest.documentsDir, name);
}
