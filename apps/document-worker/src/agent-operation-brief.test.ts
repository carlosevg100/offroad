import type {ModelGateway} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";

import {processAgentOperationBriefJob} from "./agent-operation-brief";
import type {AgentOperationBriefJob, QueueClient} from "./queue";

const job: AgentOperationBriefJob = {
  claimed: true,
  job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-08-26T18:00:00.000Z",
  attempt: 1,
  kind: "agent_operation_brief",
  organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  intake_session_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  processing_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  payload: {message_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", locale: "pt-BR"},
};

describe("agent operation brief worker", () => {
  it("starts public company research and asks meeting context in parallel without a routing model call", async () => {
    let activation: unknown;
    let response: Record<string, unknown> | undefined;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Tenho uma reunião amanhã com a Camil Alimentos S.A. e quero preparar um pitch com alternativas estratégicas de endividamento.",
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-02T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Reunião Camil",
          entryJob: "origination_thesis", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        company_profile: {}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _id: string, value: unknown, _proposal: unknown, activated: unknown) => {
        response = value as Record<string, unknown>;
        activation = activated;
        return {};
      },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("the initial public route must be deterministic");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(activation).toMatchObject({
      job: "origination_thesis", company: {name: "Camil Alimentos S.A."},
    });
    expect(response?.reply).toContain("Já iniciei em paralelo a pesquisa pública");
    expect(response?.reply).toContain("com quem será a reunião");
    expect(response?.reply).toContain("relacionamento ou a exposição");
  });

  it("activates capital planning deterministically when company and intent are already explicit", async () => {
    let activation: unknown;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Quero comparar alternativas de dívida para financiar a expansão da Camil.",
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-02T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Camil · capital",
          entryJob: "capital_planning", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        company_profile: {name: "Camil"}, documents: [], tasks: [], artifacts: [], recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _id: string, _response: unknown, _proposal: unknown, value: unknown) => {
        activation = value;
        return {};
      },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { throw new Error("deterministic activation must not call a model"); },
      spent: () => ({costUsd: 0, calls: 0}),
    } as unknown as ModelGateway;
    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(result.status).toBe("succeeded");
    expect(activation).toMatchObject({
      job: "capital_planning", company: {name: "Camil"},
      brief: {capitalIntent: "Quero comparar alternativas de dívida para financiar a expansão da Camil."},
    });
  });

  it("activates a released public DAG in the same project with zero routing model calls", async () => {
    let modelCalls = 0;
    let recordedActivation: Record<string, unknown> | undefined;
    let completed: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Quero entender os riscos e a capacidade de dívida antes de escolher uma operação.",
        brief: {},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Camil · dívida",
          entryJob: "company_debt_view",
          accessBasis: "public_information",
          phase: "understand",
          status: "active",
        },
        company_profile: {name: "Camil", website: "https://ri.camil.com.br"},
        documents: [],
        tasks: [],
        artifacts: [],
        recent_messages: [],
      }),
      recordAgentResponse: async (
        _job: unknown,
        _messageId: string,
        _response: unknown,
        _proposal: unknown,
        activation: unknown,
      ) => {
        recordedActivation = activation as Record<string, unknown>;
        return {};
      },
      complete: async (_job: unknown, result: unknown) => { completed = result as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("the deterministic route must not call a model");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedActivation).toMatchObject({job: "company_debt_view", company: {name: "Camil"}});
    expect(completed).toMatchObject({activated_job: "company_debt_view", spend: {costUsd: 0, calls: 0}});
  });

  it("uses the latest turn locale without forking a project that started in Portuguese", async () => {
    let modelInput = "";
    let recordedResponse: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "en-US",
        message: "Please continue in English and tell me the next step.",
        brief: {currency: "BRL"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Projeto Cedro",
          entryJob: "capital_planning",
          accessBasis: "authorized_private",
          phase: "understand",
          status: "active",
        },
        company_profile: {companyName: "Cedro"},
        documents: [],
        tasks: [{taskId: "M01", label: "Resolver companhia, grupo, jurisdição e regime de evidência", ordinal: 0, status: "succeeded"}],
        artifacts: [],
        recent_messages: [{
          id: "33333333-3333-4333-8333-333333333333",
          role: "assistant" as const,
          content: "Estou organizando o entendimento inicial.",
          created_at: "2026-09-01T11:59:00.000Z",
        }],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, response: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async (request: {input: Array<{type: string; text?: string}>}) => {
        modelInput = request.input[0]?.text ?? "";
        return {
          output: {state: "idle", reply: "We are preserving the same project. The next step is to complete the current understanding."},
          usage: {inputTokens: 100, outputTokens: 30, cachedInputTokens: 0},
        };
      },
      spent: () => ({costUsd: 0.05, calls: 1}),
    } as unknown as ModelGateway;

    await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(JSON.parse(modelInput)).toMatchObject({
      locale: "en-US",
      project: {name: "Projeto Cedro"},
      recentConversation: [{content: "Estou organizando o entendimento inicial."}],
      workPlan: [{taskId: "M01", label: "Resolve company, group, jurisdiction and evidence regime"}],
    });
    expect(recordedResponse?.reply).toContain("same project");
  });

  it("normalizes an explicit company and activates the exact selected DAG without a model call", async () => {
    let recordedActivation: Record<string, unknown> | undefined;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Tenho uma reunião com o CFO da CVC amanhã. Quero explorar um refinanciamento dos vencimentos de 2027 e ainda não temos relacionamento nem exposição de crédito.",
        brief: {},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Reunião CVC",
          entryJob: "origination_thesis",
          accessBasis: "public_information",
          phase: "understand",
          status: "active",
        },
        company_profile: {},
        documents: [],
        tasks: [],
        artifacts: [],
        recent_messages: [],
      }),
      recordAgentResponse: async (
        _job: unknown,
        _messageId: string,
        _response: unknown,
        _proposal: unknown,
        activation: unknown,
      ) => {
        recordedActivation = activation as Record<string, unknown>;
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("the explicit public route must not call a model");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedActivation).toMatchObject({job: "origination_thesis", company: {name: "CVC"}});
  });

  it("asks for the institution operating model once research is already active without queueing it again", async () => {
    let recordedResponse: Record<string, unknown> | undefined;
    let recordedActivation: unknown;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "A reunião é com o CFO. Queremos explorar refinance e não temos relacionamento nem exposição.",
        brief: {}, snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-02T12:00:00.000Z", manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Reunião Camil",
          entryJob: "origination_thesis", accessBasis: "public_information",
          phase: "understand", status: "active",
        },
        company_profile: {name: "Camil"},
        professional_context: null,
        institution_capabilities: null,
        documents: [],
        tasks: [{taskId: "O01", label: "Pesquisar a companhia", ordinal: 0, status: "running"}],
        artifacts: [],
        recent_messages: [{
          id: "33333333-3333-4333-8333-333333333333",
          role: "user" as const,
          content: "Tenho uma reunião com a Camil amanhã.",
          created_at: "2026-09-02T11:59:00.000Z",
        }],
      }),
      recordAgentResponse: async (_job: unknown, _id: string, response: unknown, _proposal: unknown, activation: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        recordedActivation = activation;
        return {};
      },
      complete: async () => {}, recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => { modelCalls += 1; throw new Error("capability clarification is deterministic"); },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedActivation).toBeUndefined();
    expect(recordedResponse).toMatchObject({state: "asking"});
    expect(recordedResponse?.reply).toContain("balanço próprio");
    expect(recordedResponse?.reply).toContain("análise neutra");
  });

  it("uses relevant organization memory before asking for missing Camil meeting context", async () => {
    let recordedActivation: unknown;
    let recordedResponse: Record<string, unknown> | undefined;
    let modelCalls = 0;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Tenho uma reunião com a Camil amanhã e quero apresentar um pitch sobre alternativas estratégicas de endividamento.",
        brief: {},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Camil · reunião",
          entryJob: "origination_thesis",
          accessBasis: "public_information",
          phase: "understand",
          status: "active",
        },
        company_profile: {},
        related_project_memory: [{
          projectId: "11111111-1111-4111-8111-111111111111",
          projectName: "Camil · refinanciamento 2027",
          companyName: "Camil",
          entryJob: "origination_thesis",
          currentPhase: "understand",
          status: "completed",
          updatedAt: "2026-06-01T12:00:00.000Z",
          brief: {kind: "origination_thesis", content: {meetingContext: "Refinanciamento dos vencimentos de 2027."}},
          artifactTypes: ["meeting_brief"],
        }],
        documents: [],
        tasks: [],
        artifacts: [],
        recent_messages: [],
      }),
      recordAgentResponse: async (
        _job: unknown,
        _messageId: string,
        response: unknown,
        _proposal: unknown,
        activation: unknown,
      ) => {
        recordedResponse = response as Record<string, unknown>;
        recordedActivation = activation;
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => {
        modelCalls += 1;
        throw new Error("memory-aware public activation must not call a model");
      },
      spent: () => ({costUsd: 0, calls: modelCalls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(result.status).toBe("succeeded");
    expect(modelCalls).toBe(0);
    expect(recordedResponse).toMatchObject({state: "idle"});
    expect(recordedResponse?.reply).toContain("Camil · refinanciamento 2027");
    expect(recordedResponse?.reply).toContain("atualiza aquela tese ou abre uma agenda nova");
    expect(recordedActivation).toMatchObject({job: "origination_thesis", company: {name: "Camil"}});
  });

  it("turns a direct user declaration into a preview, never a silent mutation", async () => {
    let recordedProposal: Record<string, unknown> | undefined;
    let completed: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "O valor pretendido agora é R$ 50 milhões.",
        brief: {requestedAmount: 40_000_000, currency: "BRL", useOfProceeds: "growth_expansion"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-08-26T12:00:00.000Z",
        manifest_id: null,
        recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, _response: unknown, proposal: unknown) => {
        recordedProposal = proposal as Record<string, unknown>;
        return {};
      },
      complete: async (_job: unknown, result: unknown) => { completed = result as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => ({
        output: {
          state: "proposing",
          reply: "Preparei a atualização do volume para sua revisão.",
          proposal: {
            title: "Atualizar o volume pretendido",
            rationale: "O usuário informou diretamente o novo volume nesta conversa.",
            impactSummary: "Recalcula capacidade, estrutura e aderência de mandato.",
            patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000}],
            recompute: ["metrics", "structure", "matching"],
          },
        },
        usage: {inputTokens: 100, outputTokens: 60, cachedInputTokens: 0},
      }),
      spent: () => ({costUsd: 0.12, calls: 1}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(result.status).toBe("succeeded");
    expect(recordedProposal?.target).toBe("operation_brief");
    expect(recordedProposal?.evidence).toEqual([{kind: "user_statement", id: job.payload.message_id}]);
    expect(completed?.state).toBe("proposing");
  });

  it("replaces an unsupported numerical proposal with one clarification", async () => {
    let recordedResponse: Record<string, unknown> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Acho que precisamos aumentar o valor.",
        brief: {requestedAmount: 40_000_000, currency: "BRL", useOfProceeds: "growth_expansion"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-08-26T12:00:00.000Z",
        manifest_id: null,
        recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, response: unknown, proposal: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        expect(proposal).toBeUndefined();
        return {};
      },
      complete: async () => {},
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async () => ({
        output: {
          state: "proposing",
          reply: "Vou aumentar o valor.",
          proposal: {
            title: "Aumentar o volume",
            rationale: "O usuário pediu um aumento do volume pretendido.",
            impactSummary: "Recalcula a estrutura.",
            patches: [{operation: "set", path: "/requestedAmount", value: 50_000_000}],
            recompute: ["metrics", "structure"],
          },
        },
        usage: {inputTokens: 100, outputTokens: 60, cachedInputTokens: 0},
      }),
      spent: () => ({costUsd: 0.12, calls: 1}),
    } as unknown as ModelGateway;

    await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(recordedResponse?.state).toBe("asking");
  });

  it("routes an external instruction and refuses to turn it into an operation patch", async () => {
    let recordedResponse: Record<string, unknown> | undefined;
    let completed: Record<string, unknown> | undefined;
    let modelInput = "";
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "Pode enviar o material ao Fundo Alfa.",
        brief: {requestedAmount: 40_000_000, currency: "BRL"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-08-26T12:00:00.000Z",
        manifest_id: null,
        recent_messages: [],
      }),
      recordAgentResponse: async (_job: unknown, _messageId: string, response: unknown, proposal: unknown) => {
        recordedResponse = response as Record<string, unknown>;
        expect(proposal).toBeUndefined();
        return {};
      },
      complete: async (_job: unknown, result: unknown) => { completed = result as Record<string, unknown>; },
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async (request: {input: Array<{type: string; text?: string}>}) => {
        modelInput = request.input[0]?.text ?? "";
        return {
          output: {
            state: "proposing",
            reply: "Vou preparar o envio.",
            proposal: {
              title: "Preparar envio",
              rationale: "O usuário solicitou o contato com um financiador específico.",
              impactSummary: "Libera o contato externo.",
              patches: [{operation: "set", path: "/objective", value: "Enviar ao Fundo Alfa"}],
              recompute: ["matching"],
            },
          },
          usage: {inputTokens: 100, outputTokens: 60, cachedInputTokens: 0},
        };
      },
      spent: () => ({costUsd: 0.12, calls: 1}),
    } as unknown as ModelGateway;

    await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    expect(modelInput).toContain('"intent":"authorize_external"');
    expect(recordedResponse).toMatchObject({state: "idle"});
    expect(completed?.request_route).toMatchObject({intent: "authorize_external", effect: "external"});
  });

  it("sends only scoped project memory and real work state in one bounded model call", async () => {
    let calls = 0;
    let modelInput = "";
    let metadata: Record<string, string> | undefined;
    const queue = {
      writeStage: async () => {},
      loadAgentContext: async () => ({
        session_id: job.intake_session_id,
        message_id: job.payload.message_id,
        locale: "pt-BR",
        message: "O que já sabemos e qual é o próximo passo?",
        brief: {currency: "BRL", useOfProceeds: "working_capital"},
        snapshot_fingerprint: "a".repeat(64),
        projection_updated_at: "2026-09-01T12:00:00.000Z",
        manifest_id: null,
        project: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Projeto Cedro",
          entryJob: "company_debt_view",
          accessBasis: "private_authorized",
          phase: "understand",
          status: "active",
        },
        company_profile: {companyName: "Cedro", sector: "Distribuição"},
        professional_context: {
          affiliationKind: "bank", professionalRole: "dcm_banker", teamName: "DCM",
          institutionName: "Banco Exemplo",
          operatingModels: ["structuring", "distribution"], productFamilies: ["capital_markets"],
          primaryObjectives: ["structure_transactions"], contextNotes: null,
          disclosureStatus: "complete", lastConfirmedAt: "2026-09-01T10:00:00.000Z",
        },
        institution_capabilities: {
          institutionName: "Banco Exemplo", institutionKind: "bank",
          operatingModels: ["balance_sheet_lending", "structuring", "distribution"],
          productFamilies: ["bilateral_credit", "capital_markets"],
          geographies: ["BR", "US"], currencies: ["BRL", "USD"], capabilityNotes: null,
          sourceKind: "self_declared", disclosureStatus: "complete",
          lastConfirmedAt: "2026-09-01T10:00:00.000Z",
        },
        documents: [{
          id: "11111111-1111-4111-8111-111111111111",
          name: "balancete.pdf",
          kind: "trial_balance",
          status: "ready",
        }],
        tasks: [{taskId: "M01", label: "Resolver companhia e grupo", ordinal: 0, status: "succeeded"}],
        artifacts: [{
          id: "22222222-2222-4222-8222-222222222222",
          type: "preliminary_understanding",
          version: 1,
          status: "draft",
        }],
        recent_messages: [{
          id: "33333333-3333-4333-8333-333333333333",
          role: "assistant" as const,
          content: "Estou organizando o entendimento inicial.",
          created_at: "2026-09-01T11:59:00.000Z",
        }],
      }),
      recordAgentResponse: async () => ({}),
      complete: async () => {},
      recordAgentFailure: async () => {},
      fail: async () => { throw new Error("must not fail"); },
    } as unknown as QueueClient;
    const gateway = {
      complete: async (request: {
        input: Array<{type: string; text?: string}>;
        maxOutputTokens: number;
        metadata: Record<string, string>;
      }) => {
        calls += 1;
        modelInput = request.input[0]?.text ?? "";
        metadata = request.metadata;
        expect(request.maxOutputTokens).toBe(2_000);
        return {
          output: {
            state: "idle",
            reply: "Já identificamos a companhia e recebemos o balancete; o próximo passo é concluir a leitura antes de afirmar capacidade financeira.",
          },
          usage: {inputTokens: 180, outputTokens: 45, cachedInputTokens: 0},
        };
      },
      spent: () => ({costUsd: 0.08, calls}),
    } as unknown as ModelGateway;

    const result = await processAgentOperationBriefJob(job, {queue, gateway, log: () => {}});
    const parsedInput = JSON.parse(modelInput) as Record<string, unknown>;

    expect(result.status).toBe("succeeded");
    expect(calls).toBe(1);
    expect(parsedInput).toMatchObject({
      project: {name: "Projeto Cedro", entryJob: "company_debt_view"},
      companyProfile: {companyName: "Cedro"},
      documentInventory: [{name: "balancete.pdf", kind: "trial_balance", status: "ready"}],
      workPlan: [{taskId: "M01", status: "succeeded"}],
      artifacts: [{type: "preliminary_understanding", version: 1, status: "draft"}],
      latestUserMessage: "O que já sabemos e qual é o próximo passo?",
      professionalContext: {professionalRole: "dcm_banker", operatingModels: ["structuring", "distribution"]},
      institutionCapabilities: {institutionName: "Banco Exemplo", operatingModels: ["balance_sheet_lending", "structuring", "distribution"]},
    });
    expect(metadata).toMatchObject({projectEntryJob: "company_debt_view", documentCount: "1", artifactCount: "1"});
    expect(modelInput).not.toContain("object_path");
    expect(modelInput).not.toContain("full_document_text");
  });
});
