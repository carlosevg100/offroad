/**
 * `pnpm --filter @offroad/evals intent-router:gold [--dry-run] [--out <dir>] [--max-cost <usd>]
 *  [--request-id <uuid>] [--poll-seconds <n>]`
 *
 * Runs the production Intent Classifier contract on the canonical synthetic turns.
 *
 * All canonical turns run once for accuracy. Six plan-changing turns additionally run through two
 * authored paraphrases to prove that the same meaning preserves workflow identity. Each observation
 * runs the production router and the independent attributable-span extractor, then compiles
 * semantic objects before canonicalization. The report is promotion evidence only when all 52
 * manifest entries pass; this script never promotes or changes the production router.
 *
 * The live run never reaches a provider from this process. It requests a governed evaluation
 * through the evaluator's own session (`../src/governed-transport`); the worker runs the provider
 * preflight and every observation of the intent router family under the database's reservations,
 * one attempt at a time; and this script scores the committed run against the gold and verifies its
 * call ledger offline, with the same gate and call-evidence verifiers as before, writing
 * `intent-router-gold.json` and `intent-router-gold.md` (or `provider-preflight.json` when a
 * configured route fails its preflight) beside `evaluation.json` with the evaluation's identity,
 * fingerprints, reservations and cost. The environment carries the evaluator's credential and the
 * evaluation organization (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OFFROAD_EVALUATOR_EMAIL,
 * OFFROAD_EVALUATOR_PASSWORD, OFFROAD_EVALUATION_ORGANIZATION_ID), never a provider key.
 * `--request-id` resumes an earlier request instead of creating another evaluation. A partial
 * evaluation writes only `evaluation.json` and exits with status 3. `--dry-run` assembles the
 * snapshot and the budget without requesting anything.
 */
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {executionCanonicalText, intentRouterGoldRoutes, intentRouterGoldSnapshotContentHashes} from "@offroad/agent-contracts";

import {governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";
import type {GatewaySpentEvidence, verifyIntentRouterCallEvidence} from "../src/intent-router-call-evidence";
import type {IntentRouterGateObservation, summarizeIntentRouterGate} from "../src/intent-router-gate";
import {
  buildIntentRouterGoldSnapshot,
  intentRouterGoldBudget,
  intentRouterGoldPreflightRecord,
  intentRouterGoldRecord,
  intentRouterGoldScriptId,
  readIntentRouterGovernedResult,
} from "../src/intent-router-gold-transport";
import {assertTrustedPaidGateEnvironment, paidGateProvenance} from "../src/intent-router-gate-trust";
import {IntentRouterProviderPreflightError, type IntentRouterProviderPreflight} from "../src/intent-router-preflight";

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
};
const outDir = resolve(option("out", "results/intent-router-gold"));
const maxCostUsd = Number(option("max-cost", "3"));
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || maxCostUsd > 10) {
  throw new Error("--max-cost must be greater than 0 and no more than 10 USD");
}
const dryRun = args.includes("--dry-run");
const pollSeconds = Number(option("poll-seconds", "5"));
const requestId = option("request-id", "");
if (!Number.isFinite(pollSeconds) || pollSeconds < 1) throw new Error("--poll-seconds must be at least 1");

