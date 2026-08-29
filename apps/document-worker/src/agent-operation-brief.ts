import {randomUUID} from "node:crypto";

import {
  agentOperationBriefResponseSchema,
  createAgentChangeProposal,
  routeWorkspaceRequest,
  type AgentOperationBriefResponse,
  type WorkspaceRequestRoute,
} from "@offroad/agent-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {z} from "zod";

import type {AgentOperationBriefJob, QueueClient} from "./queue";

const contextSchema = z.object({
  session_id: z.uuid(),
  message_id: z.uuid(),
  locale: z.enum(["pt-BR", "en-US"]),
  message: z.string().min(1).max(4_000),
  brief: z.record(z.string(), z.unknown()),
  snapshot_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  projection_updated_at: z.string(),
  manifest_id: z.uuid().nullable(),
  recent_messages: z.array(z.object({
    id: z.uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8_000),
    created_at: z.string(),
  })).max(12),
});

export type AgentOperationBriefDependencies = {
  queue: QueueClient;
  gateway: ModelGateway;
  log: (event: string, detail?: Record<string, unknown>) => void;
};

const SYSTEM = `You are the Offroad Agent inside a private-credit origination workspace.

Your current authority is narrow: understand the user's latest message in the context of the
declared operation brief. You may do exactly one of three things:
1. Ask one useful clarification when the intended change is ambiguous.
2. Propose direct edits to the operation brief when the user clearly supplied the new facts.
3. Answer without a change when the message is informational or outside this command.

Rules:
- Never claim to approve credit, complete underwriting, commit capital or guarantee funding.
- Never invent a value, date, rate, term, collateral, instrument, sector or geography.
- A numerical patch is permitted only when that number appears in the latest user message.
- The latest user message is a declaration, not reconciled evidence.
- Do not expose chain of thought. Give a concise conclusion and the reason the user needs.
- Do not generate a broad checklist. Ask only the next question that materially improves the case.
- Keep the response in the locale supplied in the input.
- A proposal is only a preview. The product applies it only after explicit user acceptance.
- Only use the patch paths allowed by the response schema.`;

export async function processAgentOperationBriefJob(
  job: AgentOperationBriefJob,
  dependencies: AgentOperationBriefDependencies,
): Promise<{status: "succeeded" | "failed"; proposalId?: string}> {
  const {queue, gateway, log} = dependencies;
  try {
    await queue.writeStage(job, "agent_operation_brief", "started", {messageId: job.payload.message_id});
    const context = contextSchema.parse(await queue.loadAgentContext(job));
    const route = routeWorkspaceRequest({message: context.message, surface: "operation_brief"});
    const completion = await gateway.complete({
      task: "agent_operation_brief",
      system: SYSTEM,
      input: [{
        type: "text",
        text: JSON.stringify({
          locale: context.locale,
          currentBrief: context.brief,
          requestRoute: route,
          recentConversation: context.recent_messages.map(({role, content}) => ({role, content})),
          latestUserMessage: context.message,
        }),
      }],
      schema: agentOperationBriefResponseSchema,
      schemaName: "agent_operation_brief_response_v1",
      maxOutputTokens: 6_000,
      metadata: {
        jobId: job.job_id,
        messageId: context.message_id,
        sessionId: context.session_id,
        requestIntent: route.intent,
        requestScope: route.scope,
        requestEffect: route.effect,
      },
      cacheKey: "agent-operation-brief-v1",
    });

    const response = enforceDirectNumericalSupport(
      enforceRouteAuthority(completion.output, route, context.locale),
      context.message,
      context.locale,
    );
    const now = new Date();
    const proposal = response.proposal
      ? createAgentChangeProposal({
          id: randomUUID(),
          caseId: context.session_id,
          baseManifestFingerprint: context.snapshot_fingerprint,
          target: "operation_brief",
          title: response.proposal.title,
          rationale: response.proposal.rationale,
          impactSummary: response.proposal.impactSummary,
          patches: response.proposal.patches.map((patch) => ({...patch, previousFingerprint: null})),
          evidence: [{kind: "user_statement", id: context.message_id}],
          recompute: response.proposal.recompute,
          proposedBy: "offroad_agent",
          proposedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
        })
      : undefined;

    const assistantMessageId = randomUUID();
    await queue.recordAgentResponse(job, assistantMessageId, response, proposal);
    await queue.writeStage(job, "agent_operation_brief", "succeeded", {
      messageId: assistantMessageId,
      state: response.state,
      proposalId: proposal?.id,
      requestIntent: route.intent,
      requestScope: route.scope,
      requestEffect: route.effect,
    }, completion.usage as unknown as Record<string, number>);
    await queue.complete(job, {
      assistantMessageId,
      proposalId: proposal?.id,
      state: response.state,
      request_route: route,
      spend: gateway.spent(),
    });
    return proposal ? {status: "succeeded", proposalId: proposal.id} : {status: "succeeded"};
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown agent failure";
    log("agent_operation_brief.failed", {job: job.job_id, message: message.slice(0, 300)});
    try {
      await queue.recordAgentFailure(job, "agent_processing_failed");
    } catch (recordError) {
      log("agent_operation_brief.failure_record_failed", {
        job: job.job_id,
        message: recordError instanceof Error ? recordError.message.slice(0, 300) : "unknown",
      });
    }
    await queue.fail(job, {code: "agent_processing_failed", spend: gateway.spent()}, {retryable: false});
    return {status: "failed"};
  }
}

