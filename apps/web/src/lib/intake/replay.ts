import {
  intakeEventSchema,
  replayIntake,
  type IntakeEvent,
  type IntakePolicy,
  type IntakeState,
} from "@offroad/credit-playbook";
import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database, Json} from "@/types/database";

/**
 * The dated policy that makes one event stream produce one request state.
 *
 * M0 currently implements the event boundary through document classification. The date window
 * is deliberately explicit: changing request policy requires a new version instead of silently
 * changing the meaning of historical cases.
 */
export const M0_INTAKE_POLICY = Object.freeze({
  version: "m0-intake-2026.08.25-v1",
  maxActiveRequests: 5,
  source: {
    title: "House Playbook M0 Intake",
    reference: "IN-13, IN-14 and the M0 executable procedure contract",
  },
  asOf: "2026-08-25",
  validUntil: "2030-12-31",
} satisfies IntakePolicy);

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
