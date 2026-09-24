import {randomUUID} from "node:crypto";
import {governedEvaluationToolId, type GovernedEvaluationContract, type GovernedEvaluationPartialReason} from "@offroad/agent-contracts";
import {
 createModelGateway,
 defaultTaskPolicies,
 modelGatewayVersion,
 retentionMatrixVersion,
 type GatewayAttempt,
 type GatewayCallLog,
 type ModelGateway,
 type ProcessingEligibilityDecision,
 type Provider,
 type ProviderAdapter,
 type TaskKind,
 type TaskPolicy,
} from "@offroad/model-gateway";
import {EvaluationTransportError, type EvaluationQueue, type EvaluationQueueClaim, type EvaluationReservation, type EvaluationSettlement} from "./evaluation-queue";
import {providerEndpoints, type ProviderConnections} from "./provider-processing";

/**
 * The version a contract declares for every provider route it allows: the model gateway that
 * carries the call. A gateway release changes it, so an older contract no longer transmits.
 */
export const governedEvaluationToolVersion = modelGatewayVersion;

/** Integer microdollars, rounded up, from a dollar figure that is itself rounded to microdollars. */
export function microusdCeil(usd: number): number {
 if (!Number.isFinite(usd) || usd < 0) throw new Error("evaluation_cost_invalid");
 const value = Math.ceil(Math.round(usd * 1e9) / 1000);
 if (!Number.isSafeInteger(value)) throw new Error("evaluation_cost_invalid");
 return value;
}

export type EvaluationAttemptKind = "send" | "repair" | "fallback";
/** One reserved operation: an attempt the database authorized, and what became of it. */
export type EvaluationOperationRecord = {
 operationId: string;
 invocationId: string;
 kind: EvaluationAttemptKind;
 provider: Provider;
 model: string;
 reservedMicrousd: number;
 /** The provider adapter was invoked for it. */
 sent: boolean;
 /** The gateway's call log of the sent attempt. */
 report: {costStatus: GatewayCallLog["costStatus"]; costUsd: number} | null;
 /** What the database holds for it once the worker settled it; unsettled when that failed. */
 final: "settled" | "uncertain" | "unsettled" | null;
};

/** Why sending stopped: a database answer, a paused switch, a failed transport, or the consumer. */
export type EvaluationStopCause = "transport_denied" | "budget_exhausted" | "transport_paused" | "transport_failed" | "reservation_mismatch" | "route_undeclared" | "stopped";
export class EvaluationStop extends Error {
 constructor(readonly cause: EvaluationStopCause) { super(`evaluation_stopped:${cause}`); this.name = "EvaluationStop"; }
}

export type GovernedEvaluationGateway = {
 gateway: ModelGateway;
 operations: readonly EvaluationOperationRecord[];
 /** What the reservations answered; the database derives the same facts from its journal. */
 observed: {denied: boolean; exhausted: boolean; paused: boolean};
 /** True while an attempt is at the provider: sent and not yet reported by the gateway. */
 inFlight(): boolean;
 /** Stops every later reservation and send at once; what is already reserved stays to be settled. */
 halt(): void;
 /**
  * Stops every later reservation and send, waits for a reservation already under way, and settles
  * each operation: unsent ones as zero, reported ones from the gateway's usage, and, when the run
  * is abandoned, the one still at the provider as uncertain. Idempotent.
  */
 finish(mode: "completed" | "abandoned"): Promise<void>;
 /** The partial reason the database will require, from what the reservations and settlements saw. */
 requiredReason(): GovernedEvaluationPartialReason | null;
};

/**
 * A model gateway whose every attempt (first send, same-model repair and provider fallback) is
 * reserved in the database before it can reach a provider, and settled from the gateway's own
 * usage report after it. Reservation happens in the processingEligibility hook, with the
 * attempt's own operation id and the conservative reservation the gateway charges. A denial or a
 * budget refusal stops the run, since the database would no longer publish success; a route with
 * no configured connection is refused locally and reserves nothing.
 */
