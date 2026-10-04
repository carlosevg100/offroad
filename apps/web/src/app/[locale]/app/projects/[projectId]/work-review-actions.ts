"use server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireWorkspace} from "@/lib/auth/workspace";
import {executeWorkReviewCommand,loadWorkReviewDashboard,workReviewCommandSchema} from "@/lib/advisor/work-review-dashboard";
export async function submitWorkReviewCommand(input:unknown){
 const p=workReviewCommandSchema.safeParse(input);if(!p.success)return{ok:false as const,error:"invalid"as const};
 const {supabase}=await requireWorkspace(p.data.locale);
 const result=await executeWorkReviewCommand(async(name,args)=>{const r=await(supabase as SupabaseClient).rpc(name,args);return{data:r.data,error:r.error};},p.data);
 if(result.ok)revalidatePath(`/${p.data.locale}/app/projects/${p.data.projectId}`);return result;
}
export async function readMoreWorkReview(input:unknown){
 const p=z.strictObject({locale:z.enum(["pt-BR","en-US"]),projectId:z.uuid(),beforeId:z.uuid().nullable(),beforeDecisionId:z.uuid().nullable()}).safeParse(input);if(!p.success)return null;
 const {supabase,organization,userId}=await requireWorkspace(p.data.locale);
 return loadWorkReviewDashboard(async(name,args)=>{const r=await(supabase as SupabaseClient).rpc(name,args);return{data:r.data,error:r.error};},p.data.projectId,organization.id,userId,p.data.beforeId,p.data.beforeDecisionId);
}
