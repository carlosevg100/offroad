import type {SupabaseClient} from "@supabase/supabase-js";
import {jobFailureRecordSchema} from "./job-failure";
import {processAgentOperationBriefJob} from "./agent-operation-brief";
import type {QueueClient} from "./queue";
import type {ModelGateway} from "@offroad/model-gateway";
import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
import {institutionalModelRuntimeContextSchema,renderApprovedInstitutionalFinancialWorkbook} from "@offroad/financial-model";
import {processInstitutionalModelResult,processInstitutionalModelSetup} from "./institutional-model-runtime";
import {createQueueClient,InstitutionalCaptureRetryError,agentOperationBriefJobSchema} from "./queue";
const id="90000000-0000-4000-8000-000000000881";
const job=agentOperationBriefJobSchema.parse({claimed:true,job_id:"80000000-0000-4000-8000-000000000881",capability_token:"x".repeat(64),lease_expires_at:"2026-09-10T04:10:00Z",attempt:1,kind:"agent_operation_brief",organization_id:"20000000-0000-4000-8000-000000000881",intake_session_id:"40000000-0000-4000-8000-000000000881",processing_run_id:"70000000-0000-4000-8000-000000000881",payload:{message_id:id,locale:"en-US"}});
function fixture(){
 const sql=readFileSync(new URL("../../../supabase/tests/support/institutional_setup_fixture.sql",import.meta.url),"utf8");const data=(name:string)=>JSON.parse(sql.match(new RegExp(`set_config\\('test.setup_${name}', '([^\\n]+)', true\\);`))![1]!.replaceAll("''","'"));const candidate=data("candidate");
 const facts=data("facts") as {accepted:Record<string,unknown>}[];
 const context=institutionalModelRuntimeContextSchema.parse({projectId:"30000000-0000-4000-8000-000000000881",sourceManifestFingerprint:"a".repeat(64),currentSources:data("sources").map((s:Record<string,unknown>)=>({...s,hashVerified:true})),candidates:facts.map(({accepted:a},i)=>({id:String(i),field_path:a.fieldPath,normalized_value:a.normalizedValue,value_type:a.valueType,source_document_id:a.sourceDocument,evidence_rank:a.evidenceRank,information_class:a.informationClass,confidence:a.confidence,anchor_verified:a.anchorVerified,entity_name:a.entityName,entity_scope:a.entityScope,period_start:a.periodStart,period_end:a.periodEnd,source_anchor:a.anchor,review_state:"accepted"})),approvedConfigurations:[{id:"60000000-0000-4000-8000-000000000881",revision:1,fingerprint:candidate.configurationFingerprint,configuration:candidate.configuration,reviewedBy:candidate.submission.actorId,reviewedAt:candidate.submission.submittedAt,sourceBindings:candidate.sourceBindings}],reviewedSources:candidate.sourceBindings,pendingSetup:null,modelResultRequest:{id,configurationId:"60000000-0000-4000-8000-000000000881",configurationFingerprint:candidate.configurationFingerprint,sourceManifestFingerprint:"a".repeat(64),status:"queued",artifact:null,blockers:[]}});
 return {context:{...context,inputSnapshot:{id:"95000000-0000-4000-8000-000000000881",fingerprint:"c".repeat(64)}},candidate,configuration:data("configuration"),artifact:data("artifact")};
}
describe("real institutional setup and result worker adapter",()=>{
 it("persists a review proposal from source-bound fact rows without automatic approval",async()=>{const f=fixture();f.context.pendingSetup={submissionId:id,configuration:f.configuration,sourceReviews:f.candidate.sourceBindings,submittedBy:f.candidate.submission.actorId,submittedAt:f.candidate.submission.submittedAt,sourceManifestFingerprint:f.context.sourceManifestFingerprint};const save=vi.fn(async()=>({candidateId:"60000000-0000-4000-8000-000000000881",revision:1,replayed:false}));const result=await processInstitutionalModelSetup({job,locale:"en-US",queue:{loadInstitutionalModelContext:async()=>({...f.context,setupInputSnapshot:{id:"95000000-0000-4000-8000-000000000881",fingerprint:"a".repeat(64)}}),recordInitialInstitutionalConfigurationCandidate:save}});expect(result.status).toBe("review_required");expect(save.mock.calls).toHaveLength(1);});
 it("calculates and stores actual reproducible workbook bytes with no model gateway dependency",async()=>{const f=fixture();let saved:unknown;const result=await processInstitutionalModelResult({job,queue:{loadInstitutionalModelContext:async()=>f.context,recordInstitutionalModelResult:async (_job,value)=>{saved=value;if(value.status==="completed")expect(await renderApprovedInstitutionalFinancialWorkbook(value.artifact,"en")).not.toBeNull();return {id,status:"completed",replayed:false};}}});expect(result.status).toBe("completed");expect(saved).toEqual(expect.objectContaining({inputSnapshot:f.context.inputSnapshot}));});
 it("routes the persisted refresh before the generic advisor and makes zero model calls",async()=>{
  const f=fixture();const gateway={complete:vi.fn(async()=>{throw new Error("No model call authorized");}),spent:()=>({costUsd:0,calls:0})} as unknown as ModelGateway;
  const queue={loadAgentContext:async()=>({session_id:job.intake_session_id,message_id:id,locale:"en-US",message:"Calculate the approved model.",message_metadata:{kind:"institutional_model_refresh"},brief:{},snapshot_fingerprint:"a".repeat(64),projection_updated_at:"2026-09-10T04:00:00Z",manifest_id:null,company_profile:{},documents:[],tasks:[],artifacts:[],recent_messages:[]}),loadInstitutionalModelContext:async()=>f.context,recordInstitutionalModelResult:vi.fn(async()=>({id,status:"completed",replayed:false})),writeStage:vi.fn(async()=>{}),recordAgentResponse:vi.fn(async()=>({})),complete:vi.fn(async()=>{}),recordAgentFailure:vi.fn(async()=>{}),fail:vi.fn(async()=>{})} as unknown as QueueClient;
  expect(await processAgentOperationBriefJob(job,{queue,gateway,log:()=>{},shadowRouting:false})).toEqual({status:"succeeded"});
  expect(gateway.complete).not.toHaveBeenCalled();expect(queue.recordInstitutionalModelResult).toHaveBeenCalledOnce();expect(queue.complete).toHaveBeenCalledWith(job,expect.objectContaining({mode:"institutional_model_refresh",state:"completed",modelCalls:0}));
 });
 it("records a blocker for changed sources instead of reusing approved economics",async()=>{const f=fixture();f.context.sourceManifestFingerprint="b".repeat(64);const save=vi.fn(async(_job:unknown,payload:unknown)=>({id,status:"blocked",replayed:false,payload}));await processInstitutionalModelResult({job,queue:{loadInstitutionalModelContext:async()=>f.context,recordInstitutionalModelResult:save}});expect(save).toHaveBeenCalledWith(job,{status:"blocked",inputSnapshot:f.context.inputSnapshot,blockers:["institutional_result_approval_or_sources_changed"]});});
 it("recomputes a result the dependency graph scheduled through the same job, with no message and no model call",async()=>{
  const f=fixture();const gateway={complete:vi.fn(async()=>{throw new Error("No model call authorized");}),spent:()=>({costUsd:0,calls:0})} as unknown as ModelGateway;
  const recompute=agentOperationBriefJobSchema.parse({...job,payload:{...job.payload,surface:"dependency_recompute",institutional_recompute_candidate_id:"95000000-0000-4000-8000-000000000881"}});
  expect(recompute.payload).toEqual({message_id:id,locale:job.payload.locale,institutional_recompute_candidate_id:"95000000-0000-4000-8000-000000000881"});
  const queue={loadAgentContext:vi.fn(async()=>{throw new Error("a recompute has no conversation");}),loadInstitutionalModelContext:vi.fn(async()=>f.context),
   recordInstitutionalModelResult:vi.fn(async()=>({id,status:"completed",replayed:false})),writeStage:vi.fn(async()=>{}),recordAgentResponse:vi.fn(async()=>({})),
   complete:vi.fn(async()=>{}),recordAgentFailure:vi.fn(async()=>{}),fail:vi.fn(async()=>{})} as unknown as QueueClient;
  expect(await processAgentOperationBriefJob(recompute,{queue,gateway,log:()=>{},shadowRouting:false})).toEqual({status:"succeeded"});
  expect(queue.loadAgentContext).not.toHaveBeenCalled();expect(queue.recordAgentResponse).not.toHaveBeenCalled();expect(queue.recordAgentFailure).not.toHaveBeenCalled();
  expect(gateway.complete).not.toHaveBeenCalled();expect(queue.recordInstitutionalModelResult).toHaveBeenCalledOnce();
  expect(queue.recordInstitutionalModelResult).toHaveBeenCalledWith(recompute,expect.objectContaining({status:"completed"}));
  expect(queue.writeStage).toHaveBeenNthCalledWith(1,recompute,"institutional_model_recompute","started",{resultId:id,candidateId:"95000000-0000-4000-8000-000000000881"});
  expect(queue.writeStage).toHaveBeenNthCalledWith(2,recompute,"institutional_model_recompute","succeeded",expect.objectContaining({resultId:id,state:"completed",modelCalls:0}));
  expect(queue.complete).toHaveBeenCalledWith(recompute,{mode:"institutional_model_recompute",resultId:id,candidateId:"95000000-0000-4000-8000-000000000881",state:"completed",modelCalls:0});
 });
 it("fails a recompute job without answering a message when its result cannot be recorded",async()=>{
  const f=fixture();const gateway={complete:vi.fn(),spent:()=>({costUsd:0,calls:0})} as unknown as ModelGateway;
  const recompute=agentOperationBriefJobSchema.parse({...job,payload:{...job.payload,institutional_recompute_candidate_id:"95000000-0000-4000-8000-000000000882"}});
  const queue={loadAgentContext:vi.fn(),loadInstitutionalModelContext:vi.fn(async()=>f.context),
   recordInstitutionalModelResult:vi.fn(async()=>{throw new Error("institutional_result_stale_or_invalid");}),writeStage:vi.fn(async()=>{}),recordAgentResponse:vi.fn(),
   complete:vi.fn(),recordAgentFailure:vi.fn(),fail:vi.fn(async()=>{})} as unknown as QueueClient;
  const log=vi.fn();
  expect(await processAgentOperationBriefJob(recompute,{queue,gateway,log,shadowRouting:false})).toEqual({status:"failed"});
  expect(queue.fail).toHaveBeenCalledWith(recompute,expect.objectContaining({code:"institutional_recompute_failed",stage:"institutional_model_recompute"}),{retryable:false});
  expect(queue.complete).not.toHaveBeenCalled();expect(queue.recordAgentFailure).not.toHaveBeenCalled();expect(queue.loadAgentContext).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith("institutional_model_recompute.failed",expect.objectContaining({job:recompute.job_id}));
  expect(agentOperationBriefJobSchema.safeParse({...job,payload:{...job.payload,institutional_recompute_candidate_id:"not-a-candidate"}}).success).toBe(false);
 });
 it("replays completed requests without replacing their immutable output",async()=>{const f=fixture();f.context.modelResultRequest!.status="completed";f.context.modelResultRequest!.artifact=f.artifact;const save=vi.fn();expect(await processInstitutionalModelResult({job,queue:{loadInstitutionalModelContext:async()=>f.context,recordInstitutionalModelResult:save}})).toEqual({id,status:"completed",replayed:true});expect(save).not.toHaveBeenCalled();});
});

