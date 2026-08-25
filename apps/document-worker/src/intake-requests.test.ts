import {describe, expect, it, vi} from "vitest";

import {intakeEventFromWorkerRow, prepareWorkerIntakeRequests} from "./intake-requests";
import type {DocumentJob, QueueClient} from "./queue";

const job = {
  claimed: true,
  job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-08-25T18:10:00.000Z",
  attempt: 1,
  kind: "document_pipeline",
  organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  intake_session_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  processing_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  payload: {
    source_document_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    document_version: 1,
    original_name: "financials.xlsx",
    object_path: "org/session/financials.xlsx",
  },
} satisfies DocumentJob;

function eventRows() {
  return [
    {
      event_id: "frame-event",
      event_type: "capital_need_declared",
      intake_session_id: job.intake_session_id,
      occurred_at: "2026-08-25T18:00:00.000Z",
      sequence: 1,
      payload: {
        frame: {
          useOfProceeds: "growth_expansion",
          declaredBy: {actorId: "company-user", role: "company"},
          version: 1,
        },
      },
    },
    {
      event_id: "route-event",
      event_type: "archetype_routed",
      intake_session_id: job.intake_session_id,
      occurred_at: "2026-08-25T18:00:01.000Z",
      sequence: 2,
      payload: {
        route: {
          archetypeId: "growth_expansion",
          confidence: "medium",
          rationale: "Declared operation and current evidence.",
          retestTriggers: ["classified documents"],
          version: 1,
        },
      },
    },
    {
      event_id: "scope-event",
      event_type: "analysis_scope_recorded",
      intake_session_id: job.intake_session_id,
      occurred_at: "2026-08-25T18:00:02.000Z",
      sequence: 3,
      payload: {
        scope: {
          entities: [{
            entityId: `organization:${job.organization_id}`,
            legalName: "Rede Horizonte S.A.",
            role: "borrower",
            source: "member_organization",
            status: "declared",
          }],
          reason: "The member organization is the primary borrower initially declared for this case.",
          version: 1,
        },
      },
    },
  ];
}

function queue(rows: unknown[]) {
  const record = vi.fn(async (_job: DocumentJob, _events: unknown[]) => {});
  return {
    client: {
      loadIntakeEvents: vi.fn(async () => rows),
      recordIntakeRequestLadders: record,
    } as unknown as QueueClient,
    record,
  };
}

describe("worker request preparation", () => {
  it("rejects malformed rows at the worker boundary", () => {
    expect(() => intakeEventFromWorkerRow({...eventRows()[0], sequence: 0})).toThrow();
  });

  it("materializes a governed batch from replayed evidence", async () => {
    const {client, record} = queue(eventRows());

    const count = await prepareWorkerIntakeRequests(job, client);

    expect(count).toBeGreaterThan(0);
    expect(record).toHaveBeenCalledOnce();
    const written = record.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(written.length).toBe(count);
    expect(written[0]).toEqual(expect.objectContaining({
      eventId: expect.any(String),
      requirementId: expect.any(String),
      basisRevision: 3,
      attempts: expect.arrayContaining([
        expect.objectContaining({source: "classified_room"}),
        expect.objectContaining({source: "registered_public_source", outcome: "not_permitted"}),
      ]),
    }));
  });

  it("does not write without an event stream", async () => {
    const {client, record} = queue([]);
    expect(await prepareWorkerIntakeRequests(job, client)).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });

  it("replays once when concurrent evidence makes the first basis stale", async () => {
    const rows = eventRows();
    const load = vi.fn(async () => rows);
    const record = vi
      .fn<QueueClient["recordIntakeRequestLadders"]>()
      .mockRejectedValueOnce(new Error("intake_request_ladder_stale"))
      .mockResolvedValueOnce(undefined);
    const client = {loadIntakeEvents: load, recordIntakeRequestLadders: record} as unknown as QueueClient;

    const count = await prepareWorkerIntakeRequests(job, client);

    expect(count).toBeGreaterThan(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(2);
  });
});
