"use server";
import {z} from "zod";
import {institutionalModelConfigurationSchema} from "@offroad/financial-model";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadInstitutionalSetupContext} from "@/lib/advisor/institutional-setup-reader";
import {compileInstitutionalSetupForm,type SetupDraft} from "@/lib/advisor/institutional-setup-form";
import type {Json} from "@/types/database";
const request=z.object({locale:z.enum(["pt-BR","en-US"]),projectId:z.uuid(),expectedManifestFingerprint:z.string().regex(/^[a-f0-9]{64}$/),submissionId:z.uuid(),draft:z.unknown(),sourceReviews:z.array(z.object({sourceDocument:z.string(),version:z.string(),hash:z.string(),asOfDate:z.iso.date(),currency:z.string().regex(/^[A-Z]{3}$/),amountScale:z.literal("units"),metadataEvidence:z.object({locator:z.string().trim().min(1),rationale:z.string().trim().min(1)})}))});
type Command={rpc(name:"submit_institutional_model_setup_v1",args:{p_project_id:string;p_expected_manifest_fingerprint:string;p_configuration:Json;p_source_reviews:Json;p_submission_id:string;p_locale:string}):PromiseLike<{data:Json|null;error:{code?:string}|null}>};
export async function submitInstitutionalSetup(raw:unknown):Promise<{ok:true}|{ok:false;error:"invalid"|"stale"|"denied"|"save"}>{
 const parsed=request.safeParse(raw);if(!parsed.success)return {ok:false,error:"invalid"};
 const {supabase,userId}=await requireWorkspace(parsed.data.locale);
 const current=await loadInstitutionalSetupContext(supabase,parsed.data.projectId);
 if(!current)return {ok:false,error:"denied"};
 if(current.sourceManifestFingerprint!==parsed.data.expectedManifestFingerprint)return {ok:false,error:"stale"};
 let configuration:unknown;
 try{configuration=institutionalModelConfigurationSchema.parse(compileInstitutionalSetupForm({draft:parsed.data.draft as SetupDraft,facts:current.candidates,sources:current.currentSources,actorId:userId,submittedAt:new Date().toISOString(),submissionId:parsed.data.submissionId}));}catch{return {ok:false,error:"invalid"};}
 const result=await(supabase as unknown as Command).rpc("submit_institutional_model_setup_v1",{p_project_id:parsed.data.projectId,p_expected_manifest_fingerprint:parsed.data.expectedManifestFingerprint,p_configuration:configuration as Json,p_source_reviews:parsed.data.sourceReviews as Json,p_submission_id:parsed.data.submissionId,p_locale:parsed.data.locale});
 return result.error?{ok:false,error:result.error.code==="40001"?"stale":result.error.code==="42501"?"denied":"save"}:{ok:true};
}
