import {describe, expect, it} from "vitest";
import {readProjectWorkRequests} from "./project-work-requests";

const base = {id: "10000000-0000-4000-8000-000000000001", objective: "Calcule os cenários.", status: "dispatched", origin_section: "document-review", requested_by: "10000000-0000-4000-8000-000000000002", created_at: "2026-09-10T20:00:00Z"};

describe("project work request history", () => {
  it("keeps the executor surface and the originating result of each request", () => {
    expect(readProjectWorkRequests([{...base, capability: "financial_result", dispatch: {surface: "institutional-setup", executor: "institutional_model"}}])).toEqual([
      {id: base.id, capability: "financial_result", objective: base.objective, status: "dispatched", surface: "institutional-setup", originSection: "document-review", requestedBy: base.requested_by, createdAt: base.created_at},
    ]);
  });
  it("drops unknown capabilities, statuses and surfaces instead of guessing", () => {
    expect(readProjectWorkRequests([{...base, capability: "matching", dispatch: {}}, {...base, capability: "financial_result", status: "done", dispatch: {}}])).toEqual([]);
    expect(readProjectWorkRequests([{...base, capability: "provider_research", dispatch: {surface: "unknown-surface"}}])[0]?.surface).toBeNull();
  });
});
