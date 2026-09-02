import {randomUUID} from "node:crypto";

import {
  agentOperationBriefResponseSchema,
  createAgentChangeProposal,
  routeWorkspaceExecution,
  routeWorkspaceRequest,
  type AgentOperationBriefResponse,
  type WorkspaceExecutionRoute,
  type WorkspaceJobActivation,
  type WorkspaceRequestRoute,
} from "@offroad/agent-contracts";
import type {ModelGateway} from "@offroad/model-gateway";
import {z} from "zod";

import type {AgentOperationBriefJob, QueueClient} from "./queue";

const contextSchema = z.object({
  session_id: z.uuid(),
  message_id: z.uuid(),
  locale: z.enum(["pt-BR", "en-US"]),
  message: z.string().min(1).max(8_000),
  brief: z.record(z.string(), z.unknown()),
  snapshot_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  projection_updated_at: z.string(),
  manifest_id: z.uuid().nullable(),
  project: z.object({
    id: z.uuid(),
    name: z.string(),
    entryJob: z.string(),
    accessBasis: z.string(),
    phase: z.string(),
    status: z.string(),
  }).nullable().optional(),
  company_profile: z.record(z.string(), z.unknown()).default({}),
  documents: z.array(z.object({
    id: z.uuid(),
    name: z.string(),
    kind: z.string().nullable(),
    status: z.string(),
  })).max(250).default([]),
  tasks: z.array(z.object({
    taskId: z.string(),
    label: z.string(),
    ordinal: z.number(),
    status: z.string(),
  })).max(80).default([]),
  artifacts: z.array(z.object({
    id: z.uuid(),
    type: z.string(),
    version: z.number(),
    status: z.string(),
  })).max(80).default([]),
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

const SYSTEM = `You are the Offroad Agent inside one persistent private-debt advisory project.

The conversation may begin with a question, a company, public research, private documents, a
capital need or an existing transaction. Preserve that context and help the user advance one
useful step at a time. You may do exactly one of four things in this turn:
1. Ask one useful clarification when the intended change is ambiguous.
2. Propose direct edits to the operation brief when the user clearly supplied the new facts.
3. Answer without a change when the message is informational, when work is still running, or
   when the next action belongs to a later governed gate.
4. Activate the exact released executor selected by executionRoute when its context is complete.

Rules:
- Never claim to approve credit, complete underwriting, commit capital or guarantee funding.
- Never invent a value, date, rate, term, collateral, instrument, sector or geography.
- A numerical patch is permitted only when that number appears in the latest user message.
- The latest user message is a declaration, not reconciled evidence.
- Do not expose chain of thought. Give a concise conclusion and the reason the user needs.
- Do not generate a broad checklist. Ask only the next question that materially improves the case.
- Do not claim that a document was read, a search ran, a calculation was completed or an artifact
  exists unless the supplied project context explicitly shows that state.
- Treat document names as inventory, not proof of their contents.
- Distinguish a user declaration from documented, reconciled or calculated evidence.
- If company or assignment scope is still unclear, reflect the current understanding and ask the
  single missing question needed to identify it. Do not force a form or internal vocabulary.
- Existing plan tasks and artifacts are real state. Explain what is running, complete or blocked
  without inventing progress.
- executionRoute is a deterministic zero-model-call decision. Never select a different executor.
- When executionRoute names company_debt_view, origination_thesis or capital_planning, an activation is allowed only
  for public-information work with no uploaded documents. If the company is explicit in the user
  conversation, return the exact company name and only user-stated assignment context in activation.
  If it is not explicit, ask only for the company name. Never infer a private company identity.
- An activation queues a governed TaskSpec executor in the same project. It does not approve
  credit, choose a financing structure, contact a lender or grant external authority.
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
    const route = routeWorkspaceRequest({message: context.message, surface: "case_workspace"});
    const executionRoute = routeWorkspaceExecution({
      entryJob: context.project?.entryJob ?? null,
      accessBasis: context.project?.accessBasis ?? null,
      companyName: companyProfileString(context.company_profile, "name", "companyName"),
      documentCount: context.documents.length,
      artifactTypes: context.artifacts.map((artifact) => artifact.type),
      requestText: context.message,
      requestIntent: route.intent,
      requestEffect: route.effect,
    });
    const deterministicActivation = buildDeterministicActivation(context, executionRoute);
    const completion = deterministicActivation
      ? {
          output: activationResponse(context.locale, deterministicActivation),
          usage: {inputTokens: 0, outputTokens: 0, cachedInputTokens: 0},
        }
      : await gateway.complete({
          task: "agent_operation_brief",
          system: SYSTEM,
          input: [{
            type: "text",
            text: JSON.stringify({
              locale: context.locale,
              currentBrief: context.brief,
              project: context.project ?? null,
              companyProfile: context.company_profile,
              documentInventory: context.documents,
              workPlan: context.tasks,
              artifacts: context.artifacts,
              requestRoute: route,
              executionRoute,
              recentConversation: context.recent_messages.map(({role, content}) => ({role, content})),
              latestUserMessage: context.message,
            }),
          }],
          schema: agentOperationBriefResponseSchema,
          schemaName: "agent_operation_brief_response_v2",
          maxOutputTokens: 2_000,
          metadata: {
            jobId: job.job_id,
            messageId: context.message_id,
            sessionId: context.session_id,
            requestIntent: route.intent,
            requestScope: route.scope,
            requestEffect: route.effect,
            executionAction: executionRoute.action,
            executionReason: executionRoute.reasonCode,
            projectEntryJob: context.project?.entryJob ?? "legacy_session",
            documentCount: String(context.documents.length),
            artifactCount: String(context.artifacts.length),
          },
          cacheKey: "advisor-conversation-2026.09.01-v2",
        });

    const response = enforceExecutionActivation(
      enforceDirectNumericalSupport(
        enforceRouteAuthority(completion.output, route, context.locale),
        context.message,
        context.locale,
      ),
      executionRoute,
      context,
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
    await queue.recordAgentResponse(job, assistantMessageId, response, proposal, response.activation);
    await queue.writeStage(job, "agent_operation_brief", "succeeded", {
      messageId: assistantMessageId,
      state: response.state,
      proposalId: proposal?.id,
      requestIntent: route.intent,
      requestScope: route.scope,
      requestEffect: route.effect,
      executionAction: executionRoute.action,
      executionReason: executionRoute.reasonCode,
      activatedJob: response.activation?.job,
    }, completion.usage as unknown as Record<string, number>);
    await queue.complete(job, {
      assistantMessageId,
      proposalId: proposal?.id,
      state: response.state,
      request_route: route,
      execution_route: executionRoute,
      activated_job: response.activation?.job,
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

type AgentContext = z.infer<typeof contextSchema>;

function companyProfileString(profile: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function buildDeterministicActivation(
  context: AgentContext,
  route: WorkspaceExecutionRoute,
): WorkspaceJobActivation | null {
  if (route.action !== "queue_specialized_job" || !route.analysisScope) return null;
  const name = companyProfileString(context.company_profile, "name", "companyName");
  if (!name) return null;
  const websiteCandidate = companyProfileString(context.company_profile, "website");
  const website = websiteCandidate
    && websiteCandidate.startsWith("https://")
    && z.url().safeParse(websiteCandidate).success
    ? websiteCandidate
    : undefined;
  if (route.analysisScope === "company_debt_view") {
    return {job: "company_debt_view", company: {name, ...(website ? {website} : {})}, brief: {focus: context.message}};
  }
  if (route.analysisScope === "capital_planning") {
    return {
      job: "capital_planning",
      company: {name, ...(website ? {website} : {})},
      brief: {capitalIntent: context.message},
    };
  }
  return {
    job: "origination_thesis",
    company: {name, ...(website ? {website} : {})},
    brief: {meetingContext: context.message},
  };
}

function activationResponse(
  locale: "pt-BR" | "en-US",
  activation: WorkspaceJobActivation,
): AgentOperationBriefResponse {
  return {
    state: "idle",
    reply: locale === "pt-BR"
      ? `Entendi o pedido para ${activation.company.name}. Vou iniciar agora o plano especializado neste mesmo projeto e registrar as fontes, tarefas e produto de trabalho para sua revisão.`
      : `I understood the assignment for ${activation.company.name}. I will now start the specialized plan in this same project and record its sources, tasks and work product for your review.`,
    activation,
  };
}

function enforceExecutionActivation(
  response: AgentOperationBriefResponse,
  route: WorkspaceExecutionRoute,
  context: AgentContext,
): AgentOperationBriefResponse {
  const activation = response.activation;
  if (!activation) return response;
  if (!route.analysisScope || route.action === "conversation_only" || activation.job !== route.analysisScope) {
    return {
      state: "idle",
      reply: context.locale === "pt-BR"
        ? "Não iniciei um executor diferente nem ampliei o escopo do projeto. Podemos continuar o raciocínio nesta conversa; qualquer produção, aprovação ou contato seguirá pelo gate correspondente."
        : "I did not start a different executor or broaden the project scope. We can continue the reasoning in this conversation; any production, approval or contact will follow its corresponding gate.",
    };
  }

  const genericNames = new Set(["empresa", "companhia", "company", "operação", "operacao", "captação", "captacao"]);
  const proposedName = activation.company.name.normalize("NFKC").trim();
  const existingName = companyProfileString(context.company_profile, "name", "companyName");
  const userCorpus = [context.message, ...context.recent_messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)]
    .join("\n")
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR");
  const nameSupported = existingName?.localeCompare(proposedName, undefined, {sensitivity: "base"}) === 0
    || userCorpus.includes(proposedName.toLocaleLowerCase("pt-BR"));
  if (!nameSupported || genericNames.has(proposedName.toLocaleLowerCase("pt-BR"))) {
    return {
      state: "asking",
      reply: context.locale === "pt-BR"
        ? "Antes de iniciar a análise, preciso confirmar qual companhia deve ser pesquisada."
        : "Before starting the analysis, I need to confirm which company should be researched.",
      clarification: {
        question: context.locale === "pt-BR" ? "Qual é o nome exato da companhia?" : "What is the company's exact name?",
        whyItMatters: context.locale === "pt-BR"
          ? "A identidade delimita as fontes públicas, evita misturar empresas homônimas e fixa o escopo do projeto."
          : "The identity bounds public sources, prevents mixing namesake companies and fixes the project scope.",
        answerKind: "text",
        choices: [],
        priority: "required_now",
      },
    };
  }

  const existingWebsite = companyProfileString(context.company_profile, "website");
  const websiteSupported = !activation.company.website
    || existingWebsite === activation.company.website
    || userCorpus.includes(activation.company.website.toLocaleLowerCase("pt-BR"));
  const safeActivation: WorkspaceJobActivation = websiteSupported
    ? activation
    : {...activation, company: {name: activation.company.name}};
  return activationResponse(context.locale, safeActivation);
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