describe("institutional snapshot transport",()=>{
 it.each([undefined,null,{id:"not-uuid",fingerprint:"c".repeat(64)},{id:"95000000-0000-4000-8000-000000000881",fingerprint:"x"},{id:"95000000-0000-4000-8000-000000000881",fingerprint:"c".repeat(64),extra:true}])("rejects a queued result with a missing or malformed pin: %j",async(inputSnapshot)=>{
  const f=fixture();const save=vi.fn();
  await expect(processInstitutionalModelResult({job,queue:{loadInstitutionalModelContext:async()=>({...f.context,inputSnapshot}),recordInstitutionalModelResult:save}})).rejects.toThrow();
  expect(save).not.toHaveBeenCalled();
 });
 it("replays an already completed legacy request without inventing a snapshot",async()=>{
  const f=fixture();f.context.modelResultRequest!.status="completed";f.context.modelResultRequest!.artifact=f.artifact;const save=vi.fn();
  expect(await processInstitutionalModelResult({job,queue:{loadInstitutionalModelContext:async()=>({...f.context,inputSnapshot:undefined}),recordInstitutionalModelResult:save}})).toEqual({id,status:"completed",replayed:true});
  expect(save).not.toHaveBeenCalled();
 });
});

describe("institutional contention requeue",()=>{
 it.each([false,true])("requeues capture contention without reporting a terminal conversation error (recompute=%s)",async(recompute)=>{
  const activeJob=recompute?agentOperationBriefJobSchema.parse({...job,payload:{...job.payload,institutional_recompute_candidate_id:"95000000-0000-4000-8000-000000000883"}}):job;
  const queue={loadAgentContext:vi.fn(async()=>({session_id:job.intake_session_id,message_id:id,locale:"en-US",message:"Calculate the approved model.",message_metadata:{kind:"institutional_model_refresh"},brief:{},snapshot_fingerprint:"a".repeat(64),projection_updated_at:"2026-09-10T04:00:00Z",manifest_id:null,company_profile:{},documents:[],tasks:[],artifacts:[],recent_messages:[]})),loadInstitutionalModelContext:vi.fn(async()=>{throw new InstitutionalCaptureRetryError();}),recordInstitutionalModelResult:vi.fn(),writeStage:vi.fn(),recordAgentResponse:vi.fn(),recordAgentFailure:vi.fn(),fail:vi.fn(async(_job,error)=>{jobFailureRecordSchema.parse(error);}),complete:vi.fn()} as unknown as QueueClient;
  const gateway={complete:vi.fn(),spent:()=>({costUsd:0,calls:0})} as unknown as ModelGateway;
  expect(await processAgentOperationBriefJob(activeJob,{queue,gateway,log:()=>{},shadowRouting:false})).toEqual({status:"failed"});
  expect(queue.fail).toHaveBeenCalledWith(activeJob,expect.objectContaining({code:"institutional_capture_retry",stage:recompute?"institutional_model_recompute":"institutional_model_refresh",retryable:true,cause:expect.objectContaining({name:"InstitutionalCaptureRetryError",message:"institutional_capture_retry"})}),{retryable:true,retryInSeconds:2});
  expect(queue.recordAgentFailure).not.toHaveBeenCalled();expect(queue.recordAgentResponse).not.toHaveBeenCalled();expect(queue.complete).not.toHaveBeenCalled();expect(gateway.complete).not.toHaveBeenCalled();
 });
});

