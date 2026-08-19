import {describe, expect, it} from "vitest";

import {sleep} from "./sleep";

/** Timers that Node counts as reasons to stay alive. An unreferenced one is not counted. */
const liveTimers = () => process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;

describe("idle wait", () => {
  it("keeps the process alive while it waits", async () => {
    // The regression this exists for: with an unreferenced timer the worker signed in, found
    // an empty queue, and exited 0 before the wait ever finished — 54 tasks in four hours.
    const before = liveTimers();
    const waiting = sleep(30);
    expect(liveTimers()).toBeGreaterThan(before);
    await waiting;
    expect(liveTimers()).toBe(before);
  });

  it("stops waiting when shutdown is signalled", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const waiting = sleep(30_000, controller.signal);
    controller.abort();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("returns immediately when shutdown already happened", async () => {
    const controller = new AbortController();
    controller.abort();
    const started = Date.now();
    await sleep(30_000, controller.signal);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
