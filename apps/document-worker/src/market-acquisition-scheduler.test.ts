import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it} from "vitest";
import {createMarketScheduler, MarketSchedulerError, runMarketSchedulerCycle} from "./market-acquisition-scheduler";

type Call = {name: string; args: Record<string, unknown>};
function client(answer: {data?: unknown; error?: {message: string; code?: string}}, calls: Call[] = []) {
 return {rpc(name: string, args: Record<string, unknown>) {
  calls.push({name, args});
  return {abortSignal: async () => ({data: answer.data ?? null, error: answer.error ?? null})};
 }} as unknown as SupabaseClient;
}
const communiques = {kind: "copom_communiques", status: "fired", list: "fired", listJobId: "3a820000-0000-4000-8000-000000000003",
 details: [{meeting: 270, jobId: "3a820000-0000-4000-8000-000000000001"}], inFlight: [271],
 blocked: [{meeting: 268, reason: "meeting_disputed"}, {meeting: 269, reason: "listing_unavailable"}]};
const series = {kind: "series_432", status: "fired", jobId: "3a820000-0000-4000-8000-000000000002", windowStart: "2021-01-14", windowEnd: "2026-10-21"};

describe("market scheduler client", () => {
 it("fires with the worker token and summarizes the firing without remote text", async () => {
  const calls: Call[] = [];
  const scheduler = createMarketScheduler(client({data: {schedules: [communiques, series]}}, calls), "worker-token");
  expect(await runMarketSchedulerCycle(scheduler)).toEqual({fired: 2, details: 1, blocked: ["268:meeting_disputed", "269:listing_unavailable"],
   statuses: ["copom_communiques:fired", "series_432:fired"]});
  expect(calls).toEqual([{name: "worker_fire_market_schedules_v1", args: {p_worker_token: "worker-token"}}]);
 });

 it("is inert without schedules and reports blocks and waits", async () => {
  expect(await runMarketSchedulerCycle(createMarketScheduler(client({data: {schedules: []}}), "t"))).toEqual({fired: 0, details: 0, blocked: [], statuses: []});
  const r = await runMarketSchedulerCycle(createMarketScheduler(client({data: {schedules: [
   {kind: "series_432", status: "blocked", reason: "anchor_missing", windowStart: "2021-01-14"},
   {kind: "copom_communiques", status: "busy"}]}}), "t"));
  expect((await runMarketSchedulerCycle(createMarketScheduler(client({data: {schedules: [{kind: "series_432", status: "already_fired",
   jobId: "3a820000-0000-4000-8000-000000000004"}]}}), "t"))).statuses).toEqual(["series_432:already_fired"]);
  expect(r).toEqual({fired: 0, details: 0, blocked: ["series_432:anchor_missing"], statuses: ["series_432:blocked", "copom_communiques:busy"]});
  expect((await runMarketSchedulerCycle(createMarketScheduler(client({data: {schedules: [{kind: "series_432", status: "in_flight", windowStart: "2021-01-14"}]}}), "t"))).statuses)
   .toEqual(["series_432:in_flight"]);
 });

 it("refuses answers outside the contract", async () => {
  for (const bad of [{schedules: [{...series, jobId: "job"}]}, {schedules: [{...communiques, extra: 1}]}, {schedules: [{kind: "other", status: "busy"}]},
   {schedules: [{...communiques, blocked: [{meeting: 1, reason: "anything"}]}]}, {schedules: [{kind: "series_432", status: "blocked", reason: "Texto livre"}]},
   {schedules: [{kind: "series_432", status: "blocked", reason: "arbitrary_remote_text"}]}, {schedules: [{...communiques, listJobId: undefined}]}, {}]) {
   await expect(createMarketScheduler(client({data: bad}), "t").fire()).rejects.toThrow();
  }
 });

 it("names only known refusals and maps the lock timeout", async () => {
  const refusal = async (error: {message: string; code?: string}) => {
   try { await createMarketScheduler(client({error}), "t").fire(); }
   catch (e) { if (e instanceof MarketSchedulerError) return e.code; throw e; }
   throw new Error("accepted");
  };
  expect(await refusal({message: "worker_account_binding_required"})).toBe("worker_account_binding_required");
  expect(await refusal({message: "canceling statement due to lock timeout", code: "55P03"})).toBe("market_scheduler_lock_timeout");
  expect(await refusal({message: "relation private.x does not exist"})).toBe("market_scheduler_transport_failed");
  const throwing = {rpc() { return {abortSignal: async () => { throw new Error("socket"); }}; }} as unknown as SupabaseClient;
  await expect(createMarketScheduler(throwing, "t").fire()).rejects.toMatchObject({code: "market_scheduler_transport_failed"});
 });
});
