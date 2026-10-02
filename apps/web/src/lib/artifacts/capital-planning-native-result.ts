import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {capitalPlanningMapArtifactSchema} from "@offroad/domain-contracts";
import {z} from "zod";
import type {Database} from "@/types/database";
import {readCapitalS11Result} from "./capital-s11-result";
import {loadCapitalProjectReviewBasis,type CapitalProjectReviewBasis} from "./capital-project-review";

export type CapitalPlanningNativeResult={ok:true;content:z.infer<typeof capitalPlanningMapArtifactSchema>;review:CapitalProjectReviewBasis}
 |{ok:false;error:"capital_s11_result_withheld"};
/** Existing S11 physical reader owns byte/hash/Storage/header validation. This
 * surface additionally binds the full financial product to the current human
 * review target, after hydration, without an inline legacy fallback. */
export async function loadCapitalPlanningNativeResult(supabase:SupabaseClient<Database>,input:{
 organizationId:string;workId:string;artifact:{id:string;artifact_fingerprint:string;content:unknown};
}):Promise<CapitalPlanningNativeResult>{
 const denied={ok:false,error:"capital_s11_result_withheld"} as const;
 if(!z.uuid().safeParse(input.workId).success||!z.uuid().safeParse(input.artifact.id).success
  ||!/^[a-f0-9]{64}$/.test(input.artifact.artifact_fingerprint))return denied;
 try{
  const retained=await readCapitalS11Result(supabase,{organizationId:input.organizationId,projection:input.artifact.content});
  if(!retained.ok)return denied;
  const content=capitalPlanningMapArtifactSchema.safeParse(retained.content);if(!content.success)return denied;
  const review=await loadCapitalProjectReviewBasis(supabase,input.workId,input.artifact.id,retained.revisionId);
  if(!review||review.artifactType!=="alternative_map"||review.artifactFingerprint!==input.artifact.artifact_fingerprint
   ||["stale","superseded"].includes(review.status))return denied;
  return{ok:true,content:content.data,review};
 }catch{return denied;}
}
