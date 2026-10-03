/** Finite prospectively captured preview JSON producer. Office material is a
 * separate 3S consumer; this module never claims that material bytes can replay. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {case01,preview} from "@offroad/credit-playbook";
import {fingerprintJson} from "@offroad/case-understanding";
import {preparePreviewNativeModelRecipe,type PreviewModelRecipeInput} from "./integration-preview-model-recipe";
import {capturePreviewActualInput,compilePreviewConsumedBasis,compilePreviewBoundaryBasis} from "./integration-preview-consumed-basis";
import {projectAcceptedPreviewQuestions,type PreviewQuestionsInput} from "./preview-questions";
import {projectAcceptedPreviewSynthesis,type PreviewSynthesisInput} from "./preview-synthesis";
import {compilePreviewDecisionArtifact} from "./preview-decision-artifact";
import {integrationPreviewRequestSchema,type PreviewRunContextRow} from "./integration-preview";
import type {PreviewBodyKind} from "./integration-preview-body-storage";
import type {CapitalBodyRetentionReceipt} from "./capital-body-retention";

const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const baseSchema=z.strictObject({schemaVersion:z.literal("capital-preview-base.v1"),runId:uuid,jobId:uuid,organizationId:uuid,workId:uuid,planId:uuid,briefId:uuid,planFingerprint:hash,
 composition:preview.previewCompositionSchema,workflowFingerprint:hash,contextFingerprint:hash,canonicalContext:z.string().min(1),expiresAt:z.iso.datetime({offset:true})});
export type PreviewNativeBase=z.infer<typeof baseSchema>;
export interface PreviewNativePipelinePorts {
 begin():Promise<{base:unknown;context:PreviewRunContextRow}>;
 /** Exact local installed extraction; SQL compares its SHA/bytes against the
  * human publication's verified SourceVersion before accepting a physical body. */
 extraction(file:string):Promise<Uint8Array>;
 retain(input:{runId:string;kind:PreviewBodyKind;body:unknown;fileName?:string;taskId?:string;taskRunId?:string;semanticFingerprint?:string}):Promise<CapitalBodyRetentionReceipt>;
 startTask(input:{taskId:string;executorKey:string;executorVersion:string;inputFingerprint:string}):Promise<string>;
 commit(input:{runId:string;taskId:string;taskRunId:string;retainedPayloadId:string;role:"task_output"|"decision_contract"}):Promise<{capitalArtifactId:string;artifactFingerprint:string}>;
 finishTask(input:{runId:string;taskRunId:string}):Promise<void>;
 /** Both routes and failed attempts are accounted from the ledger, including a
  * reused accepted body. This port must never substitute fixed prose after error. */
 paid(input:{runId:string;preparation:PreviewModelRecipeInput;boundaryBasisFingerprint:string}):Promise<{output:unknown;execution:{model:string;costUsd:number;latencyMs:number;modelCalls:number;unknownCostCalls:number}}>; 
 /** Full result proof is checked physically before a no-model replay. A partial
  * run is not declared complete and must be resumed through actual task state. */
 recover(base:PreviewNativeBase):Promise<{capitalArtifactId:string;artifactFingerprint:string;modelCalls:number;costUsd:number;unknownCostCalls:number}|null>;
 restoreTask?(input:{runId:string;taskId:string;inputFingerprint:string}):Promise<{output:preview.PreviewStepOutput;taskRunId:string;capitalArtifactId:string;status:"running"|"succeeded";artifactFingerprint:string;execution?:{modelCalls:number;costUsd:number;unknownCostCalls:number}}|null>;
 finalize(input:{runId:string;consumedBasis:ReturnType<typeof compilePreviewConsumedBasis>}):Promise<void>;
}
const deny=():never=>{throw Error("capital_preview_native_pipeline_denied");};
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
/** No legacy artifact or generic model gateway port is exposed. */
export async function runFinitePreviewNative(ports:PreviewNativePipelinePorts,corpusManifest:unknown,now:()=>number=Date.now){
 const loaded=await ports.begin(),base=baseSchema.parse(loaded.base),context=loaded.context;
 if(Date.parse(base.expiresAt)<=now()||base.workId!==context.project.id||base.planId!==context.plan.id||base.briefId!==context.brief.id||base.planFingerprint!==context.plan.fingerprint
  ||base.composition!==context.preview.composition||base.workflowFingerprint!==context.preview.workflow.fingerprint||context.prior_artifacts.length!==0)deny();
 const replay=await ports.recover(base);if(replay)return{...replay,replayed:true,materialRecovery:"not_proven"as const};
 await ports.retain({runId:base.runId,kind:"context",body:JSON.parse(base.canonicalContext)});
 const steps=preview.previewStepsForComposition(base.composition),outputs=new Map<string,preview.PreviewStepOutput>(),actualInputs:Record<string,unknown>={};
 const planTaskIds=new Set(context.tasks.map(task=>task.id));
 if(planTaskIds.size!==steps.length||steps.some(step=>!planTaskIds.has(step.taskId)))deny();
 const briefAnswers=z.array(z.strictObject({questionId:z.string().min(1),answer:z.string().min(1)})).parse(context.brief.content.answers??[]);
 const runContext:preview.PreviewRunContext={evidence:case01.case01Evidence(),premises:preview.previewPremisesSchema.parse(context.preview.premises),outputs,request:integrationPreviewRequestSchema.parse({...context.brief.content.request as object,composition:base.composition}),previousBrief:null,...(briefAnswers.length?{answers:briefAnswers}:{})};
 // The first eight deterministic inputs determine the complete installed source
 // subset. Future A01/A02 inputs are not asserted to exist at this point.
 const sourceInputs=Object.fromEntries(steps.map(step=>[step.taskId,step.taskId==='A01'||step.taskId==='A02'?{}:preview.previewStepInput(step,runContext)]));
 const sourceBasis=compilePreviewConsumedBasis({composition:base.composition,inputs:sourceInputs,corpusManifest});
 for(const source of sourceBasis.entries){const text=await ports.extraction(source.file);if(sha(text)!==source.sha256||text.byteLength!==source.bytes)deny();
  await ports.retain({runId:base.runId,kind:"source",fileName:source.file,body:{schemaVersion:"capital-preview-extraction.v1",file:source.file,bytesBase64:Buffer.from(text).toString("base64")}});}
 let modelCalls=0,costUsd=0,unknownCostCalls=0,lastArtifactId:string|undefined,lastArtifactFingerprint:string|undefined;
 const account=(execution:{modelCalls:number;costUsd:number;unknownCostCalls:number})=>{if(!Number.isInteger(execution.modelCalls)||execution.modelCalls<0||!Number.isFinite(execution.costUsd)||execution.costUsd<0||!Number.isInteger(execution.unknownCostCalls)||execution.unknownCostCalls<0)deny();modelCalls+=execution.modelCalls;costUsd+=execution.costUsd;unknownCostCalls+=execution.unknownCostCalls;};
 const paid=async(preparation:PreviewModelRecipeInput)=>{const pin=preparePreviewNativeModelRecipe(preparation);
  const basis=compilePreviewBoundaryBasis({boundary:preparation.boundary,contextFingerprint:base.contextFingerprint,sourceBasisFingerprint:sourceBasis.fingerprint,predecessorInputs:actualInputs,modelInputFingerprint:pin.inputFingerprint});
  const result=await ports.paid({runId:base.runId,preparation,boundaryBasisFingerprint:basis.fingerprint});account(result.execution);return result;};
 for(const step of steps){
  if(step.taskId==='A01'){
   const fixed=(preview.meetingBriefInput(runContext).candidateQuestions??[]).map(question=>{if(!question.coverage||question.coverage.answeredBy!==null||question.coverage.answer!==null)deny();return{...question,coverage:{searched:question.coverage!.searched,answeredBy:null,answer:null}};});
   const questionInput:PreviewQuestionsInput={gateway:null,locale:context.session.locale,gaps:preview.extractPreviewGaps(outputs,context.session.locale),request:{desiredOutcome:runContext.request.sponsorInstruction,audience:runContext.request.audience?.primary??null,depth:null,form:runContext.request.form,undefinedAspects:runContext.request.undefinedAspects??[],sponsorInstruction:runContext.request.sponsorInstruction},answered:briefAnswers,documents:preview.previewBaseDocuments(),fixed};
   // No gaps is an actual deterministic no-call path, not a model fallback.
   if(questionInput.gaps.length>0){const result=await paid({boundary:"questions",input:questionInput});const projected=projectAcceptedPreviewQuestions(questionInput,result.output,result.execution);if(projected.source==='model')runContext.candidateQuestions=projected.questions;}
  }
  const actualInput=capturePreviewActualInput(preview.previewStepInput(step,runContext));actualInputs[step.taskId]=actualInput;
  const inputFingerprint=fingerprintJson(actualInput);
  await ports.retain({runId:base.runId,kind:"actual_input",taskId:step.taskId,semanticFingerprint:inputFingerprint,body:{schemaVersion:"capital-preview-actual-input.v1",taskId:step.taskId,input:actualInput}});
  const restored=await ports.restoreTask?.({runId:base.runId,taskId:step.taskId,inputFingerprint});
  const taskRunId=restored?uuid.parse(restored.taskRunId):uuid.parse(await ports.startTask({taskId:step.taskId,executorKey:step.executorKey,executorVersion:step.methodVersion,inputFingerprint}));
  let output=restored?.output??preview.runPreviewStep(step,runContext).output;
  if(restored?.execution)account(restored.execution);
  if(step.taskId==='A02'&&!restored){
   const synthesisInput:PreviewSynthesisInput={gateway:null,locale:context.session.locale,outputs,request:runContext.request,objectFingerprints:preview.briefObjectFingerprints(outputs),previous:null,skeleton:output as unknown as preview.SynthesisOutput};
   const result=await paid({boundary:"synthesis",input:synthesisInput});output=projectAcceptedPreviewSynthesis(synthesisInput,result.output,result.execution)as unknown as preview.PreviewStepOutput;
  }
  outputs.set(step.taskId,output);
  const body={schemaVersion:"capital-preview-json-body.v1",runId:base.runId,taskId:step.taskId,role:"task_output",artifactType:step.artifactType,inputFingerprint,content:preview.previewArtifactContent(step,output,runContext.premises)};
  if(restored){lastArtifactId=uuid.parse(restored.capitalArtifactId);lastArtifactFingerprint=restored.artifactFingerprint;}
  else{
  const retained=await ports.retain({runId:base.runId,kind:"task_output",taskId:step.taskId,taskRunId,semanticFingerprint:fingerprintJson(body),body});
  if(!retained.retainedPayloadId)deny();
  const committed=await ports.commit({runId:base.runId,taskId:step.taskId,taskRunId,retainedPayloadId:uuid.parse(retained.retainedPayloadId),role:"task_output"});lastArtifactId=uuid.parse(committed.capitalArtifactId);lastArtifactFingerprint=hash.parse(committed.artifactFingerprint);
  }
  if(step===steps.at(-1)&&restored?.status!=="succeeded"){
   const contract=compilePreviewDecisionArtifact({caseId:case01.case01EvidenceManifest.caseId,asOf:case01.case01EvidenceManifest.referenceDate,outputs,premises:runContext.premises});
   const contractBody={schemaVersion:"capital-preview-json-body.v1",runId:base.runId,taskId:step.taskId,role:"decision_contract",artifactType:"preview_decision_contract",inputFingerprint,content:contract};
   const scope=await ports.retain({runId:base.runId,kind:"decision_contract",taskId:step.taskId,taskRunId,semanticFingerprint:fingerprintJson(contractBody),body:contractBody});if(!scope.retainedPayloadId)deny();
   await ports.commit({runId:base.runId,taskId:step.taskId,taskRunId,retainedPayloadId:uuid.parse(scope.retainedPayloadId),role:"decision_contract"});
  }
  if(restored?.status!=="succeeded")await ports.finishTask({runId:base.runId,taskRunId});
 }
 const consumedBasis=compilePreviewConsumedBasis({composition:base.composition,inputs:actualInputs,corpusManifest});
 if(fingerprintJson(consumedBasis.entries)!==fingerprintJson(sourceBasis.entries))deny();
 await ports.finalize({runId:base.runId,consumedBasis});if(!lastArtifactId||!lastArtifactFingerprint)deny();
 return{capitalArtifactId:lastArtifactId,artifactFingerprint:lastArtifactFingerprint,modelCalls,costUsd,unknownCostCalls,replayed:false,materialRecovery:"not_proven"as const};
}
