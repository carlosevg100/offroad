import {describe, expect, it} from "vitest";

import {
  buildReceivablesMethodEvidenceRequestProjection,
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
  it("asks again for a new dataset while retaining evidence identity across runs and languages", () => {
    const context = {projectId: "10000000-0000-4000-8000-000000000001", processingRunId: "20000000-0000-4000-8000-000000000001", locale: "pt-BR" as const, readiness: base};
    const original = buildReceivablesMethodEvidenceRequestProjection(context).requests[0]!;
    const replay = buildReceivablesMethodEvidenceRequestProjection({...context, processingRunId: "20000000-0000-4000-8000-000000000002", locale: "en-US"}).requests[0]!;
    const nextPool = buildReceivablesMethodEvidenceRequestProjection({...context, readiness: {...base, sourceDatasetHash: "b".repeat(64)}}).requests[0]!;
    expect(replay.requirementKey).toBe(original.requirementKey);
    expect(replay.question).not.toBe(original.question);
    expect(nextPool.requirementKey).not.toBe(original.requirementKey);
    expect(nextPool.requirementKey).toMatch(/^[a-z0-9_.-]{3,120}$/);
  });

  it("suppresses only assembled draft requirements and preserves temporal and conflict gaps", () => {
    const projection = buildReceivablesMethodEvidenceRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001",
      processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "en-US", missingDraftSections: ["policy.maxDaysPastDue"],
      readiness: {...base, gaps: [
        {...base.gaps[0]!, class: "evidence" as const, code: "portfolio_lineage_not_assembled"},
        {...base.gaps[0]!, class: "evidence" as const, code: "support_period:accounting_reconciliation_difference"},
        {...base.gaps[0]!, code: "portfolio_lineage_not_assembled"},
        {...base.gaps[0]!, class: "evidence" as const, code: "performance_history_incomplete"},
      ].map((gap) => ({...gap, question: {pt: gap.code, en: gap.code}}))},
    });
    expect(projection.requests.map((request) => request.question)).toEqual([
      "support_period:accounting_reconciliation_difference",
      "portfolio_lineage_not_assembled",
      "performance_history_incomplete",
    ]);
  });

  it("keeps source review pending without asking the user to resupply existing balance documents", () => {
    const readiness = {...base, gaps: [{...base.gaps[0]!, code: "support_period:undeclared_recourse_and_debt"}]};
    const projection = buildReceivablesMethodInformationRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001", processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "pt-BR", readiness,
    });
    expect(projection.requests).toEqual([]);
    expect(readiness.methodExecutionAllowed).toBe(false);
    expect(readiness.gaps).toHaveLength(1);
  });

  it("preserves distinct stable keys for grouped temporal requirements", () => {
    const projection = buildReceivablesMethodInformationRequestProjection({
      projectId: "10000000-0000-4000-8000-000000000001", processingRunId: "20000000-0000-4000-8000-000000000001",
      locale: "en-US", readiness: {...base, gaps: ["accounting_reconciliation_difference", "cancelled_invoice_open", "dilution_misclassification"].map((detector) => ({...base.gaps[0]!, code: `support_period:${detector}`}))},
    });
    expect(projection.requests).toHaveLength(3);
    expect(new Set(projection.requests.map((request) => request.requirementKey)).size).toBe(3);
  });

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
        requirementKey: expect.stringMatching(/^receivables\.r01\.evidence\.[a-f0-9]{64}$/),
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
