import type {SupabaseClient} from "@supabase/supabase-js";
import {matchScreenSchema, type MatchScreen} from "@offroad/domain-contracts";
import {z} from "zod";

import type {Database, Json} from "@/types/database";

export type DealStateRow = Database["public"]["Tables"]["deal_state_objects"]["Row"];

const localizedTextSchema = z.object({pt: z.string(), en: z.string()}).passthrough();
const understandingSchema = z.object({
  readiness: z.object({
    state: z.enum(["blocked", "in_progress", "ready"]),
    score: z.number().min(0).max(1),
    components: z.array(z.object({
      id: z.string(),
      score: z.number().min(0).max(1),
      labels: localizedTextSchema,
      explanation: localizedTextSchema,
    }).passthrough()),
    blockers: z.array(z.object({id: z.string(), labels: localizedTextSchema}).passthrough()),
  }),
  reconciliation: z.object({
    exceptions: z.array(z.unknown()),
    gaps: z.array(z.unknown()),
    questions: z.array(z.unknown()),
  }).passthrough(),
}).passthrough();

const structureLineSchema = z.object({description: z.string(), basisIds: z.array(z.string()).default([])}).passthrough();
const structureAlternativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  instrument: z.string(),
  route: z.string(),
  amount: z.string(),
  currency: z.string(),
  termMonths: z.number().int().nonnegative(),
  graceMonths: z.number().int().nonnegative(),
  amortization: z.string(),
  indexer: z.string(),
  targetBuyer: z.string().nullable(),
  rationale: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  assumptions: z.array(z.string()),
  security: z.array(structureLineSchema),
  covenants: z.array(structureLineSchema),
  conditionsPrecedent: z.array(structureLineSchema.extend({owner: z.string().nullable()})),
  implementationDays: z.object({min: z.number(), max: z.number()}).passthrough().nullable(),
  sourcesAndUses: z.object({
    totalSources: z.string(),
    totalUses: z.string(),
    difference: z.string(),
    status: z.enum(["pass", "fail"]),
  }),
  totalCost: z.object({
    status: z.enum(["available", "pending_market_reference"]),
    totalRate: z.object({min: z.string(), max: z.string()}).nullable(),
  }).passthrough(),
  status: z.enum(["comparable", "incomplete", "blocked"]),
  confirmationEligible: z.boolean(),
  blockers: z.array(z.string()),
  missingInputs: z.array(z.string()),
}).passthrough();

const compiledStructureSchema = z.object({
  version: z.string(),
  status: z.enum(["pending_design", "blocked", "pending_confirmation"]),
  alternatives: z.array(structureAlternativeSchema),
  recommendation: z.object({
    alternativeId: z.string(),
    rationale: z.string(),
    status: z.enum(["ready_for_confirmation", "invalid"]),
    blockers: z.array(z.string()),
  }).passthrough().nullable(),
  proposalFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  blockers: z.array(z.string()),
  missingInputs: z.array(z.string()),
}).passthrough();

