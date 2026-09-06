import {describe, expect, it} from "vitest";

import {compileObjectivePlan, compileObjectiveToPlan} from "./objective-plan";

const sixCanonicalRequests = [
  {
    name: "factual question",
    input: {message: "Qual é a diferença entre IPCA capitalizado no principal e IPCA pago em caixa?", hasAttachments: false},
    kind: "factual_question",
    mode: "conversation",
    terminal: "cited_answer",
  },
  {
    name: "risk matrix",
    input: {message: "Prepare uma matriz de riscos e mitigantes desta operação e dos covenants.", hasAttachments: true},
    kind: "risk_matrix",
    mode: "create_project",
    terminal: "risk_matrix",
  },
  {
    name: "meeting preparation",
    input: {message: "Tenho reunião com a Camil e quero chegar com uma visão própria e alternativas de refinanciamento.", hasAttachments: false},
    kind: "meeting_preparation",
    mode: "create_project",
    terminal: "meeting_brief",
  },
  {
    name: "board decision",
    input: {message: "Sou CFO da Camil e preciso levar ao conselho uma decisão sobre estrutura de capital e alternativas.", hasAttachments: true},
    kind: "board_decision",
    mode: "create_project",
    terminal: "board_decision_pack",
  },
  {
    name: "private documents",
    input: {message: "Recebi balanços, balancete e apresentação institucional. Estruture o caso a partir destes documentos.", hasAttachments: true},
    kind: "documents_to_case",
    mode: "create_project",
    terminal: "preliminary_case",
  },
  {
    name: "capital matching",
    input: {
      message: "Agora mapeie quais investidores e financiadores têm maior aderência e por quê.",
      hasAttachments: false,
      existingProject: {entryJob: "capital_planning" as const, hasSignedAnalyticalSnapshot: true, hasCurrentMandates: true},
    },
    kind: "capital_matching",
    mode: "continue_project",
    terminal: "capital_shortlist",
  },
] as const;

