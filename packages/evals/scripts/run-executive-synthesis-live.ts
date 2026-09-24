/**
 * Synthetic author/reviewer contract evaluation, not application E2E or release approval.
 *
 * The author and the independent reviewer run in the worker under the governed evaluation
 * transport, never from this process: the script generates the synthetic case offline from the
 * authored scenario, as it always did, assembles the snapshot (the case, the author and reviewer
 * task policies and the reviewer opposite each author provider), requests the evaluation through
 * the evaluator's own session (`../src/governed-transport`) under the evaluation's ceiling (USD 3
 * and eight attempts), and writes the record the database committed, stamped with this run's
 * provenance, beside `evaluation.json`. No provider key is read. A partial evaluation writes only
 * `evaluation.json` and exits with status 3; a committed record that fails its gates exits with
 * status 1.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {executiveSynthesisLiveAudience, executiveSynthesisLiveContentHashes, executiveSynthesisLiveRoutes} from "@offroad/agent-contracts";
import {
  buildExecutiveSynthesisLiveSnapshot,
  documentWorkGovernedBudget,
  documentWorkLiveCeilings,
  documentWorkLiveOptions,
  executiveSynthesisLiveEvidence,
  executiveSynthesisLiveSummary,
  logGovernedProgress,
  readExecutiveSynthesisLiveResult,
  requesterProvenance,
} from "../src/document-work-governed";
import {assertDocumentWorkLiveEnvironment} from "../src/document-work-product-live";
import {GovernedTransportError, governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";

async function main() {
  assertDocumentWorkLiveEnvironment(process.env);
  const directory = resolve(process.env.RUNNER_TEMP ?? ".", "executive-synthesis-live");
  mkdirSync(directory, {recursive: true});
  const snapshot = buildExecutiveSynthesisLiveSnapshot();
  const options = documentWorkLiveOptions(process.argv.slice(2));
  // The evaluator's credential, read before anything is requested: absent, the run fails closed here.
  const environment = readGovernedTransportEnvironment();
  // Every call may take the longer of the author's and the reviewer's timeouts.
  const timeoutMs = Math.max(snapshot.policies.case_brief.timeoutMs, snapshot.policies.audit_evidence.timeoutMs);
  // Live: the worker writes and reviews the brief under the governed transport. This process holds
  // no provider key and builds no adapter or gateway.
  const evaluation = await requestGovernedEvaluation({
    audience: {...executiveSynthesisLiveAudience(snapshot), scriptId: "run-executive-synthesis-live"},
    routes: executiveSynthesisLiveRoutes(snapshot),
    budget: documentWorkGovernedBudget(documentWorkLiveCeilings.synthesis, timeoutMs),
    snapshot,
    sourceContentHashes: executiveSynthesisLiveContentHashes(snapshot),
    ...(options.requestId ? {requestId: options.requestId} : {}),
  }, {environment, pollIntervalMs: options.pollIntervalMs, onProgress: logGovernedProgress});
  writeFileSync(resolve(directory, "evaluation.json"), `${JSON.stringify(governedEvaluationEvidence(evaluation), null, 2)}\n`, "utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if (evaluation.outcome !== "succeeded") {
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode = 3;
    return;
  }
  const record = readExecutiveSynthesisLiveResult(evaluation.result, snapshot);
  writeFileSync(resolve(directory, "evidence.json"), JSON.stringify(executiveSynthesisLiveEvidence(record, requesterProvenance(process.env)), null, 2));
  writeFileSync(resolve(directory, "summary.md"), executiveSynthesisLiveSummary(record));
  if (!record.passed) process.exitCode = 1;
}
main().catch((error: unknown) => {console.error(error instanceof GovernedTransportError ? error.message : "executive_synthesis_live_setup_failed"); process.exitCode = 1;});
