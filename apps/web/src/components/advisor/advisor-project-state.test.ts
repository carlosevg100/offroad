import {describe, expect, it} from "vitest";

import {advisorNeedsAttention, failureWasRecovered, latestSuccessfulOutcomeAt} from "./advisor-project-state";

describe("advisor project current state", () => {
  const failed = {type: "quality_gate_failed", createdAt: "2026-09-03T10:00:00.000Z"};
  const recovered = {type: "work_completed", createdAt: "2026-09-03T10:05:00.000Z"};

  it("does not keep a project in attention after a later successful retry", () => {
    expect(advisorNeedsAttention({
      active: false,
      sessionStatus: "failed",
      taskStatuses: ["failed", "succeeded"],
      messageStatuses: ["failed", "completed"],
      events: [failed, recovered],
    })).toBe(false);
    expect(failureWasRecovered(failed.createdAt, latestSuccessfulOutcomeAt([failed, recovered]))).toBe(true);
  });

  it("keeps the latest unrecovered failure visible", () => {
    expect(advisorNeedsAttention({
      active: false,
      sessionStatus: "failed",
      taskStatuses: ["failed"],
      messageStatuses: ["failed"],
      events: [recovered, {...failed, createdAt: "2026-09-03T10:06:00.000Z"}],
    })).toBe(true);
  });
});
