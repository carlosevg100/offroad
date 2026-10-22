import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {executionTransportTimeoutMs} from "./execution-queue";

/**
 * The event consumer the RG-01 monitor reads, registered with handler rg01 by the founder (M2 part 4). The
 * database completes its rows only through worker_run_rg01_event_v1; the generic completion refuses them.
 */
export const MARKET_RG01_CONSUMER = "rg01-monitor";
/** At most this many events are turned into requests per cycle; the rest wait for the next one. */
export const MARKET_RG01_EVENTS_PER_CYCLE = 20;
/** The pause between cycles of the monitor's own loop. */
export const MARKET_RG01_CYCLE_MS = 60_000;

const scheduleSchema = z.object({scheduled: z.number().int().min(0), active: z.boolean()}).strict();
const runSchema = z.discriminatedUnion("status", [
 z.object({status: z.enum(["busy", "idle", "retry", "superseded"])}).strict(),
 z.object({status: z.literal("evaluated"), evaluationId: z.uuid(), reused: z.boolean(),
  result: z.enum(["fired", "pending_confirmation", "not_fired", "incomplete"]), freshness: z.enum(["current", "stale", "absent"]),
  requests: z.array(z.string().max(120)).max(10_000)}).strict(),
]);
const evaluateSchema = z.object({active: z.boolean(), runs: z.array(runSchema).max(100)}).strict();
const eventClaimSchema = z.object({claimed: z.literal(true), consumerId: z.literal(MARKET_RG01_CONSUMER), eventSequence: z.number().int().positive(),
 leaseId: z.uuid(), capability: z.string().regex(/^[a-f0-9]{64}$/)}).loose();
const eventRunSchema = z.object({completed: z.literal(true), replayed: z.boolean(), request: z.string().max(120).optional()}).strict();

export type MarketRg01Run = z.infer<typeof runSchema>;
export type MarketRg01EventClaim = z.infer<typeof eventClaimSchema>;
export type MarketRegimeMonitor = {
 schedule(): Promise<z.infer<typeof scheduleSchema>>;
 evaluate(): Promise<z.infer<typeof evaluateSchema>>;
 claimEvent(): Promise<MarketRg01EventClaim | null>;
 runEvent(claim: MarketRg01EventClaim): Promise<z.infer<typeof eventRunSchema>>;
};

/** Database refusals the monitor reports by name; anything else carries no remote text. */
export const marketRegimeMonitorCodes = ["market_authority_order", "market_event_lease_denied", "market_event_handler_mismatch", "market_event_delegation_required",
 "market_event_consumer_not_enabled", "market_regime_declaration_inactive", "worker_account_binding_required"] as const;
export type MarketRegimeMonitorCode = (typeof marketRegimeMonitorCodes)[number] | "market_regime_monitor_transport_failed";
export class MarketRegimeMonitorError extends Error {
 constructor(readonly code: MarketRegimeMonitorCode) { super(code); this.name = "MarketRegimeMonitorError"; }
}
const known = new Set<string>(marketRegimeMonitorCodes);

export function createMarketRegimeMonitor(client: SupabaseClient, workerToken: string): MarketRegimeMonitor {
 const rpc = async (name: string, args: Record<string, unknown>) => {
  let response: {data: unknown; error: {message?: unknown} | null};
  try { response = await client.rpc(name, args).abortSignal(AbortSignal.timeout(executionTransportTimeoutMs(0))); }
  catch { throw new MarketRegimeMonitorError("market_regime_monitor_transport_failed"); }
  if (response.error) {
   const message = typeof response.error.message === "string" ? response.error.message : "";
   throw new MarketRegimeMonitorError(known.has(message) ? message as MarketRegimeMonitorCode : "market_regime_monitor_transport_failed");
  }
  return response.data;
 };
 return {
  async schedule() { return scheduleSchema.parse(await rpc("worker_schedule_rg01_v1", {p_worker_token: workerToken})); },
  async evaluate() { return evaluateSchema.parse(await rpc("worker_evaluate_rg01_v1", {p_worker_token: workerToken})); },
  async claimEvent() {
   const data = await rpc("worker_claim_market_event_v1", {p_worker_token: workerToken, p_consumer: MARKET_RG01_CONSUMER});
   if (z.object({claimed: z.literal(false)}).strict().safeParse(data).success) return null;
   return eventClaimSchema.parse(data);
  },
  async runEvent(c) {
   return eventRunSchema.parse(await rpc("worker_run_rg01_event_v1", {p_consumer: c.consumerId, p_sequence: c.eventSequence, p_capability: c.capability, p_lease: c.leaseId}));
  },
 };
}

export type MarketRg01CycleResult =
 | {status: "inactive"}
 | {status: "ran"; scheduled: number; events: number; runs: MarketRg01Run["status"][]; fired: number; eventsFailed?: MarketRegimeMonitorCode};

/**
 * One cycle of the monitor: request the current hour and every due deadline, turn the consumer's events into
 * requests, then evaluate every active declaration. Inactive (no consumer with the handler, or no live
 * delegation for this worker) does nothing else. A failure while handling events does not stop the
 * evaluation of the requests already recorded; it is reported with the cycle. The evaluation runs in the
 * database over a snapshot of one statement; busy, retry and superseded are answered again by the next cycle.
 */
export async function runMarketRg01Cycle(monitor: MarketRegimeMonitor, signal: AbortSignal): Promise<MarketRg01CycleResult> {
 const scheduled = await monitor.schedule();
 if (!scheduled.active) return {status: "inactive"};
 let events = 0;
 let eventsFailed: MarketRegimeMonitorCode | undefined;
 try {
  while (events < MARKET_RG01_EVENTS_PER_CYCLE && !signal.aborted) {
   const claim = await monitor.claimEvent();
   if (!claim) break;
   await monitor.runEvent(claim);
   events += 1;
  }
 } catch (error) {
  eventsFailed = error instanceof MarketRegimeMonitorError ? error.code : "market_regime_monitor_transport_failed";
 }
 const failure = eventsFailed ? {eventsFailed} : {};
 if (signal.aborted) return {status: "ran", scheduled: scheduled.scheduled, events, runs: [], fired: 0, ...failure};
 const evaluated = await monitor.evaluate();
 if (!evaluated.active) return {status: "inactive"};
 return {status: "ran", scheduled: scheduled.scheduled, events, runs: evaluated.runs.map((run) => run.status),
  fired: evaluated.runs.filter((run) => run.status === "evaluated" && run.result === "fired").length, ...failure};
}