const productionPlanSchema = z.object({
  schemaVersion: z.string(),
  artifacts: z.array(z.enum(["teaser", "financial_model", "indicative_term_sheet", "data_room_index"])),
  sourceCaseFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).passthrough();

export type UnderstandingSnapshot = z.infer<typeof understandingSchema>;
export type CompiledStructure = z.infer<typeof compiledStructureSchema>;
export type StructureAlternative = z.infer<typeof structureAlternativeSchema>;
export type ProductionPlan = z.infer<typeof productionPlanSchema>;

export type DealStateWorkbench = {
  understanding: {row: DealStateRow; value: UnderstandingSnapshot} | null;
  structure: {row: DealStateRow; value: CompiledStructure} | null;
  structureDecision: DealStateRow | null;
  productionPlan: {row: DealStateRow; value: ProductionPlan} | null;
  packageReview: DealStateRow | null;
  matchScreen: {row: DealStateRow; value: MatchScreen} | null;
  isProcessing: boolean;
};

export function latestActiveDealState(rows: readonly DealStateRow[]) {
  const latest = new Map<string, DealStateRow>();
  for (const row of rows) {
    const current = latest.get(row.object_type);
    if (!current || row.object_version > current.object_version) latest.set(row.object_type, row);
  }
  for (const [type, row] of latest) {
    if (row.status === "stale" || row.status === "superseded") latest.delete(type);
  }
  return latest;
}

function record(value: Json): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

export function parseUnderstanding(row: DealStateRow | undefined) {
  if (!row) return null;
  const parsed = understandingSchema.safeParse(row.payload);
  return parsed.success ? {row, value: parsed.data} : null;
}

export function parseCompiledStructure(row: DealStateRow | undefined) {
  if (!row) return null;
  const payload = record(row.payload);
  const parsed = compiledStructureSchema.safeParse(payload?.compiled ?? row.payload);
  return parsed.success ? {row, value: parsed.data} : null;
}

export function parseProductionPlan(row: DealStateRow | undefined) {
  if (!row) return null;
  const parsed = productionPlanSchema.safeParse(row.payload);
  return parsed.success ? {row, value: parsed.data} : null;
}

function dependsOn(row: DealStateRow, objectType: string, objectFingerprint: string) {
  return Array.isArray(row.dependencies) && row.dependencies.some((dependency) => (
    dependency !== null
    && typeof dependency === "object"
    && !Array.isArray(dependency)
    && (dependency as Record<string, unknown>).objectType === objectType
    && (dependency as Record<string, unknown>).objectFingerprint === objectFingerprint
  ));
}

export function parseGovernedMatchScreen(
  row: DealStateRow | undefined,
  packageReview: DealStateRow | undefined,
  materialArtifact: DealStateRow | undefined,
) {
  if (
    !row
    || !packageReview
    || packageReview.status !== "approved"
    || !materialArtifact
    || !dependsOn(row, "package_review", packageReview.object_fingerprint)
    || !dependsOn(row, "material_artifact", materialArtifact.object_fingerprint)
  ) return null;
  const parsed = matchScreenSchema.safeParse(row.payload);
  if (
    !parsed.success
    || parsed.data.packageReviewFingerprint !== packageReview.object_fingerprint
    || parsed.data.materialArtifactFingerprint !== materialArtifact.object_fingerprint
  ) return null;
  return {row, value: parsed.data};
}

export async function loadDealStateWorkbench(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<DealStateWorkbench> {
  const [{data: rows}, {data: activeJobs}] = await Promise.all([
    supabase
      .from("deal_state_objects")
      .select("id, organization_id, intake_session_id, object_type, object_version, status, input_fingerprint, object_fingerprint, payload, dependencies, created_by, created_by_kind, created_at, updated_at, superseded_at")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId)
      .order("object_version", {ascending: false}),
    supabase
      .from("processing_jobs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId)
      .eq("kind", "case_analysis")
      .in("status", ["queued", "leased"])
      .limit(1),
  ]);
  const latest = latestActiveDealState(rows ?? []);
  return {
    understanding: parseUnderstanding(latest.get("understanding_snapshot")),
    structure: parseCompiledStructure(latest.get("structure_option")),
    structureDecision: latest.get("structure_decision") ?? null,
    productionPlan: parseProductionPlan(latest.get("production_plan")),
    packageReview: latest.get("package_review") ?? null,
    matchScreen: parseGovernedMatchScreen(
      latest.get("match_screen"),
      latest.get("package_review"),
      latest.get("material_artifact"),
    ),
    isProcessing: Boolean(activeJobs?.length),
  };
}

export function localizedText(value: {pt: string; en: string}, locale: string) {
  return locale === "pt-BR" ? value.pt : value.en;
}

export function structureProposalFingerprint(row: DealStateRow) {
  const parsed = parseCompiledStructure(row);
  return parsed?.value.proposalFingerprint ?? null;
}
