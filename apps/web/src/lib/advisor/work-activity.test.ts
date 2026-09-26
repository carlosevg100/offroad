import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {
  conversationIsWorking,
  executionsAreRunning,
  institutionalCalculationRuns,
  institutionalRecomputePipeline,
  jobKindRunning,
  jobStatusRuns,
  noWorkActivity,
  summarizeWorkActivity,
  workActivity,
  workIsRunning,
  workIsWaitingForPerson,
  workShouldRefresh,
  type WorkActivityRows,
} from "./work-activity";
import {loadWorkActivity} from "./work-activity-reader";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const empty: WorkActivityRows = {jobs: [], runs: [], milestones: [], requests: [], recomputeCandidates: [], institutionalCandidates: []};
const job = (status: string, kind = "work_conversation", run = id(2)) => ({id: id(1), kind, status, processing_run_id: run});
const wait = (extra: Partial<WorkActivityRows["milestones"][number]> = {}) => ({id: id(10), kind: "awaiting_human", subject_kind: "work_review",
  subject_id: id(11), label: "person_review", resolves_milestone_id: null, supersedes_milestone_id: null, occurred_at: "2026-09-26T10:00:00Z", ...extra});
const read = (rows: Partial<WorkActivityRows>) => workActivity({...empty, ...rows});

