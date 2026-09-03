export type AdvisorOutcomeEvent = {
  type: string;
  createdAt: string;
};

const SUCCESS_EVENTS = new Set(["work_completed", "decision_recorded", "question_answered"]);
const FAILURE_EVENTS = new Set(["work_failed", "quality_gate_failed"]);

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
