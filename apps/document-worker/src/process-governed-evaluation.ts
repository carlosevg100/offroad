import {setTimeout as delay} from "node:timers/promises";
import {
 executionCanonicalText,
 executionSerializationVersion,
 governedEvaluationContractSchema,
 governedEvaluationPartialResult,
 governedEvaluationToolId,
 loadExecutionCanonicalText,
 type GovernedEvaluationContract,
 type GovernedEvaluationOutcome,
 type GovernedEvaluationPartialReason,
 type GovernedEvaluationReason,
} from "@offroad/agent-contracts";
import {assertModelAllowed, type GatewayCallLog, type Provider, type ProviderAdapter} from "@offroad/model-gateway";
import {evaluationFamilies, type EvaluationFamily, type PreparedEvaluation} from "./evaluation-families";
import {EvaluationTransportError, type EvaluationQueue, type EvaluationQueueClaim, type EvaluationRenewal} from "./evaluation-queue";
import {createGovernedEvaluationGateway, governedEvaluationToolVersion} from "./governed-evaluation-gateway";
import type {ProviderConnections} from "./provider-processing";

export type GovernedEvaluationDependencies = {
 /** Provider adapters the worker holds; each call through them is reserved and settled first. */
 adapters: Partial<Record<Provider, ProviderAdapter>>;
 /** The route metadata of each provider connection, as assurances record it. */
 connections: ProviderConnections;
 families?: Readonly<Record<string, EvaluationFamily>>;
 clock?: () => Date;
 /** Lease renewal cadence; the lease itself lasts sixty seconds. */
 heartbeatMs?: number;
 onCall?: (log: GatewayCallLog) => void;
};
export type GovernedEvaluationResult =
 | {status: GovernedEvaluationOutcome; reason: GovernedEvaluationReason; replayed: boolean}
 | {status: "aborted"};

/** The largest result the database stores. */
const maximumResultBytes = 8_388_608;
/** The database's precedence of partial reasons, strongest first. */
const precedence: GovernedEvaluationPartialReason[] = ["transport_denied", "budget_exhausted", "operation_uncertain"];

/**
 * Consumer of one governed evaluation claim. The contract and snapshot bytes are verified before
 * anything else, so a mismatch refuses the claim before any reservation or send. The lease is
 * renewed throughout; the family runs through a gateway that reserves every attempt in the
 * database and settles it from the gateway's usage report; and the commit carries the reason the
 * database derives, computed from what this lease observed: transport denied, budget exhausted,
 * operation uncertain, or evaluation failed, and success with the result bytes only when every
 * operation settled. A heartbeat refusal stops the run without a commit, like the pinned consumer.
 */
