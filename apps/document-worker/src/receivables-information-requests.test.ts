import {describe, expect, it} from "vitest";

import {buildReceivablesMethodInformationRequestProjection} from "./receivables-information-requests";

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
      sourceNamespace: "receivables_method_r01",
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
});
