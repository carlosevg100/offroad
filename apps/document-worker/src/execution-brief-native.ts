import {z} from "zod";
import type {CompiledExecutionBrief, VisibleExecutionBrief} from "@offroad/work-plan";

const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
export const executionBriefInputCaptureSchema=z.object({
  schemaVersion:z.literal("execution-brief-input-capture.v1"),captureId:z.uuid(),producerJobId:z.uuid(),workId:z.uuid(),
  inputFingerprint:fingerprint,contextFingerprint:fingerprint,context:z.record(z.string(),z.unknown()),sourceCount:z.number().int().nonnegative(),
}).strict();
export type ExecutionBriefInputCapture=z.infer<typeof executionBriefInputCaptureSchema>;
export type ExecutionBriefNativeProduct={internal:CompiledExecutionBrief;visible:VisibleExecutionBrief};
export type ExecutionBriefNativeProducerPort={
  capture(requestId:string):Promise<unknown>;
  record(capture:ExecutionBriefInputCapture,product:ExecutionBriefNativeProduct):Promise<unknown>;
};
/** Capture precedes compilation. The compiler receives only server-loaded inputs;
 * neither callers nor an approval screen may manufacture a missing precursor. */
export async function produceCapturedExecutionBrief(input:{
  jobId:string;workId:string;requestId:string;port:ExecutionBriefNativeProducerPort;
  compile(context:ExecutionBriefInputCapture["context"]):ExecutionBriefNativeProduct;
}):Promise<unknown>{
  z.uuid().parse(input.jobId);z.uuid().parse(input.workId);z.uuid().parse(input.requestId);
  const capture=executionBriefInputCaptureSchema.parse(await input.port.capture(input.requestId));
  if(capture.producerJobId!==input.jobId||capture.workId!==input.workId)throw new Error("execution_brief_capture_scope_mismatch");
  const product=input.compile(structuredClone(capture.context));
  if(product.internal.fingerprint!==product.visible.fingerprint)throw new Error("execution_brief_capture_product_mismatch");
  // The recording command must revalidate the capture under the current lease,
  // source rights and consumed context before invoking the installed primitive.
  return input.port.record(capture,product);
}

export type ExecutionBriefCaptureQueuePort={
  captureExecutionBriefInputs?(job:{job_id:string;capability_token:string},requestId:string):Promise<unknown>;
  recoverExecutionBriefProduct?(job:{job_id:string;capability_token:string},requestId:string):Promise<unknown>;
};
const uuid=z.uuid();
export const executionBriefProductReceiptSchema=z.strictObject({
  schemaVersion:z.literal("execution-brief-native-product-receipt.v1"),
  producerKind:z.enum(["agent_operation_brief","execution_brief_proposal"]),captureId:uuid,producerJobId:uuid,requestId:uuid,
  workId:uuid,executionBriefId:uuid,briefFingerprint:fingerprint,planId:uuid,planFingerprint:fingerprint,
  assistantMessageId:uuid.nullable(),proposalId:uuid.nullable(),activationJobId:uuid.nullable(),dispatchId:uuid.nullable(),
});
const recoverySchema=z.strictObject({schemaVersion:z.literal("execution-brief-product-recovery.v1"),
  state:z.enum(["none","unresolved","committed"]),producerJobId:uuid,requestId:uuid,captureId:uuid.nullable(),
  product:executionBriefProductReceiptSchema.nullable(),
});
/** Recover an already committed product before any loader, model or compiler.
 * An incomplete or revoked precursor never becomes a new authorship attempt. */
export async function recoverExecutionBriefProduct(queue:ExecutionBriefCaptureQueuePort,
  job:{job_id:string;capability_token:string;work_id?:string|null|undefined},requestId:string,kind:"agent_operation_brief"|"execution_brief_proposal") {
  if(!queue.recoverExecutionBriefProduct)return null;
  const result=recoverySchema.parse(await queue.recoverExecutionBriefProduct(job,requestId));
  if(result.producerJobId!==job.job_id||result.requestId!==requestId)throw new Error("execution_brief_recovery_scope_mismatch");
  if(result.state==="none"){
    if(result.captureId!==null||result.product!==null)throw new Error("execution_brief_recovery_scope_mismatch");
    return null;
  }
  if(result.state==="unresolved")throw new Error("execution_brief_capture_unresolved");
  const p=result.product;
  if(!p||!result.captureId||p.captureId!==result.captureId||p.producerJobId!==job.job_id||p.requestId!==requestId||p.producerKind!==kind
    ||job.work_id&&p.workId!==job.work_id||kind==="agent_operation_brief"&&!p.assistantMessageId)
    throw new Error("execution_brief_recovery_scope_mismatch");
  return p;
}
export async function loadExecutionBriefCapture(queue:ExecutionBriefCaptureQueuePort,job:{job_id:string;capability_token:string},requestId:string):Promise<ExecutionBriefInputCapture>{
  if(!queue.captureExecutionBriefInputs)throw new Error("execution_brief_native_capture_command_unavailable");
  const capture=executionBriefInputCaptureSchema.parse(await queue.captureExecutionBriefInputs(job,requestId));
  if(capture.producerJobId!==job.job_id)throw new Error("execution_brief_capture_scope_mismatch");
  return capture;
}