function enforceRouteAuthority(
  response: AgentOperationBriefResponse,
  route: WorkspaceRequestRoute,
  locale: "pt-BR" | "en-US",
): AgentOperationBriefResponse {
  if (route.allowedOnCurrentSurface && route.effect === "proposal") return response;
  if (route.effect === "none" && !response.proposal) return response;
  if (route.intent === "clarify" && response.state === "asking" && !response.proposal) return response;

  if (route.intent === "authorize_external") {
    return {
      state: "idle",
      reply: locale === "pt-BR"
        ? "Esta conversa não envia materiais nem contata financiadores. A introdução só pode ser autorizada na etapa de mercado, para destinatários e versões específicos."
        : "This conversation does not send materials or contact lenders. An introduction can only be authorized in the market stage for specific recipients and versions.",
    };
  }
  if (route.intent === "approve") {
    return {
      state: "idle",
      reply: locale === "pt-BR"
        ? "Registrei sua intenção, mas esta conversa não confirma uma decisão do caso. A aprovação precisa ocorrer no objeto e na versão correspondentes."
        : "I recorded your intent, but this conversation cannot confirm a case decision. Approval must occur on the corresponding object and version.",
    };
  }
  if (route.intent === "compile") {
    return {
      state: "idle",
      reply: locale === "pt-BR"
        ? "A produção de materiais exige uma estrutura confirmada e um plano de produção aprovado. Esta conversa pode ajudar a corrigir o pedido, mas não libera os artefatos."
        : "Material production requires a confirmed structure and an approved production plan. This conversation can help correct the request, but it cannot release artifacts.",
    };
  }
  return {...response, proposal: undefined, state: response.clarification ? "asking" : "idle"};
}

function enforceDirectNumericalSupport(
  response: AgentOperationBriefResponse,
  latestMessage: string,
  locale: "pt-BR" | "en-US",
): AgentOperationBriefResponse {
  const numericPaths = new Set(["/requestedAmount", "/requestedTermMonths", "/requestedGraceMonths"]);
  const hasNumericPatch = response.proposal?.patches.some((patch) => numericPaths.has(patch.path)) ?? false;
  if (!hasNumericPatch || /\d/.test(latestMessage)) return response;
  return {
    state: "asking",
    reply: locale === "pt-BR"
      ? "Para preparar essa alteração sem presumir um valor, preciso que você informe o número pretendido."
      : "To prepare this change without assuming a value, I need the intended number.",
    clarification: {
      question: locale === "pt-BR"
        ? "Qual é o valor exato que deve constar na operação?"
        : "What exact value should the transaction show?",
      whyItMatters: locale === "pt-BR"
        ? "Esse número afeta a análise de capacidade, a estrutura indicativa e o universo de financiadores."
        : "This number affects capacity analysis, the indicative structure and the lender universe.",
      answerKind: "number",
      choices: [],
      priority: "required_now",
    },
  };
}
