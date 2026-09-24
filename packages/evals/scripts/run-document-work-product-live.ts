/**
 * Protected live executor and source-review controls; never application E2E or promotion.
 *
 * `pnpm --filter @offroad/evals exec tsx scripts/run-document-work-product-live.ts [--request-id <uuid>] [--poll-seconds <n>]`
 *
 * The documentary executor and its authored source-review controls never reach a provider from
 * this process. The script assembles the snapshot offline (the authored gold cases, the controls
 * and the executor's task policy), requests a governed evaluation through the evaluator's own
 * session (`../src/governed-transport`) under the ceilings the evaluation always kept (USD 3 and
 * 26 attempts, gold USD 2.50 and 18 attempts, the controls the rest), and the worker runs the
 * documentary family with every send, repair and fallback reserved in the database first. The
 * script writes the record the database committed, stamped with this run's provenance, its
 * summary, and `evaluation.json` with the evaluation's identity, fingerprints, reservations and
 * cost. The environment carries the evaluator's credential and the evaluation organization
 * (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OFFROAD_EVALUATOR_EMAIL, OFFROAD_EVALUATOR_PASSWORD,
 * OFFROAD_EVALUATION_ORGANIZATION_ID), never a provider key. `--request-id` resumes an earlier
 * request. A partial evaluation writes only `evaluation.json` and exits with status 3; a committed
 * record that fails its gates exits with status 1, as it always did.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {documentWorkProductLiveAudience, documentWorkProductLiveContentHashes, evaluationPolicyRoutes} from "@offroad/agent-contracts";

import {
  buildDocumentWorkProductLiveSnapshot,
  documentWorkGovernedBudget,
  documentWorkLiveCeilings,
  documentWorkLiveOptions,
  documentWorkProductLiveEvidence,
  documentWorkProductLiveSummary,
  logGovernedProgress,
  readDocumentWorkProductLiveResult,
  requesterProvenance,
} from "../src/document-work-governed";
import {assertDocumentWorkLiveEnvironment} from "../src/document-work-product-live";
import {GovernedTransportError, governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";

async function main() {
  assertDocumentWorkLiveEnvironment(process.env);
  const directory = resolve(process.env.RUNNER_TEMP ?? ".", "document-work-product-live");
  mkdirSync(directory, {recursive: true});
  const snapshot = buildDocumentWorkProductLiveSnapshot();
  const options = documentWorkLiveOptions(process.argv.slice(2));
  // The evaluator's credential, read before anything is requested: absent, the run fails closed here.
  const environment = readGovernedTransportEnvironment();
  const budget = documentWorkGovernedBudget(documentWorkLiveCeilings.documentary, snapshot.policy.timeoutMs);
  console.log(`evaluation budget: ${budget.maxCostMicrousd} microusd, ${budget.maxModelCalls} calls, ${budget.maxDurationMs} ms of work`);

  // Live: the worker runs the documentary family under the governed transport. This process holds
  // no provider key and builds no adapter or gateway; it asks through the evaluator's session and
  // writes what the database committed.
  const evaluation = await requestGovernedEvaluation({
    audience: {...documentWorkProductLiveAudience(snapshot), scriptId: "run-document-work-product-live"},
    routes: evaluationPolicyRoutes(snapshot.policy),
    budget,
    snapshot,
    sourceContentHashes: documentWorkProductLiveContentHashes(snapshot),
    ...(options.requestId ? {requestId: options.requestId} : {}),
  }, {environment, pollIntervalMs: options.pollIntervalMs, onProgress: logGovernedProgress});

  writeFileSync(resolve(directory, "evaluation.json"), `${JSON.stringify(governedEvaluationEvidence(evaluation), null, 2)}\n`, "utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if (evaluation.outcome !== "succeeded") {
    // A partial evaluation publishes only its reason: there is no record to write.
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode = 3;
    return;
  }
  const record = readDocumentWorkProductLiveResult(evaluation.result, snapshot);
  writeFileSync(resolve(directory, "evidence.json"), JSON.stringify(documentWorkProductLiveEvidence(record, requesterProvenance(process.env)), null, 2));
  writeFileSync(resolve(directory, "summary.md"), documentWorkProductLiveSummary(record));
  if (!record.passed) process.exitCode = 1;
}
// Only a transport refusal names itself, by code; anything else stays the fixed setup failure.
main().catch((error: unknown) => {console.error(error instanceof GovernedTransportError ? error.message : "document_work_product_live_setup_failed"); process.exitCode = 1;});
