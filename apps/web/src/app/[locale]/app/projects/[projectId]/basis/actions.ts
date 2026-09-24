"use server";

import {z} from "zod";
import {revalidatePath} from "next/cache";
import {adoptObservationForWorkSchema, dossierEntityLinkSchema, proposeAssumptionRevisionSchema, metricDefinitionVersionSchema} from "@offroad/domain-contracts";
import {calculateAdoptedLeverage} from "@offroad/financial-model";
import {requireWorkspace} from "@/lib/auth/workspace";
import {capitalDecisionPurpose} from "@/lib/advisor/adoption-basis-reader";
import type {Json} from "@/types/database";

const route = z.object({locale: z.enum(["pt-BR", "en-US"]), projectId: z.uuid()});
type Failure = {ok: false; error: "invalid" | "denied" | "conflict" | "unavailable"};
function failure(code?: string): Failure {
  return {ok: false, error: code === "40001" ? "conflict" : code === "42501" ? "denied" : code?.startsWith("22") || code === "23514" ? "invalid" : "unavailable"};
}

export async function saveAdoptionDecision(input: unknown): Promise<{ok: true; versionId: string} | Failure> {
  const parsed = route.extend({mode: z.enum(["observation", "hypothesis"]), payload: z.unknown()}).strict().safeParse(input);
  if (!parsed.success) return failure("22023");
  const {locale, projectId, mode} = parsed.data;
  const payload = (mode === "observation" ? adoptObservationForWorkSchema : proposeAssumptionRevisionSchema).safeParse(parsed.data.payload);
  if (!payload.success || payload.data.workId !== projectId || payload.data.purpose !== capitalDecisionPurpose) return failure("22023");
  const {supabase, organization} = await requireWorkspace(locale);
  const project = await supabase.from("capital_projects").select("id").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project.data) return failure("42501");
  const result = await supabase.rpc(mode === "observation" ? "adopt_observation_for_work_v1" : "propose_assumption_revision_v1", {p_payload: payload.data as Json});
  if (result.error || !result.data) return failure(result.error?.code);
  revalidatePath(`/${locale}/app/projects/${projectId}/basis`);
  return {ok: true, versionId: result.data};
}

export async function previewAdoptedLeverage(input: unknown): Promise<{ok: true; result: ReturnType<typeof calculateAdoptedLeverage>} | Failure> {
  const parsed = route.extend({versionId: z.uuid(), netDebtDecisionId: z.uuid(), ebitdaDecisionId: z.uuid()}).strict().safeParse(input);
  if (!parsed.success) return failure("22023");
  const {locale, projectId, versionId, netDebtDecisionId, ebitdaDecisionId} = parsed.data;
  const {supabase, organization} = await requireWorkspace(locale);
  const project = await supabase.from("capital_projects").select("id").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project.data) return failure("42501");
  const result = await supabase.rpc("read_adoption_basis_v1", {p_version_id: versionId});
  if (result.error) return failure(result.error.code);
  try {
    const envelope = z.object({canonical: z.string(), fingerprint: z.string()}).parse(result.data);
    return {ok: true, result: calculateAdoptedLeverage({envelope, scope: {workId: projectId, purpose: capitalDecisionPurpose, versionId}, netDebtDecisionId, ebitdaDecisionId})};
  } catch { return failure("22023"); }
}

export async function recordBasisDefinition(input: unknown): Promise<{ok: true} | Failure> {
  const parsed = route.extend({dossierId: z.uuid(), requestId: z.uuid(), metricKey: z.string().trim().min(1).max(300), version: metricDefinitionVersionSchema}).strict().safeParse(input);
  if (!parsed.success) return failure("22023");
  const {locale, projectId, dossierId, requestId, metricKey, version} = parsed.data;
  if (version.kind === "contractual" && typeof version.contractAnchor?.locator === "string" && !version.contractAnchor.locator.trim()) return failure("22023");
  const {supabase, organization} = await requireWorkspace(locale);
  const project = await supabase.from("capital_projects").select("id").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project.data) return failure("42501");
  // The SQL command independently requires the dossier's work capability and source rights.
  const sessions = await supabase.from("document_intake_sessions").select("id").eq("organization_id", organization.id).eq("capital_project_id", projectId);
  if (sessions.error) return failure();
  const dossier = await supabase.from("dossiers").select("id").eq("organization_id", organization.id).eq("id", dossierId).in("resource_id", [projectId, ...(sessions.data ?? []).map((s) => s.id)]).maybeSingle();
  if (!dossier.data) return failure("42501");
  // PostgreSQL nullable arguments are generated as string; send SQL NULL, never omit a required argument.
  const sqlNull = null as never;
  const result = await supabase.rpc("record_definition_version_v1", {p_dossier_id: dossierId, p_metric_key: metricKey, p_kind: version.kind, p_definition: version.definition,
    p_contract_source_version_id: version.contractSourceVersionId ?? sqlNull, p_contract_anchor: version.contractAnchor as Json,
    p_definition_id: sqlNull, p_expected_version: 0, p_request_id: requestId});
  if (result.error) return failure(result.error.code);
  revalidatePath(`/${locale}/app/projects/${projectId}/basis`);
  return {ok: true};
}

