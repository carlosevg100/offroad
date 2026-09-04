import {describe, expect, it} from "vitest";

import {
  advisorNeedsAttention,
  currentActivityCycle,
  customerEventType,
  failureWasRecovered,
  latestSuccessfulOutcomeAt,
} from "./advisor-project-state";

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

  it("shows the latest retry cycle without replaying earlier worker stages", () => {
    const events = [
      {id: "old-start", type: "work_started", createdAt: "2026-09-03T10:01:00.000Z", detail: {job_id: "old"}},
      {id: "plan", type: "plan_created", createdAt: "2026-09-03T10:00:00.000Z", detail: {revision: 1}},
      {id: "old-failure", type: "work_failed", createdAt: "2026-09-03T10:02:00.000Z", detail: {job_id: "old"}},
      {id: "new-start", type: "work_started", createdAt: "2026-09-03T10:03:00.000Z", detail: {job_id: "new"}},
      {id: "new-research", type: "work_progress", createdAt: "2026-09-03T10:04:00.000Z", detail: {job_id: "new"}},
      {id: "new-question", type: "question_created", createdAt: "2026-09-03T10:05:00.000Z", detail: {request_count: 2}},
    ];

    expect(currentActivityCycle(events).map((event) => event.id)).toEqual([
      "plan",
      "new-start",
      "new-research",
      "new-question",
    ]);
  });
});
