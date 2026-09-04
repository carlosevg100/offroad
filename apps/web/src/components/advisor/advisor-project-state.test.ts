import {describe, expect, it} from "vitest";

import {advisorNeedsAttention, customerEventType, failureWasRecovered, latestSuccessfulOutcomeAt} from "./advisor-project-state";

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

  it("treats only terminal stage progress as a completed work product", () => {
    expect(customerEventType("work_progress", {stage: "preliminary_understanding", status: "succeeded"})).toBe("work_completed");
    expect(customerEventType("work_progress", {stage: "public_research", status: "succeeded"})).toBe("work_progress");
    expect(customerEventType("work_progress", {stage: "case_analysis", status: "started"})).toBe("work_progress");
  });
});
