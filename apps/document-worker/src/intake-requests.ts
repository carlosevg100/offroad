import {randomUUID} from "node:crypto";

import {
  buildPendingRequestLadders,
  intakeEventSchema,
  M0_INTAKE_POLICY,
  replayIntake,
  type IntakeEvent,
} from "@offroad/credit-playbook";
import {z} from "zod";

import type {DocumentJob, QueueClient} from "./queue";

const intakeEventRowSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  intake_session_id: z.string().min(1),
  occurred_at: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  sequence: z.coerce.number().int().positive(),
}).strict();

/** Converts a capability-scoped database row at the worker trust boundary. */
export function intakeEventFromWorkerRow(input: unknown): IntakeEvent {
  const row = intakeEventRowSchema.parse(input);
  return intakeEventSchema.parse({
    ...row.payload,
    eventId: row.event_id,
    caseId: row.intake_session_id,
    sequence: row.sequence,
    occurredAt: row.occurred_at,
    type: row.event_type,
  }) as IntakeEvent;
}

/**
 * Replays the immutable intake after classification and materializes only the requests whose
 * three-step search ladder was completed against that exact evidence revision.
 */
export async function prepareWorkerIntakeRequests(job: DocumentJob, queue: QueueClient): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rows = await queue.loadIntakeEvents(job);
    if (rows.length === 0) return 0;

    const events = rows.map(intakeEventFromWorkerRow);
    const state = replayIntake(job.intake_session_id, M0_INTAKE_POLICY, events);
    const drafts = buildPendingRequestLadders(state);
    if (drafts.length === 0) return 0;

    try {
      await queue.recordIntakeRequestLadders(
        job,
        drafts.map((draft) => ({
          eventId: randomUUID(),
          requirementId: draft.requirementId,
          attempts: draft.attempts,
          basisRevision: state.evidenceRevision,
        })),
      );
      return drafts.length;
    } catch (error) {
      if (attempt === 0 && error instanceof Error && error.message.includes("intake_request_ladder_stale")) {
        continue;
      }
      throw error;
    }
  }
  return 0;
}
