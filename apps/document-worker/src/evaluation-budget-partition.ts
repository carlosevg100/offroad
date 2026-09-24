import type {z} from "zod";
import type {EvaluationGatewayRequest, EvaluationSpend} from "@offroad/agent-contracts";
import {
 createModelGateway,
 defaultTaskPolicies,
 ModelGatewayError,
 resolveModel,
 retentionMatrixVersion,
 type GatewayRequest,
 type GatewayResult,
 type ModelGateway,
 type ModelRef,
 type TaskKind,
 type TaskPolicy,
} from "@offroad/model-gateway";

/**
 * The ceilings an evaluation keeps inside its governed budget, per attempt, exactly where its
 * script kept them when it held the providers: before each send and each provider fallback, an
 * attempt is refused locally when its partition has no call left, or when the partition's
 * exposure plus the attempt's conservative reservation would pass the partition's dollars. The
 * contract's budget in the database stays the outer authority; the partitions reproduce the
 * evaluation's own protocol (fixed partitions, one record per request, and a refusal recorded the
 * way the script recorded it).
 *
 * Each route is sent to the governed gateway as a request pinned to that route with no fallback,
 * so every send and every provider fallback passes the partition first and the database
 * reservation after it. The conditional same-model repair of a prompted request stays inside its
 * send: the database reserves it and the contract bounds it, the partition does not see it.
 *
 * A failure that is not the model's (a denied, exhausted or paused transport, a route the worker
 * has no connection for, a reservation that cannot be computed) halts the evaluation: every later
 * request refuses at once, and the family rethrows it, so the consumer publishes the partial reason
 * the database derives instead of a record whose failures were the transport's.
 */

export type EvaluationPartitionLimits = {maxCostUsd: number; maxCalls: number};
export type EvaluationPartition = {
 /** A model gateway limited to this partition: its spend is this partition's alone. */
 gateway: ModelGateway;
 /** Every request made through it, in order, without content. */
 requests: EvaluationGatewayRequest[];
};
export type EvaluationBudgetScope = {
 partition(name: string, limits: EvaluationPartitionLimits): EvaluationPartition;
 /** Throws the failure that halted the evaluation; returns when nothing did. */
 throwIfHalted(): void;
};

/** What a model may do wrong; anything else is the transport's and halts the evaluation. */
const modelFailures = new Set<string>(["all_attempts_failed", "output_truncated"]);
/** Rounds the subtraction noise of a spend difference away; the gateway's costs have six decimals. */
const nano = (value: number) => Math.round(value * 1e9) / 1e9;

type Attempt = GatewayResult<unknown>["attempts"][number];
const attemptOutcomes = new Set<string>(["ok", "refusal", "error", "invalid_output", "policy_rejected"]);
function attemptsOf(details: unknown): Attempt[] {
 if (!Array.isArray(details)) return [];
 return details.filter((item): item is Attempt => typeof item === "object" && item !== null
  && ((item as Attempt).provider === "anthropic" || (item as Attempt).provider === "openai")
  && typeof (item as Attempt).model === "string" && attemptOutcomes.has((item as Attempt).outcome));
}

/** The request pinned to one route: the governed gateway sends it there once, and only there. */
function pinned<TSchema extends z.ZodType>(request: GatewayRequest<TSchema>, route: ModelRef): GatewayRequest<TSchema> {
 return {...request, model: {provider: route.provider, model: route.model, effort: route.effort}, allowFallback: false};
}

