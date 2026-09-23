import {Worker} from "node:worker_threads";
import {fileURLToPath} from "node:url";
import {releasedMethodArtifact, loadReleasedExecutionProfile} from "./released-method-executor";

// Fixed program; input is workerData, never source text. No capability or credential crosses.
const calculationProgram = `
const {workerData:d,parentPort}=require('node:worker_threads');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
try {
 if(createHash('sha256').update(readFileSync(d.file)).digest('hex')!==d.hash) throw Error('artifact');
 const m=require(d.file);
 const r01=d.method==='underwrite-receivables-pool';
 if(!r01 && d.method!=='prepare-capital-structure-decision') throw Error('method');
 const inputSchema=r01?m.receivablesPoolUnderwritingInputSchema:m.capitalProcedurePacketV2InputSchema;
 const outputSchema=r01?m.receivablesPoolUnderwritingSchema:m.capitalProcedurePacketV2OutputSchema;
 const calculate=r01?m.underwriteReceivablesPool:m.prepareCapitalProcedurePacketV2;
 const input=inputSchema.safeParse(JSON.parse(d.input));
 if(!input.success){parentPort.postMessage({ok:false,reason:'invalid_input'});}
 else {
  const output=outputSchema.parse(calculate(input.data));
  const text=JSON.stringify(output);
  if(Buffer.byteLength(text)>8388608) throw Error('output_size');
  parentPort.postMessage({ok:true,text});
 }
} catch {parentPort.postMessage({ok:false,reason:'calculation_failed'});}
`;
export type CalculationResult = {ok:true;text:string}|{ok:false;reason:"invalid_input"|"calculation_failed"};

/** Termination is awaited before returning; synchronous CPU work cannot defeat an abort. */
export async function awaitExecutionThread(create: () => Worker, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new Error("execution_aborted");
  const worker = create();
  worker.stdout?.resume(); worker.stderr?.resume();
  let abort: () => void = () => {};
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(new Error("execution_aborted"));
      signal.addEventListener("abort", abort, {once:true});
      worker.once("message", resolve);
      worker.once("error", () => reject(new Error("execution_calculation_failed")));
      worker.once("exit", () => reject(new Error("execution_calculation_failed")));
      if (signal.aborted) abort();
    });
  } finally {
    signal.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
export async function calculatePinnedCapital(identity: {methodId:string;methodVersion:string;manifestHash:string}, inputText:string, signal:AbortSignal):Promise<CalculationResult> {
  if(identity.methodId!=="prepare-capital-structure-decision") throw new Error("execution_method_unavailable");
  return calculatePinnedMethod(identity,inputText,signal);
}

/** Both methods share the terminating runtime. R01 is not yet enabled in queue claims. */
export async function calculatePinnedMethod(identity: {methodId:string;methodVersion:string;manifestHash:string}, inputText:string, signal:AbortSignal):Promise<CalculationResult> {
  if(signal.aborted)throw new Error("execution_aborted");
  const profile=loadReleasedExecutionProfile(identity);
  if(Buffer.byteLength(inputText)>8_388_608) return {ok:false,reason:"invalid_input"};
  const release=releasedMethodArtifact(identity);
  const file=fileURLToPath(new URL(`../released-methods/${release.artifactHash}.cjs`,import.meta.url));
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(profile.limits.maxDurationMs)]);
  const result=await awaitExecutionThread(()=>new Worker(calculationProgram,{eval:true,workerData:{file,hash:release.artifactHash,input:inputText,method:profile.method.methodId},
    env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256,stackSizeMb:4},stdout:true,stderr:true}),bounded);
  if(!result || typeof result!=="object" || !("ok" in result)) throw new Error("execution_calculation_failed");
  if(result.ok===true && "text" in result && typeof result.text==="string" && Buffer.byteLength(result.text)<=8_388_608) return {ok:true,text:result.text};
  if(result.ok===false && "reason" in result && (result.reason==="invalid_input" || result.reason==="calculation_failed")) return {ok:false,reason:result.reason};
  throw new Error("execution_calculation_failed");
}
