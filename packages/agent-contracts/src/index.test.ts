import {describe, expect, it} from "vitest";
import {
  agentOperationBriefResponseSchema,
  createAgentChangeProposal,
  proposalIsCurrent,
  workspaceJobActivationSchema,
} from "./index";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  caseId: "22222222-2222-4222-8222-222222222222",
  baseManifestFingerprint: "a".repeat(64),
  target: "operation_brief" as const,
  title: "Ajustar a descrição da destinação",
  rationale: "A formulação proposta reflete o documento de origem com maior precisão.",
  impactSummary: "Atualiza o briefing e recompila os materiais dependentes.",
  patches: [{operation: "set" as const, path: "/useOfProceeds", value: "Expansão de três lojas", previousFingerprint: null}],
  evidence: [{kind: "document_anchor" as const, id: "document-1:page-2"}],
  recompute: ["claims" as const, "materials" as const, "language_conduct" as const],
  proposedBy: "offroad_agent" as const,
  proposedAt: "2026-08-26T12:00:00.000Z",
  expiresAt: "2026-08-27T12:00:00.000Z",
};

describe("agent change contracts", () => {
  it("binds every proposal to the exact case snapshot and impact preview", () => {
    const proposal = createAgentChangeProposal(base);
    expect(proposal.proposalFingerprint).toHaveLength(64);
    expect(proposal.recompute).toEqual(["claims", "materials", "language_conduct"]);
    expect(proposalIsCurrent(proposal, {manifestFingerprint: "a".repeat(64), now: new Date("2026-08-26T13:00:00.000Z")})).toBe(true);
  });

  it("invalidates stale or expired proposals", () => {
    const proposal = createAgentChangeProposal(base);
    expect(proposalIsCurrent(proposal, {manifestFingerprint: "b".repeat(64), now: new Date("2026-08-26T13:00:00.000Z")})).toBe(false);
    expect(proposalIsCurrent(proposal, {manifestFingerprint: "a".repeat(64), now: new Date("2026-08-28T13:00:00.000Z")})).toBe(false);
  });

  it("does not let public context alone rewrite a numerical case value", () => {
    expect(() => createAgentChangeProposal({
      ...base,
      patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000, previousFingerprint: null}],
      evidence: [{kind: "public_source", id: "source-1"}],
    })).toThrow();
  });

  it("accepts a user-declared number while keeping the executable paths narrow", () => {
    expect(() => createAgentChangeProposal({
      ...base,
      patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000, previousFingerprint: null}],
      evidence: [{kind: "user_statement", id: "33333333-3333-4333-8333-333333333333"}],
    })).not.toThrow();

    expect(agentOperationBriefResponseSchema.safeParse({
      state: "proposing",
      reply: "Preparei uma alteração para sua revisão.",
      proposal: {
        title: "Atualizar o volume pretendido",
        rationale: "O novo valor foi informado diretamente pelo usuário nesta conversa.",
        impactSummary: "Recalcula a análise e a estrutura indicativa.",
        patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000}],
        recompute: ["metrics", "structure", "matching"],
      },
    }).success).toBe(true);

    expect(agentOperationBriefResponseSchema.safeParse({
      state: "proposing",
      reply: "Tentativa inválida.",
      proposal: {
        title: "Alterar investidor",
        rationale: "Esta tentativa sai do primeiro comando autorizado do agente.",
        impactSummary: "Não deve ser aceita.",
        patches: [{operation: "set", path: "/investor", value: "Fundo A"}],
        recompute: ["matching"],
      },
    }).success).toBe(false);
  });

  it("does not let an idle response smuggle a proposal", () => {
    expect(agentOperationBriefResponseSchema.safeParse({
      state: "idle",
      reply: "Nenhuma alteração é necessária.",
      proposal: {
        title: "Alterar valor",
        rationale: "Esta proposta não pode viajar em uma resposta idle.",
        impactSummary: "Mudaria a operação.",
        patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000}],
        recompute: ["metrics"],
      },
    }).success).toBe(false);
  });

  it("allows one governed executor activation without mixing it with a case mutation", () => {
    expect(agentOperationBriefResponseSchema.safeParse({
      state: "idle",
      reply: "Identifiquei a companhia e vou iniciar a leitura pública na ótica de dívida.",
      activation: {
        job: "company_debt_view",
        company: {name: "Camil", website: "https://ri.camil.com.br"},
        brief: {focus: "Entender o perfil de dívida e preparar alternativas para a reunião."},
      },
    }).success).toBe(true);

    expect(agentOperationBriefResponseSchema.safeParse({
      state: "asking",
      reply: "Comecei a atualizar a leitura pública enquanto confirmamos o contexto da reunião.",
      clarification: {
        question: "Com quem será a conversa e o que você quer provocar?",
        whyItMatters: "Isso calibra a profundidade e o ângulo da análise sem interromper a pesquisa.",
        answerKind: "text",
        choices: [],
        priority: "high_value",
      },
      activation: {
        job: "origination_thesis",
        company: {name: "Camil"},
        brief: {meetingContext: "Preparar uma reunião sobre alternativas de estrutura de capital."},
      },
    }).success).toBe(true);

    expect(agentOperationBriefResponseSchema.safeParse({
      state: "proposing",
      reply: "Tentativa inválida.",
      activation: {
        job: "company_debt_view",
        company: {name: "Camil"},
        brief: {},
      },
    }).success).toBe(false);

    expect(workspaceJobActivationSchema.safeParse({
      job: "company_debt_view",
      company: {name: "Camil", website: "http://ri.camil.com.br"},
      brief: {},
    }).success).toBe(false);
  });
});
