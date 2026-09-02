import {describe, expect, it} from "vitest";
import {routeWorkspaceExecution, routeWorkspaceRequest} from "./index";

describe("workspace request router", () => {
  it("keeps a hypothetical case question read-only", () => {
    expect(routeWorkspaceRequest({message: "E se o prazo fosse cinco anos?", surface: "case_workspace"})).toMatchObject({
      intent: "simulate",
      scope: "case",
      effect: "none",
      requiresExplicitConfirmation: false,
      allowedOnCurrentSurface: true,
    });
  });

  it("routes a factual change to a proposal rather than a silent commit", () => {
    expect(routeWorkspaceRequest({message: "O valor agora é R$ 50 milhões.", surface: "operation_brief"})).toMatchObject({
      intent: "propose_change",
      scope: "case",
      effect: "proposal",
      requiresExplicitConfirmation: false,
    });
  });

  it("recognizes approval but still requires the governed confirmation path", () => {
    expect(routeWorkspaceRequest({message: "Aprovo essa estrutura.", surface: "case_workspace"})).toMatchObject({
      intent: "approve",
      effect: "commit",
      requiresExplicitConfirmation: true,
    });
  });

  it("blocks an external instruction on the operation brief surface", () => {
    expect(routeWorkspaceRequest({message: "Pode enviar ao Fundo Alfa.", surface: "operation_brief"})).toMatchObject({
      intent: "authorize_external",
      scope: "market",
      effect: "external",
      allowedOnCurrentSurface: false,
      requiresExplicitConfirmation: true,
    });
  });

  it("does not confuse preparing a pitch with authorizing an external contact", () => {
    expect(routeWorkspaceRequest({
      message: "Tenho uma reunião com a Camil amanhã e gostaria de apresentar um pitch sobre alternativas estratégicas de endividamento.",
      surface: "case_workspace",
    })).toMatchObject({
      intent: "clarify",
      effect: "none",
      allowedOnCurrentSurface: true,
    });
  });

  it("still protects an instruction to present the material to a lender", () => {
    expect(routeWorkspaceRequest({
      message: "Apresente o material ao Fundo Alfa.",
      surface: "case_workspace",
    })).toMatchObject({
      intent: "authorize_external",
      effect: "external",
      allowedOnCurrentSurface: false,
    });
  });

  it("routes general instrument questions to knowledge without state effects", () => {
    expect(routeWorkspaceRequest({message: "Qual a diferença entre CCB e debênture?", surface: "knowledge"})).toMatchObject({
      intent: "explain",
      scope: "knowledge",
      effect: "none",
    });
  });

  it("abstains when no deterministic rule is safe", () => {
    expect(routeWorkspaceRequest({message: "Quero conversar sobre isso.", surface: "case_workspace"})).toMatchObject({
      intent: "clarify",
      confidence: "ambiguous",
      effect: "none",
    });
  });
});

describe("workspace execution router", () => {
  it("queues a released public executor without spending a model call", () => {
    expect(routeWorkspaceExecution({
      entryJob: "company_debt_view",
      accessBasis: "public_information",
      companyName: "Camil",
      documentCount: 0,
      artifactTypes: [],
      requestText: "Analise a companhia na ótica de dívida.",
    })).toEqual({
      action: "queue_specialized_job",
      analysisScope: "company_debt_view",
      requirements: [],
      reasonCode: "specialized_executor_ready",
      modelRoutingCalls: 0,
    });
  });

  it("collects only the missing identity before public research", () => {
    expect(routeWorkspaceExecution({
      entryJob: "origination_thesis",
      accessBasis: "public_information",
      companyName: "",
      documentCount: 0,
      artifactTypes: [],
      requestText: "Tenho uma reunião amanhã e quero chegar com alternativas de dívida.",
    })).toMatchObject({
      action: "collect_required_context",
      analysisScope: "origination_thesis",
      requirements: ["company_identity", "meeting_audience", "desired_outcome", "relationship_context"],
      modelRoutingCalls: 0,
    });
  });

  it("collects only missing high-value meeting context before expensive origination work", () => {
    expect(routeWorkspaceExecution({
      entryJob: "origination_thesis",
      accessBasis: "public_information",
      companyName: "Camil",
      documentCount: 0,
      artifactTypes: [],
      requestText: "Tenho uma reunião com a Camil amanhã e quero preparar um pitch com alternativas estratégicas de endividamento.",
    })).toMatchObject({
      action: "collect_required_context",
      requirements: ["meeting_audience", "desired_outcome", "relationship_context"],
      reasonCode: "specialized_context_incomplete",
    });
  });

  it("queues origination after audience, desired outcome and relationship are present across the conversation", () => {
    expect(routeWorkspaceExecution({
      entryJob: "origination_thesis",
      accessBasis: "public_information",
      companyName: "Camil",
      documentCount: 0,
      artifactTypes: [],
      conversationText: "Quero explorar o refinanciamento dos vencimentos de 2027 e comparar o efeito na alavancagem.",
      requestText: "A reunião será com o CFO e a tesouraria. Ainda não temos relacionamento nem exposição de crédito.",
    })).toMatchObject({
      action: "queue_specialized_job",
      requirements: [],
      reasonCode: "specialized_executor_ready",
    });
  });

  it("never sends private documents through a public-information executor", () => {
    expect(routeWorkspaceExecution({
      entryJob: "company_debt_view",
      accessBasis: "authorized_private",
      companyName: "Cedro",
      documentCount: 3,
      artifactTypes: [],
      requestText: "Analise os documentos enviados.",
    })).toMatchObject({
      action: "conversation_only",
      reasonCode: "private_case_requires_case_graph",
      modelRoutingCalls: 0,
    });
  });

  it("does not silently rerun a completed specialized work product", () => {
    expect(routeWorkspaceExecution({
      entryJob: "origination_thesis",
      accessBasis: "public_information",
      companyName: "CVC",
      documentCount: 0,
      artifactTypes: ["meeting_brief"],
      requestText: "Atualize o trabalho.",
    })).toMatchObject({
      action: "conversation_only",
      reasonCode: "specialized_work_product_exists",
    });
  });

  it("routes a public capital need to the released planning DAG without a model call", () => {
    expect(routeWorkspaceExecution({
      entryJob: "capital_planning",
      accessBasis: "public_information",
      companyName: "Camil",
      documentCount: 0,
      artifactTypes: [],
      requestText: "Quero comparar alternativas para financiar crescimento e alongar a dívida.",
    })).toMatchObject({
      action: "queue_specialized_job",
      analysisScope: "capital_planning",
      requirements: [],
      modelRoutingCalls: 0,
    });
  });

  it("does not reinterpret a material or external command as permission to start research", () => {
    expect(routeWorkspaceExecution({
      entryJob: "origination_thesis",
      accessBasis: "public_information",
      companyName: "Camil",
      documentCount: 0,
      artifactTypes: [],
      requestText: "Prepare e envie o teaser ao Fundo Alfa.",
      requestIntent: "authorize_external",
      requestEffect: "external",
    })).toMatchObject({
      action: "conversation_only",
      reasonCode: "governed_action_requires_exact_surface",
      modelRoutingCalls: 0,
    });
  });
});
