import {describe, expect, it} from "vitest";

import {
  createDcmDecisionRecord,
  createInitialDcmPlan,
  createDcmPlanRevision,
  dcmRequirementCoverageSchema,
  dcmWorkItemSchema,
  rankInformationRequests,
  selectRunnableWork,
  specialistForTaskSpec,
  type DcmInformationRequest,
} from "./work-system";

const projectId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-09-03T01:00:00.000Z";

function request(overrides: Partial<DcmInformationRequest> = {}): DcmInformationRequest {
  return {
    schemaVersion: "dcm-information-request.v1",
    id: crypto.randomUUID(),
    projectId,
    requirementKey: "debt.schedule",
    question: "Envie o cronograma da dívida por instrumento.",
    whyItMatters: "Permite mapear os vencimentos e a necessidade de refinanciamento.",
    decisionImpact: "Define prazo, volume e prioridade das alternativas.",
    acceptableEvidence: ["Planilha de dívida", "Nota explicativa"],
    answerKind: "document",
    choices: [],
    priority: "high_value",
    informationGain: 0.8,
    materiality: 0.8,
    answerability: 0.8,
    redundancyPenalty: 0,
    status: "open",
    createdAt,
    ...overrides,
  };
}

describe("agentic DCM work contracts", () => {
  it("preserves abstention as a valid, evidence-backed decision state", () => {
    const decision = createDcmDecisionRecord({
      id: crypto.randomUUID(),
      projectId,
      decisionKey: "structure.preferred",
      question: "Qual estrutura deve ser priorizada?",
      status: "open",
      recommendation: null,
      alternatives: [],
      rationaleSummary: "A documentação ainda não sustenta uma recomendação.",
      evidence: [],
      assumptions: [],
      unresolved: ["Cronograma de amortização por instrumento"],
      confidence: "insufficient",
      proposedBy: "deal_captain",
      reviewedBy: null,
      createdAt,
      supersedesDecisionId: null,
    });
    expect(decision.recommendation).toBeNull();
    expect(decision.fingerprint).toHaveLength(64);
  });

  it("does not allow an unreviewed decision to become confirmed", () => {
    expect(() => createDcmDecisionRecord({
      id: crypto.randomUUID(), projectId, decisionKey: "structure.preferred",
      question: "Qual estrutura deve ser priorizada?", status: "confirmed",
      recommendation: "Debênture com amortização customizada.", alternatives: [],
      rationaleSummary: "Compatível com os fluxos projetados.", evidence: [], assumptions: [], unresolved: [],
      confidence: "medium", proposedBy: "transaction_structuring", reviewedBy: null,
      createdAt, supersedesDecisionId: null,
    })).toThrow();
  });

  it("requires evidence before marking an information requirement as verified", () => {
    expect(dcmRequirementCoverageSchema.safeParse({
      schemaVersion: "dcm-requirement-coverage.v1", id: crypto.randomUUID(), projectId,
      requirementKey: "debt.schedule", label: "Cronograma da dívida", status: "verified",
      materiality: "blocking", decisionIds: [], evidence: [], missingReason: null,
      assessedAt: createdAt, assessedBy: "document_intelligence",
    }).success).toBe(false);
  });

  it("asks at most three questions ranked by decision value", () => {
    const ranked = rankInformationRequests([
      request({id: crypto.randomUUID(), requirementKey: "low.value", informationGain: 0.2}),
      request({id: crypto.randomUUID(), requirementKey: "high.value", informationGain: 1}),
      request({id: crypto.randomUUID(), requirementKey: "medium.value", informationGain: 0.6}),
      request({id: crypto.randomUUID(), requirementKey: "blocking.value", priority: "blocking", materiality: 1}),
      request({id: crypto.randomUUID(), requirementKey: "later.value", priority: "later", informationGain: 1}),
    ], 10);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.requirementKey).toBe("high.value");
    expect(ranked.some((item) => item.requirementKey === "later.value")).toBe(false);
  });

  it("runs independent work in parallel but never bypasses requirements or approval", () => {
    const researchId = crypto.randomUUID();
    const analysisId = crypto.randomUUID();
    const externalId = crypto.randomUUID();
    const plan = createDcmPlanRevision({
      id: crypto.randomUUID(), projectId, revision: 1,
      goal: "Avaliar alternativas de capital para a companhia.", trigger: "project_created",
      triggerRef: "initial-request", status: "active", createdAt, createdBy: "deal_captain",
      supersedesPlanId: null,
      workItems: [
        {
          id: researchId, projectId, planRevision: 1, taskSpecId: "C02", title: "Pesquisar companhia e setor",
          specialist: "company_and_sector", status: "ready", effect: "none", dependencies: [],
          requirementKeys: [], decisionKeys: ["company.position"], inputEvidence: [], outputRefs: [],
          approvalRequired: false, budget: {modelCalls: 2, searchQueries: 8, costUsd: 10},
        },
        {
          id: analysisId, projectId, planRevision: 1, taskSpecId: "C05", title: "Mapear dívida econômica",
          specialist: "debt_and_capital_structure", status: "ready", effect: "propose_state", dependencies: [],
          requirementKeys: ["debt.schedule"], decisionKeys: ["structure.capacity"], inputEvidence: [], outputRefs: [],
          approvalRequired: false, budget: {modelCalls: 1, searchQueries: 0, costUsd: 5},
        },
        {
          id: externalId, projectId, planRevision: 1, taskSpecId: "X04", title: "Contatar financiador",
          specialist: "market_intelligence", status: "ready", effect: "external", dependencies: [],
          requirementKeys: [], decisionKeys: [], inputEvidence: [], outputRefs: [], approvalRequired: true,
          budget: {modelCalls: 0, searchQueries: 0, costUsd: 0},
        },
      ],
    });

    expect(selectRunnableWork({plan, coveredRequirements: new Set()})).toEqual([
      expect.objectContaining({id: researchId}),
    ]);
    expect(selectRunnableWork({
      plan,
      coveredRequirements: new Set(["debt.schedule"]),
      approvedWorkItemIds: new Set([externalId]),
    }).map((item) => item.id)).toEqual([researchId, analysisId, externalId]);
  });

  it("rejects cyclic plans and external work without an approval gate", () => {
    expect(dcmWorkItemSchema.safeParse({
      id: crypto.randomUUID(), projectId, planRevision: 1, taskSpecId: "X04", title: "Contatar financiador",
      specialist: "market_intelligence", status: "ready", effect: "external", dependencies: [],
      requirementKeys: [], decisionKeys: [], inputEvidence: [], outputRefs: [], approvalRequired: false,
      budget: {modelCalls: 0, searchQueries: 0, costUsd: 0},
    }).success).toBe(false);

    const left = crypto.randomUUID();
    const right = crypto.randomUUID();
    const item = (id: string, dependencies: string[]) => ({
      id, projectId, planRevision: 1, taskSpecId: null, title: "Análise agêntica",
      specialist: "deal_captain" as const, status: "pending" as const, effect: "none" as const,
      dependencies, requirementKeys: [], decisionKeys: [], inputEvidence: [], outputRefs: [], approvalRequired: false,
      budget: {modelCalls: 1, searchQueries: 0, costUsd: 1},
    });
    expect(() => createDcmPlanRevision({
      id: crypto.randomUUID(), projectId, revision: 1, goal: "Rejeitar ciclos no plano.",
      trigger: "project_created", triggerRef: "cycle-test", status: "active", createdAt,
      createdBy: "deal_captain", supersedesPlanId: null,
      workItems: [item(left, [right]), item(right, [left])],
    })).toThrow();
  });

  it("projects compiled TaskSpecs into a bounded first plan", () => {
    const ids = {
      M01: "20000000-0000-4000-8000-000000000001",
      C02: "20000000-0000-4000-8000-000000000002",
      C11: "20000000-0000-4000-8000-000000000003",
    } as const;
    const plan = createInitialDcmPlan({
      id: "30000000-0000-4000-8000-000000000001",
      projectId,
      goal: "Analisar a companhia e desenvolver alternativas de capital.",
      triggerRef: "message:initial",
      createdAt,
      idForTask: (taskId) => ids[taskId as keyof typeof ids],
      taskSpecs: [
        {id: "M01", label: "Resolver a companhia", dependencies: [], effect: "propose_state", executionClass: "extraction"},
        {id: "C02", label: "Pesquisar companhia e setor", dependencies: ["M01"], effect: "none", executionClass: "research"},
        {id: "C11", label: "Compilar tese", dependencies: ["C02"], effect: "propose_state", executionClass: "judgment"},
      ],
      requirementKeysByTask: {C11: ["debt.schedule"]},
      decisionKeysByTask: {C11: ["structure.preferred"]},
    });
    expect(plan.workItems.map((item) => ({
      task: item.taskSpecId,
      specialist: item.specialist,
      status: item.status,
      dependencies: item.dependencies,
    }))).toEqual([
      {task: "M01", specialist: "context_intelligence", status: "ready", dependencies: []},
      {task: "C02", specialist: "company_and_sector", status: "pending", dependencies: [ids.M01]},
      {task: "C11", specialist: "debt_and_capital_structure", status: "pending", dependencies: [ids.C02]},
    ]);
    expect(plan.workItems[2]?.requirementKeys).toEqual(["debt.schedule"]);
  });

  it("maps every TaskSpec family to an explicit specialist", () => {
    expect(specialistForTaskSpec("D06")).toBe("document_intelligence");
    expect(specialistForTaskSpec("C03")).toBe("financial_analysis");
    expect(specialistForTaskSpec("S11")).toBe("transaction_structuring");
    expect(specialistForTaskSpec("A05")).toBe("materials");
    expect(specialistForTaskSpec("L05")).toBe("independent_verifier");
  });
});
