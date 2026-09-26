/**
 * What is in progress for a work, read only from persisted facts (stage 18, increment 5B).
 *
 * Four facts, and nothing else, say that something is in progress:
 * - a live job of the work: `queued` or `leased` (a machine is on it) or `awaiting_approval`
 *   (held until a person approves);
 * - an open wait: an `awaiting_human` milestone that no `human_resolved` resolves and no newer wait
 *   supersedes; the wait of a recompute candidate is open only while the candidate itself is
 *   `awaiting_authorization`, the rule the work's update view reads;
 * - a dependency update request that is `scheduled`;
 * - a recompute candidate that is `scheduled`: the worker will produce its execution, or its
 *   institutional result, and the candidate settles when that job ends.
 *
 * A missing result is never activity. When none of these facts exists, a surface shows the gap and
 * its next step; the page stops refreshing.
 *
 * A person may read only the status columns of a job (kind, status, run), never its payload or
 * execution: a job is tied to what it produces through its run and through the candidates, never by
 * guessing.
 */

export const liveJobStatuses = ["queued", "leased", "awaiting_approval"] as const;
export type LiveJobStatus = (typeof liveJobStatuses)[number];

/** The pipeline of the run the dependency graph opens to recompute an institutional result (5A). */
export const institutionalRecomputePipeline = "institutional-dependency-recompute-v1";

export type WorkActivityJob = Readonly<{
  id: string;
  kind: string;
  status: LiveJobStatus;
  /** The job recomputes an institutional result for the dependency graph, in the background. */
  recompute: boolean;
}>;

export type WorkActivityWait = Readonly<{milestoneId: string; subjectKind: string; subjectId: string; label: string; since: string}>;

export type WorkActivityCandidate = Readonly<{id: string; family: "execution" | "institutional"; producedId: string | null}>;

export type WorkActivity = Readonly<{
  jobs: readonly WorkActivityJob[];
  waits: readonly WorkActivityWait[];
  scheduledRequests: readonly string[];
  /** Scheduled candidates, with the execution or institutional result they produce once it exists. */
  scheduledCandidates: readonly WorkActivityCandidate[];
}>;

/** The rows the reader selects, already scoped to the work (and its intake session). */
export type WorkActivityRows = Readonly<{
  jobs: ReadonlyArray<{id: string; kind: string; status: string; processing_run_id: string}>;
  /** The runs of the live jobs, to tell a background recomputation from a turn. */
  runs: ReadonlyArray<{id: string; pipeline_version: string}>;
  milestones: ReadonlyArray<{id: string; kind: string; subject_kind: string; subject_id: string; label: string;
    resolves_milestone_id: string | null; supersedes_milestone_id: string | null; occurred_at: string}>;
  requests: ReadonlyArray<{id: string; status: string}>;
  recomputeCandidates: ReadonlyArray<{id: string; state: string; execution_id: string | null}>;
  institutionalCandidates: ReadonlyArray<{id: string; state: string; result_id: string | null}>;
}>;

export const noWorkActivity: WorkActivity = {jobs: [], waits: [], scheduledRequests: [], scheduledCandidates: []};

function liveStatus(status: string): LiveJobStatus | null {
  return (liveJobStatuses as readonly string[]).includes(status) ? status as LiveJobStatus : null;
}

/** A job status that a machine is working on. */
export function jobStatusRuns(status: string | null | undefined): boolean {
  return status === "queued" || status === "leased";
}

