import {z} from "zod";

/** Prospectively published 3V ports. SQL captures delivered inputs and derives
 * authority; the caller supplies no source count, preparer or review permission. */
export type AssessmentCaptureAuthority={jobId:string;capabilityToken:string};
export type AssessmentCaptureRpc=(name:string,args:Record<string,unknown>)=>Promise<unknown>;
const uuid=z.uuid();
const capturedInput=z.looseObject({assessmentInputSnapshotId:uuid});
export const assessmentCaseCapturedInputSchema=capturedInput.extend({
 _execution:z.looseObject({mode:z.enum(["primary","shadow","replay"]),baseline_execution_id:uuid.optional(),baseline_report:z.unknown().optional()}),
 priorBasis:z.strictObject({use:z.enum(["optional_task_cache","required_comparison","not_consumed"]),state:z.enum(["absent","captured","unproven"]),
  controlledExecutionId:uuid.nullable(),reportFingerprint:z.string().regex(/^[a-f0-9]{64}$/).nullable()}),
 document_work_request:z.looseObject({executionScope:z.string().optional()}).nullish(),
 prior_case_report:z.unknown().optional(),
}).superRefine((input,ctx)=>{
 const expected=input._execution.mode!=="primary"?"required_comparison":input.document_work_request?.executionScope==="documentary_only"?"not_consumed":"optional_task_cache";
 if(input.priorBasis.use!==expected)ctx.addIssue({code:"custom",message:"assessment_prior_contract_unresolved"});
 if(expected==="required_comparison"&&(input.priorBasis.state!=="captured"||!input.priorBasis.reportFingerprint||
  input.priorBasis.controlledExecutionId!==input._execution.baseline_execution_id||input._execution.baseline_report==null))ctx.addIssue({code:"custom",message:"assessment_baseline_basis_unproven"});
 if(expected==="optional_task_cache"&&input.priorBasis.state==="captured"&&(input.prior_case_report==null||!input.priorBasis.reportFingerprint))ctx.addIssue({code:"custom",message:"assessment_prior_basis_unproven"});
});
const assessmentReceipt=z.object({agent_plan_id:uuid,coverage_count:z.number().int().nonnegative(),request_count:z.number().int().nonnegative(),decision_count:z.number().int().nonnegative()});
const m07IndexReceipt=z.union([
 z.strictObject({assessmentId:uuid,proposalReceiptId:uuid,replayed:z.boolean()}),
 z.strictObject({assessmentId:uuid,skippedHumanFrozen:z.literal(true)}),
]);
export function createAssessmentNativeCapture(authority:AssessmentCaptureAuthority,call:AssessmentCaptureRpc){
 const args=Object.freeze({p_job_id:uuid.parse(authority.jobId),p_capability_token:z.string().min(1).parse(authority.capabilityToken)});
 return Object.freeze({
  async loadCaseInput(){return assessmentCaseCapturedInputSchema.parse(await call("worker_load_case_assessment_input_v5",args));},
  async loadInstitutionalContext(){return capturedInput.parse(await call("worker_load_assessment_institutional_context_v1",args));},
  async loadPreliminaryInput(){return capturedInput.parse(await call("worker_load_preliminary_assessment_input_v3",args));},
  async retrieval(input:{query:string;allowedFundIds?:readonly string[];precedentPurpose?:string;limit?:number}){
   const limit=z.number().int().min(1).max(100).parse(input.limit??20);
   const result=await call("worker_load_assessment_retrieval_v2",{...args,p_query:z.string().min(1).parse(input.query),
    p_allowed_fund_ids:z.array(uuid).parse(input.allowedFundIds??[]),p_precedent_purpose:input.precedentPurpose??null,p_limit:limit});
   return z.array(z.unknown()).parse(result);
  },
  async recordAssessment(assessment:unknown){
   const data=assessmentReceipt.parse(await call("worker_record_agent_assessment_v2",{...args,p_assessment:assessment}));
   return{agentPlanId:data.agent_plan_id,coverageCount:data.coverage_count,requestCount:data.request_count,decisionCount:data.decision_count};
  },
  async recordM07Index(input:{recipeId:string;finalRetainedPayloadId:string}){
   // Strict parse also rejects accidental raw bodies passed through this port.
   const value=z.strictObject({recipeId:uuid,finalRetainedPayloadId:uuid}).parse(input);
   return m07IndexReceipt.parse(await call("worker_record_m07_assessment_index_v1",{...args,p_recipe_id:value.recipeId,p_final_retained_payload_id:value.finalRetainedPayloadId}));
  },
 });
}
