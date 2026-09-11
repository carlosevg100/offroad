import {describe, expect, it} from "vitest";
import {countAcceptedDebtFacts, readProjectWorkRequests} from "./project-work-requests";

const base = {id: "10000000-0000-4000-8000-000000000001", objective: "Calcule os cenários.", status: "dispatched", origin_section: "document-review", requested_by: "10000000-0000-4000-8000-000000000002", created_at: "2026-09-10T20:00:00Z"};

describe("project work request history", () => {
  it("keeps the executor surface and the originating result of each request", () => {
    expect(readProjectWorkRequests([{...base, capability: "financial_result", dispatch: {surface: "institutional-setup", executor: "institutional_model"}}])).toEqual([
      {id: base.id, capability: "financial_result", objective: base.objective, status: "dispatched", surface: "institutional-setup", originSection: "document-review", requestedBy: base.requested_by, createdAt: base.created_at},
    ]);
  });
  it("keeps a debt structure request with its own surface", () => {
    expect(readProjectWorkRequests([{...base, capability: "debt_structure_analysis", dispatch: {surface: "debt-structure", executor: "case01_debt_methods"}}])[0])
      .toMatchObject({capability: "debt_structure_analysis", surface: "debt-structure"});
  });

  it("counts only the debt facts the review accepted with a verified anchor", () => {
    const fact = (field_path: string, review_state: string, anchor_verified = true) => ({field_path, review_state, anchor_verified});
    expect(countAcceptedDebtFacts(null)).toBe(0);
    expect(countAcceptedDebtFacts({candidates: []})).toBe(0);
    expect(countAcceptedDebtFacts({candidates: [
      fact("debt.instruments.0.balance", "accepted"),
      fact("debt.gross_total", "edited"),
      fact("debt.covenants", "proposed"),
      fact("debt.maturity_profile", "accepted", false),
      fact("revenue", "accepted"),
    ]})).toBe(2);
  });

  it("drops unknown capabilities, statuses and surfaces instead of guessing", () => {
    expect(readProjectWorkRequests([{...base, capability: "matching", dispatch: {}}, {...base, capability: "financial_result", status: "done", dispatch: {}}])).toEqual([]);
    expect(readProjectWorkRequests([{...base, capability: "provider_research", dispatch: {surface: "unknown-surface"}}])[0]?.surface).toBeNull();
  });
});
