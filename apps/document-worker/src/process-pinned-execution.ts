import {createHash} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {executionSerializationVersion,loadExecutionCanonicalText,executionContractSchema,executionCanonicalText} from "@offroad/agent-contracts";
import {bindProfiledExecution,assertCurrentExecutionAuthority} from "./pinned-execution";
import {loadReleasedExecutionProfile} from "./released-method-executor";
import {calculatePinnedMethod,type CalculationResult} from "./execution-calculation";
import type {ExecutionQueue,ExecutionQueueClaim,ExecutionOutcome,ExecutionReason,ExecutionRenewal} from "./execution-queue";
const digest=(text:string)=>createHash("sha256").update(text,"utf8").digest("hex");
const partial=(reason:ExecutionReason)=>executionCanonicalText({status:"partial",reason});

/** A failed authorization request aborts CPU work. Only the current SQL commit publishes. */
export async function processPinnedExecution(c:ExecutionQueueClaim,queue:ExecutionQueue,shutdown:AbortSignal,
 calculate:typeof calculatePinnedMethod=calculatePinnedMethod):Promise<{status:"succeeded"|"partial"|"aborted"}> {
 const contract=executionContractSchema.parse(loadExecutionCanonicalText(c.contractText,c.contractFingerprint,executionSerializationVersion));
 const snapshot=loadExecutionCanonicalText(c.snapshotText,contract.inputs.fingerprint,executionSerializationVersion);
 const profile=loadReleasedExecutionProfile(contract.method);
 const bound=bindProfiledExecution({claim:{jobId:c.jobId,leaseId:c.leaseId,executionId:c.executionId,organizationId:contract.organizationId,workId:contract.workId,
 principalId:contract.principalId,processingRunId:contract.processingRunId,contractFingerprint:c.contractFingerprint},contract,snapshot,profile,availableMethod:profile.method});
 const abort=new AbortController(),stop=new AbortController();
 let denied=false,exhausted=c.budgetExpired,deadline=Infinity,timer:ReturnType<typeof setTimeout>|undefined;
 const onShutdown=()=>abort.abort();shutdown.addEventListener("abort",onShutdown,{once:true});
 if(shutdown.aborted)abort.abort();
 const verify=(r:ExecutionRenewal,requestStarted:number)=>{
  const {elapsedDurationMs,remainingDurationMs,...authority}=r;
  assertCurrentExecutionAuthority(bound,authority,new Date());
  if(elapsedDurationMs<c.elapsedDurationMs)throw new Error("execution_duration_reset");
  // Subtract the entire transport time; never extend a previously observed deadline.
  const remaining=Math.max(0,remainingDurationMs-(performance.now()-requestStarted));
  deadline=Math.min(deadline,performance.now()+remaining,performance.now()+Math.max(0,Date.parse(r.leaseExpiresAt)-Date.now()-1000));
  if(timer)clearTimeout(timer);
  if(remaining===0 || deadline<=performance.now()){exhausted=true;abort.abort();}
  else timer=setTimeout(()=>{exhausted=true;abort.abort();},Math.max(0,deadline-performance.now()));
 };
 const renew=async()=>{const start=performance.now();verify(await queue.renew(c),start);};
 let heartbeat:Promise<void>|undefined;
 try {
  if(abort.signal.aborted)return {status:"aborted"};
  await renew();
  heartbeat=(async()=>{
   while(!stop.signal.aborted){
    try{await delay(3000,undefined,{signal:stop.signal});}catch{return;}
    if(stop.signal.aborted)return;
    try{await renew();}catch{denied=true;abort.abort();return;}
   }
  })();
  let resultText=partial("budget_exhausted"),reason:ExecutionReason="budget_exhausted",outcome:ExecutionOutcome="partial";
  let reserved=false;
  if(!exhausted){
   const receipt=await queue.reserve(c);
   if(receipt.mayExecute){
    if(!("operationId" in receipt) || receipt.operationId!==c.executionId || receipt.state!=="reserved" || receipt.replayed)throw new Error("execution_reservation_mismatch");
    reserved=true;
    let result:CalculationResult;
    try{result=await calculate(contract.method,c.snapshotText,abort.signal);}catch{
     if(denied || shutdown.aborted)return {status:"aborted"};
     result={ok:false,reason:"calculation_failed"};
    }
    if(result.ok){resultText=executionCanonicalText(JSON.parse(result.text));reason="calculated";outcome="succeeded";}
    else{reason=result.reason;resultText=partial(reason);}
   }else if(receipt.state==="settled"){
    // An earlier lease settled this operation with its exact bytes and outcome: publish them as settled, never recompute.
    const settled=await queue.settledResult(c);
    if(settled.available){
     const text=executionCanonicalText(JSON.parse(settled.resultText));
     if(text!==settled.resultText || digest(text)!==settled.resultHash)throw new Error("execution_settled_bytes_mismatch");
     resultText=text;outcome=settled.outcome;reason=settled.reason;
    }else{reason="operation_uncertain";resultText=partial(reason);}
   }else if(receipt.state!=="partial_budget_exhausted"){
    reason="operation_uncertain";resultText=partial(reason);
   }else exhausted=true;
  }
  stop.abort();await heartbeat;
  if(denied || shutdown.aborted)return {status:"aborted"};
  await renew();
  if(exhausted){reason="budget_exhausted";outcome="partial";resultText=partial(reason);}
  if(reserved)await queue.settle(c,resultText,outcome,reason);
  await renew();
  if(exhausted){reason="budget_exhausted";outcome="partial";resultText=partial(reason);}
  if(shutdown.aborted)return {status:"aborted"};
  await queue.commit(c,contract.inputs.fingerprint,resultText,outcome,reason);
  return {status:outcome};
 } finally {
  stop.abort();abort.abort();if(timer)clearTimeout(timer);
  shutdown.removeEventListener("abort",onShutdown);
  await heartbeat;
 }
}
