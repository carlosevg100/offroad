/**
 * The market part of the worker, alone, for the integrated proof of M2 part 4 (ADR 0023) against staging.
 * It runs the same modules the image runs (the acquisition consumer with its fetch, Storage and confirmation,
 * the orphan sweep, the scheduler and the RG-01 monitor) and nothing else: no document jobs, executions,
 * evaluations, outboxes of tenants, recomputes or retention. It refuses to start against any project but the
 * one named in MARKET_PROOF_PROJECT_REF. The stop is graceful and bounded: the deadline is armed before any remote
 * call; after it no job is claimed and no loop starts another cycle; an acquisition already claimed finishes
 * or fails under its own lease and timeouts, as in the image; then the timers are cleared and the process exits.
 * A watchdog armed with the deadline ends the process two minutes after it whatever is still pending (sign-in,
 * the schema contract, an upload, a renewal): the attempt then expires with its lease and its bytes go to the
 * orphan sweep, which is the same outcome as a worker that dies.
 *
 * Environment: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_ACCOUNT_EMAIL, WORKER_ACCOUNT_PASSWORD,
 * OFFROAD_WORKER_TOKEN, MARKET_PROOF_PROJECT_REF, MARKET_PROOF_MINUTES (default 30).
 */
import {createClient} from "@supabase/supabase-js";

import {createMarketAcquisitionQueue} from "../src/market-acquisition-queue";
import {createMarketObjectStore} from "../src/market-acquisition-storage";
import {createMarketScheduler, MARKET_SCHEDULER_CYCLE_MS, MarketSchedulerError, runMarketSchedulerCycle} from "../src/market-acquisition-scheduler";
import {createMarketRegimeMonitor, MARKET_RG01_CYCLE_MS, MarketRegimeMonitorError, runMarketRg01Cycle} from "../src/market-regime-monitor";
import {processMarketAcquisition, sweepMarketOrphans} from "../src/process-market-acquisition";
import {assertWorkerRuntimeSchema} from "../src/runtime-schema";

const log = (event: string, detail: Record<string, unknown> = {}) =>
  process.stdout.write(`${JSON.stringify({at: new Date().toISOString(), event, ...detail})}\n`);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const GRACE_MS = 2 * 60_000;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, {once: true});
});

async function main(): Promise<void> {
  const url = required("SUPABASE_URL");
  const project = required("MARKET_PROOF_PROJECT_REF");
  // The proof runs against the named project only: the host is checked before any credential is sent.
  if (new URL(url).hostname !== `${project}.supabase.co`) throw new Error("the Supabase URL is not the named project");
  const minutes = Number(process.env.MARKET_PROOF_MINUTES ?? "30");
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240) throw new Error("MARKET_PROOF_MINUTES out of range");
  const stop = new AbortController();
  const deadline = setTimeout(() => stop.abort(), minutes * 60_000);
  const watchdog = setTimeout(() => { log("proof.forced_exit"); process.exit(2); }, minutes * 60_000 + GRACE_MS);
  const onSignal = () => stop.abort();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try { await run(url, project, minutes, stop.signal); }
  finally {
    clearTimeout(deadline);
    clearTimeout(watchdog);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

async function run(url: string, project: string, minutes: number, signal: AbortSignal): Promise<void> {
  const token = required("OFFROAD_WORKER_TOKEN");
  const supabase = createClient(url, required("SUPABASE_PUBLISHABLE_KEY"), {auth: {persistSession: false, autoRefreshToken: true}});
  const {error} = await supabase.auth.signInWithPassword({email: required("WORKER_ACCOUNT_EMAIL"), password: required("WORKER_ACCOUNT_PASSWORD")});
  if (error) throw new Error("the proof worker could not sign in");
  const contract = await assertWorkerRuntimeSchema(supabase);
  log("proof.started", {project, minutes, schemaVersion: contract.schemaVersion});
  const stop = {signal};

  const queue = createMarketAcquisitionQueue(supabase, token);
  const store = createMarketObjectStore(supabase);
  const scheduler = createMarketScheduler(supabase, token);
  const monitor = createMarketRegimeMonitor(supabase, token);

  const schedulerLoop = (async () => {
    while (!stop.signal.aborted) {
      await runMarketSchedulerCycle(scheduler)
        .then((r) => { if (r.statuses.length > 0) log("market.scheduler", {fired: r.fired, details: r.details, statuses: r.statuses.join(","), blocked: r.blocked.join(",")}); })
        .catch((e) => log("market.scheduler_failed", {reason: e instanceof MarketSchedulerError ? e.code : "market_scheduler_transport_failed"}));
      await sleep(MARKET_SCHEDULER_CYCLE_MS, stop.signal);
    }
  })();
  const monitorLoop = (async () => {
    while (!stop.signal.aborted) {
      await runMarketRg01Cycle(monitor, stop.signal)
        .then((r) => { if (r.status === "ran") log("market.rg01", {scheduled: r.scheduled, events: r.events, runs: r.runs.join(","), fired: r.fired}); })
        .catch((e) => log("market.rg01_failed", {reason: e instanceof MarketRegimeMonitorError ? e.code : "market_regime_monitor_transport_failed"}));
      await sleep(MARKET_RG01_CYCLE_MS, stop.signal);
    }
  })();

  let idle = 0;
  while (!stop.signal.aborted) {
    let claim;
    try { claim = await queue.claim(); }
    catch { log("market.poll_failed"); await sleep(5000, stop.signal); continue; }
    if (claim) {
      const result = await processMarketAcquisition(claim, queue, store, stop.signal);
      log("market.finished", {job: claim.jobId, contract: claim.contractId, status: result.status,
        ...(result.status === "failed" ? {code: result.code} : result.status === "abandoned" ? {reason: result.reason} : {})});
      continue;
    }
    if (++idle % 10 === 0) {
      await sweepMarketOrphans(queue, store).then((n) => { if (n > 0) log("market.swept", {count: n}); }).catch(() => log("market.sweep_failed"));
    }
    await sleep(5000, stop.signal);
  }
  await Promise.all([schedulerLoop, monitorLoop]);
  supabase.auth.stopAutoRefresh();
  log("proof.stopped");
}

main()
  .then(() => process.exit(0))
  .catch((error) => { log("proof.failed", {message: (error as Error).message}); process.exit(1); });
