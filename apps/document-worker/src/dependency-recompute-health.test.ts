import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createRecomputeHealthMonitor, runDependencyRecomputePass, type DependencyRecomputeQueue, type RecomputeHealthMonitor} from "./dependency-recompute";

const token = "private-recompute-worker-token";
const healthy = {scheduledCount: 2, oldestScheduledSeconds: 40, expiredLeaseCount: 0, awaitingAuthorizationCount: 1};
type Reply = {data: unknown; error: unknown} | Error;

/** A client whose health RPC answers the replies in order, then a healthy reading. */
function setup(replies: Reply[] = [], start = 0) {
  let clock = start;
  const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => ({
    abortSignal: () => {
      const next = replies.shift() ?? {data: healthy, error: null};
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  }));
  const log = vi.fn();
  const monitor = createRecomputeHealthMonitor({rpc} as unknown as SupabaseClient, token, log, {now: () => clock});
  return {rpc, log, monitor, at: (ms: number) => { clock = ms; }};
}
const events = (log: ReturnType<typeof vi.fn>) => log.mock.calls.map(([event]) => event);

describe("recompute health in the worker", () => {
  it("reads at boot and then at most every 30 seconds, through the worker entry point", async () => {
    const {rpc, log, monitor, at} = setup();
    expect(await monitor.maybeRead()).toEqual(healthy);
    for (const ms of [1, 29_999]) { at(ms); expect(await monitor.maybeRead()).toBeNull(); }
    at(30_000); expect(await monitor.maybeRead()).toEqual(healthy);
    at(59_999); expect(await monitor.maybeRead()).toBeNull();
    at(60_000); expect(await monitor.maybeRead()).toEqual(healthy);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.every(([name, args]) => name === "worker_dependency_recompute_health_v1" && JSON.stringify(args) === JSON.stringify({p_worker_token: token}))).toBe(true);
    expect(log.mock.calls).toEqual(Array(3).fill(["recompute.health", healthy]));
  });

  it.each([
    [{oldestScheduledSeconds: 1800, expiredLeaseCount: 0}, false],
    [{oldestScheduledSeconds: 1801, expiredLeaseCount: 0}, true],
    [{oldestScheduledSeconds: 0, expiredLeaseCount: 1}, true],
    [{oldestScheduledSeconds: 7200, expiredLeaseCount: 3}, true],
  ])("with %j it logs the backlog line with the same numbers: %s", async (change, backlog) => {
    const numbers = {...healthy, ...change};
    const {log, monitor} = setup([{data: numbers, error: null}]);
    await monitor.maybeRead();
    expect(log.mock.calls).toEqual(backlog ? [["recompute.health", numbers], ["recompute.backlog.failed", numbers]] : [["recompute.health", numbers]]);
  });

  it.each([
    ["an RPC error", {data: null, error: {message: "sensitive failure detail", code: "42501"}}],
    ["a transport failure", new Error("fetch failed: sensitive transport detail")],
    ["an identifier beside the numbers", {data: {...healthy, organizationId: "a6a60000-0000-4000-9000-000000000001"}, error: null}],
    ["a missing number", {data: {scheduledCount: 1, oldestScheduledSeconds: 1, expiredLeaseCount: 0}, error: null}],
    ["a negative count", {data: {...healthy, expiredLeaseCount: -1}, error: null}],
    ["a fractional age", {data: {...healthy, oldestScheduledSeconds: 12.5}, error: null}],
    ["a number as text", {data: {...healthy, scheduledCount: "2"}, error: null}],
    ["an empty reply", {data: null, error: null}],
    ["a list", {data: [healthy], error: null}],
  ] as Array<[string, Reply]>)("refuses %s as health_failed without numbers or detail", async (_label, reply) => {
    const {log, monitor} = setup([reply]);
    expect(await monitor.maybeRead()).toBeNull();
    expect(log.mock.calls).toEqual([["recompute.poll.failed", {reason: "health_failed"}]]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/sensitive|private-recompute|a6a60000/);
  });

  it("throttles a failed read too and reads again 30 seconds later", async () => {
    const {rpc, log, monitor, at} = setup([new Error("down")]);
    await monitor.maybeRead();
    at(10_000); await monitor.maybeRead();
    at(30_000); await monitor.maybeRead();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(events(log)).toEqual(["recompute.poll.failed", "recompute.health"]);
  });

  it("keeps claiming when the health read fails, in this pass and the next", async () => {
    const {log, monitor, at} = setup([new Error("down"), {data: null, error: {message: "down"}}]);
    const claim = vi.fn(async () => null);
    const queue = {claim} as unknown as DependencyRecomputeQueue;
    await runDependencyRecomputePass(queue, monitor, log);
    at(30_000);
    await runDependencyRecomputePass(queue, monitor, log);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(log.mock.calls).toEqual([["recompute.poll.failed", {reason: "health_failed"}], ["recompute.poll.failed", {reason: "health_failed"}]]);
  });

  it("reads the health, when due, before the claim of a pass and claims nothing once stopping", async () => {
    const order: string[] = [];
    const health: RecomputeHealthMonitor = {maybeRead: vi.fn(async () => { order.push("health"); return null; })};
    const queue = {claim: vi.fn(async () => { order.push("claim"); throw new Error("transport"); })} as unknown as DependencyRecomputeQueue;
    const log = vi.fn();
    await runDependencyRecomputePass(queue, health, log);
    expect(order).toEqual(["health", "claim"]);
    expect(log).toHaveBeenCalledWith("recompute.poll.failed", {reason: "recompute_transport_failed"});
    order.length = 0;
    await runDependencyRecomputePass(queue, health, log, {stopping: () => true});
    expect(order).toEqual([]);
  });

  it("writes exactly the fields the reviewed CloudWatch filters read", async () => {
    const config = JSON.parse(readFileSync(new URL("../monitoring/dependency-recompute-alarms.json", import.meta.url), "utf8")) as {
      filters: Array<{pattern: string; value: string; sample: Record<string, unknown>}>;
    };
    // Each line as the worker logger writes it: the event name beside the detail.
    const lines: Record<string, Record<string, unknown>> = {};
    const record = (event: string, detail?: Record<string, unknown>) => { lines[event] = {event, ...detail}; };
    const reading = (reply: Reply) => ({rpc: vi.fn(() => ({abortSignal: () => reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)}))}) as unknown as SupabaseClient;
    await createRecomputeHealthMonitor(reading({data: {...healthy, expiredLeaseCount: 1}, error: null}), token, record).maybeRead();
    await createRecomputeHealthMonitor(reading(new Error("down")), token, record).maybeRead();
    expect(Object.keys(lines).sort()).toEqual(["recompute.backlog.failed", "recompute.health", "recompute.poll.failed"]);
    expect(Object.keys(lines["recompute.health"]!).sort()).toEqual(["awaitingAuthorizationCount", "event", "expiredLeaseCount", "oldestScheduledSeconds", "scheduledCount"]);
    for (const filter of config.filters) {
      const event = /\$\.event = "([a-z.]+)"/.exec(filter.pattern)![1]!;
      const line = lines[event];
      expect(line, filter.pattern).toBeDefined();
      expect(Object.keys(filter.sample).filter((key) => key !== "at").sort()).toEqual(Object.keys(line!).sort());
      if (filter.value !== "1") expect(typeof line![filter.value.replace("$.", "")]).toBe("number");
    }
  });
});