export async function processGovernedEvaluation(c: EvaluationQueueClaim, queue: EvaluationQueue, shutdown: AbortSignal,
 deps: GovernedEvaluationDependencies): Promise<GovernedEvaluationResult> {
 const contract = governedEvaluationContractSchema.parse(loadExecutionCanonicalText(c.contractText, c.contractFingerprint, executionSerializationVersion));
 if (contract.executionId !== c.executionId) throw new Error("evaluation_claim_mismatch");
 const snapshot = loadExecutionCanonicalText(c.snapshotText, contract.inputs.fingerprint, executionSerializationVersion);
 const clock = deps.clock ?? (() => new Date());
 const abort = new AbortController(), stop = new AbortController();
 let denied = false, budgetDeadline = Infinity, leaseDeadline = Infinity, timer: ReturnType<typeof setTimeout> | undefined;
 // Exhaustion the database already counts (the claim, a renewal at zero) or only this lease's clock
 // does so far; only the first may be published as budget_exhausted.
 let exhausted: "database" | "clock" | null = c.budgetExpired ? "database" : null;
 // Read through a function: the timer and the renewals change it behind the control flow.
 const exhaustion = () => exhausted;
 let remainingAtLastRenewal = Infinity;
 const onShutdown = () => abort.abort();
 shutdown.addEventListener("abort", onShutdown, {once: true});
 if (shutdown.aborted) abort.abort();
 const schedule = () => {
  if (timer) clearTimeout(timer);
  const now = performance.now();
  if (budgetDeadline <= now) { exhausted ??= "clock"; abort.abort(); return; }
  if (leaseDeadline <= now) { denied = true; abort.abort(); return; }
  // Checked again at least every minute, so a far deadline never overflows the timer.
  timer = setTimeout(schedule, Math.min(60_000, Math.max(0, Math.min(budgetDeadline, leaseDeadline) - now)));
 };
 const verify = (r: EvaluationRenewal, requestStarted: number) => {
  if (r.jobId !== c.jobId || r.leaseId !== c.leaseId || r.executionId !== c.executionId || r.organizationId !== contract.organizationId
   || r.processingRunId !== contract.processingRunId || r.contractFingerprint !== c.contractFingerprint) throw new Error("evaluation_authority_mismatch");
  if (r.elapsedDurationMs < c.elapsedDurationMs) throw new Error("evaluation_duration_reset");
  const now = performance.now();
  remainingAtLastRenewal = r.remainingDurationMs;
  if (r.remainingDurationMs === 0) exhausted = "database";
  // Subtract the whole round trip from the budget and never extend a deadline already observed;
  // the lease deadline moves with each renewal and stops the run only if renewals stop landing.
  budgetDeadline = Math.min(budgetDeadline, now + Math.max(0, r.remainingDurationMs - (now - requestStarted)));
  leaseDeadline = now + Math.max(0, Date.parse(r.leaseExpiresAt) - Date.now() - 5000);
  schedule();
 };
 const renew = async () => { const started = performance.now(); verify(await queue.renew(c), started); };
 let heartbeat: Promise<void> | undefined;
 let governed: ReturnType<typeof createGovernedEvaluationGateway> | undefined;
 try {
  if (abort.signal.aborted) return {status: "aborted"};
  await renew();
  heartbeat = (async () => {
   while (!stop.signal.aborted) {
    try { await delay(deps.heartbeatMs ?? 10_000, undefined, {signal: stop.signal}); } catch { return; }
    if (stop.signal.aborted) return;
    try { await renew(); } catch { denied = true; abort.abort(); return; }
   }
  })();

  let reason: GovernedEvaluationPartialReason | null = null;
  let resultText = "";
  const before = exhaustion();
  const prepared = before ? null : prepare(contract, snapshot, deps.families ?? evaluationFamilies);
  // Out of budget before anything was sent: nothing runs. The confirmation below turns a clock-only
  // exhaustion into budget_exhausted once the database counts it too.
  if (before) reason = before === "database" ? "budget_exhausted" : "evaluation_failed";
  else if (abort.signal.aborted) {
   // Stopped before anything was reserved: the evaluation stays open for a later lease.
   stop.abort();
   await heartbeat;
   return {status: "aborted"};
  } else if (!prepared) reason = "evaluation_failed";
  else {
   const run = createGovernedEvaluationGateway({claim: c, queue, contract, adapters: deps.adapters, connections: deps.connections,
    policies: prepared.policies, ...(deps.onCall ? {onCall: deps.onCall} : {})});
   governed = run;
   // The moment the run is stopped, no further attempt may reserve or send.
   abort.signal.addEventListener("abort", () => run.halt(), {once: true});
   let output: unknown, failed = false;
   try { output = await untilAborted(prepared.run(run.gateway, clock), abort.signal); }
   catch { failed = true; }
   if (denied) {
    // Authority is gone: settle what is known at best, publish nothing.
    await run.finish("abandoned").catch(() => undefined);
    return {status: "aborted"};
   }
   if (shutdown.aborted && exhaustion() === null && !run.inFlight()) {
    // Nothing is at a provider: settle, and unless the outcome is already decided keep the
    // evaluation open, so a later lease runs it again instead of publishing a failure.
    await run.finish("completed");
    if (run.requiredReason() === null) return {status: "aborted"};
   }
   await run.finish(abort.signal.aborted ? "abandoned" : "completed");
   reason = run.requiredReason() ?? (exhaustion() === "database" ? "budget_exhausted" : failed ? "evaluation_failed" : null);
   if (reason === null) {
    try { resultText = executionCanonicalText(output); } catch { reason = "evaluation_failed"; }
    if (reason === null && Buffer.byteLength(resultText, "utf8") > maximumResultBytes) reason = "evaluation_failed";
   }
  }
  stop.abort();
  await heartbeat;
  if (denied) return {status: "aborted"};
  // Publication happens under current authority; a budget that ran out on this lease's clock is
  // recorded as exhausted only once the database counts it the same way.
  await renew();
  for (let wait = 0; exhaustion() === "clock" && wait < 5; wait++) {
   await delay(Math.min(remainingAtLastRenewal + 100, 5_000));
   await renew();
  }
  if (exhaustion() === "database" && reason !== "transport_denied") reason = "budget_exhausted";
  return await commit(c, queue, contract, reason, resultText);
 } finally {
  stop.abort();
  abort.abort();
  if (timer) clearTimeout(timer);
  shutdown.removeEventListener("abort", onShutdown);
  await heartbeat;
  await governed?.finish("abandoned").catch(() => undefined);
 }
}

