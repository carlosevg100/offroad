import type {ExecutionQueueClaim} from "./execution-queue";
/** Failure of the additive consumer never disables independent legacy work. */
export function createFairExecutionPoller<T>(legacy:()=>Promise<T|null>,execution:()=>Promise<ExecutionQueueClaim|null>,onExecutionFailure:()=>void){
 let executionFirst=true;
 const pinned=async()=>{try{const claim=await execution();return claim?{kind:"execution" as const,claim}:null;}catch{onExecutionFailure();return null;}};
 const old=async()=>{const job=await legacy();return job?{kind:"legacy" as const,job}:null;};
 return async()=>{const first=executionFirst;executionFirst=!executionFirst;return first?(await pinned()??await old()):(await old()??await pinned());};
}
