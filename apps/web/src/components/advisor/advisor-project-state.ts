export type AdvisorOutcomeEvent = {
  type: string;
  createdAt: string;
};

export type AdvisorCycleEvent = AdvisorOutcomeEvent & {
  id: string;
  detail?: unknown;
};

/** Planned tasks may be ready before the user confirms the next stage. They are not active work. */
export function advisorIsActive(input: {
  sessionStatus: string;
  taskStatuses: readonly string[];
  messageStatuses: readonly string[];
}): boolean {
  return input.sessionStatus === "processing"
    || input.taskStatuses.includes("running")
    || input.messageStatuses.some((status) => status === "queued" || status === "processing");
}

/** Preliminary gaps become active requests only after the user accepts the initial understanding. */
export function canShowAdvisorInformationRequests(preliminaryStatus: string | null): boolean {
  return preliminaryStatus !== "pending_confirmation";
}

const SUCCESS_EVENTS = new Set(["work_completed", "decision_recorded", "question_answered"]);
const FAILURE_EVENTS = new Set(["work_failed", "quality_gate_failed"]);
const TERMINAL_STAGES = new Set([
  "preliminary_understanding",
  "case_analysis",
  "company_debt_view",
  "capital_planning",
  "origination_thesis",
  "agent_operation_brief",
]);

/** Stage telemetry uses `work_progress` for both intermediate and terminal success. Normalize
 * only stages that finish a customer-visible unit of work. */
export function customerEventType(eventType: string, detail: unknown): string {
  if (eventType !== "work_progress" || !detail || typeof detail !== "object" || Array.isArray(detail)) return eventType;
  const record = detail as Record<string, unknown>;
  return record.status === "succeeded" && typeof record.stage === "string" && TERMINAL_STAGES.has(record.stage)
    ? "work_completed"
    : eventType;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventJobId(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const value = (detail as Record<string, unknown>).job_id;
  return typeof value === "string" && value ? value : null;
}

/**
 * Retries belong to the same project history, but replaying every stage from every attempt makes
 * the live conversation look as if the worker is repeating itself. Keep the latest job cycle,
 * its post-run assessments/questions, and the most recent plan that preceded it.
 */
export function currentActivityCycle<T extends AdvisorCycleEvent>(events: readonly T[]): T[] {
  const ordered = [...events].sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt));
  const latestJobEvent = [...ordered].reverse().find((event) => eventJobId(event.detail));
  const jobId = latestJobEvent ? eventJobId(latestJobEvent.detail) : null;
  if (!jobId) return ordered;
  const jobEvents = ordered.filter((event) => eventJobId(event.detail) === jobId);
  const cycleStartedAt = Math.min(...jobEvents.map((event) => timestamp(event.createdAt)));
  const latestPlan = [...ordered]
    .reverse()
    .find((event) => event.type === "plan_created" && timestamp(event.createdAt) <= cycleStartedAt);
  return ordered.filter((event) => {
    if (latestPlan && event.id === latestPlan.id) return true;
    const candidateJobId = eventJobId(event.detail);
    if (candidateJobId) return candidateJobId === jobId;
    return timestamp(event.createdAt) >= cycleStartedAt;
  });
}

export function latestSuccessfulOutcomeAt(events: readonly AdvisorOutcomeEvent[]): number | null {
  const successful = events
    .filter((event) => SUCCESS_EVENTS.has(event.type))
    .map((event) => timestamp(event.createdAt));
  return successful.length ? Math.max(...successful) : null;
}

/**
 * A recovered retry is not an outstanding failure. The most recent terminal work outcome wins;
 * aggregate session/task flags remain a fallback for older projects that have no event trail.
 */
export function advisorNeedsAttention(input: {
  active: boolean;
  sessionStatus: string;
  taskStatuses: readonly string[];
  messageStatuses: readonly string[];
  events: readonly AdvisorOutcomeEvent[];
}): boolean {
  if (input.active) return false;
  const outcomes = input.events
    .filter((event) => SUCCESS_EVENTS.has(event.type) || FAILURE_EVENTS.has(event.type))
    .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt));
  const latest = outcomes.at(-1);
  if (latest) return FAILURE_EVENTS.has(latest.type);
  return input.sessionStatus === "failed"
    || input.taskStatuses.includes("failed")
    || input.messageStatuses.includes("failed");
}

export function failureWasRecovered(createdAt: string, successfulOutcomeAt: number | null): boolean {
  return successfulOutcomeAt !== null && timestamp(createdAt) <= successfulOutcomeAt;
}
