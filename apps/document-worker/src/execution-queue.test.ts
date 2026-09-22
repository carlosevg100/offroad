import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createExecutionQueue, type ExecutionQueueClaim} from "./execution-queue";
import {releasedMethodArtifacts} from "./released-methods.generated";

const claim: ExecutionQueueClaim = {claimed:true, jobId:"20000000-0000-4000-8000-000000000001", leaseId:"20000000-0000-4000-8000-000000000002", executionId:"20000000-0000-4000-8000-000000000003", capability:"x".repeat(64), attempt:1, contractText:"{}", contractFingerprint:"a".repeat(64), snapshotText:"{}", elapsedDurationMs:0, leaseExpiresAt:"2026-09-22T20:00:00Z", budgetExpired:false};
function transport(data:unknown, error:unknown=null) {
  const abortSignal=vi.fn(async (signal:AbortSignal)=>{expect(signal).toBeInstanceOf(AbortSignal);return {data,error};});
  const rpc=vi.fn(()=>({abortSignal}));
  return {queue:createExecutionQueue({rpc} as unknown as SupabaseClient,"synthetic-worker-token"),rpc};
}
describe("execution queue transport",()=>{
  it("claims only installed capital manifests and treats an empty queue as idle",async()=>{
    const t=transport({claimed:false});expect(await t.queue.claim()).toBeNull();
    expect(t.rpc).toHaveBeenCalledWith("worker_claim_execution_v1",{p_worker_token:"synthetic-worker-token",p_manifest_hashes:releasedMethodArtifacts.filter(r=>r.methodId==="prepare-capital-structure-decision").map(r=>r.manifestHash)});
  });
  it("rejects malformed and extended claim receipts",async()=>{
    for(const data of [{claimed:true},{...claim,capability:"short"},{...claim,authorityOverride:true}]) await expect(transport(data).queue.claim()).rejects.toThrow();
  });
  it("does not include remote diagnostic content in a transport failure",async()=>{
    await expect(transport(null,{message:"private borrower detail"}).queue.claim()).rejects.toThrow(/^execution_transport_failed$/);
  });
  it("lets the database select the operation identity and kernel",async()=>{
    const t=transport({operationId:claim.executionId,state:"reserved",replayed:false,mayExecute:true});await t.queue.reserve(claim);
    expect(t.rpc).toHaveBeenCalledWith("worker_reserve_execution_v1",{p_job:claim.jobId,p_lease:claim.leaseId,p_capability:claim.capability});
  });
  it("sends the exact result hash when settling",async()=>{
    const t=transport({settled:true,replayed:false});await t.queue.settle(claim,"b".repeat(64));
    expect(t.rpc).toHaveBeenCalledWith("worker_settle_execution_v1",{p_job:claim.jobId,p_lease:claim.leaseId,p_capability:claim.capability,p_result_hash:"b".repeat(64)});
  });
  it("refuses a terminal receipt with a different outcome",async()=>{
    await expect(transport({committed:true,replayed:false,outcome:"partial"}).queue.commit(claim,"b".repeat(64),"{}","succeeded","calculated")).rejects.toThrow("execution_commit_mismatch");
  });
});
