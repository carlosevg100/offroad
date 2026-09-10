type Spend={calls:number;costUsd:number;unknownCostCalls:number};
type Control={caseId:string;passed:boolean;providerCallRange:{start:number;end:number}};

/** Gold retains 18 attempts; unused attempts may be assigned only after gold has finished. */
export function documentWorkControlCallBudget(goldCalls:number):number {
 if(!Number.isSafeInteger(goldCalls)||goldCalls<0||goldCalls>18)throw new Error("document_work_invalid_gold_call_accounting");
 return 26-goldCalls;
}

export function summarizeDocumentWorkControls(controls:readonly Control[],gold:Spend,spent:Spend){
 let maxCalls:number|null=null;
 try{maxCalls=documentWorkControlCallBudget(gold.calls);}catch{}
 let cursor=0;
 const rangesValid=controls.every(control=>{
  const {start,end}=control.providerCallRange;
  const valid=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start===cursor&&end>=start;
  cursor=end;return valid;
 });
 const executedControls=controls.filter(control=>control.providerCallRange.end>control.providerCallRange.start).length;
 const totalCalls=gold.calls+spent.calls,totalCostUsd=gold.costUsd+spent.costUsd;
 return {passed:maxCalls!==null&&controls.length===8&&new Set(controls.map(control=>control.caseId)).size===8
  &&controls.every(control=>control.passed)&&executedControls===8&&rangesValid&&cursor===spent.calls
  &&Number.isSafeInteger(spent.calls)&&spent.calls>=8&&spent.calls<=maxCalls&&totalCalls<=26
  &&Number.isFinite(gold.costUsd)&&gold.costUsd>=0&&gold.costUsd<=2.5
  &&Number.isFinite(spent.costUsd)&&spent.costUsd>=0&&spent.costUsd<=.5&&totalCostUsd<=3
  &&gold.unknownCostCalls===0&&spent.unknownCostCalls===0,
  maxCalls,executedControls,totalCalls,totalCostUsd,notCalledControls:controls.filter(control=>control.providerCallRange.start===control.providerCallRange.end).map(control=>control.caseId)};
}

/** Keep budget non-execution distinct from a provider/validation rejection, without raw errors. */
export function documentWorkControlFailure(error:unknown,start:number,end:number):string {
 const code=error&&typeof error==="object"&&"code" in error?error.code:undefined;
 if(code==="budget_exceeded")return start===end?"not_called_budget":"attempted_budget_exhausted";
 if(code==="all_attempts_failed"||code==="invalid_output"||code==="output_truncated"||code==="timeout")return "provider_response_rejected";
 return "executor_or_provider_rejected";
}