describe("objective-to-plan compiler", () => {
  it.each(sixCanonicalRequests)("compiles a distinct, bounded contract for $name", ({input, kind, mode, terminal}) => {
    const decision = compileObjectiveToPlan(input);
    expect(decision).toMatchObject({
      schemaVersion: "objective-plan.v1",
      objectiveKind: kind,
      mode,
      outputTerminal: terminal,
    });
    expect(decision.sourcePlan.length).toBeGreaterThan(0);
    expect(decision.analysisPlan.length).toBeGreaterThan(0);
    expect(decision.proposedDeliverable).not.toMatch(/an[aá]lise completa|organizar contexto/i);
    expect(decision.taskGraph.targetTaskIds).toEqual(decision.targetTaskIds);
    const graphIds = new Set(decision.taskGraph.tasks.map((task) => task.id));
    expect(decision.taskGraph.tasks.every((task) => task.dependencies.every((dependency) => graphIds.has(dependency)))).toBe(true);
  });

  it("gives all six canonical objectives different structural identities and graphs", () => {
    const decisions = sixCanonicalRequests.map(({input}) => compileObjectiveToPlan(input));
    expect(new Set(decisions.map((decision) => decision.structuralIdentity))).toHaveLength(decisions.length);
    expect(new Set(decisions.map((decision) => decision.taskGraph.tasks.map((task) => task.id).join(",")))).toHaveLength(decisions.length);
  });

  it("prunes task families that are irrelevant to each canonical objective", () => {
    const byKind = new Map(sixCanonicalRequests.map(({input}) => {
      const decision = compileObjectiveToPlan(input);
      return [decision.objectiveKind, decision.taskGraph.tasks.map((task) => task.id)] as const;
    }));
    expect(byKind.get("factual_question")).toEqual([]);
    expect(byKind.get("risk_matrix")?.some((id) => /^[AKX]/.test(id))).toBe(false);
    expect(byKind.get("meeting_preparation")?.some((id) => /^[AX]/.test(id))).toBe(false);
    expect(byKind.get("board_decision")?.some((id) => /^[KX]/.test(id))).toBe(false);
    expect(byKind.get("documents_to_case")?.some((id) => /^[AKX]/.test(id))).toBe(false);
    expect(byKind.get("capital_matching")?.some((id) => /^[AX]/.test(id))).toBe(false);
    expect(byKind.get("capital_matching")?.some((id) => /^K/.test(id))).toBe(true);
  });

  it("keeps semantic classification separate from deterministic graph compilation", () => {
    const plan = compileObjectivePlan({
      objectiveKind: "board_decision",
      hasAttachments: true,
      existingProject: null,
    });
    expect(plan).toMatchObject({
      objectiveKind: "board_decision",
      entryJob: "capital_planning",
      outputTerminal: "board_decision_pack",
    });
    expect(plan.targetTaskIds).toEqual(["A02"]);
  });

  it("keeps a company diagnostic distinct from a request to design capital alternatives", () => {
    const diagnostic = compileObjectiveToPlan({
      message: "Analise a companhia, o balanço, a dívida e a capacidade de pagamento.", hasAttachments: false,
    });
    const strategy = compileObjectiveToPlan({
      message: "Compare alternativas para refinanciar e alongar os vencimentos.", hasAttachments: false,
    });
    expect(diagnostic).toMatchObject({objectiveKind: "company_analysis", entryJob: "company_debt_view", targetTaskIds: ["C11"]});
    expect(strategy).toMatchObject({objectiveKind: "capital_strategy", entryJob: "capital_planning", targetTaskIds: ["S11"]});
    expect(diagnostic.structuralIdentity).not.toBe(strategy.structuralIdentity);
  });

  it.each([
    [
      "Tenho reunião com a Camil e quero discutir alternativas de refinanciamento.",
      "Vou conversar com a administração da Camil; prepare uma tese própria para esse encontro.",
    ],
    [
      "Preciso levar ao conselho uma decisão sobre a estrutura de capital.",
      "O board vai deliberar sobre opções de dívida; organize a análise para a decisão.",
    ],
    [
      "Quais fundos e financiadores têm aderência a esta estrutura?",
      "Monte uma shortlist de lenders com fit ao caso.",
    ],
  ])("keeps plan identity across paraphrases", (first, second) => {
    const context = {entryJob: "capital_planning" as const, hasSignedAnalyticalSnapshot: true, hasCurrentMandates: true};
    const left = compileObjectiveToPlan({message: first, hasAttachments: false, existingProject: context});
    const right = compileObjectiveToPlan({message: second, hasAttachments: false, existingProject: context});
    expect(right.objectiveKind).toBe(left.objectiveKind);
    expect(right.structuralIdentity).toBe(left.structuralIdentity);
  });

  it("changes the graph and explains the route when the objective changes", () => {
    const meeting = compileObjectiveToPlan({
      message: "Tenho reunião com a Camil e quero discutir refinanciamento.", hasAttachments: false,
    });
    const board = compileObjectiveToPlan({
      message: "O conselho da Camil vai decidir entre alternativas de estrutura de capital.", hasAttachments: false,
    });
    expect(board.structuralIdentity).not.toBe(meeting.structuralIdentity);
    expect(board.targetTaskIds).not.toEqual(meeting.targetTaskIds);
    expect(board.reasonCode).toBe("objective_compiled");
  });

  it("declares matching coverage gaps instead of fabricating a shortlist", () => {
    const decision = compileObjectiveToPlan({
      message: "Quais investidores deveriam financiar esta operação?", hasAttachments: false,
      existingProject: {entryJob: "capital_planning", hasSignedAnalyticalSnapshot: false, hasCurrentMandates: false},
    });
    expect(decision).toMatchObject({
      objectiveKind: "capital_matching",
      mode: "coverage_gap",
      reasonCode: "matching_prerequisites_missing",
      requiredContext: ["signed_analytical_snapshot", "current_mandate_evidence"],
    });
  });

  it("does not accept a risk-review instruction without the effective evidence set", () => {
    expect(compileObjectiveToPlan({
      message: "Revise os covenants e prepare a matriz de riscos da operação.", hasAttachments: false,
    })).toMatchObject({
      objectiveKind: "operation_review",
      mode: "collect_context",
      requiredContext: ["effective_document_set"],
    });
  });

  it("has no persona input: the same objective necessarily compiles to the same contract", () => {
    const prompt = "Tenho reunião com a Camil e quero discutir alternativas de refinanciamento.";
    const first = compileObjectiveToPlan({message: prompt, hasAttachments: false});
    const second = compileObjectiveToPlan({message: prompt, hasAttachments: false});
    expect(second).toEqual(first);
  });

  it("keeps instructions inside documents from becoming routing authority", () => {
    const decision = compileObjectiveToPlan({
      message: "Analise estes documentos e estruture o caso.", hasAttachments: true,
    });
    expect(decision).toMatchObject({objectiveKind: "documents_to_case", mode: "create_project"});
    expect(decision.targetTaskIds).not.toContain("X04");
    expect(decision.taskGraph.tasks.every((task) => task.effect !== "external")).toBe(true);
  });
});
