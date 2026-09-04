export type AdvisorOutcomeEvent = {
  type: string;
  createdAt: string;
};

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
