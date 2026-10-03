import {describe,expect,it,vi} from "vitest";
import {assessmentCaseCapturedInputSchema,createAssessmentNativeCapture} from "./assessment-native-capture";
const jobId="10000000-0000-4000-8000-000000000001",snapshotId="10000000-0000-4000-8000-000000000002";
const authority={jobId,capabilityToken:"token"};
describe("prospective assessment capture",()=>{
 it("binds required comparison to the typed baseline while optional cache may have a gap",()=>{
  const baseline={assessmentInputSnapshotId:snapshotId,_execution:{mode:"shadow",baseline_execution_id:jobId,baseline_report:{}},priorBasis:{use:"required_comparison",state:"captured",controlledExecutionId:jobId,reportFingerprint:"a".repeat(64)}};
  expect(assessmentCaseCapturedInputSchema.safeParse(baseline).success).toBe(true);
  for(const raw of [{...baseline,priorBasis:{...baseline.priorBasis,state:"unproven"}},{...baseline,_execution:{mode:"replay",baseline_execution_id:snapshotId,baseline_report:{}}},{...baseline,priorBasis:{...baseline.priorBasis,use:"optional_task_cache"}}])expect(assessmentCaseCapturedInputSchema.safeParse(raw).success).toBe(false);
  expect(assessmentCaseCapturedInputSchema.safeParse({...baseline,_execution:{mode:"primary"},priorBasis:{use:"optional_task_cache",state:"unproven",controlledExecutionId:jobId,reportFingerprint:null},prior_case_report:null}).success).toBe(true);
  expect(assessmentCaseCapturedInputSchema.safeParse({...baseline,_execution:{mode:"primary"},document_work_request:{executionScope:"documentary_only"},priorBasis:{use:"not_consumed",state:"absent",controlledExecutionId:null,reportFingerprint:null}}).success).toBe(true);
 });
 it("uses the assembled frozen case input and requires server capture identity",async()=>{
  const call=vi.fn().mockResolvedValue({assessmentInputSnapshotId:snapshotId,documents:[],_execution:{mode:"primary"},priorBasis:{use:"optional_task_cache",state:"absent",controlledExecutionId:null,reportFingerprint:null}});
  expect((await createAssessmentNativeCapture(authority,call).loadCaseInput()).assessmentInputSnapshotId).toBe(snapshotId);
  expect(call).toHaveBeenCalledWith("worker_load_case_assessment_input_v5",{p_job_id:jobId,p_capability_token:"token"});
  call.mockResolvedValue({documents:[]});await expect(createAssessmentNativeCapture(authority,call).loadCaseInput()).rejects.toThrow();
 });
 it("preserves the canonical retrieval envelope and rejects array or inconsistent abstention",async()=>{
  const context={playbook_version:null,results:[],abstained:true};
  const call=vi.fn().mockResolvedValue(context);const ports=createAssessmentNativeCapture(authority,call);
  expect(await ports.retrieval({query:"synthetic evidence"})).toEqual(context);
  const selected={playbook_version:"approved-v1",results:[{source:"case",id:jobId,content:"Own verified evidence",citation:{key:"source:1",label:"Own source"},score:0.4}],abstained:false};
  call.mockResolvedValue(selected);expect(await ports.retrieval({query:"synthetic evidence"})).toEqual(selected);
  for(const invalid of [[],{...context,abstained:false},{...selected,abstained:true},{results:[],abstained:true}]){
   call.mockResolvedValue(invalid);await expect(ports.retrieval({query:"synthetic evidence"})).rejects.toThrow();
  }
  const calls=call.mock.calls.length;await expect(ports.retrieval({query:"synthetic evidence",limit:51})).rejects.toThrow();expect(call.mock.calls).toHaveLength(calls);
 });
 it("cannot fall back to the historical writer after database denial",async()=>{
  const call=vi.fn().mockRejectedValue(new Error("assessment_primary_capture_required"));
  await expect(createAssessmentNativeCapture(authority,call).recordAssessment({})).rejects.toThrow("assessment_primary_capture_required");
  expect(call).toHaveBeenCalledTimes(1);expect(call.mock.calls[0]?.[0]).toBe("worker_record_agent_assessment_v2");
 });
 it("records public final as references only and rejects a financial body",async()=>{
  const call=vi.fn().mockResolvedValue({assessmentId:jobId,proposalReceiptId:snapshotId,replayed:false});
  const ports=createAssessmentNativeCapture(authority,call);
  await ports.recordM07Index({recipeId:jobId,finalRetainedPayloadId:snapshotId});
  expect(call).toHaveBeenCalledWith("worker_record_m07_assessment_index_v1",{p_job_id:jobId,p_capability_token:"token",p_recipe_id:jobId,p_final_retained_payload_id:snapshotId});
  await expect(ports.recordM07Index({recipeId:jobId,finalRetainedPayloadId:snapshotId,body:{recommendation:"private"}} as Parameters<typeof ports.recordM07Index>[0])).rejects.toThrow();
  expect(call).toHaveBeenCalledTimes(1);
 });
 it("accepts the explicit human-frozen skip without inventing a receipt",async()=>{
  const call=vi.fn().mockResolvedValue({assessmentId:jobId,skippedHumanFrozen:true});
  expect(await createAssessmentNativeCapture(authority,call).recordM07Index({recipeId:jobId,finalRetainedPayloadId:snapshotId})).toEqual({assessmentId:jobId,skippedHumanFrozen:true});
 });
});
