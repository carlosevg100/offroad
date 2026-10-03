/** Unit orchestration tests. These ports do not claim SQL or Storage execution. */
import {describe,it,expect,vi} from "vitest";
import type {ModelGateway} from "@offroad/model-gateway";
import type {QueueClient} from "./queue";
const native=vi.hoisted(()=>({consume:vi.fn(),revision:vi.fn()}));
vi.mock("./capital-s11-native-consumer",()=>({consumeCapitalS11Initial:native.consume,consumeCapitalS11Revision:native.revision}));
import {processCapitalPlanningJob} from "./capital-planning";
import {job} from "./capital-planning.test-support";
const receipt={schemaVersion:"capital-s11-commit-receipt.v1",recipeId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",producerTaskRunId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",taskRunId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",capitalArtifactId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",revisionId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",finalFingerprint:"a".repeat(64),artifactFingerprint:"b".repeat(64),artifactVersion:1,replayed:true,finalRetainedPayloadId:"ffffffff-ffff-4fff-8fff-ffffffffffff"};
function fixture(){
 native.consume.mockReset();native.consume.mockResolvedValue({...receipt,replayed:false});native.revision.mockReset();native.revision.mockResolvedValue({...receipt,replayed:false});
 const recovery=vi.fn().mockResolvedValue(receipt),adapter=vi.fn().mockReturnValue({});
 const queue={writeStage:vi.fn().mockResolvedValue(undefined),fail:vi.fn().mockResolvedValue(undefined),complete:vi.fn().mockResolvedValue(undefined),completeAdvisorSpecializedJob:vi.fn().mockResolvedValue(undefined),
  createCapitalS11RecoveryAdapter:vi.fn(()=>({recover:recovery})),createCapitalS11Adapter:adapter,
  loadCapitalProjectContext:vi.fn(()=>{throw new Error("legacy loader must not run");}),recordCapitalProjectArtifact:vi.fn(),recordPublicResearch:vi.fn(),recordAgentAssessment:vi.fn()};
 const complete=vi.fn(()=>{throw new Error("legacy model must not run");});
 const deps={queue:queue as unknown as QueueClient,gateway:{complete,spent:()=>({})} as unknown as ModelGateway,lineage:()=>[],researchProviders:[],s11Runtime:{adapters:{},connections:{},maxCostUsd:.95,maxCalls:2,researchReserveUsd:.3},monotonicNow:()=>20};
 return{queue,recovery,adapter,deps,complete};
}
describe("native S11 worker entry",()=>{
 it("recovers before current context or research, then completes by exact native artifact references",async()=>{
  const f=fixture();const result=await processCapitalPlanningJob(job,f.deps);
  expect(result).toEqual({status:"succeeded",artifactId:receipt.capitalArtifactId});
  expect(native.consume).not.toHaveBeenCalled();expect(f.adapter).not.toHaveBeenCalled();expect(f.queue.loadCapitalProjectContext).not.toHaveBeenCalled();expect(f.complete).not.toHaveBeenCalled();
  expect(f.queue.complete).toHaveBeenCalledWith(job,expect.objectContaining({recipe_id:receipt.recipeId,revision_id:receipt.revisionId,artifact_fingerprint:receipt.artifactFingerprint,replayed:true}));
  expect(f.queue.recordPublicResearch).not.toHaveBeenCalled();expect(f.queue.recordAgentAssessment).not.toHaveBeenCalled();expect(f.queue.recordCapitalProjectArtifact).not.toHaveBeenCalled();
 });
 it("uses initial native factory only after an authoritative no-recovery result",async()=>{
  const f=fixture();f.recovery.mockResolvedValue(null);expect((await processCapitalPlanningJob(job,f.deps)).status).toBe("succeeded");
  expect(native.consume).toHaveBeenCalledWith(job,expect.objectContaining({budget:f.deps.s11Runtime,adapters:{},connections:{}}));
  expect(f.queue.loadCapitalProjectContext).not.toHaveBeenCalled();expect(f.complete).not.toHaveBeenCalled();
 });
 it("does not turn revoked or missing physical recovery into a fresh paid run",async()=>{
  const f=fixture();f.recovery.mockRejectedValue(Object.assign(new Error("gap"),{code:"capital_s11_retained_recovery_required"}));
  expect((await processCapitalPlanningJob(job,f.deps)).status).toBe("failed");expect(f.adapter).not.toHaveBeenCalled();expect(native.consume).not.toHaveBeenCalled();expect(f.queue.complete).not.toHaveBeenCalled();expect(f.queue.fail).toHaveBeenCalled();
 });
 it("fails closed when a native runtime has no recovery factory",async()=>{
  const f=fixture();delete (f.deps.queue as Partial<QueueClient>).createCapitalS11RecoveryAdapter;
  expect((await processCapitalPlanningJob(job,f.deps)).status).toBe("failed");expect(f.queue.loadCapitalProjectContext).not.toHaveBeenCalled();expect(native.consume).not.toHaveBeenCalled();
 });
 it("selects closed human revision only after recovery-none and exposes no research callback",async()=>{
  const f=fixture();f.recovery.mockResolvedValue(null);
  const corrected={...job,payload:{...job.payload,capital_task_ids:["M04","S11"],revision_of_artifact_id:receipt.capitalArtifactId,correction_decision_id:receipt.taskRunId,revision_review_id:receipt.recipeId,revision_of_native_revision_id:receipt.revisionId}};
  expect((await processCapitalPlanningJob(corrected,f.deps)).status).toBe("succeeded");
  expect(native.consume).not.toHaveBeenCalled();expect(native.revision).toHaveBeenCalledOnce();
  const input=native.revision.mock.calls[0]![1];expect(input).not.toHaveProperty("research");expect(input).not.toHaveProperty("queue");
  expect(f.queue.loadCapitalProjectContext).not.toHaveBeenCalled();expect(f.complete).not.toHaveBeenCalled();
 });
 it("recovers a revised native result before any human-input read, model or search",async()=>{
  const f=fixture();const corrected={...job,payload:{...job.payload,capital_task_ids:["M04","S11"],revision_of_artifact_id:receipt.capitalArtifactId,correction_decision_id:receipt.taskRunId,revision_review_id:receipt.recipeId,revision_of_native_revision_id:receipt.revisionId}};
  expect((await processCapitalPlanningJob(corrected,f.deps)).status).toBe("succeeded");expect(native.revision).not.toHaveBeenCalled();expect(native.consume).not.toHaveBeenCalled();expect(f.adapter).not.toHaveBeenCalled();
 });

});