describe("prospective setup capture",()=>{
 it.each([undefined,null,{id:"bad",fingerprint:"a".repeat(64)},{id:"95000000-0000-4000-8000-000000000881",fingerprint:"bad"},{id:"95000000-0000-4000-8000-000000000881",fingerprint:"a".repeat(64),extra:true}])("rejects absent or malformed setup pin: %j",async(setupInputSnapshot)=>{
  const f=fixture();const save=vi.fn();
  await expect(processInstitutionalModelSetup({job,locale:"en-US",queue:{loadInstitutionalModelContext:async()=>({...f.context,setupInputSnapshot}),recordInitialInstitutionalConfigurationCandidate:save}})).rejects.toThrow();
  expect(save).not.toHaveBeenCalled();
 });
 it("passes the exact setup pin with the real candidate",async()=>{
  const f=fixture();const pin={id:"95000000-0000-4000-8000-000000000881",fingerprint:"a".repeat(64)};
  f.context.pendingSetup={submissionId:id,configuration:f.configuration,sourceReviews:f.candidate.sourceBindings,submittedBy:f.candidate.submission.actorId,submittedAt:f.candidate.submission.submittedAt,sourceManifestFingerprint:f.context.sourceManifestFingerprint};
  const save=vi.fn(async()=>({candidateId:"60000000-0000-4000-8000-000000000881",revision:1,replayed:false}));
  await processInstitutionalModelSetup({job,locale:"en-US",queue:{loadInstitutionalModelContext:async()=>({...f.context,setupInputSnapshot:pin}),recordInitialInstitutionalConfigurationCandidate:save}});
  expect(save).toHaveBeenCalledWith(job,expect.objectContaining({submissionId:id,inputSnapshot:pin,candidate:expect.objectContaining({status:"review_required",willExecute:false})}));
 });
 it("replays a completed legacy setup without computing or manufacturing capture",async()=>{
  const save=vi.fn();const replay={submissionId:id,status:"review_required",candidateId:"60000000-0000-4000-8000-000000000881",revision:1,informationRequestBasis:null};
  expect(await processInstitutionalModelSetup({job,locale:"en-US",queue:{loadInstitutionalModelContext:async()=>({setupReplay:replay}),recordInitialInstitutionalConfigurationCandidate:save}})).toEqual({status:"review_required",candidateId:replay.candidateId,revision:1,replayed:true});
  expect(save).not.toHaveBeenCalled();
 });
 it("resumes missing-input questions from the recorded minimal basis without a new assessment",async()=>{
  const save=vi.fn();const sync=vi.fn(async()=>({openCount:1}));
  const replay={submissionId:id,status:"missing_inputs",candidateId:null,revision:null,informationRequestBasis:{configurationFingerprint:"a".repeat(64),missingInputs:[{targetPath:"openingBalanceSheet.cash",code:"fact_missing"}]}};
  await processInstitutionalModelSetup({job,locale:"en-US",queue:{loadInstitutionalModelContext:async()=>({setupReplay:replay}),recordInitialInstitutionalConfigurationCandidate:save,syncInstitutionalInformationRequests:sync}});
  expect(sync).toHaveBeenCalledWith(job,{requests:[expect.objectContaining({answerBinding:expect.objectContaining({expectedConfigurationFingerprint:"a".repeat(64)})})]});
  expect(save).not.toHaveBeenCalled();
 });
 it("rejects replay for another submission",async()=>{
  const save=vi.fn();
  await expect(processInstitutionalModelSetup({job,locale:"en-US",queue:{loadInstitutionalModelContext:async()=>({setupReplay:{submissionId:"90000000-0000-4000-8000-000000000999",status:"calculation_blocked",candidateId:null,revision:null,informationRequestBasis:null}}),recordInitialInstitutionalConfigurationCandidate:save}})).rejects.toThrow("institutional_setup_replay_unbound");
  expect(save).not.toHaveBeenCalled();
 });
});


