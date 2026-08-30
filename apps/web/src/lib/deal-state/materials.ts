import type {FinancialModelArtifact} from "@offroad/case-engine";
import type {Material, MaterialKind} from "@offroad/case-materials";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import {latestActiveDealState} from "./workbench";
import type {DealStateRow} from "./workbench";
import type {Database} from "@/types/database";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const localizedSchema = z.object({pt: z.string(), en: z.string()});
const claimMetadata = {
  claimId: z.string().optional(),
  material: z.boolean().optional(),
  claimKind: z.string().optional(),
  supportIds: z.array(z.string()).optional(),
  qualifierBasis: z.array(z.string()).optional(),
  approvedFingerprint: z.string().optional(),
};
const materialBlockSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("heading"), text: localizedSchema}),
  z.object({type: z.literal("paragraph"), text: localizedSchema, ...claimMetadata}),
  z.object({type: z.literal("metrics"), items: z.array(z.object({
    label: localizedSchema,
    value: z.string(),
    formatted: localizedSchema,
    supportIds: z.array(z.string()),
  }))}),
  z.object({type: z.literal("table"), caption: localizedSchema, head: z.array(localizedSchema), rows: z.array(z.array(z.string()))}),
  z.object({type: z.literal("list"), items: z.array(localizedSchema)}),
  z.object({type: z.literal("disclaimer"), text: localizedSchema}),
  z.object({type: z.literal("kv"), caption: localizedSchema.optional(), rows: z.array(z.object({
    label: localizedSchema,
    value: localizedSchema,
    note: localizedSchema.optional(),
    ...claimMetadata,
  }))}),
  z.object({type: z.literal("callout"), title: localizedSchema, items: z.array(z.object({
    label: localizedSchema,
    value: localizedSchema,
    ...claimMetadata,
  }))}),
]);
const materialKindSchema = z.enum([
  "teaser", "credit_profile", "package", "credit_memo", "term_sheet",
  "financial_model", "diligence_qa", "data_room_index",
]);
const materialSchema = z.object({
  kind: materialKindSchema,
  title: localizedSchema,
  blocks: z.array(materialBlockSchema),
  dependsOn: z.array(z.string()),
  template: z.unknown().optional(),
  conductAudit: z.unknown().optional(),
  sections: z.array(z.string()).optional(),
  artifactFingerprint: z.string().optional(),
});
const financialModelSchema = z.object({
  version: z.string(),
  selectedAlternativeId: z.string(),
  proposalFingerprint: hashSchema,
  inputs: z.object({
    amount: z.string(),
    termMonths: z.number().int().positive(),
    graceMonths: z.number().int().nonnegative(),
    amortization: z.enum(["sac", "price", "bullet"]),
    annualInterestRate: z.string().nullable(),
  }),
  periods: z.array(z.string()),
  sheetNames: z.object({pt: z.array(z.string()), en: z.array(z.string())}),
  deskAssumptions: z.array(z.string()),
  supportIds: z.array(z.string()),
  workbooks: z.object({
    pt: z.object({sha256: hashSchema, byteSize: z.number().int().positive()}),
    en: z.object({sha256: hashSchema, byteSize: z.number().int().positive()}),
  }),
  fingerprint: hashSchema,
});
const artifactPayloadSchema = z.object({
  materials: z.array(materialSchema),
  financialModel: financialModelSchema.nullable(),
  materialTruth: z.unknown(),
  dataRoom: z.unknown(),
});
const planPayloadSchema = z.object({
  artifacts: z.array(z.enum(["teaser", "financial_model", "indicative_term_sheet", "data_room_index"])),
});

function dependsOn(row: {dependencies: unknown}, objectType: string, objectFingerprint: string) {
  return Array.isArray(row.dependencies) && row.dependencies.some((dependency) => (
    dependency !== null
    && typeof dependency === "object"
    && !Array.isArray(dependency)
    && (dependency as Record<string, unknown>).objectType === objectType
    && (dependency as Record<string, unknown>).objectFingerprint === objectFingerprint
  ));
}

export type GovernedMaterialPackage = {
  artifactFingerprint: string;
  materials: Material[];
  financialModel: FinancialModelArtifact | null;
  plannedArtifacts: Array<"teaser" | "financial_model" | "indicative_term_sheet" | "data_room_index">;
};

export function governedMaterialPackageFromRows(rows: readonly DealStateRow[]): GovernedMaterialPackage | null {
  const latest = latestActiveDealState(rows);
  const option = latest.get("structure_option");
  const decision = latest.get("structure_decision");
  const plan = latest.get("production_plan");
  const artifact = latest.get("material_artifact");
  if (
    !option || option.status !== "pending_confirmation"
    || !decision || !["confirmed", "approved"].includes(decision.status)
    || !dependsOn(decision, "structure_option", option.object_fingerprint)
    || !plan || plan.status !== "approved"
    || !dependsOn(plan, "structure_decision", decision.object_fingerprint)
    || !artifact || !["pending_confirmation", "approved"].includes(artifact.status)
    || !dependsOn(artifact, "production_plan", plan.object_fingerprint)
  ) return null;

  const parsedArtifact = artifactPayloadSchema.safeParse(artifact.payload);
  const parsedPlan = planPayloadSchema.safeParse(plan.payload);
  if (!parsedArtifact.success || !parsedPlan.success) return null;
  return {
    artifactFingerprint: artifact.object_fingerprint,
    materials: parsedArtifact.data.materials as Material[],
    financialModel: parsedArtifact.data.financialModel as FinancialModelArtifact | null,
    plannedArtifacts: parsedPlan.data.artifacts,
  };
}

export async function loadGovernedMaterialPackage(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<GovernedMaterialPackage | null> {
  const {data: rows} = await supabase
    .from("deal_state_objects")
    .select("id, organization_id, intake_session_id, object_type, object_version, status, input_fingerprint, object_fingerprint, payload, dependencies, created_by, created_by_kind, created_at, updated_at, superseded_at")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId)
    .in("object_type", ["structure_option", "structure_decision", "production_plan", "material_artifact"])
    .order("object_version", {ascending: false});
  return governedMaterialPackageFromRows(rows ?? []);
}

const planKindForMaterial: Partial<Record<MaterialKind, GovernedMaterialPackage["plannedArtifacts"][number]>> = {
  teaser: "teaser",
  term_sheet: "indicative_term_sheet",
  financial_model: "financial_model",
  data_room_index: "data_room_index",
};

export function governedMaterial(
  governed: GovernedMaterialPackage,
  kind: MaterialKind,
) {
  const plannedKind = planKindForMaterial[kind];
  if (!plannedKind || !governed.plannedArtifacts.includes(plannedKind)) return null;
  return governed.materials.find((material) => material.kind === kind) ?? null;
}