export function createEvaluationBudgetScope(governed: ModelGateway, policies: Partial<Record<TaskKind, TaskPolicy>>): EvaluationBudgetScope {
 // The same policies the consumer gives the governed gateway.
 const merged: Record<TaskKind, TaskPolicy> = {...defaultTaskPolicies, ...policies};
 let halt: {error: unknown} | null = null;
 let busy = false;
 const stop = (error: unknown): never => {
  halt ??= {error};
  throw halt.error;
 };
 const throwIfHalted = () => { if (halt) throw halt.error; };

 /**
  * The reservation the governed gateway will charge for one attempt, computed by the gateway's
  * own code: a gateway with no adapter at all, whose eligibility hook records the attempt's
  * conservative reservation and refuses it. Nothing it builds can reach a provider.
  */
 const reservationOf = async (request: GatewayRequest<z.ZodType>, route: ModelRef): Promise<number> => {
  const captured: {usd: number | null} = {usd: null};
  const probe = createModelGateway({adapters: {}, policies: merged, budgetReservation: "conservative_text_v1",
   processingEligibility: async ({attempt}) => {
    captured.usd ??= attempt.reservationUsd;
    return {allowed: false, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: ["reservation_probe"]};
   }});
  let failure: unknown = new Error("evaluation_reservation_unavailable");
  try { await probe.complete(pinned(request, route)); } catch (error) { failure = error; }
  if (captured.usd === null || !Number.isFinite(captured.usd) || captured.usd <= 0) return stop(failure);
  return captured.usd;
 };

 const partition = (name: string, limits: EvaluationPartitionLimits): EvaluationPartition => {
  if (!/^[a-z_]{1,40}$/.test(name) || !Number.isSafeInteger(limits.maxCalls) || limits.maxCalls < 0
   || !Number.isFinite(limits.maxCostUsd) || limits.maxCostUsd < 0) throw new Error("evaluation_partition_invalid");
  const spent: EvaluationSpend = {calls: 0, costUsd: 0, unknownCostCalls: 0, budgetExposureUsd: 0};
  const requests: EvaluationGatewayRequest[] = [];
  /** Adds what the governed gateway reports for one pinned request to this partition. */
  const measured = async <T>(work: () => Promise<T>): Promise<T> => {
   const before = governed.spent();
   try { return await work(); } finally {
    const after = governed.spent();
    spent.calls += after.calls - before.calls;
    spent.unknownCostCalls += after.unknownCostCalls - before.unknownCostCalls;
    spent.costUsd = nano(spent.costUsd + after.costUsd - before.costUsd);
    spent.budgetExposureUsd = nano(spent.budgetExposureUsd + after.budgetExposureUsd - before.budgetExposureUsd);
   }
  };

  const complete = async <TSchema extends z.ZodType>(request: GatewayRequest<TSchema>): Promise<GatewayResult<z.infer<TSchema>>> => {
   throwIfHalted();
   // Spend is measured around each request, so requests never overlap.
   if (busy) stop(new Error("evaluation_partition_overlap"));
   busy = true;
   const start = spent.calls;
   const before = {...spent};
   const made: Attempt[] = [];
   let answer: EvaluationGatewayRequest["answer"] = null;
   let outcome: EvaluationGatewayRequest["outcome"] = "ok";
   try {
    let routes: ModelRef[];
    try {
     const {primary, fallback} = resolveModel(request.task, merged, {override: request.model, useShadow: request.useShadow});
     routes = fallback && request.allowFallback !== false ? [primary, fallback] : [primary];
    } catch (error) { return stop(error); }
    let last: ModelGatewayError | null = null;
    for (const [index, route] of routes.entries()) {
     if (spent.calls >= limits.maxCalls) {
      // The gateway's own rule: a later attempt without budget leaves the earlier failure standing.
      if (last) throw new ModelGatewayError(last.message, last.code, [...made]);
      throw new ModelGatewayError(`call budget exhausted (${spent.calls}/${limits.maxCalls})`, "budget_exceeded", {...spent, exposureUsd: spent.budgetExposureUsd});
     }
     const reservationUsd = await reservationOf(request, route);
     if (spent.budgetExposureUsd + reservationUsd > limits.maxCostUsd) {
      throw new ModelGatewayError(`cost budget would be exceeded (${spent.budgetExposureUsd.toFixed(4)} + ${reservationUsd.toFixed(4)} > ${limits.maxCostUsd})`,
       "budget_exceeded", {...spent, exposureUsd: spent.budgetExposureUsd, reservationUsd});
     }
     let result: GatewayResult<z.infer<TSchema>>;
     try {
      result = await measured(() => governed.complete(pinned(request, route)));
     } catch (error) {
      if (!(error instanceof ModelGatewayError) || !modelFailures.has(error.code)) return stop(error);
      made.push(...attemptsOf(error.details).map((attempt) => index > 0 ? {...attempt, usedProviderFallback: true} : attempt));
      last = error;
      continue;
     }
     const attempts = result.attempts.map((attempt) => index > 0 ? {...attempt, usedProviderFallback: true} : attempt);
     // A route the worker could not reach is not a model answer: the evaluation is not the declared one.
     if (attempts.some((attempt) => attempt.outcome === "policy_rejected")) return stop(new ModelGatewayError("evaluation_route_unavailable", "data_policy_violation", attempts));
     made.push(...attempts);
     const {usage} = result;
     answer = {
      provider: result.provider, model: result.model, effort: result.effort,
      usage: {inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedInputTokens: usage.cachedInputTokens,
       ...(usage.cacheCreationInputTokens === undefined ? {} : {cacheCreationInputTokens: usage.cacheCreationInputTokens}),
       ...(usage.reasoningTokens === undefined ? {} : {reasoningTokens: usage.reasoningTokens})},
      costUsd: result.costUsd, latencyMs: Math.max(0, Math.round(result.latencyMs)), stopReason: result.stopReason, fromCassette: result.fromCassette,
     };
     return index > 0 ? {...result, usedFallback: true, usedProviderFallback: true, attempts: [...made]} : {...result, attempts: [...made]};
    }
    // Every route failed: the last failure stands, carrying every attempt, as the gateway reports it.
    throw new ModelGatewayError(last!.message, last!.code, [...made]);
   } catch (error) {
    outcome = error instanceof ModelGatewayError && (error.code === "budget_exceeded" || modelFailures.has(error.code)) ? error.code as typeof outcome : outcome;
    throw error;
   } finally {
    busy = false;
    // A halted request never reaches a published record: the evaluation ends partial.
    if (!halt) {
     requests.push({
      partition: name, task: request.task, schemaName: request.schemaName, providerCallRange: {start, end: spent.calls}, outcome,
      attempts: made.map((attempt) => ({provider: attempt.provider, model: attempt.model, outcome: attempt.outcome, retryOrdinal: attempt.retryOrdinal ?? 0,
       isSameModelRepair: attempt.isSameModelRepair ?? false, usedProviderFallback: attempt.usedProviderFallback ?? false})),
      answer,
      spent: {calls: spent.calls - before.calls, costUsd: nano(spent.costUsd - before.costUsd), unknownCostCalls: spent.unknownCostCalls - before.unknownCostCalls,
       budgetExposureUsd: nano(spent.budgetExposureUsd - before.budgetExposureUsd)},
     });
    }
   }
  };
  return {gateway: {complete, spent: () => ({...spent})}, requests};
 };

 return {partition, throwIfHalted};
}