/**
 * The family of the contract's script, its strictly read snapshot, and the checks that keep a run
 * inside its contract: the case it names, the sources it declares and a declared, allowed tool for
 * every route. Anything else ends the evaluation as failed before anything is reserved or sent.
 */
export function prepare(contract: GovernedEvaluationContract, snapshot: unknown, families: Readonly<Record<string, EvaluationFamily>>): PreparedEvaluation | null {
 if (!Object.hasOwn(families, contract.audience.scriptId)) return null;
 const family = families[contract.audience.scriptId]!;
 let prepared: PreparedEvaluation;
 try { prepared = family.prepare(snapshot); } catch { return null; }
 if (prepared.audience.caseId !== contract.audience.caseId || prepared.audience.caseVersion !== contract.audience.caseVersion) return null;
 const declared = new Set(contract.inputs.sources.map((source) => source.contentHash));
 if (declared.size !== new Set(prepared.contentHashes).size || prepared.contentHashes.some((hash) => !declared.has(hash))) return null;
 for (const route of prepared.routes) {
  try { assertModelAllowed(route); } catch { return null; }
  if (!contract.tools.some((tool) => tool.id === governedEvaluationToolId(route.provider, route.model) && tool.version === governedEvaluationToolVersion)) return null;
 }
 return prepared;
}

/**
 * Publishes once. The first attempt carries the reason derived from this lease; when the database
 * knows more (a send a previous lease left uncertain, an assurance revoked after the last
 * reservation), it refuses with evaluation_partial_result_required and changes nothing, and the
 * remaining reasons are tried in its own precedence order, nearest first.
 */
async function commit(c: EvaluationQueueClaim, queue: EvaluationQueue, contract: GovernedEvaluationContract,
 reason: GovernedEvaluationPartialReason | null, resultText: string): Promise<GovernedEvaluationResult> {
 const above = (current: GovernedEvaluationReason) => {
  const index = precedence.indexOf(current as GovernedEvaluationPartialReason);
  return (index < 0 ? [...precedence] : precedence.slice(0, index)).reverse();
 };
 const below = (current: GovernedEvaluationReason) => {
  const index = precedence.indexOf(current as GovernedEvaluationPartialReason);
  return index < 0 ? [] : precedence.slice(index + 1);
 };
 const first: GovernedEvaluationReason = reason ?? "evaluated";
 const candidates = [...new Set<GovernedEvaluationReason>([first, ...above(first), ...below(first), "evaluation_failed"])];
 let refusal: unknown;
 for (const candidate of candidates) {
  const outcome: GovernedEvaluationOutcome = candidate === "evaluated" ? "succeeded" : "partial";
  const text = candidate === "evaluated" ? resultText : executionCanonicalText(governedEvaluationPartialResult(candidate));
  try {
   const receipt = await queue.commit(c, contract.inputs.fingerprint, text, outcome, candidate);
   return {status: outcome, reason: candidate, replayed: receipt.replayed};
  } catch (error) {
   refusal = error;
   const code = error instanceof EvaluationTransportError ? error.code : null;
   if (code !== "evaluation_partial_result_required" && !(code === "evaluation_receipt_required" && candidate === "evaluated")) throw error;
  }
 }
 throw refusal;
}

/** Waits for the work unless the signal aborts first; the work itself cannot be cancelled. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
 work.catch(() => undefined);
 if (signal.aborted) return Promise.reject(new Error("evaluation_aborted"));
 return new Promise<T>((resolve, reject) => {
  const onAbort = () => reject(new Error("evaluation_aborted"));
  signal.addEventListener("abort", onAbort, {once: true});
  work.then((value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
   (error: unknown) => { signal.removeEventListener("abort", onAbort); reject(error); });
 });
}
