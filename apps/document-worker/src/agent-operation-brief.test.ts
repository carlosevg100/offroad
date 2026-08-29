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
});