describe("work activity from persisted facts", () => {
  it("a missing result with no fact is not processing, not waiting and not polled", () => {
    const activity = read({});
    expect(activity).toEqual(noWorkActivity);
    expect(workIsRunning(activity)).toBe(false);
    expect(workIsWaitingForPerson(activity)).toBe(false);
    expect(workShouldRefresh(activity)).toBe(false);
    expect(institutionalCalculationRuns(activity, id(60))).toBe(false);
    expect(summarizeWorkActivity(activity)).toEqual({refresh: false, working: false, waitingForPerson: false});
  });

  it.each(["queued", "leased"])("a %s job runs and is polled", (status) => {
    const activity = read({jobs: [job(status)]});
    expect(workIsRunning(activity)).toBe(true);
    expect(workShouldRefresh(activity)).toBe(true);
    expect(workIsWaitingForPerson(activity)).toBe(false);
    expect(jobStatusRuns(status)).toBe(true);
  });

  it("a job held for approval waits for a person and is not polled", () => {
    const activity = read({jobs: [job("awaiting_approval", "capital_project_analysis")]});
    expect(workIsWaitingForPerson(activity)).toBe(true);
    expect(workIsRunning(activity)).toBe(false);
    expect(workShouldRefresh(activity)).toBe(false);
    expect(conversationIsWorking(activity)).toBe(false);
    expect(jobStatusRuns("awaiting_approval")).toBe(false);
  });

  it.each(["succeeded", "failed", "poison", "cancelled"])("a %s job is not activity", (status) => {
    const activity = read({jobs: [job(status)]});
    expect(activity.jobs).toEqual([]);
    expect(workShouldRefresh(activity)).toBe(false);
    expect(jobStatusRuns(status)).toBe(false);
  });

  it("an open wait is waiting for a person; a resolution or a newer wait closes it", () => {
    expect(workIsWaitingForPerson(read({milestones: [wait()]}))).toBe(true);
    expect(workShouldRefresh(read({milestones: [wait()]}))).toBe(false);
    const resolution = wait({id: id(12), kind: "human_resolved", resolves_milestone_id: id(10)});
    expect(workIsWaitingForPerson(read({milestones: [wait(), resolution]}))).toBe(false);
    const newer = wait({id: id(13), subject_id: id(14), supersedes_milestone_id: id(10)});
    expect(read({milestones: [wait(), newer]}).waits.map((open) => open.milestoneId)).toEqual([id(13)]);
  });

  it("the wait of a recompute candidate is open only while the candidate awaits authorization", () => {
    const candidateWait = wait({subject_kind: "work_recompute_candidate", subject_id: id(20), label: "dependency_recompute_authorization"});
    expect(workIsWaitingForPerson(read({milestones: [candidateWait]}))).toBe(false);
    expect(workIsWaitingForPerson(read({milestones: [candidateWait], recomputeCandidates: [{id: id(20), state: "awaiting_authorization", execution_id: null}]}))).toBe(true);
    // Authorized: the candidate is scheduled for the worker; that is machine work, not a wait.
    const authorized = read({milestones: [candidateWait], recomputeCandidates: [{id: id(20), state: "scheduled", execution_id: null}]});
    expect(workIsWaitingForPerson(authorized)).toBe(false);
    expect(workShouldRefresh(authorized)).toBe(true);
  });

  it("a scheduled update request runs; other request states do not", () => {
    expect(workShouldRefresh(read({requests: [{id: id(30), status: "scheduled"}]}))).toBe(true);
    for (const status of ["open", "awaiting_authorization", "ready", "adopted", "declined", "superseded"]) {
      expect(workShouldRefresh(read({requests: [{id: id(30), status}]}))).toBe(false);
    }
  });

  it("a scheduled candidate runs until it has its execution or result; then the job is the fact", () => {
    expect(workShouldRefresh(read({recomputeCandidates: [{id: id(40), state: "scheduled", execution_id: null}]}))).toBe(true);
    expect(workShouldRefresh(read({recomputeCandidates: [{id: id(40), state: "scheduled", execution_id: id(41)}]}))).toBe(false);
    expect(workShouldRefresh(read({recomputeCandidates: [{id: id(40), state: "settled", execution_id: null}]}))).toBe(false);
    expect(workShouldRefresh(read({institutionalCandidates: [{id: id(42), state: "scheduled", result_id: null}]}))).toBe(true);
    expect(workShouldRefresh(read({institutionalCandidates: [{id: id(42), state: "scheduled", result_id: id(43)}]}))).toBe(false);
    expect(workShouldRefresh(read({institutionalCandidates: [{id: id(42), state: "failed", result_id: null}]}))).toBe(false);
  });

  it("the conversation works only for the jobs it waits on", () => {
    for (const kind of ["document_pipeline", "preliminary_analysis", "capital_project_analysis", "work_conversation", "agent_operation_brief"]) {
      expect(conversationIsWorking(read({jobs: [job("leased", kind)]}))).toBe(true);
    }
    for (const kind of ["execution_brief_proposal", "work_execution", "case_analysis"]) {
      const activity = read({jobs: [job("queued", kind)]});
      expect(conversationIsWorking(activity)).toBe(false);
      expect(workShouldRefresh(activity)).toBe(true);
    }
    // The dependency graph's recomputation of an institutional result runs in the background: its run says so.
    const recompute = read({jobs: [job("queued", "agent_operation_brief", id(50))], runs: [{id: id(50), pipeline_version: institutionalRecomputePipeline}]});
    expect(conversationIsWorking(recompute)).toBe(false);
    expect(summarizeWorkActivity(recompute)).toEqual({refresh: true, working: false, waitingForPerson: false});
    const turn = read({jobs: [job("queued", "agent_operation_brief", id(51))], runs: [{id: id(51), pipeline_version: "advisor-conversation-2026.09.01-v1"}]});
    expect(conversationIsWorking(turn)).toBe(true);
  });

  it("calculates an institutional result only while its candidate is scheduled or a calculating turn runs", () => {
    const result = id(60);
    expect(institutionalCalculationRuns(read({institutionalCandidates: [{id: id(61), state: "scheduled", result_id: result}]}), result)).toBe(true);
    expect(institutionalCalculationRuns(read({institutionalCandidates: [{id: id(61), state: "scheduled", result_id: id(62)}]}), result)).toBe(false);
    expect(institutionalCalculationRuns(read({institutionalCandidates: [{id: id(61), state: "settled", result_id: result}]}), result)).toBe(false);
    expect(institutionalCalculationRuns(read({jobs: [job("leased", "agent_operation_brief")]}), result)).toBe(true);
    expect(institutionalCalculationRuns(read({jobs: [job("failed", "agent_operation_brief")]}), result)).toBe(false);
    expect(institutionalCalculationRuns(read({jobs: [job("queued", "work_conversation")]}), result)).toBe(false);
    // Another result's background recomputation does not calculate this one.
    expect(institutionalCalculationRuns(read({jobs: [job("queued", "agent_operation_brief", id(63))],
      runs: [{id: id(63), pipeline_version: institutionalRecomputePipeline}]}), result)).toBe(false);
  });

  it("follows the executions by their jobs and the candidates the worker still has to take", () => {
    expect(executionsAreRunning(read({jobs: [job("leased", "work_execution")]}))).toBe(true);
    expect(executionsAreRunning(read({jobs: [job("awaiting_approval", "work_execution")]}))).toBe(false);
    expect(executionsAreRunning(read({jobs: [job("queued", "work_conversation")]}))).toBe(false);
    expect(executionsAreRunning(read({recomputeCandidates: [{id: id(72), state: "scheduled", execution_id: null}]}))).toBe(true);
    expect(executionsAreRunning(read({institutionalCandidates: [{id: id(73), state: "scheduled", result_id: null}]}))).toBe(false);
    expect(jobKindRunning(read({jobs: [job("queued", "case_analysis")]}), ["case_analysis"])).toBe(true);
    expect(jobKindRunning(read({jobs: [job("awaiting_approval", "case_analysis")]}), ["case_analysis"])).toBe(false);
  });
});

