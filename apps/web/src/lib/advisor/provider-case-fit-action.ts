"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {providerCaseCriteriaSchema} from "@offroad/fund-mandate";
import {capitalProjectJobSchema,providerCaseFitPlanSnapshot} from "@offroad/work-plan";
import {requireWorkspace} from "@/lib/auth/workspace";
import {startProviderCaseFitProject} from "./provider-case-fit-command";
import type {Json} from "@/types/database";
const command=z.object({requestId:z.uuid(),locale:z.enum(["pt-BR","en-US"]),projectId:z.uuid().optional(),expectedPlanFingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional(),projectName:z.string().trim().min(2).max(80),objective:z.string().trim().min(2).max(8000),criteria:providerCaseCriteriaSchema}).strict();
export async function requestProviderCaseFit(value:unknown):Promise<{ok:true;projectId:string}|{ok:false;error:"invalid"|"stale"|"forbidden"|"save"}> {
 const parsed=command.safeParse(value);if(!parsed.success)return{ok:false,error:"invalid"};const input=parsed.data;
 if(input.criteria.source.referenceId!==input.requestId||Date.parse(input.criteria.asOf)>Date.now()||(input.projectId&&!input.expectedPlanFingerprint))return{ok:false,error:"invalid"};
 const {supabase,organization}=await requireWorkspace(input.locale);
 let entryJob=capitalProjectJobSchema.parse("company_debt_view");
 if(input.projectId){
  const {data,error}=await supabase.from("capital_projects").select("entry_job").eq("id",input.projectId).eq("organization_id",organization.id).maybeSingle();
  if(error||!data)return{ok:false,error:"forbidden"};const job=capitalProjectJobSchema.safeParse(data.entry_job);if(!job.success)return{ok:false,error:"invalid"};entryJob=job.data;
 }
 const result=await startProviderCaseFitProject(supabase,{p_request_id:input.requestId,p_locale:input.locale,p_project_name:input.projectName,p_prompt:input.objective,p_plan:providerCaseFitPlanSnapshot(entryJob) as unknown as Json,p_case_criteria:input.criteria as unknown as Json,...(input.projectId?{p_project_id:input.projectId,p_expected_plan_fingerprint:input.expectedPlanFingerprint}:{})});
 if(result.error)return{ok:false,error:result.error.code==="42501"?"forbidden":result.error.code==="40001"?"stale":"save"};
 const resultData=z.object({capital_project_id:z.uuid()}).passthrough().safeParse(result.data);if(!resultData.success)return{ok:false,error:"save"};
 revalidatePath(`/${input.locale}/app`);
 return{ok:true,projectId:resultData.data.capital_project_id};
}
