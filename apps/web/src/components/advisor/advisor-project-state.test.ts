import {describe, expect, it} from "vitest";

import {conversationIsWorking, summarizeWorkActivity, workActivity, workShouldRefresh, type WorkActivityRows} from "@/lib/advisor/work-activity";

import {
  advisorNeedsAttention,
  canShowAdvisorInformationRequests,
  currentActivityCycle,
  customerEventType,
  failureWasRecovered,
  latestSuccessfulOutcomeAt,
} from "./advisor-project-state";

const noRows: WorkActivityRows = {jobs: [], runs: [], milestones: [], requests: [], recomputeCandidates: [], institutionalCandidates: []};
const liveJob = (kind: string, status: string) => ({id: "10000000-0000-4000-8000-000000000001", kind, status, processing_run_id: "10000000-0000-4000-8000-000000000002"});

describe("advisor project current state", () => {
  const failed = {type: "quality_gate_failed", createdAt: "2026-09-03T10:00:00.000Z"};
  const recovered = {type: "work_completed", createdAt: "2026-09-03T10:05:00.000Z"};

  it("does not treat planned work as running while the project awaits review: only a live job is", () => {
    // Planned tasks, a session status or a queued message are not jobs; with no live job nothing runs.
    expect(conversationIsWorking(workActivity(noRows))).toBe(false);
    expect(conversationIsWorking(workActivity({...noRows, jobs: [liveJob("capital_project_analysis", "leased")]}))).toBe(true);
  });

  it("holds the information request until the preliminary understanding is accepted", () => {
    expect(canShowAdvisorInformationRequests("pending_confirmation")).toBe(false);
    expect(canShowAdvisorInformationRequests("confirmed")).toBe(true);
    expect(canShowAdvisorInformationRequests(null)).toBe(true);
  });

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

  it.each(["question_answered", "decision_recorded"])("does not recover execution when %s is recorded", (type) => {
    const interaction = {type, createdAt: "2026-09-03T10:10:00.000Z"};
    for (const failureType of ["work_failed", "quality_gate_failed"]) {
      const failure = {...failed, type: failureType};
      const events = [failure, interaction];
      expect(advisorNeedsAttention({
        active: false, sessionStatus: "review_ready", taskStatuses: [], messageStatuses: [], events,
      })).toBe(true);
      expect(latestSuccessfulOutcomeAt(events)).toBeNull();
      expect(failureWasRecovered(failure.createdAt, latestSuccessfulOutcomeAt(events))).toBe(false);
    }
  });

  it("retains aggregate failure fallback when a partial event trail contains only interactions", () => {
    const events = [{type: "question_answered", createdAt: recovered.createdAt}];
    for (const state of [
      {sessionStatus: "failed", taskStatuses: [], messageStatuses: []},
      {sessionStatus: "review_ready", taskStatuses: ["failed"], messageStatuses: []},
      {sessionStatus: "review_ready", taskStatuses: [], messageStatuses: ["failed"]},
    ]) {
      expect(advisorNeedsAttention({active: false, ...state, events})).toBe(true);
    }
    // An answer itself is not a new failure either.
    expect(advisorNeedsAttention({
      active: false, sessionStatus: "review_ready", taskStatuses: [], messageStatuses: [], events,
    })).toBe(false);
  });

  it("prioritizes active execution without treating a queued retry as recovered", () => {
    const state = {sessionStatus: "review_ready", taskStatuses: [], messageStatuses: ["queued"]};
    const events = [failed, {type: "question_answered", createdAt: recovered.createdAt}];
    const active = conversationIsWorking(workActivity({...noRows, jobs: [liveJob("agent_operation_brief", "queued")]}));
    expect(active).toBe(true);
    expect(advisorNeedsAttention({...state, active, events})).toBe(false);
    expect(failureWasRecovered(failed.createdAt, latestSuccessfulOutcomeAt(events))).toBe(false);
    // If processing stops without successful execution, the original failure still needs attention.
    expect(advisorNeedsAttention({...state, messageStatuses: [], active: false, events})).toBe(true);
  });

  it("uses event time rather than input order and requires success strictly after failure", () => {
    const state = {active: false, sessionStatus: "review_ready", taskStatuses: [], messageStatuses: []};
    expect(advisorNeedsAttention({...state, events: [recovered, failed]})).toBe(false);
    const laterFailure = {...failed, createdAt: "2026-09-03T10:06:00.000Z"};
    expect(advisorNeedsAttention({...state, events: [laterFailure, recovered]})).toBe(true);
    const tiedFailure = {...failed, createdAt: recovered.createdAt};
    for (const events of [[recovered, tiedFailure], [tiedFailure, recovered]]) {
      expect(advisorNeedsAttention({...state, events})).toBe(true);
      expect(failureWasRecovered(tiedFailure.createdAt, latestSuccessfulOutcomeAt(events))).toBe(false);
    }
  });

  it("does not use successful intermediate progress as execution recovery", () => {
    const progress = {
      type: customerEventType("work_progress", {stage: "public_research", status: "succeeded"}),
      createdAt: recovered.createdAt,
    };
    expect(advisorNeedsAttention({
      active: false, sessionStatus: "review_ready", taskStatuses: [], messageStatuses: [], events: [failed, progress],
    })).toBe(true);
    expect(latestSuccessfulOutcomeAt([failed, progress])).toBeNull();
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

describe("pending plan refresh", () => {
  it("refreshes a project while the plan is being prepared without declaring the conversation busy", () => {
    for (const status of ["queued", "leased"]) {
      const activity = workActivity({...noRows, jobs: [liveJob("execution_brief_proposal", status)]});
      expect(workShouldRefresh(activity)).toBe(true);
      expect(conversationIsWorking(activity)).toBe(false);
    }
    // A plan awaiting approval waits for the person on its approval card, and is not polled.
    const held = workActivity({...noRows, jobs: [liveJob("capital_project_analysis", "awaiting_approval")]});
    expect(summarizeWorkActivity(held)).toEqual({refresh: false, working: false, waitingForPerson: false});
    for (const status of ["succeeded", "failed", "cancelled"]) expect(workShouldRefresh(workActivity({...noRows, jobs: [liveJob("execution_brief_proposal", status)]}))).toBe(false);
  });
});
