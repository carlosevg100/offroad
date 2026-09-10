/** One missing control from the second authorized evaluation; never a fresh round. */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {fingerprintJson} from "@offroad/case-understanding";
import {createModelGateway, createAnthropicAdapter, type GatewayCallLog} from "@offroad/model-gateway";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {documentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";
import {scoreDocumentWorkSourceReviewControl} from "../src/document-work-product-live";
import {validateDocumentWorkProductContinuation} from "../src/document-work-product-continuation";

async function main() {
  const env=process.env;
  if(env.GITHUB_ACTIONS!=="true" || env.GITHUB_REPOSITORY!=="carlosevg100/offroad" || env.GITHUB_REF!=="refs/heads/main"
    || env.GITHUB_RUN_ATTEMPT!=="1" || env.GITHUB_EVENT_NAME!=="workflow_dispatch"
    || env.GITHUB_WORKFLOW_REF!=="carlosevg100/offroad/.github/workflows/document-work-product-continuation.yml@refs/heads/main") throw new Error("protected_continuation_required");
  const receiptBytes=readFileSync(resolve(env.RUNNER_TEMP!,"documentary-parent/document-work-product-live/evidence.json"),"utf8");
  const plan=validateDocumentWorkProductContinuation({receiptBytes,trusted:{
    runId:"34467680287",runAttempt:"1",gitSha:"d3763a7fd28e9ff5e35acdb9d748ef8b3d126ce1",
    receiptSha256:"01c86a6de3c52f704a9ecf1917d03163d29d2a84d9b51c542e8b3ac0a480ed47",
    fixtureFingerprint:fingerprintJson(documentWorkProductLiveCases),sourceReviewFixtureFingerprint:fingerprintJson(documentWorkSourceReviewCases),
  }});
  const sample=documentWorkSourceReviewCases.find(sample=>sample.id===plan.caseId);
  if(!sample || !env.ANTHROPIC_API_KEY) throw new Error("continuation_source_unavailable");
  const directory=resolve(env.RUNNER_TEMP!,"documentary-continuation");mkdirSync(directory,{recursive:true});
  const calls:GatewayCallLog[]=[];
  const gateway=createModelGateway({adapters:{anthropic:createAnthropicAdapter({apiKey:env.ANTHROPIC_API_KEY,disableSdkRetries:true})},
    budget:{maxCalls:1,maxCostUsd:plan.maxCostUsd},budgetReservation:"conservative_text_v1",onCall:call=>calls.push(call)});
  const path=pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)),"../../../apps/document-worker/src/document-work-source-review.ts")).href;
  const {reviewDocumentWorkSourceFidelity}=await import(path) as {reviewDocumentWorkSourceFidelity:(input:unknown,narrative:unknown,deps:{gateway:typeof gateway})=>Promise<{issues:Array<{fieldId:string}>}>};
  // Persist the claim before crossing the provider boundary. An interrupted run is never retried.
  writeFileSync(resolve(directory,"started.json"),JSON.stringify({sourceRunId:plan.sourceRunId,runId:env.GITHUB_RUN_ID,caseId:plan.caseId,remainingCalls:1})+"\n");
  let review:Awaited<ReturnType<typeof reviewDocumentWorkSourceFidelity>>|null=null;
  let failure:string|null=null;
  try {review=await reviewDocumentWorkSourceFidelity(sample.input,sample.narrative,{gateway});}
  catch {failure="continuation_rejected_or_unknown";}
  const spent=gateway.spent();
  const combinedCalls=plan.priorCalls+spent.calls,combinedCostUsd=plan.priorCostUsd+spent.costUsd;
  const passed=review!==null && scoreDocumentWorkSourceReviewControl(sample,review) && spent.calls===1
    && spent.unknownCostCalls===0 && spent.costUsd<=plan.maxCostUsd && combinedCalls===26 && combinedCostUsd<=3;
  const evidence={schemaVersion:"document-work-product-continuation.v1",synthetic:true,scope:"one_previously_unexecuted_control",
    sourceRunId:plan.sourceRunId,sourceReceiptSha256:plan.sourceReceiptSha256,sourceEvaluationPassed:false,
    runId:env.GITHUB_RUN_ID,gitSha:env.GITHUB_SHA,runAttempt:env.GITHUB_RUN_ATTEMPT,caseId:plan.caseId,
    passed,combinedAcceptancePassed:passed,combinedCalls,combinedCostUsd,priorCalls:plan.priorCalls,priorCostUsd:plan.priorCostUsd,
    spent,calls,review,failure};
  writeFileSync(resolve(directory,"evidence.json"),JSON.stringify(evidence,null,2)+"\n");
  writeFileSync(resolve(directory,"summary.md"),`# Documentary evaluation continuation\n\n${passed?"PASS":"FAIL"}: one previously unexecuted control.\n\nSource run ${plan.sourceRunId} remains immutable and failed for incomplete coverage. This linked receipt completes that coverage only if passed.\n\nCombined attempts: ${combinedCalls}/26. Combined measured USD: ${combinedCostUsd}/3. No gold request or prior control repeated. This is not application E2E or automatic promotion.\n`);
  if(!passed)process.exitCode=1;
}
main().catch(()=>{console.error("documentary_continuation_setup_rejected");process.exitCode=1;});
