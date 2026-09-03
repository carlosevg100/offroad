import {describe, expect, it} from "vitest";

import {
  buildPreliminaryAssessment,
  buildPrivateCaseAssessment,
  buildPublicWorkAssessment,
} from "./agent-assessment";

const projectId = "10000000-0000-4000-8000-000000000001";
const assessedAt = "2026-09-03T12:00:00.000Z";

describe("agent assessment projection", () => {
  it("lets classified private documents satisfy the playbook without asking the user again", () => {
    const assessment = buildPrivateCaseAssessment({
      projectId,
      assessmentRef: "processing_run:20000000-0000-4000-8000-000000000001",
      locale: "pt-BR",
      assessedAt,
      archetypeId: "other",
      documents: [
        {id: "doc-financials", kind: "audited_financial_statements"},
        {id: "doc-debt", kind: "debt_schedule"},
      ],
      clientQuestions: [{
        findingId: "stack-vs-balance",
        severity: "critical",
        pt: "O mapa da dívida não concilia com o balanço. Qual valor está correto?",
        en: "The debt schedule does not reconcile to the balance sheet. Which amount is correct?",
      }],
    });

    expect(assessment.coverage.find((item) => item.requirementKey.endsWith("financials_historical")))
      .toMatchObject({status: "verified", evidence: [{id: "document:doc-financials"}]});
    expect(assessment.coverage.find((item) => item.requirementKey.endsWith("debt_schedule")))
      .toMatchObject({status: "verified", evidence: [{id: "document:doc-debt"}]});
    expect(assessment.requests).toHaveLength(3);
    expect(assessment.requests[0]).toMatchObject({
      requirementKey: "finding.stack-vs-balance",
      priority: "blocking",
    });
    expect(assessment.requests.some((request) => request.requirementKey.endsWith("financials_historical")))
      .toBe(false);
  });

  it("turns a public directional recommendation into an evidence-aware decision", () => {
    const assessment = buildPublicWorkAssessment({
      projectId,
      assessmentRef: "processing_run:20000000-0000-4000-8000-000000000002",
      locale: "en-US",
      assessedAt,
      requests: [{
        request: "Current debt schedule",
        whyItMatters: "It establishes maturities and current contractual obligations.",
        decisionImpact: "It determines whether a refinancing alternative should be prioritized.",
        acceptableEvidence: ["Debt spreadsheet", "Facility agreements"],
      }],
      decision: {
        decisionKey: "capital_strategy.direction",
        question: "Which capital alternative should be developed further?",
        status: "directional",
        recommendation: "Refinancing with staged maturities",
        rationaleSummary: "The available public evidence supports testing maturity extension first.",
        confidence: "medium",
        proposedBy: "transaction_structuring",
      },
    });

    expect(assessment.coverage).toHaveLength(1);
    expect(assessment.requests).toHaveLength(1);
    expect(assessment.decisions[0]).toMatchObject({
      status: "directional",
      recommendation: "Refinancing with staged maturities",
      confidence: "medium",
    });
  });

  it("caps preliminary clarification at three decision-useful points", () => {
    const assessment = buildPreliminaryAssessment({
      projectId,
      assessmentRef: "processing_run:20000000-0000-4000-8000-000000000003",
      locale: "pt-BR",
      assessedAt,
      openPoints: ["Objetivo", "Montante", "Prazo", "Garantias", "Perímetro"],
    });

    expect(assessment.requests).toHaveLength(3);
    expect(assessment.coverage).toHaveLength(5);
  });

  it("keeps repeated public prompts addressable without key collisions", () => {
    const repeated = {
      request: "Current debt schedule",
      whyItMatters: "It establishes maturities and current contractual obligations.",
      decisionImpact: "It changes the refinancing analysis.",
      acceptableEvidence: ["Debt spreadsheet"],
    };
    const assessment = buildPublicWorkAssessment({
      projectId,
      assessmentRef: "processing_run:20000000-0000-4000-8000-000000000004",
      locale: "en-US",
      assessedAt,
      requests: [repeated, repeated],
    });

    expect(assessment.coverage).toHaveLength(2);
    expect(new Set(assessment.coverage.map((item) => item.requirementKey)).size).toBe(2);
  });

  it("deduplicates repeated financial findings before persistence", () => {
    const finding = {
      findingId: "stack-vs-balance",
      severity: "critical" as const,
      pt: "O mapa da dívida não concilia com o balanço. Qual valor está correto?",
      en: "The debt schedule does not reconcile to the balance sheet. Which amount is correct?",
    };
    const assessment = buildPrivateCaseAssessment({
      projectId,
      assessmentRef: "processing_run:20000000-0000-4000-8000-000000000005",
      locale: "pt-BR",
      assessedAt,
      archetypeId: "other",
      documents: [],
      clientQuestions: [finding, finding],
    });

    expect(assessment.coverage.filter((item) => item.requirementKey === "finding.stack-vs-balance"))
      .toHaveLength(1);
    expect(assessment.requests.filter((item) => item.requirementKey === "finding.stack-vs-balance"))
      .toHaveLength(1);
  });
});
