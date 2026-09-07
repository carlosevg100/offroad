import {describe, expect, it} from "vitest";

import {applyGovernedReceivablesInformationResponse} from "./receivables-information-response";

const answer = {
  id: "10000000-0000-4000-8000-000000000001",
  requirementKey: "receivables.r01.field.structure.advance_rate",
  question: "Qual advance rate devemos testar?",
  answerKind: "number" as const,
  answerSource: "custom" as const,
  sourceNamespace: "receivables_method_r01_fields",
  answeredAt: "2026-09-07T02:00:00.000Z",
  answeredBy: "20000000-0000-4000-8000-000000000001",
  producerBinding: {
    schemaVersion: "receivables-information-request-binding.v1" as const,
    methodId: "R01" as const,
    sourceDatasetHash: "a".repeat(64),
    fieldPath: "/structure/advanceRate" as const,
    valueKind: "percentage" as const,
    unit: "percent_0_100" as const,
    minimum: 0,
    maximum: 100,
    options: [],
  },
};

describe("governed receivables information responses", () => {
  it("normalizes an explicit percentage and preserves its exact user-message lineage", () => {
    const applied = applyGovernedReceivablesInformationResponse({
      answeredRequest: answer,
      content: "72,5%",
      messageId: "30000000-0000-4000-8000-000000000001",
    });
    expect(applied).toMatchObject({
      fieldPath: "/structure/advanceRate",
      canonicalValue: "0.725",
      nextDraft: {revision: 1, fields: {"/structure/advanceRate": {value: "0.725"}}},
      status: {state: "incomplete"},
    });
    expect(applied?.patch.suppliedBy.evidence).toEqual([{
      sourceClass: "user_confirmation",
      sourceId: "30000000-0000-4000-8000-000000000001",
      anchor: "information_request:10000000-0000-4000-8000-000000000001",
    }]);
  });

  it("fails closed on a value outside the bound range", () => {
    expect(() => applyGovernedReceivablesInformationResponse({
      answeredRequest: answer, content: "125%", messageId: "30000000-0000-4000-8000-000000000001",
    })).toThrow("receivables_information_response_range_invalid");
  });

  it("does not reinterpret an unbound workflow response as a financial input", () => {
    expect(applyGovernedReceivablesInformationResponse({
      answeredRequest: {...answer, sourceNamespace: "agent_assessment", producerBinding: null},
      content: "72.5", messageId: "30000000-0000-4000-8000-000000000001",
    })).toBeNull();
  });
});
