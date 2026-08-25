import {describe, expect, it} from "vitest";

import {buildScopeSuggestionInputs, deterministicJobEventId} from "./intake-governance";

describe("intake governance candidates", () => {
  it("surfaces only anchored, high-confidence entity names and never invents a legal role", () => {
    const result = buildScopeSuggestionInputs([
      {entity_name: "Horizonte Logística Ltda.", confidence: 0.93, anchor_verified: true},
      {entity_name: " Horizonte   Logística Ltda. ", confidence: 0.87, anchor_verified: true},
      {entity_name: "Grupo sem âncora S.A.", confidence: 0.99, anchor_verified: false},
      {entity_name: "Baixa confiança Ltda.", confidence: 0.79, anchor_verified: true},
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      legalName: "Horizonte Logística Ltda.",
      suggestedRole: "other",
    }));
    expect(result[0]?.suggestionId).toMatch(/^scope-suggestion:[a-f0-9]{32}$/);
  });

  it("creates stable, purpose-separated UUIDs for job retries", () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    expect(deterministicJobEventId(jobId, "scope-suggestions")).toBe(
      deterministicJobEventId(jobId, "scope-suggestions"),
    );
    expect(deterministicJobEventId(jobId, "scope-suggestions")).not.toBe(
      deterministicJobEventId(jobId, "advisor-authorization"),
    );
    expect(deterministicJobEventId(jobId, "scope-suggestions")).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });
});

