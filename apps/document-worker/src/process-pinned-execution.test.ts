import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {Worker} from "node:worker_threads";
import {describe,it,expect,vi} from "vitest";
import {executionCanonicalText,executionContractFingerprint,executionInputFingerprint} from "@offroad/agent-contracts";
import {loadReleasedExecutionProfile,loadReleasedReceivables} from "./released-method-executor";
import {diversifiedReceivablesCase} from "@offroad/receivables-analysis";
import {processPinnedExecution} from "./process-pinned-execution";
import {calculatePinnedCapital,awaitExecutionThread} from "./execution-calculation";
import type {ExecutionQueue,ExecutionQueueClaim,ExecutionRenewal} from "./execution-queue";
const identity={methodId:"prepare-capital-structure-decision",methodVersion:"2026.09.21-v4",manifestHash:"2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478"};
function fixture(methodIdentity=identity,snapshot:unknown={}){
 const {contract}=JSON.parse(readFileSync(new URL("../../../packages/agent-contracts/test-fixtures/execution-contract.json",import.meta.url),"utf8"));
 const profile=loadReleasedExecutionProfile(methodIdentity);
 contract.method=profile.method;contract.tools=profile.tools;contract.allowedEffects=profile.allowedEffects;
 contract.inputs.fingerprint=executionInputFingerprint(snapshot);contract.budget={...profile.limits,expiresAt:new Date(Date.now()+60000).toISOString()};contract.requestedAt=new Date().toISOString();
 const c:ExecutionQueueClaim={claimed:true,jobId:"20000000-0000-4000-8000-000000000001",leaseId:"20000000-0000-4000-8000-000000000002",capability:"x".repeat(64),attempt:1,executionId:contract.executionId,
 contractText:executionCanonicalText(contract),contractFingerprint:executionContractFingerprint(contract),snapshotText:executionCanonicalText(snapshot),elapsedDurationMs:0,leaseExpiresAt:new Date(Date.now()+60000).toISOString(),budgetExpired:false};
 const renewal:ExecutionRenewal={allowed:true,jobId:c.jobId,leaseId:c.leaseId,executionId:c.executionId,organizationId:contract.organizationId,workId:contract.workId,principalId:contract.principalId,
 processingRunId:contract.processingRunId,contractFingerprint:c.contractFingerprint,leaseExpiresAt:c.leaseExpiresAt,elapsedDurationMs:0,remainingDurationMs:31000};
 const q:ExecutionQueue={claim:vi.fn(async()=>c),renew:vi.fn(async()=>({...renewal})),reserve:vi.fn(async()=>({operationId:c.executionId,state:"reserved" as const,replayed:false,mayExecute:true})),settledResult:vi.fn(async()=>({available:false as const})),settle:vi.fn(async()=>{}),commit:vi.fn(async()=>{})};
 const calculate=vi.fn(async()=>({ok:true as const,text:'{"calculation":"synthetic"}'}));
 return {c,q,renewal,calculate,shutdown:new AbortController()};
}
describe("pinned execution consumer",()=>{
 it("uses the common contract and exact settlement bytes for the installed R01 adapter",async()=>{
  const input={currency:"BRL" as const,case:diversifiedReceivablesCase("common-envelope")};
  const f=fixture({methodId:"underwrite-receivables-pool",methodVersion:"2026.09.06-v1",manifestHash:"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090"},input);
  const expected=executionCanonicalText(loadReleasedReceivables().underwriteReceivablesPool(input));
  expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal)).toEqual({status:"succeeded"});
  expect(f.q.settle).toHaveBeenCalledWith(f.c,expected,"succeeded","calculated");
  expect(f.q.commit).toHaveBeenCalledWith(f.c,executionInputFingerprint(input),expected,"succeeded","calculated");
 });
 it("stops without settle or commit when the heartbeat transport reports withdrawn authority (simulated queue; the real denial is proved in execution_consumer.sql)",async()=>{
  const f=fixture({methodId:"underwrite-receivables-pool",methodVersion:"2026.09.06-v1",manifestHash:"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090"});
  vi.mocked(f.q.renew).mockResolvedValueOnce(f.renewal).mockRejectedValueOnce(Error("revoked"));
  await expect(processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).rejects.toThrow("revoked");
  expect(f.q.settle).not.toHaveBeenCalled();expect(f.q.commit).not.toHaveBeenCalled();
 });
 it("settles the exact calculated bytes before current-authority commit",async()=>{const f=fixture();expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).toEqual({status:"succeeded"});
 expect(f.q.settle).toHaveBeenCalledWith(f.c,'{"calculation":"synthetic"}',"succeeded","calculated");expect(f.q.commit).toHaveBeenCalledWith(f.c,executionInputFingerprint({}),'{"calculation":"synthetic"}',"succeeded","calculated");});
 it("refuses altered snapshot or claim before any calculation",async()=>{const f=fixture();f.c.snapshotText='{"changed":true}';await expect(processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).rejects.toThrow();expect(f.calculate).not.toHaveBeenCalled();expect(f.q.reserve).not.toHaveBeenCalled();});
 it("does not calculate after cumulative budget exhaustion",async()=>{const f=fixture();f.renewal.remainingDurationMs=0;expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).toEqual({status:"partial"});expect(f.calculate).not.toHaveBeenCalled();expect(f.q.commit).toHaveBeenLastCalledWith(f.c,executionInputFingerprint({}),'{"reason":"budget_exhausted","status":"partial"}',"partial","budget_exhausted");});
 it.each(["uncertain","settled"] as const)("does not repeat a %s logical operation after restart when no settled bytes exist",async(state)=>{const f=fixture();f.q.reserve=vi.fn(async()=>({operationId:f.c.executionId,state,replayed:true,mayExecute:false}));expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).toEqual({status:"partial"});expect(f.calculate).not.toHaveBeenCalled();expect(f.q.settle).not.toHaveBeenCalled();expect(f.q.commit).toHaveBeenLastCalledWith(f.c,executionInputFingerprint({}),'{"reason":"operation_uncertain","status":"partial"}',"partial","operation_uncertain");});
 it("publishes the bytes settled by an earlier lease without recomputing",async()=>{const f=fixture();const text='{"calculation":"synthetic"}';
  f.q.reserve=vi.fn(async()=>({operationId:f.c.executionId,state:"settled" as const,replayed:true,mayExecute:false}));
  f.q.settledResult=vi.fn(async()=>({available:true as const,resultText:text,resultHash:createHash("sha256").update(text).digest("hex"),outcome:"succeeded" as const,reason:"calculated" as const,settledByLease:"20000000-0000-4000-8000-000000000009"}));
  expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).toEqual({status:"succeeded"});
  expect(f.calculate).not.toHaveBeenCalled();expect(f.q.settle).not.toHaveBeenCalled();
  expect(f.q.commit).toHaveBeenCalledWith(f.c,executionInputFingerprint({}),text,"succeeded","calculated");});
 it("refuses settled bytes whose hash or canonical form does not match",async()=>{for(const settled of [
  {available:true as const,resultText:'{"calculation":"synthetic"}',resultHash:"c".repeat(64),outcome:"succeeded" as const,reason:"calculated" as const,settledByLease:"20000000-0000-4000-8000-000000000009"},
  {available:true as const,resultText:'{"z":1,"a":2}',resultHash:createHash("sha256").update('{"z":1,"a":2}').digest("hex"),outcome:"succeeded" as const,reason:"calculated" as const,settledByLease:"20000000-0000-4000-8000-000000000009"}]){
  const f=fixture();f.q.reserve=vi.fn(async()=>({operationId:f.c.executionId,state:"settled" as const,replayed:true,mayExecute:false}));f.q.settledResult=vi.fn(async()=>settled);
  await expect(processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).rejects.toThrow("execution_settled_bytes_mismatch");expect(f.q.commit).not.toHaveBeenCalled();}});
 it("republishes settled partial marker bytes with their settled outcome, never as success",async()=>{const f=fixture();const text='{"reason":"calculation_failed","status":"partial"}';
  f.q.reserve=vi.fn(async()=>({operationId:f.c.executionId,state:"settled" as const,replayed:true,mayExecute:false}));
  f.q.settledResult=vi.fn(async()=>({available:true as const,resultText:text,resultHash:createHash("sha256").update(text).digest("hex"),outcome:"partial" as const,reason:"calculation_failed" as const,settledByLease:"20000000-0000-4000-8000-000000000009"}));
  expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).toEqual({status:"partial"});
  expect(f.calculate).not.toHaveBeenCalled();expect(f.q.commit).toHaveBeenCalledWith(f.c,executionInputFingerprint({}),text,"partial","calculation_failed");});
 it("settles a failed kernel run as partial with its reason",async()=>{const f=fixture();const calculate=vi.fn(async()=>({ok:false as const,reason:"calculation_failed" as const}));
  expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,calculate)).toEqual({status:"partial"});
  expect(f.q.settle).toHaveBeenCalledWith(f.c,'{"reason":"calculation_failed","status":"partial"}',"partial","calculation_failed");
  expect(f.q.commit).toHaveBeenCalledWith(f.c,executionInputFingerprint({}),'{"reason":"calculation_failed","status":"partial"}',"partial","calculation_failed");});
 it("refuses authorization for another scope and a reset duration",async()=>{for(const override of [{leaseId:"20000000-0000-4000-8000-000000000099"},{elapsedDurationMs:0}]){const f=fixture();f.c.elapsedDurationMs=10;Object.assign(f.renewal,override);await expect(processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).rejects.toThrow();expect(f.calculate).not.toHaveBeenCalled();}});
 it("does not settle or commit when the simulated heartbeat fails between calculation and settlement",async()=>{const f=fixture();vi.mocked(f.q.renew).mockResolvedValueOnce(f.renewal).mockRejectedValueOnce(Error("denied"));await expect(processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).rejects.toThrow();expect(f.q.settle).not.toHaveBeenCalled();expect(f.q.commit).not.toHaveBeenCalled();});
 it("does not commit when the simulated heartbeat fails after settlement",async()=>{const f=fixture();vi.mocked(f.q.renew).mockResolvedValueOnce(f.renewal).mockResolvedValueOnce(f.renewal).mockRejectedValueOnce(Error("denied"));await expect(processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).rejects.toThrow();expect(f.q.settle).toHaveBeenCalledOnce();expect(f.q.commit).not.toHaveBeenCalled();});
 it("retains partial outcome when the duration expires during settlement",async()=>{const f=fixture();vi.mocked(f.q.renew).mockResolvedValueOnce(f.renewal).mockResolvedValueOnce(f.renewal).mockResolvedValueOnce({...f.renewal,remainingDurationMs:0});expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).toEqual({status:"partial"});expect(f.q.commit).toHaveBeenLastCalledWith(f.c,executionInputFingerprint({}),'{"reason":"budget_exhausted","status":"partial"}',"partial","budget_exhausted");});
 it("terminates busy CPU work on budget deadline and persists only partial",async()=>{const f=fixture();f.renewal.remainingDurationMs=30;const compute=async(_i:unknown,_t:string,signal:AbortSignal)=>{await awaitExecutionThread(()=>new Worker('while(true){}',{eval:true}),signal);return {ok:true as const,text:'{}'};};expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,compute)).toEqual({status:"partial"});expect(f.q.commit).toHaveBeenLastCalledWith(f.c,executionInputFingerprint({}),'{"reason":"budget_exhausted","status":"partial"}',"partial","budget_exhausted");});
 it("aborts an ongoing calculation when heartbeat is denied",async()=>{const f=fixture();vi.mocked(f.q.renew).mockResolvedValueOnce(f.renewal).mockRejectedValueOnce(Error("revoked"));let terminated=false;const compute=async(_i:unknown,_t:string,signal:AbortSignal)=>{try{await awaitExecutionThread(()=>new Worker('while(true){}',{eval:true}),signal);}finally{terminated=true;}return {ok:true as const,text:'{}'};};expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,compute)).toEqual({status:"aborted"});expect(terminated).toBe(true);expect(f.q.commit).not.toHaveBeenCalled();},7000);
 it("does not start a calculation during shutdown",async()=>{const f=fixture();f.shutdown.abort();expect(await processPinnedExecution(f.c,f.q,f.shutdown.signal,f.calculate)).toEqual({status:"aborted"});expect(f.calculate).not.toHaveBeenCalled();expect(f.q.commit).not.toHaveBeenCalled();});
 it("runs the real packaged schema in a credential-free child and denies invalid input",async()=>{expect(await calculatePinnedCapital(identity,'{}',new AbortController().signal)).toEqual({ok:false,reason:"invalid_input"});});
 it("awaits thread termination and refuses a previously aborted signal",async()=>{const a=new AbortController();a.abort();const create=vi.fn(()=>new Worker('while(true){}',{eval:true}));await expect(awaitExecutionThread(create,a.signal)).rejects.toThrow("execution_aborted");expect(create).not.toHaveBeenCalled();});
});