export async function recordBasisEntity(input: unknown): Promise<{ok: true} | Failure | {ok: false; error: "roleExists"}> {
 const parsed = route.extend({dossierId:z.uuid(),name:z.string().trim().min(2).max(300),namespace:z.string().min(1).max(80),value:z.string().min(1).max(300),reason:z.string().trim().min(5).max(2000),
  relationship:dossierEntityLinkSchema.shape.relationship,perimeter:z.enum(["consolidated","standalone"])}).strict().safeParse(input);
 if(!parsed.success) return failure("22023");
 const {locale,projectId,dossierId,name,namespace,value,reason,relationship,perimeter}=parsed.data;
 const {supabase,organization}=await requireWorkspace(locale);
 const project=await supabase.from("capital_projects").select("id").eq("organization_id",organization.id).eq("id",projectId).maybeSingle();
 if(!project.data) return failure("42501");
 const sessions=await supabase.from("document_intake_sessions").select("id").eq("organization_id",organization.id).eq("capital_project_id",projectId);
 if(sessions.error) return failure();
 const dossier=await supabase.from("dossiers").select("id").eq("organization_id",organization.id).eq("id",dossierId).in("resource_id",[projectId,...(sessions.data??[]).map(s=>s.id)]).maybeSingle();
 if(!dossier.data) return failure("42501");
 const entity=await supabase.rpc("ensure_basis_entity_v1",{p_dossier_id:dossierId,p_name:name,p_namespace:namespace,p_value:value,p_reason:reason});
 if(entity.error||!entity.data) return failure(entity.error?.code);
 const entityId=entity.data;
 // The reviewed identity alone does not register the company: the execution gate needs the entity the basis
 // uses to be the active subject of a dossier of this work. The role is linked explicitly, never inferred.
 type RoleState={state:"missing"}|{state:"recorded"}|{state:"failed";result:Failure|{ok:false;error:"roleExists"}};
 const role=async():Promise<RoleState>=>{
  const now=new Date().toISOString();
  const found=await supabase.from("dossier_entity_links").select("perimeter").eq("organization_id",organization.id).eq("dossier_id",dossierId).eq("entity_id",entityId)
   .eq("relationship",relationship).is("withdrawn_at",null).or(`valid_until.is.null,valid_until.gt.${now}`).limit(1);
  if(found.error) return {state:"failed",result:failure(found.error.code)};
  const current=found.data?.[0];
  if(!current) return {state:"missing"};
  return (current.perimeter as Record<string,unknown>|null)?.basis===perimeter?{state:"recorded"}:{state:"failed",result:{ok:false,error:"roleExists"}};
 };
 const existing=await role();
 if(existing.state==="failed") return existing.result;
 if(existing.state==="missing"){
  const sqlNull=null as never;
  const linked=await supabase.rpc("link_dossier_entity_v1",{p_dossier_id:dossierId,p_entity_id:entityId,p_relationship:relationship,p_perimeter:{basis:perimeter},
   p_valid_from:new Date().toISOString(),p_valid_until:sqlNull,p_reason:reason,p_request_id:crypto.randomUUID()});
  // A concurrent submission may have linked the same role first; the recorded link decides the answer.
  if(linked.error&&linked.error.message!=="identity_period_overlap") return failure(linked.error.code);
  if(linked.error){const settled=await role();if(settled.state==="failed") return settled.result;if(settled.state==="missing") return failure();}
 }
 revalidatePath(`/${locale}/app/projects/${projectId}/basis`);
 return {ok:true};
}
