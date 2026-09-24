/**
 * Structured-output probe: asks the provider, with synthetic input, to answer each request shape
 * the routing tasks use (effort low or medium, thinking off or adaptive, a flat schema or the
 * nested envelope-like schema with a $ref, the routing schema at its real size, and that size as
 * prompted JSON) and prints the verdict per variant. The input is a fixed sentence about a
 * fictional company; nothing here is customer content.
 *
 * No model is called from this process. The probe runs in the worker as a governed evaluation (the
 * `probe-structured-output` family): this script requests it through the evaluator's own session
 * (`../src/governed-transport`), the worker reserves every request in the database before sending
 * it through the model gateway, on this one route with no fallback, and the script prints the
 * verdicts the database committed. A shape the provider answers outside its schema is reported
 * with the gateway's code and each attempt's outcome. A request the provider rejects has no usage
 * to settle: its reservation stays charged as uncertain and the evaluation ends partial, so a
 * rejection shows as `operation_uncertain` and its text is not published. The environment carries
 * the evaluator's credential and the evaluation organization (SUPABASE_URL,
 * SUPABASE_PUBLISHABLE_KEY, OFFROAD_EVALUATOR_EMAIL, OFFROAD_EVALUATOR_PASSWORD,
 * OFFROAD_EVALUATION_ORGANIZATION_ID), never a provider key.
 *
 * A live run needs `--max-cost`, in dollars at list price with every reservation included; there
 * is no default. `--dry-run` assembles the snapshot and its budget without requesting anything.
 * `--request-id` resumes an earlier request. A partial evaluation writes only its evaluation
 * evidence and exits with status 3.
 *
 *   pnpm --filter @offroad/evals exec tsx scripts/probe-structured-output.ts --max-cost <usd>
 *     [--dry-run] [--out <dir>] [--request-id <uuid>] [--poll-seconds <n>]
 */
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {
  executionCanonicalText,
  readStructuredOutputProbeResult,
  structuredOutputProbeCalls,
  structuredOutputProbeRoutes,
  structuredOutputProbeSnapshotSchema,
} from "@offroad/agent-contracts";

import {governedEvaluationEvidence, readGovernedTransportEnvironment, requestGovernedEvaluation} from "../src/governed-transport";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const valued = new Set(["--max-cost", "--out", "--request-id", "--poll-seconds"]);
const options = new Map<string, string>();
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index]!;
  if (arg === "--") continue;
  if (valued.has(arg)) {
    options.set(arg.slice(2), argv[index + 1] ?? "");
    index += 1;
  } else if (arg === "--dry-run") options.set("dry-run", "true");
  else {
    console.error(`unknown argument ${arg}`);
    process.exit(2);
  }
}
const option = (name: string, fallback = ""): string => options.get(name) || fallback;
const dryRun = options.has("dry-run");
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
/** How long a request may wait for the worker to claim it, beyond the work the budget allows. */
const queueAllowanceMs = 30 * 60_000;

const system = "You classify one sentence into the requested JSON. Return the requested JSON only.";
const input = [{type: "text" as const, text: JSON.stringify({latestUserMessage: "Preciso preparar uma reunião com a Companhia Fictícia sobre refinanciamento das debêntures."})}];