export function createGovernedEvaluationGateway(input: {
 claim: EvaluationQueueClaim;
 queue: EvaluationQueue;
 contract: GovernedEvaluationContract;
 adapters: Partial<Record<Provider, ProviderAdapter>>;
 connections: ProviderConnections;
 policies: Partial<Record<TaskKind, TaskPolicy>>;
 onCall?: (log: GatewayCallLog) => void;
}): GovernedEvaluationGateway {
 const {claim, queue, contract, connections} = input;
 const operations: EvaluationOperationRecord[] = [];
 const byInvocation = new Map<string, EvaluationOperationRecord>();
 const observed = {denied: false, exhausted: false, paused: false};
 let stopped: EvaluationStopCause | null = null;
 let armed: EvaluationOperationRecord | null = null;
 let atProvider: EvaluationOperationRecord | null = null;
 let pendingHook: Promise<unknown> = Promise.resolve();
 const declared = (provider: Provider, model: string) => contract.tools.some((tool) =>
  tool.id === governedEvaluationToolId(provider, model) && tool.version === governedEvaluationToolVersion && tool.effect === "read_only");
 function stop(cause: EvaluationStopCause): never {
  stopped ??= cause;
  throw new EvaluationStop(stopped);
 }

 const settlementOf = (operation: EvaluationOperationRecord, abandoned: boolean): EvaluationSettlement | null => {
  if (!operation.sent) return {outcome: "settled", spentMicrousd: 0, spentCalls: 0};
  if (!operation.report) return abandoned ? {outcome: "uncertain"} : null;
  if (operation.report.costStatus === "cassette" || operation.report.costStatus === "not_called") return {outcome: "settled", spentMicrousd: 0, spentCalls: 0};
  if (operation.report.costStatus !== "measured") return {outcome: "uncertain"};
  const spent = microusdCeil(operation.report.costUsd);
  // A measured cost above the reservation cannot be recorded as settled; the whole reservation stays charged.
  return spent <= operation.reservedMicrousd ? {outcome: "settled", spentMicrousd: spent, spentCalls: 1} : {outcome: "uncertain"};
 };
 const flush = async (abandoned: boolean): Promise<boolean> => {
  let complete = true;
  for (const operation of operations) {
   if (operation.final !== null) continue;
   const settlement = settlementOf(operation, abandoned);
   if (!settlement) continue;
   try { operation.final = (await queue.settle(claim, operation.operationId, settlement)).state; }
   catch { operation.final = "unsettled"; complete = false; }
  }
  return complete;
 };

 const decide = async ({provider, model, resources, attempt}: {provider: Provider; model: string; resources: readonly string[]; attempt: GatewayAttempt}): Promise<ProcessingEligibilityDecision> => {
  if (stopped) stop(stopped);
  // The attempt before this one is over: whatever it reserved is settled before anything new is reserved.
  if (armed) armed = null;
  if (!await flush(false)) stop("transport_failed");
  if (!declared(provider, model)) stop("route_undeclared");
  const connection = connections[provider];
  if (!connection || !input.adapters[provider]) {
   return {allowed: false, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: ["processing_connection_unverified"]};
  }
  const operationId = randomUUID();
  const reservedMicrousd = microusdCeil(attempt.reservationUsd);
  let reservation: EvaluationReservation;
  try {
   reservation = await queue.reserve(claim, {operationId, resources, reservedMicrousd, reservedCalls: 1,
    route: {provider, model, ...connection, endpoint: providerEndpoints[provider], toolVersion: governedEvaluationToolVersion}});
  } catch (error) {
   if (error instanceof EvaluationTransportError && error.code === "evaluation_transport_paused") { observed.paused = true; stop("transport_paused"); }
   stop("transport_failed");
  }
  if (!reservation.allowed) {
   if ("state" in reservation) { observed.exhausted = true; stop("budget_exhausted"); }
   observed.denied = true;
   stop("transport_denied");
  }
  if (!reservation.mayExecute || reservation.replayed || reservation.operationId !== operationId) {
   // Never sent: a replay never authorizes a transmission, and the receipt keeps the state it already had.
   operations.push({operationId, invocationId: attempt.invocationId, kind: kindOf(attempt), provider, model, reservedMicrousd, sent: false, report: null,
    final: reservation.replayed && reservation.state !== "reserved" ? reservation.state : "unsettled"});
   stop("reservation_mismatch");
  }
  const operation: EvaluationOperationRecord = {operationId, invocationId: attempt.invocationId, kind: kindOf(attempt), provider, model, reservedMicrousd,
   sent: false, report: null, final: null};
  operations.push(operation);
  byInvocation.set(attempt.invocationId, operation);
  // Reserved after the consumer stopped: it stays unsent and is settled as zero.
  if (stopped) stop(stopped);
  armed = operation;
  return {allowed: true, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: []};
 };

 // Every adapter refuses to transmit without the reservation of the attempt the hook just allowed.
 const adapters: Partial<Record<Provider, ProviderAdapter>> = {};
 for (const [provider, adapter] of Object.entries(input.adapters) as Array<[Provider, ProviderAdapter | undefined]>) {
  if (!adapter) continue;
  adapters[provider] = {provider, async complete(request) {
   const operation = armed;
   if (!operation || stopped || operation.provider !== provider || operation.model !== request.model) throw new Error("evaluation_send_without_reservation");
   armed = null;
   operation.sent = true;
   atProvider = operation;
   return adapter.complete(request);
  }};
 }

 const gateway = createModelGateway({
  adapters,
  policies: {...defaultTaskPolicies, ...input.policies},
  budgetReservation: "conservative_text_v1",
  processingEligibility: (decision) => {
   const pending = decide(decision);
   pendingHook = pending.then(() => undefined, () => undefined);
   return pending;
  },
  onCall: (log) => {
   const operation = byInvocation.get(log.invocationId);
   if (operation && operation.sent && operation.final === null && !operation.report) {
    operation.report = {costStatus: log.costStatus, costUsd: log.costUsd};
    if (atProvider === operation) atProvider = null;
   }
   input.onCall?.(log);
  },
 });

 return {
  gateway,
  operations,
  observed,
  inFlight: () => atProvider !== null,
  halt() { stopped ??= "stopped"; },
  async finish(mode) {
   stopped ??= "stopped";
   await pendingHook;
   armed = null;
   await flush(mode === "abandoned");
   if (mode === "abandoned") atProvider = null;
  },
  requiredReason() {
   if (observed.denied) return "transport_denied";
   if (observed.exhausted) return "budget_exhausted";
   if (operations.some((operation) => operation.final !== "settled")) return "operation_uncertain";
   return null;
  },
 };
}

function kindOf(attempt: GatewayAttempt): EvaluationAttemptKind {
 return attempt.isSameModelRepair ? "repair" : attempt.usedProviderFallback ? "fallback" : "send";
}