export function workActivity(rows: WorkActivityRows): WorkActivity {
  const recomputeRuns = new Set(rows.runs.flatMap((run) => run.pipeline_version === institutionalRecomputePipeline ? [run.id] : []));
  const jobs = rows.jobs.flatMap((job): WorkActivityJob[] => {
    const status = liveStatus(job.status);
    return status ? [{id: job.id, kind: job.kind, status, recompute: recomputeRuns.has(job.processing_run_id)}] : [];
  });
  const resolved = new Set(rows.milestones.flatMap((row) => row.kind === "human_resolved" && row.resolves_milestone_id ? [row.resolves_milestone_id] : []));
  const superseded = new Set(rows.milestones.flatMap((row) => row.kind === "awaiting_human" && row.supersedes_milestone_id ? [row.supersedes_milestone_id] : []));
  const awaitingCandidates = new Set(rows.recomputeCandidates.flatMap((row) => row.state === "awaiting_authorization" ? [row.id] : []));
  const waits = rows.milestones
    .filter((row) => row.kind === "awaiting_human" && !resolved.has(row.id) && !superseded.has(row.id)
      && (row.subject_kind !== "work_recompute_candidate" || awaitingCandidates.has(row.subject_id)))
    .map((row) => ({milestoneId: row.id, subjectKind: row.subject_kind, subjectId: row.subject_id, label: row.label, since: row.occurred_at}));
  return {
    jobs,
    waits,
    scheduledRequests: rows.requests.flatMap((row) => row.status === "scheduled" ? [row.id] : []),
    scheduledCandidates: [
      ...rows.recomputeCandidates.flatMap((row) => row.state === "scheduled" ? [{id: row.id, family: "execution" as const, producedId: row.execution_id}] : []),
      ...rows.institutionalCandidates.flatMap((row) => row.state === "scheduled" ? [{id: row.id, family: "institutional" as const, producedId: row.result_id}] : []),
    ],
  };
}

const runs = (job: WorkActivityJob) => jobStatusRuns(job.status);
/** A scheduled candidate without what it produces: the worker still has to take it. Once the
 * execution or result exists, its job is the fact. */
const awaitingWorker = (candidate: WorkActivityCandidate) => candidate.producedId === null;

/** A machine is on something of this work: the page refreshes while this holds. */
export function workIsRunning(activity: WorkActivity): boolean {
  return activity.jobs.some(runs) || activity.scheduledRequests.length > 0 || activity.scheduledCandidates.some(awaitingWorker);
}

/** Something of this work waits for a person: held work or an open wait. Nothing refreshes for it. */
export function workIsWaitingForPerson(activity: WorkActivity): boolean {
  return activity.jobs.some((job) => job.status === "awaiting_approval") || activity.waits.length > 0;
}

/** The refresh decision: poll only while a machine is on something of the work. A wait for a
 * person is not polled; the person's own action refreshes the page. */
export function workShouldRefresh(activity: WorkActivity): boolean {
  return workIsRunning(activity);
}

/** Jobs the conversation waits on: reading documents, the analysis a turn asks for and the reply to
 * a turn. A plan being prepared, a pinned execution, the case analysis and a dependency
 * recomputation run in the background: the page refreshes for them, but the conversation stays open. */
const conversationJobKinds = new Set(["document_pipeline", "preliminary_analysis", "capital_project_analysis", "work_conversation", "agent_operation_brief"]);

export function conversationIsWorking(activity: WorkActivity): boolean {
  return activity.jobs.some((job) => runs(job) && conversationJobKinds.has(job.kind) && !job.recompute);
}

/** A live job of one of these kinds runs (queued or leased). */
export function jobKindRunning(activity: WorkActivity, kinds: readonly string[]): boolean {
  return activity.jobs.some((job) => runs(job) && kinds.includes(job.kind));
}

/**
 * Whether the calculation of an institutional result runs. A recomputation is named by its
 * candidate, which stays scheduled until its job ends. A calculation a person asked for runs as a
 * turn of the conversation, whose job a person cannot tie to the result: it counts while such a turn
 * runs. With neither, nothing calculates the result.
 */
export function institutionalCalculationRuns(activity: WorkActivity, resultId: string): boolean {
  return activity.scheduledCandidates.some((candidate) => candidate.family === "institutional" && candidate.producedId === resultId)
    || activity.jobs.some((job) => runs(job) && job.kind === "agent_operation_brief" && !job.recompute);
}

/** A pinned execution of the work runs, or the worker will produce a recomputed one. */
export function executionsAreRunning(activity: WorkActivity): boolean {
  return jobKindRunning(activity, ["work_execution"])
    || activity.scheduledCandidates.some((candidate) => candidate.family === "execution" && awaitingWorker(candidate));
}

/** What a client surface needs to show and poll, without ids: the refresh decision, whether the
 * conversation's own work runs, and whether something waits for a person. */
export type WorkActivitySummary = Readonly<{refresh: boolean; working: boolean; waitingForPerson: boolean}>;

export function summarizeWorkActivity(activity: WorkActivity): WorkActivitySummary {
  return {refresh: workShouldRefresh(activity), working: conversationIsWorking(activity), waitingForPerson: workIsWaitingForPerson(activity)};
}