type Call = [string, ...unknown[]];
function fakeClient(results: Record<string, {data: unknown[] | null; error: unknown}>) {
  const calls: Record<string, Call[]> = {};
  const from = (table: string) => {
    calls[table] = [];
    const result = () => results[table] ?? {data: [], error: null};
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    for (const method of ["select", "eq", "in", "or", "order", "limit"]) {
      query[method] = (...args: unknown[]) => { calls[table]!.push([method, ...args]); return query; };
    }
    return query;
  };
  return {client: {from} as never, calls};
}

describe("work activity reader", () => {
  const scope = {organizationId: id(1), workId: id(2), sessionId: id(3)};

  it("reads only the status columns of the jobs of the work and of its intake session, and the work's waits, requests and candidates", async () => {
    const {client, calls} = fakeClient({
      processing_jobs: {data: [job("queued", "case_analysis"), {...job("leased", "agent_operation_brief", id(9)), id: id(8)}], error: null},
      processing_runs: {data: [{id: id(9), pipeline_version: institutionalRecomputePipeline}], error: null},
      work_milestones: {data: [wait()], error: null},
    });
    const activity = await loadWorkActivity(client, scope);
    expect(workShouldRefresh(activity)).toBe(true);
    expect(workIsWaitingForPerson(activity)).toBe(true);
    expect(activity.jobs.find((live) => live.kind === "agent_operation_brief")?.recompute).toBe(true);
    expect(calls.processing_jobs).toContainEqual(["select", "id, kind, status, processing_run_id"]);
    expect(calls.processing_jobs).toContainEqual(["in", "status", ["queued", "leased", "awaiting_approval"]]);
    expect(calls.processing_jobs).toContainEqual(["or", `work_id.eq.${scope.workId},intake_session_id.eq.${scope.sessionId}`]);
    expect(calls.processing_runs).toContainEqual(["in", "id", [id(9)]]);
    expect(calls.work_milestones).toContainEqual(["eq", "work_id", scope.workId]);
    expect(calls.work_continuation_requests).toContainEqual(["eq", "status", "scheduled"]);
    expect(calls.work_recompute_candidates).toContainEqual(["in", "state", ["scheduled", "awaiting_authorization"]]);
    expect(calls.institutional_recompute_candidates).toContainEqual(["eq", "state", "scheduled"]);
  });

  it("reads only the session's jobs for an intake session without a work, and no run when no calculation is live", async () => {
    const {client, calls} = fakeClient({});
    const activity = await loadWorkActivity(client, {...scope, workId: null});
    expect(activity).toEqual(noWorkActivity);
    expect(calls.processing_jobs).toContainEqual(["eq", "intake_session_id", scope.sessionId]);
    expect(Object.keys(calls)).toEqual(["processing_jobs"]);
  });

  it("fails instead of guessing when a fact cannot be read, and refuses an unscoped or malformed read", async () => {
    await expect(loadWorkActivity(fakeClient({work_milestones: {data: null, error: {code: "42501"}}}).client, scope)).rejects.toThrow("work_activity_unavailable");
    await expect(loadWorkActivity(fakeClient({processing_jobs: {data: [job("queued", "agent_operation_brief")], error: null},
      processing_runs: {data: null, error: {code: "42501"}}}).client, scope)).rejects.toThrow("work_activity_unavailable");
    await expect(loadWorkActivity(fakeClient({}).client, {...scope, workId: null, sessionId: null})).rejects.toThrow("work_activity_scope_required");
    await expect(loadWorkActivity(fakeClient({}).client, {...scope, workId: "x),status.eq.failed"})).rejects.toThrow();
  });
});
