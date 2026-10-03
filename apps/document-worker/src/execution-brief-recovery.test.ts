import {describe,expect,it,vi} from "vitest";
import type {ModelGateway} from "@offroad/model-gateway";
import {recoverExecutionBriefProduct} from "./execution-brief-native";
import {processAgentOperationBriefJob} from "./agent-operation-brief";
import {processExecutionBriefProposalJob} from "./execution-brief-proposal";
import type {AgentOperationBriefJob,ExecutionBriefProposalJob,QueueClient} from "./queue";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const job={claimed:true,job_id:id(1),capability_token:"a".repeat(64),work_id:id(2),organization_id:id(3),intake_session_id:id(4),processing_run_id:id(5),
  kind:"agent_operation_brief",payload:{message_id:id(6),locale:"pt-BR"},attempt:2,lease_expires_at:"2026-10-02T17:00:00Z"} as AgentOperationBriefJob;
const product={schemaVersion:"execution-brief-native-product-receipt.v1",producerKind:"agent_operation_brief",captureId:id(7),producerJobId:job.job_id,
  requestId:job.payload.message_id,workId:job.work_id,executionBriefId:id(8),briefFingerprint:"b".repeat(64),planId:id(9),planFingerprint:"c".repeat(64),
  assistantMessageId:id(10),proposalId:null,activationJobId:id(11),dispatchId:id(12)};
const reply={schemaVersion:"execution-brief-product-recovery.v1",state:"committed",producerJobId:job.job_id,requestId:job.payload.message_id,captureId:product.captureId,product};
describe("native execution brief commit to ACK recovery",()=>{
  it("recovers the original IDs before agent loader, model, compiler or writer",async()=>{
    const complete=vi.fn(async()=>{}),loadAgentContext=vi.fn(),captureExecutionBriefInputs=vi.fn(),recordAgentResponse=vi.fn(),model=vi.fn();
    const queue={recoverExecutionBriefProduct:vi.fn(async()=>reply),complete,loadAgentContext,captureExecutionBriefInputs,recordAgentResponse} as unknown as QueueClient;
    expect(await processAgentOperationBriefJob(job,{queue,gateway:{complete:model} as unknown as ModelGateway,log:()=>{}})).toEqual({status:"succeeded"});
    expect(complete).toHaveBeenCalledExactlyOnceWith(job,{recovered:true,...product,modelCalls:0});
    for(const f of [loadAgentContext,captureExecutionBriefInputs,recordAgentResponse,model])expect(f).not.toHaveBeenCalled();
  });
  it("rejects crossed work, producer, request or product IDs before returning any recovery",async()=>{
    for(const patch of [{workId:id(20)},{producerJobId:id(20)},{requestId:id(20)},{captureId:id(20)},{assistantMessageId:null}])
      await expect(recoverExecutionBriefProduct({recoverExecutionBriefProduct:async()=>({...reply,product:{...product,...patch}})},job,job.payload.message_id,"agent_operation_brief"))
        .rejects.toThrow("execution_brief_recovery_scope_mismatch");
  });
  it("never compiles an unresolved capture or retries a denied recovery as new authorship",async()=>{
    const capture=vi.fn();
    await expect(recoverExecutionBriefProduct({captureExecutionBriefInputs:capture,recoverExecutionBriefProduct:async()=>({...reply,state:"unresolved",product:null})},job,job.payload.message_id,"agent_operation_brief"))
      .rejects.toThrow("execution_brief_capture_unresolved");
    await expect(recoverExecutionBriefProduct({captureExecutionBriefInputs:capture,recoverExecutionBriefProduct:async()=>{throw new Error("source_revoked");}},job,job.payload.message_id,"agent_operation_brief"))
      .rejects.toThrow("source_revoked");expect(capture).not.toHaveBeenCalled();
  });
  it("recovers proposal identity without running its compiler or writing a second product",async()=>{
    const p={...product,producerKind:"execution_brief_proposal",requestId:job.job_id,assistantMessageId:null};
    const proposalJob={...job,kind:"execution_brief_proposal",payload:{approval_target_job_id:id(11),locale:"pt-BR"}} as ExecutionBriefProposalJob;
    const loadExecutionBriefProposal=vi.fn(),recordExecutionBriefProposal=vi.fn();
    const queue={recoverExecutionBriefProduct:async()=>({...reply,requestId:job.job_id,product:p}),loadExecutionBriefProposal,recordExecutionBriefProposal,fail:vi.fn()};
    expect(await processExecutionBriefProposalJob(proposalJob,queue)).toEqual({status:"proposed"});
    expect(loadExecutionBriefProposal).not.toHaveBeenCalled();expect(recordExecutionBriefProposal).not.toHaveBeenCalled();expect(queue.fail).not.toHaveBeenCalled();
  });
});
