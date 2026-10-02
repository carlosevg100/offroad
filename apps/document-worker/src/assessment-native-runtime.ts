import{z}from"zod";
import{capitalPublicLicensedPayloadSchema}from"@offroad/domain-contracts";
import type{SupabaseClient}from"@supabase/supabase-js";
import type{CaseAnalysisJob}from"./queue";
import{createAssessmentNativeCapture}from"./assessment-native-capture";
import{readAssessmentResearchSourceBytes}from"./capital-body-read-client";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.iso.datetime({offset:true});
const reference=z.strictObject({deliveryId:uuid,retainedPayloadId:uuid,payloadFingerprint:hash});
const prepared=z.strictObject({schemaVersion:z.literal("assessment-research-capture.v1"),snapshotId:uuid,status:z.enum(["abstained","succeeded"]),sources:z.array(reference).max(25)}).superRefine((r,c)=>{
 if((r.status==="abstained")!==(r.sources.length===0)||new Set(r.sources.map(s=>s.deliveryId)).size!==r.sources.length||new Set(r.sources.map(s=>s.retainedPayloadId)).size!==r.sources.length)c.addIssue({code:"custom",message:"assessment_research_capture_unresolved"});
});
const scopeSchema=z.strictObject({schemaVersion:z.literal("capital-public-storage-scope.v1"),state:z.literal("complete"),allocationId:uuid,retainedPayloadId:uuid,deliveryId:uuid,bucket:z.literal("capital-input-capture"),path:z.string(),payloadFingerprint:hash,byteLength:z.number().int().positive().max(1048576),storageObjectId:uuid,storageVersion:z.string().min(1),retainedAt:time,uploadExpiresAt:time,expiresAt:time,purgeAt:time});
export type AssessmentResearchSummary={status:"succeeded"|"abstained";sourceCount:number;topicCounts:Record<string,number>;researchRunId:null;costExposureUsd:0;sources:Array<{provider:string;topic:string;title:string;url:string;snippet:string;publishedAt:string|null}>};
export function createAssessmentNativeRuntime(client:SupabaseClient,now:()=>number=Date.now){return Object.freeze({
 forJob(job:CaseAnalysisJob){
  const authority={jobId:uuid.parse(job.job_id),capabilityToken:z.string().min(1).parse(job.capability_token)};
  const args={p_job_id:authority.jobId,p_capability_token:authority.capabilityToken};
  const rpc=async(name:string,extra:Record<string,unknown>={})=>{const result=await client.rpc(name,{...args,...extra});if(result.error)throw new Error("assessment_capture_denied");return result.data as unknown;};
  const capture=createAssessmentNativeCapture(authority,(name,params)=>rpc(name,params));
  return Object.freeze({...capture,
   async publicResearch():Promise<AssessmentResearchSummary>{
    const before=prepared.parse(await rpc("worker_prepare_assessment_research_v1"));
    const sources:AssessmentResearchSummary["sources"]=[],topicCounts:Record<string,number>={};
    for(const source of before.sources){
     const scope=scopeSchema.parse(await rpc("worker_read_assessment_research_source_v1",{p_snapshot_id:before.snapshotId,p_retained_payload_id:source.retainedPayloadId}));
     if(scope.retainedPayloadId!==source.retainedPayloadId||scope.deliveryId!==source.deliveryId||scope.payloadFingerprint!==source.payloadFingerprint||scope.path!==`${job.organization_id}/${scope.allocationId}/payload.json`||Date.parse(scope.retainedAt)>=Date.parse(scope.purgeAt)||Date.parse(scope.purgeAt)>=Date.parse(scope.expiresAt)||Date.parse(scope.purgeAt)<=now())throw new Error("assessment_research_source_denied");
     const physical=await readAssessmentResearchSourceBytes(client,authority,{snapshotId:before.snapshotId,retainedPayloadId:source.retainedPayloadId},scope);
     const payload=capitalPublicLicensedPayloadSchema.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(physical.bytes))as unknown);
     const topic=payload.topic??"public_context";topicCounts[topic]=(topicCounts[topic]??0)+1;
     sources.push({provider:payload.provider??"licensed_public_source",topic,title:payload.title,url:payload.url,snippet:payload.snippet??"",publishedAt:payload.publishedAt??null});
    }
    const after=prepared.parse(await rpc("worker_prepare_assessment_research_v1"));
    if(JSON.stringify(after)!==JSON.stringify(before))throw new Error("assessment_research_capture_changed");
    return{status:before.status,sourceCount:sources.length,topicCounts,researchRunId:null,costExposureUsd:0,sources};
   },
  });
 },
});}
export type AssessmentNativeRuntime=ReturnType<typeof createAssessmentNativeRuntime>;
