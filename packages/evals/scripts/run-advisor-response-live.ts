/**
 * Protected probe of the production advisor response contract on both provider routes, in the
 * prior structured shape (diagnostic) and the current prompted shape (the gate).
 *
 * The four requests run in the worker under the governed evaluation transport, never from this
 * process: the script assembles the snapshot offline (the synthetic conversation, both routes and
 * the task policy), requests the evaluation through the evaluator's own session
 * (`../src/governed-transport`) under the probe's ceiling (USD 1 and eight attempts), and writes
 * the record the database committed, stamped with this run's provenance, beside
 * `evaluation.json`. No provider key is read. A partial evaluation writes only `evaluation.json`
 * and exits with status 3; a committed record that fails its gate exits with status 1.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {advisorResponseLiveAudience,advisorResponseLiveContentHashes,distinctEvaluationRoutes} from "@offroad/agent-contracts";
import {
  advisorResponseLiveEvidence,
  advisorResponseLiveSummary,
  buildAdvisorResponseLiveSnapshot,
  documentWorkGovernedBudget,
  documentWorkLiveCeilings,
  documentWorkLiveOptions,
  logGovernedProgress,
  readAdvisorResponseLiveResult,
  requesterProvenance,
} from "../src/document-work-governed";
import {assertDocumentWorkLiveEnvironment} from "../src/document-work-product-live";
import {GovernedTransportError,governedEvaluationEvidence,readGovernedTransportEnvironment,requestGovernedEvaluation} from "../src/governed-transport";

async function main(){
  assertDocumentWorkLiveEnvironment(process.env);
  const snapshot=buildAdvisorResponseLiveSnapshot();
  const options=documentWorkLiveOptions(process.argv.slice(2));
  // The evaluator's credential, read before anything is requested: absent, the run fails closed here.
  const environment=readGovernedTransportEnvironment();
  const directory=resolve(process.env.RUNNER_TEMP??"outputs","advisor-response-live");mkdirSync(directory,{recursive:true});
  // Live: the worker probes the contract under the governed transport. This process holds no
  // provider key and builds no adapter or gateway.
  const evaluation=await requestGovernedEvaluation({
    audience:{...advisorResponseLiveAudience(snapshot),scriptId:"run-advisor-response-live"},
    routes:distinctEvaluationRoutes([snapshot.routes.anthropic,snapshot.routes.openai]),
    budget:documentWorkGovernedBudget(documentWorkLiveCeilings.advisor,snapshot.policy.timeoutMs),
    snapshot,
    sourceContentHashes:advisorResponseLiveContentHashes(snapshot),
    ...(options.requestId?{requestId:options.requestId}:{}),
  },{environment,pollIntervalMs:options.pollIntervalMs,onProgress:logGovernedProgress});
  writeFileSync(resolve(directory,"evaluation.json"),`${JSON.stringify(governedEvaluationEvidence(evaluation),null,2)}\n`,"utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if(evaluation.outcome!=="succeeded"){
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode=3;
    return;
  }
  const record=readAdvisorResponseLiveResult(evaluation.result,snapshot);
  writeFileSync(resolve(directory,"evidence.json"),JSON.stringify(advisorResponseLiveEvidence(record,requesterProvenance(process.env)),null,2));
  writeFileSync(resolve(directory,"summary.md"),advisorResponseLiveSummary(record));
  if(!record.passed)process.exitCode=1;
}
main().catch((error:unknown)=>{process.exitCode=1;console.error(error instanceof GovernedTransportError?error.message:"advisor_response_probe_failed");});
