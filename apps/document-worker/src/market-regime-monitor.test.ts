import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it} from "vitest";
import {createMarketRegimeMonitor, MARKET_RG01_CONSUMER, MARKET_RG01_EVENTS_PER_CYCLE, MarketRegimeMonitorError, runMarketRg01Cycle,
 type MarketRegimeMonitor} from "./market-regime-monitor";

type Call = {name: string; args: Record<string, unknown>};
function client(answers: Record<string, ({data?: unknown; error?: {message: string}})[]>, calls: Call[] = []) {
 return {rpc(name: string, args: Record<string, unknown>) {
  calls.push({name, args});
  const queue = answers[name] ?? [];
  const answer = queue.length > 1 ? queue.shift()! : queue[0] ?? {error: {message: "missing"}};
  return {abortSignal: async () => ({data: answer.data ?? null, error: answer.error ?? null})};
 }} as unknown as SupabaseClient;
}
const claim = {claimed: true, consumerId: MARKET_RG01_CONSUMER, eventSequence: 41, leaseId: "3a7e0000-0000-4000-8000-000000000001", capability: "b".repeat(64),
 attempt: 1, leaseExpiresAt: "2026-10-22T12:02:00.000+00:00", subjectKey: "source:bcb", subjectOrdinal: 3,
 event: {subjectKind: "source", subjectId: "bcb", event: "released", reason: "Evento", recordedAt: "2026-10-22T12:00:00.000000Z"}};
const evaluated = {status: "evaluated", evaluationId: "3a7e0000-0000-4000-8000-000000000002", reused: false, result: "fired", freshness: "current",
 requests: ["hour:2026-10-22T09"]};

describe("RG-01 monitor client", () => {
 it("calls the worker entries with the token, and the handler with the lease of the claim", async () => {
  const calls: Call[] = [];
  const monitor = createMarketRegimeMonitor(client({
   worker_schedule_rg01_v1: [{data: {scheduled: 2, active: true}}],
   worker_claim_market_event_v1: [{data: claim}],
   worker_run_rg01_event_v1: [{data: {completed: true, replayed: false, request: "event:rg01-monitor:41"}}],
   worker_evaluate_rg01_v1: [{data: {active: true, runs: [evaluated, {status: "busy"}]}}],
  }, calls), "worker-token");
  expect(await monitor.schedule()).toEqual({scheduled: 2, active: true});
  const c = await monitor.claimEvent();
  expect(c?.eventSequence).toBe(41);
  expect(await monitor.runEvent(c!)).toEqual({completed: true, replayed: false, request: "event:rg01-monitor:41"});
  expect((await monitor.evaluate()).runs).toHaveLength(2);
  expect(calls).toEqual([
   {name: "worker_schedule_rg01_v1", args: {p_worker_token: "worker-token"}},
   {name: "worker_claim_market_event_v1", args: {p_worker_token: "worker-token", p_consumer: MARKET_RG01_CONSUMER}},
   {name: "worker_run_rg01_event_v1", args: {p_consumer: MARKET_RG01_CONSUMER, p_sequence: 41, p_capability: "b".repeat(64), p_lease: claim.leaseId}},
   {name: "worker_evaluate_rg01_v1", args: {p_worker_token: "worker-token"}},
  ]);
 });

 it("refuses answers outside the contract and names only known refusals", async () => {
  for (const bad of [{...claim, consumerId: "other"}, {...claim, capability: "x"}, {...claim, leaseId: "lease"}]) {
   await expect(createMarketRegimeMonitor(client({worker_claim_market_event_v1: [{data: bad}]}), "t").claimEvent()).rejects.toThrow();
  }
  await expect(createMarketRegimeMonitor(client({worker_evaluate_rg01_v1: [{data: {active: true, runs: [{...evaluated, result: "maybe"}]}}]}), "t").evaluate()).rejects.toThrow();
  await expect(createMarketRegimeMonitor(client({worker_evaluate_rg01_v1: [{data: {active: true, runs: [{status: "busy", extra: 1}]}}]}), "t").evaluate()).rejects.toThrow();
  await expect(createMarketRegimeMonitor(client({worker_schedule_rg01_v1: [{data: {scheduled: -1, active: true}}]}), "t").schedule()).rejects.toThrow();
  const refusal = async (message: string) => {
   try { await createMarketRegimeMonitor(client({worker_schedule_rg01_v1: [{error: {message}}]}), "t").schedule(); }
   catch (error) { if (error instanceof MarketRegimeMonitorError) return error.code; throw error; }
   throw new Error("accepted");
  };
  expect(await refusal("market_authority_order")).toBe("market_authority_order");
  expect(await refusal("relation private.x does not exist at line 3")).toBe("market_regime_monitor_transport_failed");
  expect(await createMarketRegimeMonitor(client({worker_claim_market_event_v1: [{data: {claimed: false}}]}), "t").claimEvent()).toBeNull();
 });
});

describe("RG-01 monitor cycle", () => {
 function fake(active: boolean, events: number, runs: unknown[] = [evaluated]): MarketRegimeMonitor & {log: string[]} {
  const log: string[] = [];
  let left = events;
  return {log,
   async schedule() { log.push("schedule"); return {scheduled: active ? 1 : 0, active}; },
   async claimEvent() { log.push("claim"); return left-- > 0 ? {...claim, eventSequence: 100 + left} as never : null; },
   async runEvent(c) { log.push(`run:${c.eventSequence}`); return {completed: true, replayed: false}; },
   async evaluate() { log.push("evaluate"); return {active, runs: runs as never}; },
  };
 }

 it("does nothing more when the monitor is not active for this worker", async () => {
  const m = fake(false, 3);
  expect(await runMarketRg01Cycle(m, new AbortController().signal)).toEqual({status: "inactive"});
  expect(m.log).toEqual(["schedule"]);
 });

 it("schedules, turns events into requests, then evaluates every declaration", async () => {
  const m = fake(true, 2, [evaluated, {status: "retry"}, {...evaluated, result: "not_fired"}]);
  expect(await runMarketRg01Cycle(m, new AbortController().signal)).toEqual({status: "ran", scheduled: 1, events: 2, runs: ["evaluated", "retry", "evaluated"], fired: 1});
  expect(m.log).toEqual(["schedule", "claim", "run:101", "claim", "run:100", "claim", "evaluate"]);
 });

 it("bounds the events of one cycle and stops at shutdown before evaluating", async () => {
  const m = fake(true, MARKET_RG01_EVENTS_PER_CYCLE + 5);
  const result = await runMarketRg01Cycle(m, new AbortController().signal);
  expect(result).toMatchObject({events: MARKET_RG01_EVENTS_PER_CYCLE});
  const stopped = new AbortController(); stopped.abort();
  const n = fake(true, 3);
  expect(await runMarketRg01Cycle(n, stopped.signal)).toEqual({status: "ran", scheduled: 1, events: 0, runs: [], fired: 0});
  expect(n.log).toEqual(["schedule"]);
 });
});
