/** Protected live executor and source-review controls; never application E2E or promotion. */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {fingerprintJson} from "@offroad/case-understanding";
import {createModelGateway, createAnthropicAdapter, createOpenAIAdapter, defaultTaskPolicies, type GatewayCallLog} from "@offroad/model-gateway";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {documentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";
import {assertDocumentWorkLiveEnvironment, scoreDocumentWorkLive, compareDocumentWorkRepeats, scoreDocumentWorkSourceReviewControl, type LiveProduct} from "../src/document-work-product-live";
import {documentWorkFailureDiagnostics} from "../src/document-work-product-diagnostics";
import {summarizeDocumentWorkAttempts} from "../src/document-work-product-attempts";
type Review={reviewedFieldIds:string[];issues:Array<{fieldId:string;code:string;sourceIds:string[]}>};
type Diagnostic=ReturnType<typeof documentWorkFailureDiagnostics>;
async function main() {
  assertDocumentWorkLiveEnvironment(process.env);
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) throw new Error("protected_provider_credentials_required");
  const directory=resolve(process.env.RUNNER_TEMP ?? ".","document-work-product-live");
  mkdirSync(directory,{recursive:true});
  const adapters={anthropic:createAnthropicAdapter({apiKey:process.env.ANTHROPIC_API_KEY}),openai:createOpenAIAdapter({apiKey:process.env.OPENAI_API_KEY})};
  // Fixed partitions retain an aggregate USD3 ceiling, including the eight reviewer controls.
  const calls:GatewayCallLog[]=[], controlCalls:GatewayCallLog[]=[];
  const gateway=createModelGateway({adapters,budget:{maxCostUsd:2.5,maxCalls:18},onCall:call=>calls.push(call)});
  const controlGateway=createModelGateway({adapters,budget:{maxCostUsd:0.5,maxCalls:8},onCall:call=>controlCalls.push(call)});
  const workerPath=(name:string)=>pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)),`../../../apps/document-worker/src/${name}.ts`)).href;
  const {hydrateDocumentWorkSelection}=await import(workerPath("document-work-selection")) as {hydrateDocumentWorkSelection:(input:unknown,raw:unknown)=>unknown};
  const {expandDocumentWorkSourceReview}=await import(workerPath("document-work-source-review")) as {expandDocumentWorkSourceReview:(input:unknown,raw:Review)=>Review};
  const {runDocumentWorkProduct,validateDocumentWorkProductNarrative}=await import(workerPath("document-work-product")) as {
    runDocumentWorkProduct:(input:unknown,dependencies:{gateway:typeof gateway})=>Promise<LiveProduct>;
    validateDocumentWorkProductNarrative:(input:unknown,raw:unknown)=>unknown;
  };
  const {reviewDocumentWorkSourceFidelity,validateDocumentWorkSourceReview,sourceReviewSchema}=await import(workerPath("document-work-source-review")) as {
    reviewDocumentWorkSourceFidelity:(input:unknown,narrative:unknown,dependencies:{gateway:typeof gateway})=>Promise<Review>;
    validateDocumentWorkSourceReview:(input:unknown,narrative:unknown,raw:unknown)=>Review;
    sourceReviewSchema:{safeParse:(raw:unknown)=>{success:boolean;data?:Review}};
  };
  const runs:Array<{caseId:string;repeat:number;product:LiveProduct|null;score:ReturnType<typeof scoreDocumentWorkLive>|null;failure:string|null;diagnostics:Diagnostic|null;providerCallRange:{start:number;end:number};completeCalls:number;narrativeCalls:number;reviewCalls:number;responses:Array<{kind:"narrative"|"source_review";providerCallIndex:number;contentFingerprint:string;validationPassed:boolean;diagnostics:Diagnostic|null;syntheticNarrative:Diagnostic["rejectedOutput"];syntheticReview:Review|null}>}>=[];
  const repeats:Array<{caseId:string;comparison:ReturnType<typeof compareDocumentWorkRepeats>|null}>=[];
  const controls:Array<{caseId:string;expectedIssueFieldId:string|null;expectedIssueFieldIds:string[];expectedCleanFieldIds:string[];scope:"mixed_locale_review_controls";passed:boolean;review:Review|null;failure:string|null;providerCallRange:{start:number;end:number}}> = [];
  const persist=()=>{
    const accounting=summarizeDocumentWorkAttempts(runs.map(run=>({passed:run.score?.passed===true,completeCalls:run.completeCalls,narrativeCalls:run.narrativeCalls,reviewCalls:run.reviewCalls,firstResponseValid:run.responses.find(response=>response.kind==="narrative")?.validationPassed===true,providerCalls:run.providerCallRange.end-run.providerCallRange.start})),repeats.map(repeat=>repeat.comparison?.passed===true),gateway.spent());
    const controlSpend=controlGateway.spent();
    const controlsPassed=controls.length===8 && controls.every(control=>control.passed) && controlSpend.calls===8 && controlSpend.unknownCostCalls===0 && Number.isFinite(controlSpend.costUsd) && controlSpend.costUsd<=0.5;
    const passed=accounting.passed && controlsPassed;
    const evidence={schemaVersion:"document-work-product-executor-eval.v4",synthetic:true,scope:"actual_executor_and_authored_source_review_controls_not_application_e2e",promotion:false,gitSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,workflowRef:process.env.GITHUB_WORKFLOW_REF,fixtureFingerprint:fingerprintJson(documentWorkProductLiveCases),sourceReviewFixtureFingerprint:fingerprintJson(documentWorkSourceReviewCases),policy:defaultTaskPolicies.preliminary_understanding,budget:{maxCostUsd:3,maxCalls:26,gold:{maxCostUsd:2.5,maxCalls:18},sourceReviewControls:{maxCostUsd:0.5,maxCalls:8}},spent:gateway.spent(),sourceReviewControlSpend:controlSpend,accounting,passed,runs,repeats,sourceReviewControls:controls,calls,sourceReviewControlCalls:controlCalls};
    writeFileSync(resolve(directory,"evidence.json"),JSON.stringify(evidence,null,2));
    writeFileSync(resolve(directory,"summary.md"),`# Document work product evaluation\n\n${passed?"PASS":"FAIL"} · ${runs.length}/6 independent requests recorded.\n\nSynthetic inputs, actual executor and source reviewer. This is not application E2E, human domain certification or release approval.\n\n${runs.map(run=>`- ${run.caseId} repeat ${run.repeat}: ${run.score?.passed?"PASS":"FAIL"}${run.failure?` (${run.failure})`:""}`).join("\n")}\n\nSource-review controls: ${controls.filter(control=>control.passed).length}/${controls.length}; eight required, including both supported and unsupported claims.\n\nRepeat comparisons require identical input and full expected fact coverage; prose identity is reported separately. First-pass narrative success after review: ${accounting.firstPassSuccessCount}/${runs.length}. All rejected attempts remain in evidence.\n\nGold provider attempts: ${gateway.spent().calls}; source-review control attempts: ${controlSpend.calls}. Measured total USD: ${gateway.spent().costUsd+controlSpend.costUsd}. Fixed ceilings: gold18/USD2.50, controls8/USD0.50; retries and fallback consume those same budgets.\n`);
    return passed;
  };
  for(const sample of documentWorkProductLiveCases) {
    const input={job:sample.job,locale:"en-US",approvedRequest:{text:sample.objective,fingerprint:fingerprintJson({objective:sample.objective})},passages:sample.passages.map(p=>({...p,documentId:p.id,version:"1",hash:fingerprintJson(p.text),anchor:"paragraph 1"})),coverage:{documentsConsidered:sample.passages.length,omittedPassages:0,limitations:["Synthetic document-only case; no financial calculations or independent diligence."]}};
    const outputs:LiveProduct[]=[];
    for(const repeat of [1,2]) {
      const start=calls.length;
      let capturedNarrative:unknown, narrativeProviderIndex:number|null=null, completeCalls=0, narrativeCalls=0, reviewCalls=0;
      const responses:(typeof runs)[number]["responses"]=[];
      const observedGateway:typeof gateway={spent:gateway.spent,async complete(request){
        completeCalls++;
        const isNarrative=request.schemaName==="document_work_selection_v1";
        if(isNarrative)narrativeCalls++; else reviewCalls++;
        const response=await gateway.complete(request);
        if(isNarrative){
          capturedNarrative=response.output;narrativeProviderIndex=calls.length-1;
          let validationFailure:unknown;
          try{capturedNarrative=hydrateDocumentWorkSelection(input,response.output);validateDocumentWorkProductNarrative(input,capturedNarrative);}catch(error){validationFailure=error;}
          const diagnostic=documentWorkFailureDiagnostics(validationFailure,capturedNarrative,calls.length-1);
          responses.push({kind:"narrative",providerCallIndex:calls.length-1,contentFingerprint:fingerprintJson(response.output),validationPassed:validationFailure===undefined,diagnostics:validationFailure===undefined?null:diagnostic,syntheticNarrative:diagnostic.rejectedOutput,syntheticReview:null});
        }else{
          const wire=response.output as Record<string,unknown>;
          const {revisedSelection,...reviewWire}=wire;
          const parsed=sourceReviewSchema.safeParse(request.schemaName==="document_work_source_review_revision_v1"?reviewWire:response.output);
          let reviewAccepted=false; let expanded:Review|null=null;
          try{if(parsed.success){expanded=expandDocumentWorkSourceReview(input,parsed.data!);reviewAccepted=validateDocumentWorkSourceReview(input,capturedNarrative,expanded).issues.length===0;}}catch{}
          responses.push({kind:"source_review",providerCallIndex:calls.length-1,contentFingerprint:fingerprintJson(response.output),validationPassed:reviewAccepted,diagnostics:null,syntheticNarrative:null,syntheticReview:expanded ?? (parsed.success?parsed.data!:null)});
          if(request.schemaName==="document_work_source_review_revision_v1" && revisedSelection!==null && revisedSelection!==undefined){
            try{capturedNarrative=hydrateDocumentWorkSelection(input,revisedSelection);validateDocumentWorkProductNarrative(input,capturedNarrative);}catch{}
          }
        }
        return response;
      }};
      try{
        const product=await runDocumentWorkProduct(input,{gateway:observedGateway});outputs.push(product);
        runs.push({caseId:sample.id,repeat,product,score:scoreDocumentWorkLive(product,sample),failure:null,diagnostics:null,providerCallRange:{start,end:calls.length},completeCalls,narrativeCalls,reviewCalls,responses});
      }catch(error){
        const diagnostics=documentWorkFailureDiagnostics(error,capturedNarrative,narrativeProviderIndex);
        runs.push({caseId:sample.id,repeat,product:null,score:null,failure:diagnostics.code,diagnostics,providerCallRange:{start,end:calls.length},completeCalls,narrativeCalls,reviewCalls,responses});
      }
      persist();
    }
    repeats.push({caseId:sample.id,comparison:outputs.length===2?compareDocumentWorkRepeats(outputs[0]!,outputs[1]!,sample):null});persist();
  }
  for(const sample of documentWorkSourceReviewCases){
    const start=controlCalls.length;
    try{
      validateDocumentWorkProductNarrative(sample.input,sample.narrative);
      const review=await reviewDocumentWorkSourceFidelity(sample.input,sample.narrative,{gateway:controlGateway});
      const passed=scoreDocumentWorkSourceReviewControl(sample,review);
      controls.push({caseId:sample.id,expectedIssueFieldId:sample.expectedIssueFieldId,expectedIssueFieldIds:sample.expectedIssueFieldIds,expectedCleanFieldIds:sample.expectedCleanFieldIds,scope:sample.scope,passed,review,failure:null,providerCallRange:{start,end:controlCalls.length}});
    }catch(error){controls.push({caseId:sample.id,expectedIssueFieldId:sample.expectedIssueFieldId,expectedIssueFieldIds:sample.expectedIssueFieldIds,expectedCleanFieldIds:sample.expectedCleanFieldIds,scope:sample.scope,passed:false,review:null,failure:documentWorkFailureDiagnostics(error,undefined,null).code,providerCallRange:{start,end:controlCalls.length}});}
    persist();
  }
  if(!persist())process.exitCode=1;
}
main().catch(()=>{console.error("document_work_product_live_setup_failed");process.exitCode=1;});
