import {Worker} from "node:worker_threads";
import {fileURLToPath} from "node:url";
import {z} from "zod";
import {executionCanonicalText,executionInputFingerprint} from "@offroad/agent-contracts";
import {awaitExecutionThread} from "./execution-calculation";
import {releasedPreparerArtifact} from "./released-preparer";
import {releasedMethodArtifact,loadReleasedExecutionProfile} from "./released-method-executor";

const program = `
const {workerData:d,parentPort}=require('node:worker_threads');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
try {
 for(const entry of [d.preparer,d.method]) {
  if(createHash('sha256').update(readFileSync(entry.file)).digest('hex')!==entry.hash) throw Error('artifact');
 }
 const p=require(d.preparer.file),m=require(d.method.file);
 if(p.receivablesPreparationVersion!==d.preparer.id) throw Error('preparer');
 const prepared=p.prepareReceivablesExecutionInput(JSON.parse(d.input));
 const readiness=m.assessReceivablesPoolMethodReadiness({phaseOne:prepared.phaseOne,detection:prepared.detection,assembly:prepared.assembly});
 if(readiness.state!=='ready' || readiness.methodExecutionAllowed!==true || !readiness.validatedInput) {
  parentPort.postMessage({ready:false,reason:'method_not_ready'});
 } else if(JSON.stringify(readiness.validatedInput)!==JSON.stringify(prepared.assembly.input)) {
  parentPort.postMessage({ready:false,reason:'prepared_input_changed'});
 } else {
  const text=JSON.stringify(prepared);
  if(Buffer.byteLength(text)>33554432) throw Error('size');
  parentPort.postMessage({ready:true,text});
 }
} catch {parentPort.postMessage({ready:false,reason:'preparation_invalid'});}
`;
const failure=z.object({ready:z.literal(false),reason:z.enum(["method_not_ready","prepared_input_changed","preparation_invalid"])}).strict();
const response=z.union([failure,z.object({ready:z.literal(true),text:z.string().max(33_554_432)}).strict()]);
export type R01PreparationResult={ready:false;reason:z.infer<typeof failure>["reason"]}|{
 ready:true;preparerId:string;preparerHash:string;methodArtifactHash:string;prepared:Record<string,unknown>;inputText:string;inputFingerprint:string;
};

/** Replays persisted inputs and runs published readiness in a terminating thread.
 * This is a calculation prerequisite, not permission: SQL must issue/revalidate a receipt. */
export async function preparePinnedR01(identity:{methodId:string;methodVersion:string;manifestHash:string},preparerId:string,
 input:unknown,signal:AbortSignal):Promise<R01PreparationResult> {
 const started=performance.now();
 if(signal.aborted)throw new Error("execution_aborted");
 if(identity.methodId!=="underwrite-receivables-pool")throw new Error("execution_method_unavailable");
 const preparer=releasedPreparerArtifact(preparerId),method=releasedMethodArtifact(identity),profile=loadReleasedExecutionProfile(identity);
 const deadline=started+profile.limits.maxDurationMs;
 const checkDeadline=()=>{if(signal.aborted || performance.now()>=deadline)throw new Error("execution_aborted");};
 const inputText=JSON.stringify(input);
 checkDeadline();
 if(typeof inputText!=="string" || Buffer.byteLength(inputText)>134_217_728)return {ready:false,reason:"preparation_invalid"};
 const file=(hash:string)=>fileURLToPath(new URL(`../released-methods/${hash}.cjs`,import.meta.url));
 const result=response.parse(await awaitExecutionThread(()=>new Worker(program,{eval:true,workerData:{input:inputText,
  preparer:{id:preparer.id,hash:preparer.artifactHash,file:file(preparer.artifactHash)},method:{hash:method.artifactHash,file:file(method.artifactHash)}},
  env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:512,stackSizeMb:4},stdout:true,stderr:true}),
  AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.floor(deadline-performance.now())))])));
 checkDeadline();
 if(!result.ready)return result;
 const prepared=z.object({inputText:z.string(),inputFingerprint:z.string().regex(/^[a-f0-9]{64}$/),assembly:z.object({input:z.unknown()}).passthrough()}).passthrough().parse(JSON.parse(result.text));
 if(prepared.inputText!==executionCanonicalText(prepared.assembly.input) || prepared.inputFingerprint!==executionInputFingerprint(prepared.assembly.input))
  return {ready:false,reason:"prepared_input_changed"};
 checkDeadline();
 return {ready:true,preparerId:preparer.id,preparerHash:preparer.artifactHash,methodArtifactHash:method.artifactHash,
  prepared,inputText:prepared.inputText,inputFingerprint:prepared.inputFingerprint};
}
