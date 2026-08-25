import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it} from "vitest";

import type {Database} from "@/types/database";

import {intakeEventFromRow, loadIntakeReplay} from "./replay";

const sessionId = "73000000-0000-4000-8000-000000000001";

const frameRow = {
  event_id: "73000000-0000-4000-8000-000000000002",
  event_type: "capital_need_declared",
  intake_session_id: sessionId,
  occurred_at: "2026-08-25T12:00:00.000Z",
  sequence: 1,
  payload: {
    frame: {
      useOfProceeds: "growth_expansion",
      declaredBy: {actorId: "10000000-0000-4000-8000-000000000001", role: "company"},
      version: 1,
    },
  },
} as const;

const routeRow = {
  event_id: "73000000-0000-4000-8000-000000000003",
  event_type: "archetype_routed",
  intake_session_id: sessionId,
  occurred_at: "2026-08-25T12:00:01.000Z",
  sequence: 2,
  payload: {
    route: {
      archetypeId: "growth_expansion",
      confidence: "medium",
      rationale: "Finalidade declarada durante o intake guiado.",
      retestTriggers: ["classified documents"],
      version: 1,
    },
  },
} as const;

function supabaseWith(rows: unknown[]) {
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({data: rows, error: null}),
  };
  return {from: () => query} as unknown as SupabaseClient<Database>;
}

describe("intake event replay boundary", () => {
  it("parses the immutable payload instead of filling it from projections", () => {
    expect(intakeEventFromRow(frameRow)).toMatchObject({
      type: "capital_need_declared",
      caseId: sessionId,
      frame: {useOfProceeds: "growth_expansion", version: 1},
    });
  });

  it("rebuilds the routed state and reports which domains the stream covers", async () => {
    const replay = await loadIntakeReplay({
      supabase: supabaseWith([frameRow, routeRow]),
      organizationId: "20000000-0000-4000-8000-000000000001",
      sessionId,
    });

    expect(replay.kind).toBe("ready");
    if (replay.kind !== "ready") throw new Error("expected replay");
    expect(replay.state.archetypeRoute?.archetypeId).toBe("growth_expansion");
    expect(replay.coverage).toEqual({capitalNeed: true, documents: false, information: false});
  });

  it("fails closed when the stored payload is malformed", () => {
    expect(() => intakeEventFromRow({...frameRow, payload: {frame: {useOfProceeds: "growth_expansion"}}})).toThrow();
  });

  it("fails closed when the sequence is discontinuous", async () => {
    await expect(loadIntakeReplay({
      supabase: supabaseWith([frameRow, {...routeRow, sequence: 3}]),
      organizationId: "20000000-0000-4000-8000-000000000001",
      sessionId,
    })).rejects.toThrow("continuous");
  });
});
