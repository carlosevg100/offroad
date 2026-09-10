import {institutionalWorkbookArtifactSchema, parseVerifiedInstitutionalWorkbookArtifact} from "@offroad/financial-model";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {Database} from "@/types/database";

import {prepareInstitutionalComparison, type InstitutionalComparison} from "./institutional-scenario-comparison";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const resultSchema = z.object({projectId: z.uuid(), latest: z.object({
  id: z.uuid(), status: z.enum(["queued", "completed", "blocked", "stale"]),
  configurationId: z.uuid(), configurationFingerprint: hash, sourceManifestFingerprint: hash,
  artifact: institutionalWorkbookArtifactSchema.nullable(), blockers: z.array(z.string()), createdAt: z.iso.datetime({offset: true}),
}).nullable()});
export type InstitutionalModelResult = NonNullable<z.infer<typeof resultSchema>["latest"]> & {comparisons?: InstitutionalComparison[]};

export function parseInstitutionalModelResult(value: unknown, projectId: string): InstitutionalModelResult | null {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success || parsed.data.projectId !== projectId) return null;
  const result = parsed.data.latest;
  if (!result) return null;
  if (result.status !== "completed") return {...result, artifact: null};
  const artifact = parseVerifiedInstitutionalWorkbookArtifact(result.artifact);
  if (!artifact || artifact.institutional.activeScenarioId !== result.configurationId
    || artifact.institutional.sourceManifestFingerprint !== result.sourceManifestFingerprint
    || !artifact.institutional.scenarios.some(scenario => scenario.configurationId === result.configurationId && scenario.configurationFingerprint === result.configurationFingerprint)) return null;
  const rawComparisons = z.object({comparisonResults: z.array(z.unknown()).max(12).optional()}).safeParse(value);
  const comparisonRows = rawComparisons.success ? rawComparisons.data.comparisonResults ?? [] : [];
  const current = prepareInstitutionalComparison(result);
  const comparisons = new Map<string, InstitutionalComparison>();
  if (current) comparisons.set(current.id, current);
  for (const row of comparisonRows) {
    const candidate = resultSchema.shape.latest.unwrap().safeParse(row);
    if (!candidate.success || candidate.data.status !== "completed" || candidate.data.sourceManifestFingerprint !== result.sourceManifestFingerprint) continue;
    const prepared = prepareInstitutionalComparison(candidate.data);
    if (prepared && !comparisons.has(prepared.id)) comparisons.set(prepared.id, prepared);
  }
  return {...result, comparisons: [...comparisons.values()]};
}

/** The RPC checks project access and invalidates results when sources or approval change. */
export async function loadInstitutionalModelResult(client: SupabaseClient<Database>, projectId: string) {
  const {data, error} = await client.rpc("read_institutional_model_results_v1", {p_project_id: projectId});
  return error ? null : parseInstitutionalModelResult(data, projectId);
}
