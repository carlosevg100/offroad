import type {SupabaseClient} from "@supabase/supabase-js";
import {readProviderCaseFitArtifact,type ProviderCaseFitArtifact} from "@offroad/fund-mandate";
import {readProviderResearchArtifact,type ProviderResearchArtifact} from "@offroad/work-plan";
import type {Database} from "@/types/database";
import type {ProviderResearchRow} from "./provider-research-reader";
export type ProviderWorkHistoryEntry={id:string;version:number;status:string;planId:string;research:ProviderResearchArtifact|null;fit:ProviderCaseFitArtifact|null};
export function readProviderWorkHistory(rows:readonly ProviderResearchRow[],plans:readonly {id:string;plan_fingerprint:string}[],runs:readonly {id:string;plan_id:string;status:string}[],binding:{organizationId:string;projectId:string;currentPlanId:string}):ProviderWorkHistoryEntry[]{
 return rows.filter(row=>row.plan_id!==binding.currentPlanId&&['provider_research','provider_case_fit'].includes(row.artifact_type)).slice(0,10).flatMap(row=>{
  const plan=plans.find(p=>p.id===row.plan_id);if(!plan||!runs.some(r=>r.id===row.task_run_id&&r.plan_id===plan.id&&r.status==='succeeded'))return[];
  if(!['draft','pending_confirmation','confirmed','approved','stale','superseded'].includes(row.status))return[];
  const scoped={organizationId:binding.organizationId,projectId:binding.projectId,planId:plan.id,planFingerprint:plan.plan_fingerprint};
  const research=row.artifact_type==='provider_research'&&['provider-research.v1','provider-research.v2'].includes(row.schema_version)?readProviderResearchArtifact(row.content,scoped):null;
  if(research && research.schemaVersion!==row.schema_version)return[];
  const fit=row.artifact_type==='provider_case_fit'&&row.schema_version==='provider-case-fit.v1'?readProviderCaseFitArtifact(row.content,scoped):null;
  return research||fit?[{id:row.id,version:row.artifact_version,status:row.status,planId:plan.id,research,fit}]:[];
 });
}
/** Historical evidence only: original plan/run bindings remain mandatory even for stale outputs. */
export async function loadProviderWorkHistory(client:SupabaseClient<Database>,rows:readonly ProviderResearchRow[],binding:{organizationId:string;projectId:string;currentPlanId:string}){
 const candidates=rows.filter(row=>row.plan_id!==binding.currentPlanId&&['provider_research','provider_case_fit'].includes(row.artifact_type)).slice(0,10);
 if(!candidates.length)return[];
 const [{data:plans,error:planError},{data:runs,error:runError}]=await Promise.all([
  client.from('capital_project_plans').select('id,plan_fingerprint').eq('organization_id',binding.organizationId).eq('capital_project_id',binding.projectId).in('id',[...new Set(candidates.map(row=>row.plan_id))]),
  client.from('capital_project_task_runs').select('id,plan_id,status').eq('organization_id',binding.organizationId).in('plan_id',[...new Set(candidates.map(row=>row.plan_id))]).in('id',candidates.map(row=>row.task_run_id)),
 ]);
 if(planError||runError)return[];
 return readProviderWorkHistory(candidates,plans??[],runs??[],binding);
}
