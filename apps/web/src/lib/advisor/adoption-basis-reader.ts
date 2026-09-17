import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {observationDimensionsSchema, observationValueSchema} from "@offroad/domain-contracts";
import {readContextualBasis, type AdoptionBasisEnvelope, type AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {compareContextualAdoptionBases, type AdoptionDifference} from "@offroad/case-understanding";
import type {Database} from "@/types/database";

export const capitalDecisionPurpose = "prepare-capital-structure-decision";
const candidateSchema = z.object({
  id: z.uuid(), sequence: z.string(), dossierId: z.uuid(), fieldPath: z.string(),
  dimensions: observationDimensionsSchema, value: observationValueSchema.or(z.strictObject({type:z.enum(["number","text","date","boolean","list"]),value:z.null()})),
  incompleteReasons: z.array(z.string()), verificationState: z.string(),
  sourceVersionId: z.uuid().nullable(), sourceName: z.string().nullable(),
});
export type AdoptionCandidate = z.infer<typeof candidateSchema>;
export type AdoptionWorkContext = {
  candidates: AdoptionCandidate[]; nextCursor: string | null;
  basis: AdoptionBasisSnapshot | null; envelope: AdoptionBasisEnvelope | null;
  differences: AdoptionDifference[] | null; comparisonUnavailable: boolean;
  versions: Array<{id: string; revision: number}>;
  entities: Array<{id: string; legal_name: string}>;
  definitions: Array<{id: string; label: string}>;
  dossiers: Array<{id: string}>;
};

export async function loadAdoptionWorkContext(client: SupabaseClient<Database>, organizationId: string, workId: string, contextKey: string, versionId: string | null, cursor: string | null): Promise<AdoptionWorkContext> {
  const [observations, sessions, sets] = await Promise.all([
    client.rpc("list_work_observations_v1", {p_work_id: workId, p_before_sequence: cursor ?? undefined}),
    client.from("document_intake_sessions").select("id").eq("organization_id", organizationId).eq("capital_project_id", workId),
    client.from("assumption_sets").select("id").eq("organization_id", organizationId).eq("work_id", workId).eq("purpose", capitalDecisionPurpose).eq("context_key", contextKey).maybeSingle(),
  ]);
  if (observations.error || sessions.error || sets.error) throw new Error("adoption_context_unavailable");
  const candidates = z.array(candidateSchema).parse(observations.data);
  const resourceIds = [workId, ...(sessions.data ?? []).map((s) => s.id)];
  const {data: dossiers, error: dossierError} = await client.from("dossiers").select("id").eq("organization_id", organizationId).in("resource_id", resourceIds);
  if (dossierError) throw new Error("adoption_context_unavailable");
  const dossierIds = (dossiers ?? []).map((d) => d.id);
  const [entityResult, metricResult, versionResult] = await Promise.all([
    dossierIds.length ? client.from("entities").select("id,legal_name").eq("organization_id", organizationId).in("origin_dossier_id", dossierIds).order("legal_name") : Promise.resolve({data: [], error: null}),
    dossierIds.length ? client.from("metric_definitions").select("id,metric_key,kind").eq("organization_id", organizationId).in("dossier_id", dossierIds) : Promise.resolve({data: [], error: null}),
    sets.data ? client.from("assumption_versions").select("id,revision").eq("organization_id", organizationId).eq("set_id", sets.data.id).eq("classification", "working_basis").order("revision", {ascending: false}).limit(50) : Promise.resolve({data: [], error: null}),
  ]);
  if (entityResult.error || metricResult.error || versionResult.error) throw new Error("adoption_context_unavailable");
  const metrics = metricResult.data ?? [];
  const definitions: AdoptionWorkContext["definitions"] = [];
  if (metrics.length) {
    const {data, error} = await client.from("definition_versions").select("id,metric_definition_id,version_no,definition").eq("organization_id", organizationId).in("metric_definition_id", metrics.map((m) => m.id)).order("version_no", {ascending: false});
    if (error) throw new Error("adoption_context_unavailable");
    for (const definition of data ?? []) definitions.push({id: definition.id, label: `${metrics.find((m) => m.id === definition.metric_definition_id)?.metric_key} · ${definition.version_no} · ${definition.definition}`});
  }
  const selected = versionId ?? versionResult.data?.[0]?.id ?? null;
  let basis: AdoptionBasisSnapshot | null = null;
  let envelope: AdoptionBasisEnvelope | null = null;
  let differences: AdoptionDifference[] | null = null;
  let comparisonUnavailable = false;
  if (selected) {
    const {data, error} = await client.rpc("read_adoption_basis_v1", {p_version_id: selected});
    if (error) throw new Error("adoption_context_unavailable");
    const parsed = z.object({canonical: z.string(), fingerprint: z.string()}).parse(data);
    envelope = parsed;
    basis = readContextualBasis(parsed, {workId, purpose: capitalDecisionPurpose, versionId: selected});
    if (basis.contextKey !== contextKey) throw new Error("adoption_context_mismatch");
    if (basis.previousVersionId) {
      const prior = await client.rpc("compare_adoption_bases_v1", {p_left_version_id: basis.previousVersionId, p_right_version_id: selected});
      if (prior.error) comparisonUnavailable = true;
      else {
        const pair = z.object({left: z.object({canonical: z.string(), fingerprint: z.string()}), right: z.object({canonical: z.string(), fingerprint: z.string()})}).parse(prior.data);
        differences = compareContextualAdoptionBases({workId, purpose: capitalDecisionPurpose, left: {versionId: basis.previousVersionId, envelope: pair.left}, right: {versionId: selected, envelope: pair.right}});
      }
    }
  }
  return {candidates: candidates.slice(0, 25), nextCursor: candidates.length > 25 ? candidates[24]!.sequence : null, basis, envelope, differences, comparisonUnavailable, versions: versionResult.data ?? [], entities: entityResult.data ?? [], definitions, dossiers: dossiers ?? []};
}
