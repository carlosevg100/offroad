import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";

import type {Database} from "@/types/database";

import {intakeEventFromRow, loadIntakeReplay, prepareIntakeRequestLadders} from "./replay";

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

const scopeRow = {
  event_id: "73000000-0000-4000-8000-000000000004",
  event_type: "analysis_scope_recorded",
  intake_session_id: sessionId,
  occurred_at: "2026-08-25T12:00:02.000Z",
  sequence: 3,
  payload: {
    scope: {
      entities: [{
        entityId: "organization:20000000-0000-4000-8000-000000000001",
        legalName: "Rede Horizonte S.A.",
        role: "borrower",
        source: "member_organization",
        status: "declared",
        evidenceReferences: [],
      }],
      reason: "The member organization is the primary borrower initially declared for this case.",
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

  it("removes database idempotency metadata before parsing the strict domain event", () => {
    expect(intakeEventFromRow({
      ...scopeRow,
      payload: {...scopeRow.payload, requestHash: "a".repeat(64)} as unknown as
        Database["public"]["Tables"]["intake_domain_events"]["Row"]["payload"],
    })).toMatchObject({
      type: "analysis_scope_recorded",
      caseId: sessionId,
      scope: {version: 1},
    });
  });

  it("still rejects unknown business payload fields", () => {
    expect(() => intakeEventFromRow({
      ...scopeRow,
      payload: {...scopeRow.payload, unexpectedBusinessField: true} as unknown as
        Database["public"]["Tables"]["intake_domain_events"]["Row"]["payload"],
    })).toThrow();
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

  it("records requests against the replayed evidence revision", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({data: [frameRow, routeRow, scopeRow], error: null}),
    };
    const rpc = vi.fn(async (_name: string, args: {p_events: Array<{basisRevision: number}>}) => ({
      data: {events: args.p_events.map((_event, index) => ({eventId: String(index), replayed: false}))},
      error: null,
    }));
    const supabase = {from: () => query, rpc} as unknown as SupabaseClient<Database>;

    const result = await prepareIntakeRequestLadders({
      supabase,
      organizationId: "20000000-0000-4000-8000-000000000001",
      sessionId,
    });

    expect(result.recorded).toBeGreaterThan(0);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]?.[1].p_events.every((event) => event.basisRevision === 3)).toBe(true);
  });

  it("replays once when a concurrent fact makes the first request batch stale", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({data: [frameRow, routeRow, scopeRow], error: null}),
    };
    const rpc = vi.fn()
      .mockResolvedValueOnce({data: null, error: {code: "40001", message: "intake_request_ladder_stale"}})
      .mockResolvedValueOnce({data: {events: [{eventId: "new", replayed: false}]}, error: null});
    const supabase = {from: () => query, rpc} as unknown as SupabaseClient<Database>;

    await expect(prepareIntakeRequestLadders({
      supabase,
      organizationId: "20000000-0000-4000-8000-000000000001",
      sessionId,
    })).resolves.toEqual({recorded: 1});
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
