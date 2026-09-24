import type {ExecutionQueueClaim} from "./execution-queue";
import type {EvaluationQueueClaim} from "./evaluation-queue";

export type FairPollChoice<T> =
 | {kind: "execution"; claim: ExecutionQueueClaim}
 | {kind: "legacy"; job: T}
 | {kind: "evaluation"; claim: EvaluationQueueClaim};

/**
 * Failure of an additive consumer never disables independent legacy work. Each poll starts from
 * the next queue in turn and falls through the others, so no kind starves another and at most one
 * job is claimed per poll. A failing pinned or evaluation claim counts as empty; legacy failures
 * still reach the caller.
 */
export function createFairExecutionPoller<T>(legacy: () => Promise<T | null>, execution: () => Promise<ExecutionQueueClaim | null>, onExecutionFailure: () => void,
 evaluation?: {claim: () => Promise<EvaluationQueueClaim | null>; onFailure: () => void}) {
 const pinned = async (): Promise<FairPollChoice<T> | null> => {try{const claim=await execution();return claim?{kind:"execution",claim}:null;}catch{onExecutionFailure();return null;}};
 const old = async (): Promise<FairPollChoice<T> | null> => {const job=await legacy();return job?{kind:"legacy",job}:null;};
 const sources = [pinned, old];
 if (evaluation) sources.push(async () => {try{const claim=await evaluation.claim();return claim?{kind:"evaluation",claim}:null;}catch{evaluation.onFailure();return null;}});
 let next = 0;
 return async (): Promise<FairPollChoice<T> | null> => {
  const first = next;
  next = (next + 1) % sources.length;
  for (let offset = 0; offset < sources.length; offset++) {
   const choice = await sources[(first + offset) % sources.length]!();
   if (choice) return choice;
  }
  return null;
 };
}
