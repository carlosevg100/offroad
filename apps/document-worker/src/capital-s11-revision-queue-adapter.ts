/** Actual RPC revision port. Transport callbacks must use the separate closed
 * human-return Edge kinds; no ordinary task/source reader substitutes history. */
import type {SupabaseClient} from "@supabase/supabase-js";
import type {CapitalProjectAnalysisJob} from "./queue";
import type {CapitalS11RetentionScope} from "./capital-s11-protocol";
import type {capitalS11RecoverySourceScopeSchema} from "./capital-s11-recovery";
import type {z} from "zod";
import {loadCapitalS11RevisionInput} from "./capital-s11-revision-input";
import {createCapitalS11QueueAdapter} from "./capital-s11-queue-adapter";
import {retryCapitalCaptureRpc} from "./capital-capture-rpc-retry";
type PhysicalRead={bytes:Uint8Array;objectId:string;version:string};
export type CapitalS11RevisionPhysicalReaders={
 prior(scope:CapitalS11RetentionScope):Promise<PhysicalRead>;
 task(scope:CapitalS11RetentionScope,taskRunId:string):Promise<PhysicalRead>;
 source(scope:z.infer<typeof capitalS11RecoverySourceScopeSchema>):Promise<PhysicalRead>;
};
export function createCapitalS11RevisionQueueAdapter(client:SupabaseClient,job:CapitalProjectAnalysisJob,readBytes:(authority:{jobId:string;capabilityToken:string},scope:CapitalS11RetentionScope)=>Promise<PhysicalRead>,readers:CapitalS11RevisionPhysicalReaders,now:()=>number=Date.now){
 const{revision_review_id:reviewId,correction_decision_id:decisionId,revision_of_native_revision_id:priorRevisionId}=job.payload;
 if(!reviewId||!decisionId||!priorRevisionId||!job.payload.revision_of_artifact_id)throw new Error("capital_s11_human_revision_required");
 const rpc=async(name:string,extra:Record<string,unknown>={})=>{const args={p_job_id:job.job_id,p_capability_token:job.capability_token,...extra};const result=await retryCapitalCaptureRpc(()=>client.rpc(name,args));if(result.error)throw new Error("capital_s11_revision_database_denied");return result.data as unknown;};
 return createCapitalS11QueueAdapter(client,job,readBytes,now,{load:()=>loadCapitalS11RevisionInput({jobId:job.job_id,organizationId:job.organization_id,workId:job.payload.capital_project_id,reviewId,decisionId,priorRevisionId},{
  load:()=>rpc("worker_load_capital_s11_revision_inputs_v1"),
  bodyScope:ref=>ref.taskRunId?rpc("worker_read_capital_s11_revision_task_v1",{p_task_run_id:ref.taskRunId}):rpc("worker_read_capital_s11_revision_body_v1",{p_retained_payload_id:ref.retainedPayloadId}),
  readBody:ref=>ref.taskRunId?readers.task(ref.scope,ref.taskRunId):readers.prior(ref.scope),
  sourceScope:retainedPayloadId=>rpc("worker_read_capital_s11_revision_source_v1",{p_retained_payload_id:retainedPayloadId}),
  readSource:scope=>readers.source(scope),
 },now)});
}
