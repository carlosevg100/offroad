import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {executionTransportTimeoutMs} from "./execution-queue";

/** The pause between firings of the scheduler's own loop. */
export const MARKET_SCHEDULER_CYCLE_MS = 60_000;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Every reason the database names for a blocked schedule; anything else is refused, never logged. */
export const marketScheduleBlockReasons = ["grantor_inactive", "delegation_missing", "transport_paused", "publisher_missing", "source_not_acquirable",
 "contract_source_mismatch", "host_not_allowed", "contract_evidence_missing", "anchor_missing", "communique_unavailable", "series_cancelled",
 "series_quality_unclassified", "series_disagreement", "missing_communiques", "no_progress", "series_budget"] as const;
const blockedDetail = z.object({meeting: z.number().int().positive(),
 reason: z.enum(["listing_unavailable", "meeting_disputed", "detail_cancelled", "detail_failures", "communique_unavailable"])}).strict();
const entrySchema = z.discriminatedUnion("status", [
 z.object({kind: z.enum(["series_432", "copom_communiques"]), status: z.enum(["busy", "revoked", "not_due", "covered", "retry"])}).strict(),
 z.object({kind: z.literal("series_432"), status: z.literal("already_fired"), jobId: z.uuid()}).strict(),
 z.object({kind: z.literal("series_432"), status: z.literal("in_flight"), windowStart: day}).strict(),
 z.object({kind: z.enum(["series_432", "copom_communiques"]), status: z.literal("blocked"), reason: z.enum(marketScheduleBlockReasons),
  windowStart: day.optional(), meeting: z.number().int().positive().optional(), periods: z.array(day).max(10_000).optional()}).strict(),
 z.object({kind: z.literal("series_432"), status: z.literal("fired"), jobId: z.uuid(), windowStart: day, windowEnd: day}).strict(),
]);
const communiqueSchema = z.object({kind: z.literal("copom_communiques"), status: z.literal("fired"), list: z.enum(["fired", "already_fired"]), listJobId: z.uuid(),
 details: z.array(z.object({meeting: z.number().int().positive(), jobId: z.uuid()}).strict()).max(10),
 inFlight: z.array(z.number().int().positive()).max(50), blocked: z.array(blockedDetail).max(50)}).strict();
const fireSchema = z.object({schedules: z.array(z.union([communiqueSchema, entrySchema])).max(10)}).strict();

export type MarketScheduleFiring = z.infer<typeof fireSchema>;
export type MarketScheduler = {fire(): Promise<MarketScheduleFiring>};

/** Database refusals the scheduler reports by name; anything else carries no remote text. */
export const marketSchedulerCodes = ["market_authority_order", "market_isolation_unsupported", "worker_account_binding_required",
 "market_schedule_occurrence_reused"] as const;
export type MarketSchedulerCode = (typeof marketSchedulerCodes)[number] | "market_scheduler_lock_timeout" | "market_scheduler_transport_failed";
export class MarketSchedulerError extends Error {
 constructor(readonly code: MarketSchedulerCode) { super(code); this.name = "MarketSchedulerError"; }
}
const known = new Set<string>(marketSchedulerCodes);

export function createMarketScheduler(client: SupabaseClient, workerToken: string): MarketScheduler {
 return {
  async fire() {
   let response: {data: unknown; error: {message?: unknown; code?: unknown} | null};
   try {
    response = await client.rpc("worker_fire_market_schedules_v1", {p_worker_token: workerToken}).abortSignal(AbortSignal.timeout(executionTransportTimeoutMs(0)));
   } catch { throw new MarketSchedulerError("market_scheduler_transport_failed"); }
   if (response.error) {
    const message = typeof response.error.message === "string" ? response.error.message : "";
    // Any wait longer than the firing's lock timeout gives up; the next cycle tries again.
    if (response.error.code === "55P03") throw new MarketSchedulerError("market_scheduler_lock_timeout");
    throw new MarketSchedulerError(known.has(message) ? message as MarketSchedulerCode : "market_scheduler_transport_failed");
   }
   return fireSchema.parse(response.data);
  },
 };
}

export type MarketSchedulerCycleResult = {fired: number; details: number; blocked: string[]; statuses: string[]};

/**
 * One firing: the database decides, under its locks, what each granted schedule acquires now and enqueues it
 * on the existing acquisition path. Without a schedule, a delegation or an open transport nothing is
 * created. Busy, retry and a lock timeout are answered again by the next cycle.
 */
export async function runMarketSchedulerCycle(scheduler: MarketScheduler): Promise<MarketSchedulerCycleResult> {
 const firing = await scheduler.fire();
 let fired = 0;
 let details = 0;
 const blocked: string[] = [];
 for (const entry of firing.schedules) {
  if ("list" in entry) {
   if (entry.list === "fired") fired += 1;
   details += entry.details.length;
   for (const b of entry.blocked) blocked.push(`${b.meeting}:${b.reason}`);
  } else if (entry.status === "fired") {
   fired += 1;
  } else if (entry.status === "blocked") {
   blocked.push(`${entry.kind}:${entry.reason}`);
  }
 }
 return {fired, details, blocked, statuses: firing.schedules.map((entry) => `${entry.kind}:${entry.status}`)};
}
