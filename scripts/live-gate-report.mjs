#!/usr/bin/env node
// Builds the live gate report from the worker log: every model call, every routed turn, every
// preview run, with cost, latency and the points where the router abstained. Content-free: the
// report carries identifiers, decisions, models and numbers, never message text.
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname} from "node:path";

const [logPath, outPath] = process.argv.slice(2);
if (!logPath || !outPath) {
  console.error("usage: live-gate-report.mjs <worker.log> <report.json>");
  process.exit(2);
}
const events = readFileSync(logPath, "utf8").split("\n").filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const calls = events.filter((event) => event.event === "model.call").map((event) => ({
  at: event.at, job: event.job ?? null, task: event.task ?? null, provider: event.provider ?? null, model: event.model ?? null,
  effort: event.effort ?? null, outcome: event.outcome ?? null, costUsd: Number(event.costUsd ?? event.cost_usd ?? 0) || 0,
  latencyMs: Number(event.latencyMs ?? event.latency_ms ?? event.durationMs ?? 0) || 0,
  inputTokens: Number(event.inputTokens ?? 0) || 0, outputTokens: Number(event.outputTokens ?? 0) || 0,
}));
const turns = events.filter((event) => event.event === "live_preview.turn_routed" || event.event === "live_preview.router_failed").map((event) => ({
  at: event.at, job: event.job, decision: event.decision ?? "router_failed", composition: event.composition ?? null, corpus: event.corpus ?? null,
  abstained: event.abstained ?? event.event === "live_preview.router_failed", model: event.model ?? null, costUsd: Number(event.costUsd ?? 0) || 0, latencyMs: Number(event.latencyMs ?? 0) || 0,
}));
const runs = events.filter((event) => event.event === "integration_preview.run_completed" || event.event === "integration_preview.run_failed").map((event) => ({
  at: event.at, job: event.job, status: event.event.endsWith("completed") ? "completed" : "failed", composition: event.composition ?? null, replayed: event.replayed ?? null, message: event.message ?? null,
}));
const research = events.filter((event) => event.event === "live_preview.research").map((event) => ({
  at: event.at, job: event.job ?? null, status: event.status ?? null, queries: Number(event.queries ?? 0) || 0, sources: Number(event.sources ?? 0) || 0,
  cacheHits: Number(event.cacheHits ?? 0) || 0, providerCalls: Number(event.providerCalls ?? 0) || 0, maxCostExposureUsd: Number(event.maxCostExposureUsd ?? 0) || 0, reason: event.reason ?? null, latencyMs: Number(event.latencyMs ?? 0) || 0,
}));
const jobs = events.filter((event) => event.event === "job.finished").map((event) => ({job: event.job, status: event.status, ms: event.ms, modelCalls: event.modelCalls ?? 0, costUsd: Number(event.costUsd ?? 0) || 0}));
const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    modelCalls: calls.length,
    modelCallsSucceeded: calls.filter((call) => call.outcome === "ok" || call.outcome === "success" || call.outcome === "succeeded").length,
    costUsd: Number((jobs.reduce((total, job) => total + job.costUsd, 0)).toFixed(4)),
    turnsRouted: turns.length,
    abstentions: turns.filter((turn) => turn.abstained).length,
    previewRuns: runs.length,
    previewRunsFailed: runs.filter((run) => run.status === "failed").length,
    publicResearch: research.length,
    publicResearchSources: research.reduce((total, item) => total + item.sources, 0),
  },
  byModel: Object.fromEntries(Object.entries(calls.reduce((acc, call) => {
    const key = `${call.provider ?? "?"}/${call.model ?? "?"}`;
    acc[key] = acc[key] ?? {calls: 0, outcomes: {}};
    acc[key].calls += 1;
    acc[key].outcomes[call.outcome ?? "?"] = (acc[key].outcomes[call.outcome ?? "?"] ?? 0) + 1;
    return acc;
  }, {}))),
  turns, runs, jobs, calls, research,
};
mkdirSync(dirname(outPath), {recursive: true});
writeFileSync(outPath, JSON.stringify(report, null, 2));
const summary = [
  `# Live gate report (${report.generatedAt})`,
  "",
  `- Model calls: ${report.totals.modelCalls} (succeeded ${report.totals.modelCallsSucceeded})`,
  `- Total cost (job ledgers): US$ ${report.totals.costUsd.toFixed(4)}`,
  `- Turns routed by the live router: ${report.totals.turnsRouted}, abstentions ${report.totals.abstentions}`,
  `- Preview runs: ${report.totals.previewRuns}, failed ${report.totals.previewRunsFailed}`,
  `- Public research for companies without a corpus: ${report.totals.publicResearch} (${report.totals.publicResearchSources} sources; ${research.map((item) => item.status).join(", ") || "none"})`,
  "",
  "| turn | decision | composition | corpus | abstained | model | cost | latency ms |",
  "|---|---|---|---|---|---|---|---|",
  ...turns.map((turn, index) => `| ${index + 1} | ${turn.decision} | ${turn.composition ?? ""} | ${turn.corpus ?? ""} | ${turn.abstained} | ${turn.model ?? ""} | ${turn.costUsd.toFixed(4)} | ${turn.latencyMs} |`),
].join("\n");
writeFileSync(outPath.replace(/\.json$/, ".md"), summary + "\n");
console.log(summary);
