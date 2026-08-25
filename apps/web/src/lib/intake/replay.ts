import {randomUUID} from "node:crypto";

import {
  buildPendingRequestLadders,
  intakeEventSchema,
  M0_INTAKE_POLICY,
  replayIntake,
  type IntakeEvent,
  type IntakeState,
} from "@offroad/credit-playbook";
import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database, Json} from "@/types/database";

type IntakeEventRow = Pick<
  Database["public"]["Tables"]["intake_domain_events"]["Row"],
  "event_id" | "event_type" | "intake_session_id" | "occurred_at" | "payload" | "sequence"
>;

export type IntakeReplayCoverage = {
  capitalNeed: boolean;
  documents: boolean;
  information: boolean;
};

export type LoadedIntakeReplay =
  | {kind: "empty"}
  | {
      kind: "ready";
      state: IntakeState;
      coverage: IntakeReplayCoverage;
      eventTypes: IntakeEvent["type"][];
    };

/** Converts one database row at the trust boundary and rejects unknown or malformed payloads. */
export function intakeEventFromRow(row: IntakeEventRow): IntakeEvent {
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    throw new Error("invalid intake event payload");
  }

  return intakeEventSchema.parse({
    ...(row.payload as Record<string, Json | undefined>),
    eventId: row.event_id,
    caseId: row.intake_session_id,
    sequence: Number(row.sequence),
    occurredAt: row.occurred_at,
    type: row.event_type,
  }) as IntakeEvent;
}

/**
 * Rebuilds the intake from the append-only stream under tenant RLS.
 *
 * No mutable projection is used to fill a missing event. A malformed or discontinuous stream
 * fails closed so a screen cannot present a state the immutable history does not support.
 */
export async function loadIntakeReplay(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
}): Promise<LoadedIntakeReplay> {
  const {data, error} = await input.supabase
    .from("intake_domain_events")
    .select("event_id, event_type, intake_session_id, occurred_at, payload, sequence")
    .eq("organization_id", input.organizationId)
    .eq("intake_session_id", input.sessionId)
    .order("sequence");

  if (error) throw error;
  if (!data?.length) return {kind: "empty"};

  const events = data.map(intakeEventFromRow);
  const eventTypes = events.map((event) => event.type);
  const typeSet = new Set(eventTypes);

  return {
    kind: "ready",
    state: replayIntake(input.sessionId, M0_INTAKE_POLICY, events),
    eventTypes,
    coverage: {
      capitalNeed: typeSet.has("capital_need_declared"),
      documents: typeSet.has("document_received"),
      information: eventTypes.some((type) =>
        type === "information_answered" ||
        type === "information_cleared" ||
        type === "absence_recorded"
      ),
    },
  };
}

/**
 * Persists every request ladder that is stale or absent at the current evidence revision.
 *
 * The drafts are compiled by the canonical playbook. The database allocates trace versions and
 * binds the whole batch to the evidence revision it locked, so a concurrent upload or answer
 * cannot make a newly displayed request rely on an older search.
 */
export async function prepareIntakeRequestLadders(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
}): Promise<{recorded: number}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const replay = await loadIntakeReplay(input);
    if (replay.kind !== "ready") return {recorded: 0};

    const drafts = buildPendingRequestLadders(replay.state);
    if (drafts.length === 0) return {recorded: 0};

    const {data, error} = await input.supabase.rpc("record_intake_request_ladders_command", {
      p_organization_id: input.organizationId,
      p_session_id: input.sessionId,
      p_events: drafts.map((draft) => ({
        eventId: randomUUID(),
        requirementId: draft.requirementId,
        attempts: draft.attempts,
        basisRevision: replay.state.evidenceRevision,
      })) as unknown as Json,
    });
    // One concurrent upload or answer is expected under active use. Replay once against the
    // newly locked evidence revision; a second collision is surfaced instead of spinning.
    if (error?.code === "40001" && attempt === 0) continue;
    if (error) throw error;

    const events = data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.events)
      ? data.events
      : [];
    return {
      recorded: events.filter((event) =>
        event && typeof event === "object" && !Array.isArray(event) && event.replayed === false
      ).length,
    };
  }
  return {recorded: 0};
}