async function main(): Promise<void> {
  const variants: Array<{effort: "low" | "medium"; thinking: "off" | "adaptive"; shape: "flat" | "nested" | "full" | "full-prompted"}> = [];
  for (const effort of ["low", "medium"] as const) {
    for (const thinking of ["off", "adaptive"] as const) {
      for (const shape of ["flat", "nested", "full", "full-prompted"] as const) variants.push({effort, thinking, shape});
    }
  }
  const snapshot = structuredOutputProbeSnapshotSchema.parse({
    schemaVersion: "structured-output-probe-snapshot.v1",
    caseId: "structured-output-probe",
    caseVersion: "2026.09.24-v1",
    route: {provider: "anthropic", model: "claude-sonnet-5"},
    system,
    input,
    maxOutputTokens: 1_500,
    timeoutMs: 60_000,
    variants,
  });
  const snapshotText = executionCanonicalText(snapshot);
  // Each variant sends once, and a prompted one may take one same-model repair; every call may
  // take the whole timeout. The worker reserves each attempt at its list-price upper bound.
  const routes = structuredOutputProbeRoutes(snapshot);
  const maxModelCalls = structuredOutputProbeCalls(snapshot);
  const maxDurationMs = maxModelCalls * snapshot.timeoutMs;
  console.log(`evaluation snapshot: ${snapshot.variants.length} variants, ${Buffer.byteLength(snapshotText, "utf8")} bytes, sha256 ${sha256(snapshotText).slice(0, 16)}`);
  console.log(`evaluation routes: ${routes.map((route) => `${route.provider}/${route.model}@${route.effort}`).join(", ")}; at most ${maxModelCalls} calls, ${maxDurationMs} ms of work`);
  if (dryRun) {
    console.log("dry run: no model called");
    return;
  }

  // Live: the worker runs the probe family under the governed transport. This process holds no
  // provider key and builds no adapter or gateway; it asks through the evaluator's session and
  // prints what the database committed.
  const maxCostUsd = Number(option("max-cost"));
  const pollSeconds = Number(option("poll-seconds", "5"));
  const requestId = option("request-id");
  if (!option("max-cost") || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || !Number.isSafeInteger(Math.round(maxCostUsd * 1_000_000))
    || !Number.isFinite(pollSeconds) || pollSeconds < 1) {
    console.error("a live run needs --max-cost, a positive number of dollars at list price with every reservation included (there is no default), and --poll-seconds of at least 1");
    process.exit(2);
  }
  const budget = {maxCostMicrousd: Math.round(maxCostUsd * 1_000_000), maxModelCalls, maxDurationMs, expiresInMs: maxDurationMs + queueAllowanceMs};
  console.log(`evaluation budget: ${budget.maxCostMicrousd} microusd, ${maxModelCalls} calls, ${maxDurationMs} ms of work`);
  const evaluation = await requestGovernedEvaluation({
    audience: {caseId: snapshot.caseId, caseVersion: snapshot.caseVersion, scriptId: "probe-structured-output"},
    routes,
    budget,
    snapshot,
    // A fixed synthetic sentence and nothing else: the probe carries no source.
    sourceContentHashes: [],
    ...(requestId ? {requestId} : {}),
  }, {
    environment: readGovernedTransportEnvironment(),
    pollIntervalMs: pollSeconds * 1000,
    onProgress: (progress) => {
      if (progress.phase === "requested") console.log(`evaluation requested: ${progress.executionId} (${progress.request}), request ${progress.requestId}`);
      if (progress.phase === "waiting") console.log(`evaluation waiting: job ${progress.job ?? "unknown"}, run ${progress.run ?? "unknown"}, attempts ${progress.attempts ?? 0}`);
    },
  });

  const outDir = resolve(option("out", join(here, "..", "out")));
  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, "structured-output-probe.evaluation.json"), `${JSON.stringify(governedEvaluationEvidence(evaluation), null, 2)}\n`, "utf8");
  console.log(`evaluation committed: ${evaluation.outcome}/${evaluation.reason}, ${evaluation.cost.spentMicrousd} microusd over ${evaluation.cost.spentCalls} calls`);
  if (evaluation.outcome !== "succeeded") {
    // A partial evaluation publishes only its reason: there are no verdicts to print.
    console.error(`evaluation ${evaluation.executionId} is partial: ${evaluation.reason}`);
    process.exitCode = 3;
    return;
  }
  for (const variant of readStructuredOutputProbeResult(evaluation.result, snapshot).variants) {
    if (variant.verdict === "accepted") console.log(`OK    ${variant.label} model=${variant.model} ms=${variant.ms} keys=${variant.keys.join(",")}`);
    else console.log(`ERROR ${variant.label} code=${variant.code} attempts=${variant.attempts.map((attempt) => attempt.message ? `${attempt.outcome}: ${attempt.message}` : attempt.outcome).join(" | ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
