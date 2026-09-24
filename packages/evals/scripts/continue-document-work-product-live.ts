/**
 * One missing control from the second authorized evaluation; never a fresh round.
 *
 * The plan (which control, one call, the dollars left) is derived offline from the pinned receipt
 * of the source run, exactly as before. The one review then runs in the worker under the governed
 * evaluation transport: the script requests it through the evaluator's own session
 * (`../src/governed-transport`) with that single call and those dollars as the contract's budget,
 * and writes the record the database committed, stamped with this run's provenance, beside
 * `evaluation.json`. The claim is persisted in `started.json` before the request crosses to the
 * transport; an interrupted run is never retried. No provider key is read. A partial evaluation
 * writes only `started.json` and `evaluation.json` and exits with status 3.
 */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {documentWorkContinuationAudience, documentWorkContinuationContentHashes, evaluationPolicyRoutes} from "@offroad/agent-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {documentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";

import {
  buildDocumentWorkContinuationSnapshot,
  documentWorkContinuationEvidence,
  documentWorkContinuationSummary,
  documentWorkGovernedBudget,
  documentWorkLiveOptions,
  logGovernedProgress,
  readDocumentWorkContinuationResult,
  requesterProvenance,
} from "../src/document-work-governed";
import {validateDocumentWorkProductContinuation} from "../src/document-work-product-continuation";
import {GovernedTransportError, governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";

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
  const snapshot=buildDocumentWorkContinuationSnapshot(plan);
  const options=documentWorkLiveOptions(process.argv.slice(2));
  // The evaluator's credential, read before the claim is written: absent, nothing is claimed or requested.
  const environment=readGovernedTransportEnvironment();
  const directory=resolve(env.RUNNER_TEMP!,"documentary-continuation");mkdirSync(directory,{recursive:true});
  // Persist the claim before crossing to the transport. An interrupted run is never retried.
  writeFileSync(resolve(directory,"started.json"),JSON.stringify({sourceRunId:plan.sourceRunId,runId:env.GITHUB_RUN_ID,caseId:plan.caseId,remainingCalls:1})+"\n");
  // Live: the worker runs the one review under the governed transport, with this one call and
  // these dollars as its whole budget. This process holds no provider key and builds no gateway.
  const evaluation=await requestGovernedEvaluation({
    audience:{...documentWorkContinuationAudience(snapshot),scriptId:"continue-document-work-product-live"},
    routes:evaluationPolicyRoutes(snapshot.policy),
    budget:documentWorkGovernedBudget({maxCostUsd:plan.maxCostUsd,maxCalls:plan.remainingCalls},snapshot.policy.timeoutMs),
    snapshot,
    sourceContentHashes:documentWorkContinuationContentHashes(snapshot),
    ...(options.requestId?{requestId:options.requestId}:{}),
  },{environment,pollIntervalMs:options.pollIntervalMs,onProgress:logGovernedProgress});
  writeFileSync(resolve(directory,"evaluation.json"),`${JSON.stringify(governedEvaluationEvidence(evaluation),null,2)}\n`,"utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if(evaluation.outcome!=="succeeded"){
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode=3;
    return;
  }
  const record=readDocumentWorkContinuationResult(evaluation.result,snapshot);
  writeFileSync(resolve(directory,"evidence.json"),JSON.stringify(documentWorkContinuationEvidence(record,requesterProvenance(env)),null,2)+"\n");
  writeFileSync(resolve(directory,"summary.md"),documentWorkContinuationSummary(record));
  if(!record.passed)process.exitCode=1;
}
main().catch((error:unknown)=>{console.error(error instanceof GovernedTransportError?error.message:"documentary_continuation_setup_rejected");process.exitCode=1;});