describe("current writer contention reaches institutional handlers",()=>{
 it.each([false,true])("requeues a bounded v3 result-write abort without terminal reply or redispatch (recompute=%s)",async(recompute)=>{
  const activeJob=recompute?agentOperationBriefJobSchema.parse({...job,payload:{...job.payload,institutional_recompute_candidate_id:"95000000-0000-4000-8000-000000000883"}}):job;
  const f=fixture();const rpc=vi.fn(async()=>({data:null,error:{code:"40001",message:"institutional_capture_retry"}}));
  const realQueue=createQueueClient({rpc} as unknown as SupabaseClient,{workerToken:"worker",leaseSeconds:60});
  const queue={loadAgentContext:vi.fn(async()=>({session_id:job.intake_session_id,message_id:id,locale:"en-US",message:"Calculate the approved model.",message_metadata:{kind:"institutional_model_refresh"},brief:{},snapshot_fingerprint:"a".repeat(64),projection_updated_at:"2026-09-10T04:00:00Z",manifest_id:null,company_profile:{},documents:[],tasks:[],artifacts:[],recent_messages:[]})),loadInstitutionalModelContext:vi.fn(async()=>f.context),recordInstitutionalModelResult:realQueue.recordInstitutionalModelResult,writeStage:vi.fn(),recordAgentResponse:vi.fn(),recordAgentFailure:vi.fn(),fail:vi.fn(async(_job,error)=>{jobFailureRecordSchema.parse(error);}),complete:vi.fn()} as unknown as QueueClient;
  const gateway={complete:vi.fn(),spent:()=>({costUsd:0,calls:0})} as unknown as ModelGateway;const log=vi.fn();
  expect(await processAgentOperationBriefJob(activeJob,{queue,gateway,log,shadowRouting:false})).toEqual({status:"failed"});
  expect(rpc).toHaveBeenCalledTimes(3);expect(rpc).toHaveBeenCalledWith("worker_record_institutional_model_result_v3",expect.objectContaining({p_job_id:activeJob.job_id,p_capability_token:activeJob.capability_token,p_result:expect.objectContaining({inputSnapshot:f.context.inputSnapshot})}));
  expect(queue.fail).toHaveBeenCalledWith(activeJob,expect.objectContaining({code:"institutional_capture_retry",stage:recompute?"institutional_model_recompute":"institutional_model_refresh",retryable:true,cause:expect.objectContaining({name:"InstitutionalCaptureRetryError",message:"institutional_capture_retry"})}),{retryable:true,retryInSeconds:2});
  expect(queue.recordAgentFailure).not.toHaveBeenCalled();expect(queue.recordAgentResponse).not.toHaveBeenCalled();expect(queue.complete).not.toHaveBeenCalled();expect(gateway.complete).not.toHaveBeenCalled();expect(log).not.toHaveBeenCalledWith("institutional_model_recompute.failed",expect.anything());
 });
});