async function main(): Promise<void> {
  // The snapshot of the gate: the canonical gold, checked first, and the production contracts' inputs.
  const snapshot = buildIntentRouterGoldSnapshot();
  const plannedObservations = snapshot.observations.length;
  if (plannedObservations !== 52) throw new Error(`intent_router_manifest_must_have_52_observations:${plannedObservations}`);
  const snapshotText = executionCanonicalText(snapshot);
  console.log(`evaluation snapshot: ${Buffer.byteLength(snapshotText, "utf8")} bytes, sha256 ${createHash("sha256").update(snapshotText, "utf8").digest("hex").slice(0, 16)}, ${plannedObservations} observations, audience ${snapshot.audience.caseVersion}`);
  const budget = intentRouterGoldBudget(snapshot, maxCostUsd);
  console.log(`evaluation budget: ${budget.maxCostMicrousd} microusd, ${budget.maxModelCalls} calls, ${budget.maxDurationMs} ms of work`);
  if (dryRun) {
    console.log("dry run: no model called");
    return;
  }

  // Paid gate evidence comes only from the trusted post-merge workflow; the database then decides
  // whether this evaluator may ask and whether each send, repair and fallback may go.
  const gateEnvironment = {
    githubActions: process.env.GITHUB_ACTIONS, repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF, sha: process.env.GITHUB_SHA, workflowRef: process.env.GITHUB_WORKFLOW_REF,
    eventName: process.env.GITHUB_EVENT_NAME, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  };
  assertTrustedPaidGateEnvironment(gateEnvironment);

  // Live: the worker runs the intent router family under the governed transport. This process holds
  // no provider key and builds no adapter or gateway; it asks through the evaluator's session and
  // scores what the database committed.
  const evaluation = await requestGovernedEvaluation({
    audience: {...snapshot.audience, scriptId: intentRouterGoldScriptId},
    routes: intentRouterGoldRoutes(snapshot),
    budget,
    snapshot,
    sourceContentHashes: intentRouterGoldSnapshotContentHashes(snapshot),
    ...(requestId ? {requestId} : {}),
  }, {
    environment: readGovernedTransportEnvironment(),
    pollIntervalMs: pollSeconds * 1000,
    onProgress: (progress) => {
      if (progress.phase === "requested") console.log(`evaluation requested: ${progress.executionId} (${progress.request}), request ${progress.requestId}`);
      if (progress.phase === "waiting") console.log(`evaluation waiting: job ${progress.job ?? "unknown"}, run ${progress.run ?? "unknown"}, attempts ${progress.attempts ?? 0}`);
    },
  });

  mkdirSync(outDir, {recursive: true});
  writeFileSync(resolve(outDir, "evaluation.json"), `${JSON.stringify(governedEvaluationEvidence(evaluation), null, 2)}\n`, "utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if (evaluation.outcome !== "succeeded") {
    // A partial evaluation publishes only its reason: there is no run to score and no record to write.
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode = 3;
    return;
  }
  const result = readIntentRouterGovernedResult(evaluation.result, snapshot);
  if (result.outcome === "preflight_failed") {
    const preflight = intentRouterGoldPreflightRecord({result, generatedAt: new Date().toISOString()});
    writeFileSync(resolve(outDir, "provider-preflight.json"), `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
    writeFileSync(resolve(outDir, "intent-router-gold.md"), renderPreflightFailure(result.providerPreflight, result.gatewaySpent), "utf8");
    throw new IntentRouterProviderPreflightError(result.providerPreflight);
  }

  const record = intentRouterGoldRecord({result, maxCostUsd, provenance: paidGateProvenance(gateEnvironment), generatedAt: new Date().toISOString()});
  const spent = record.gatewaySpent;
  writeFileSync(resolve(outDir, "intent-router-gold.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  writeFileSync(resolve(outDir, "intent-router-gold.md"), renderMarkdown(record), "utf8");
  console.log(`gate=${record.passed ? "PASS" : "FAIL"} turns=${record.uniqueTurns} observations=${record.observations} fingerprint_invariance=${percent(record.fingerprintInvarianceRate)} qualified_stability=${percent(record.qualifiedStabilityRate)} attempts=${spent.calls} measured_cost=$${spent.costUsd.toFixed(4)} conservative_exposure=$${spent.budgetExposureUsd.toFixed(4)}`);
  console.log(`report=${resolve(outDir, "intent-router-gold.md")}`);
  if (!record.passed) process.exitCode = 1;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(record: ReturnType<typeof summarizeIntentRouterGate> & {
  generatedAt: string;
  gatewaySpent: GatewaySpentEvidence;
  providerPreflight: IntentRouterProviderPreflight[];
  callEvidence: ReturnType<typeof verifyIntentRouterCallEvidence>;
  attemptTelemetry: {
    observations: number; totalProviderAttempts: number; observationProviderAttempts: number;
    objectProviderAttempts: number;
    preflightProviderAttempts: number; sameModelRepairAttempts: number; providerFallbackAttempts: number;
    unknownCostAttempts: number;
  };
  runs: IntentRouterGateObservation[];
}): string {
  const lines = [
    "# Intent Router Gold Gate",
    "",
    `**Verdict:** ${record.passed ? "PASS" : "FAIL"}`,
    `**Generated:** ${record.generatedAt}`,
    `**Coverage:** ${record.uniqueTurns}/40 canonical turns; ${record.observations}/52 observations`,
    `**Manifest:** ${record.manifestPassed ? "PASS" : "FAIL"}`,
    `**Provider preflight:** ${record.providerPreflight.every(({passed}) => passed) ? "PASS" : "FAIL"} (${record.providerPreflight.map(({task, provider, configuredModel}) => `${task}:${provider}/${configuredModel}`).join(", ")})`,
    `**Provider-call lineage:** ${record.callEvidence.passed ? "PASS" : "FAIL"} (${record.callEvidence.linkedObservationOperations}/${record.callEvidence.observationOperations} observation operations; ${record.callEvidence.issues.length} issues)`,
    `**Pure fingerprint invariance:** ${record.fingerprintInvariantTurns}/${record.repeatedTurns} repeated turns (${percent(record.fingerprintInvarianceRate)})`,
    `**Qualified stability:** ${record.qualifiedStableTurns}/${record.repeatedTurns} repeated turns (${percent(record.qualifiedStabilityRate)})`,
    `**Cost:** independently recomputed list-price US$ ${record.callEvidence.recomputedMeasuredCostUsd.toFixed(4)}; gateway measured US$ ${record.gatewaySpent.costUsd.toFixed(4)}; conservative exposure US$ ${record.gatewaySpent.budgetExposureUsd.toFixed(4)}; ${record.gatewaySpent.unknownCostCalls} attempts with unknown cost; pricing table ${record.callEvidence.pricingTableFingerprint.slice(0, 16)}`,
    `**Volume:** ${record.attemptTelemetry.observations} observations; ${record.attemptTelemetry.totalProviderAttempts} total provider attempts (${record.attemptTelemetry.observationProviderAttempts} router + ${record.attemptTelemetry.objectProviderAttempts} object extractor + ${record.attemptTelemetry.preflightProviderAttempts} preflight); ${record.attemptTelemetry.sameModelRepairAttempts} same-model repairs; ${record.attemptTelemetry.providerFallbackAttempts} provider fallbacks`,
    `**Object coverage (separate from abstention):** ${record.objectCoverage.routedComplete}/${record.objectCoverage.routedTotal} routed observations complete; abstentions: ${record.objectCoverage.abstentionComplete} complete, ${record.objectCoverage.abstentionIncomplete} incomplete, ${record.objectCoverage.abstentionRejected} rejected; measured extractor cost US$ ${record.runs.reduce((sum, run) => sum + run.objectCostUsd, 0).toFixed(4)}`,
    `**Raw vs policy:** ${record.policyOverrideObservations}/${record.observations} observations changed by compilation/canonical policy; promotion metrics score the recomposed final output and raw-model metrics remain diagnostic.`,
    "",
    "## Promotion metrics",
    "",
    "| Metric | Result | Required | Verdict |",
    "| --- | ---: | ---: | --- |",
    ...record.metrics.map((metric) => `| ${metric.name} | ${metric.passed}/${metric.total} (${percent(metric.rate)}) | ${percent(metric.requiredRate)} | ${metric.gatePassed ? "PASS" : "FAIL"} |`),
    "",
    "## Raw-model diagnostics (non-gating)",
    "",
    "| Metric | Result |",
    "| --- | ---: |",
    ...record.rawMetrics.map((metric) => `| ${metric.name} | ${metric.passed}/${metric.total} (${percent(metric.rate)}) |`),
    "",
    "## Suite gates",
    "",
    "| Suite | Base observations | Verdict | Failed turns |",
    "| --- | ---: | --- | --- |",
    ...record.suiteGates.map((suite) => `| ${suite.suite} | ${suite.observations} | ${suite.passed ? "PASS" : "FAIL"} | ${suite.failedTurnIds.join(", ") || "none"} |`),
    "",
    "## Turn results",
    "",
    "| Turn | Run | Expected composition | Actual composition | Workflow checks | Error |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...record.runs.map((observation) => {
      const failed = Object.entries(observation.checks).filter(([, passed]) => !passed).map(([name]) => name);
      return `| ${observation.turnId} | ${observation.repeat} | ${observation.expected.composition ?? "abstain/no composition"} | ${observation.actual?.composition ?? "none"} | ${failed.length === 0 ? "PASS" : `FAIL: ${failed.join(", ")}`} | ${observation.error?.replaceAll("|", "\\|") ?? "none"} |`;
    }),
    "",
    "## Pure fingerprint invariance failures",
    "",
    record.fingerprintVariantTurnIds.length === 0 ? "None." : record.fingerprintVariantTurnIds.map((id) => `- ${id}`).join("\n"),
    "",
    "## Qualified stability failures",
    "",
    record.qualifiedUnstableTurnIds.length === 0 ? "None." : record.qualifiedUnstableTurnIds.map((id) => `- ${id}`).join("\n"),
    "",
    "> Passing this gate is necessary but not sufficient for production routing. It proves the bounded gold set and repeated-prompt invariance; it does not authorize a workflow, executor or customer-facing conclusion.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderPreflightFailure(
  providers: IntentRouterProviderPreflight[],
  spent: GatewaySpentEvidence,
): string {
  return [
    "# Intent Router Gold Gate",
    "",
    "**Verdict:** ABORTED BEFORE OBSERVATIONS",
    `**Generated:** ${new Date().toISOString()}`,
    `**Provider preflight:** FAIL (${providers.map(({task, provider, passed}) => `${task}:${provider}=${passed ? "PASS" : "FAIL"}`).join(", ") || "no result"})`,
    "**Coverage:** 0/40 canonical turns; 0/52 observations",
    `**Cost:** measured US$ ${spent.costUsd.toFixed(4)}; conservative exposure US$ ${spent.budgetExposureUsd.toFixed(4)}; ${spent.unknownCostCalls} attempts with unknown cost`,
    "",
    "> The gate aborted before the gold corpus because every configured router and semantic-object provider must pass its real prompt/input/schema contract independently.",
    "",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
