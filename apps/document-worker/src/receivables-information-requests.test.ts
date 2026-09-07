import {describe, expect, it} from "vitest";

import {
  buildReceivablesMethodFieldRequestProjection,
  buildReceivablesMethodInformationRequestProjection,
} from "./receivables-information-requests";

const base = {
  version: "2026.09.07-v1" as const,
  state: "blocked" as const,
  primaryReason: "needs_evidence" as const,
  methodExecutionAllowed: false,
  sourceDatasetHash: "a".repeat(64),
  dimensions: [],
  nextQuestions: [],
  gaps: [{
    code: "finding_unresolved:duplicate-1",
    dimensionId: "title_legal_controls" as const,
    class: "conflict" as const,
    blocking: true as const,
    message: {pt: "Há um título duplicado sem tratamento.", en: "A duplicate title has no disposition."},
    question: {pt: "Esse título foi corrigido ou é um falso positivo?", en: "Was this title corrected or is it a false positive?"},
    evidenceIds: ["doc-1"],
  }],
};

describe("receivables method question projection", () => {
  it("creates an interactive request from the actual blocking gap", () => {
    const projection = buildReceivablesMethodInformationRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001",
      processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "pt-BR",
      readiness: base,
      idFactory: () => "30000000-0000-4000-8000-000000000001",
    });
    expect(projection).toMatchObject({
      sourceNamespace: "receivables_method_r01_evidence",
      requests: [{
        requirementKey: "receivables.r01.finding_unresolved-duplicate-1",
        question: "Esse título foi corrigido ou é um falso positivo?",
        answerKind: "document",
        priority: "blocking",
      }],
    });
  });

  it("clears the producer namespace when the method becomes ready", () => {
    const projection = buildReceivablesMethodInformationRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001",
      processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "en-US",
      readiness: {...base, state: "ready", primaryReason: "ready", methodExecutionAllowed: true, gaps: []},
    });
    expect(projection.requests).toEqual([]);
  });

  it("asks for exact model fields with a private dataset and unit binding", () => {
    const ids = [
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
      "30000000-0000-4000-8000-000000000003",
    ];
    const projection = buildReceivablesMethodFieldRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001",
      processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "pt-BR",
      sourceDatasetHash: "a".repeat(64),
      activeGroups: ["structure"],
      missingSections: ["structure.advanceRate", "structure.requestedFacility", "structure.reserveRate"],
      idFactory: () => ids.shift()!,
    });
    expect(projection.sourceNamespace).toBe("receivables_method_r01_fields");
    expect(projection.requests).toHaveLength(3);
    expect(projection.requests[0]).toMatchObject({
      requirementKey: "receivables.r01.field.structure.requested_facility",
      answerKind: "number",
      producerBinding: {
        sourceDatasetHash: "a".repeat(64),
        fieldPath: "/structure/requestedFacility",
        valueKind: "money",
        unit: "currency_major",
      },
    });
    expect(projection.requests[1]).toMatchObject({
      requirementKey: "receivables.r01.field.structure.advance_rate",
      producerBinding: {fieldPath: "/structure/advanceRate", unit: "percent_0_100"},
    });
  });
});
