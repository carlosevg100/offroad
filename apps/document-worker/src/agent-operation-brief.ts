import {randomUUID} from "node:crypto";

import {
  agentOperationBriefResponseSchema,
  collaborativeAdvisoryPolicy,
  createAgentChangeProposal,
  routeWorkspaceExecution,
  routeWorkspaceRequest,
  workspaceJourneyBlueprint,
  type AgentOperationBriefResponse,
  type WorkspaceExecutionRoute,
  type WorkspaceJobActivation,
  type WorkspaceRequestRoute,
} from "@offroad/agent-contracts";
import {providerDataPolicyVersion, type ModelGateway} from "@offroad/model-gateway";
import {localizedOffroadTaskLabel} from "@offroad/work-plan";
import {z} from "zod";

import {institutionCapabilitiesSchema, organizationMethodologySchema, professionalContextSchema} from "./advisor-context";
import type {AgentOperationBriefJob, QueueClient} from "./queue";
import {describeJobFailure} from "./job-failure";
import {shadowIntentEnvelope} from "./intent-shadow";
import {routeIntegrationPreviewTurn, type PreviewStepOutput} from "./integration-preview";

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
  professional_context: professionalContextSchema.nullable().optional(),
  institution_capabilities: institutionCapabilitiesSchema.nullable().optional(),
  organization_methodology: organizationMethodologySchema.nullable().optional(),
  related_project_memory: z.array(z.object({
    projectId: z.uuid(),
    projectName: z.string().max(80),
    companyName: z.string().max(200),
    entryJob: z.string(),
    currentPhase: z.string(),
    status: z.string(),
    updatedAt: z.string(),
    brief: z.object({
      kind: z.string(),
      content: z.record(z.string(), z.unknown()),
    }).nullable(),
    artifactTypes: z.array(z.string()).max(40),
  })).max(8).default([]),
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
  /** Shadow routing records an Intent Envelope per turn for measurement. Off only in tests. */
  shadowRouting?: boolean;
};

const SYSTEM = `You are the Offroad Agent inside one persistent private-debt advisory project.

The conversation may begin with a question, a company, public research, private documents, a
capital need or an existing transaction. Preserve that context and help the user advance one
useful step at a time. You may do exactly one of four things in this turn:
1. Ask one compact clarification packet, with at most three related high-value points, when the
   mission context is incomplete.
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
- Do not generate a broad checklist. For a meeting assignment, audience, desired outcome and
  current relationship/exposure form one compact context packet; explain briefly why each missing
  point changes the analysis.
- Do not claim that a document was read, a search ran, a calculation was completed or an artifact
  exists unless the supplied project context explicitly shows that state.
- Treat document names as inventory, not proof of their contents.
- Distinguish a user declaration from documented, reconciled or calculated evidence.
- If company or assignment scope is still unclear, reflect the current understanding and ask the
  single missing question needed to identify it. Do not force a form or internal vocabulary.
- Existing plan tasks and artifacts are real state. Explain what is running, complete or blocked
  without inventing progress.
- relatedProjectMemory contains only same-organization work whose company name appears in the
  request. Use it before asking a question. When relevant history exists, mention the prior project,
  its recency and work product, then ask whether this assignment updates that thesis or starts a new
  one. Never imply that another client or organization supplied the history.
- professionalContext and institutionCapabilities are durable context supplied by this user or
  organization. Use them before asking how the user can act. They tailor execution; they are not
  evidence about the target company, a current credit appetite or an approved mandate.
- Use professional context silently to prioritize, sequence and explain the work. Never use it to
  suppress an alternative that may be better for the company. Build the company-relevant universe
  first, then explain viable execution paths without declaring what the user's institution can or
  cannot lead unless the user explicitly asks.
- If executionRoute requires institution_capability_context, ask how the institution can act in
  this assignment: lend from its balance sheet, structure, distribute, advise, invest, or combine
  those roles. Explain that this calibrates emphasis and makes the execution discussion more useful,
  but never frames it as a boundary on the strategic analysis. Do not open with an instrument
  catalogue. If the user does not know or prefers not to disclose it, continue with an
  institution-neutral analysis and do not ask again.
- When executionRoute.reasonCode is specialized_work_in_progress, do not activate another job.
  Report useful progress from the supplied tasks/artifacts. If capability context is still generic
  after an earlier question, explicitly proceed with balance-sheet, distribution, advisory and
  third-party-capital paths separated rather than repeating the question.
- Never say that public research is already running unless a supplied task is actually queued or
  running. It is acceptable to say what will begin as soon as the missing mission context is confirmed.
- executionRoute is a deterministic zero-model-call decision. Never select a different executor.
- When executionRoute names company_debt_view, origination_thesis or capital_planning, an activation is allowed only
  for public-information work with no uploaded documents. If the company is explicit in the user
  conversation, return the exact company name and only user-stated assignment context in activation.
  If it is not explicit, ask for the company name alongside any other missing mission context.
  Never infer a private company identity.
- An activation queues a governed TaskSpec executor in the same project. It does not approve
  credit, choose a financing structure, contact a lender or grant external authority.
- journeyBlueprint defines the current point of entry into the same advisory system. Follow its
  context, parallel-work, analytical and interaction rules; never turn it into a rigid wizard.
- collaborativeAdvisoryPolicy is mandatory. End substantive alternatives work like an associate or
  VP presenting completed thinking to an MD: ask which path makes sense to pursue, combine or carry
  into the material. Never ask the user to choose between an explicitly labelled "institution-led"
  universe and a separate "broader" universe.
- Keep the response in the locale supplied in the input.
- A proposal is only a preview. The product applies it only after explicit user acceptance.
- Only use the patch paths allowed by the response schema.`;

const previewArtifactsSchema = z.array(z.object({
  task_id: z.string(),
  artifact_type: z.string(),
  artifact_fingerprint: z.string(),
  content: z.record(z.string(), z.unknown()),
}));

export async function processAgentOperationBriefJob(
  job: AgentOperationBriefJob,
  dependencies: AgentOperationBriefDependencies,
): Promise<{status: "succeeded" | "failed"; proposalId?: string}> {
  const {queue, gateway, log} = dependencies;
  try {
    await queue.writeStage(job, "agent_operation_brief", "started", {messageId: job.payload.message_id});
    const context = contextSchema.parse(await queue.loadAgentContext(job));
    const route = routeWorkspaceRequest({message: context.message, surface: "case_workspace"});
    // Shadow routing: the envelope is recorded for measurement and never consulted here. A
    // failure in the classifier is logged and the turn proceeds exactly as before.
    if (dependencies.shadowRouting !== false) {
      try {
        const shadow = await shadowIntentEnvelope({
          gateway,
          context: {
            locale: context.locale,
            message: context.message,
            recentMessages: context.recent_messages.map(({role, content}) => ({role, content})),
            organizationId: job.organization_id,
            projectId: context.project?.id ?? null,
            entryJob: context.project?.entryJob ?? null,
            accessBasis: context.project?.accessBasis ?? null,
            documentIds: context.documents.map((document) => document.id),
            professionalContext: context.professional_context
              ? {
                  useForms: context.professional_context.useForms,
                  professionalRoles: context.professional_context.professionalRoles,
                  practiceAreas: context.professional_context.practiceAreas,
                  primaryObjectives: context.professional_context.primaryObjectives,
                }
              : null,
          },
        });
        await queue.recordIntentEnvelope(job, {
          envelope: shadow.envelope,
          classifier: {abstain: shadow.output.abstain, abstainReason: shadow.output.abstainReason, firstQuestion: shadow.output.firstQuestion},
          model: shadow.model,
          costUsd: shadow.costUsd,
        });
      } catch (shadowError) {
        log("agent_operation_brief.shadow_routing_failed", {job: job.job_id, message: shadowError instanceof Error ? shadowError.message.slice(0, 200) : "unknown"});
      }
    }
    // Internal validation: a granted organization's turn is routed by the deterministic preview
    // router, which replies from the objects and may activate a preview run. No model call.
    if (job.integration_preview === true) {
      const priorArtifacts = previewArtifactsSchema.safeParse(queue.loadIntegrationPreviewArtifacts ? await queue.loadIntegrationPreviewArtifacts(job).catch(() => []) : []);
      const priorOutputs = new Map<string, PreviewStepOutput>();
      for (const artifact of priorArtifacts.success ? priorArtifacts.data : []) {
        const output = artifact.content.output;
        if (output && typeof output === "object" && !Array.isArray(output)) priorOutputs.set(artifact.task_id, output as PreviewStepOutput);
      }
      const decision = routeIntegrationPreviewTurn({
        locale: context.locale,
        message: context.message,
        recentMessages: context.recent_messages.map(({role, content}) => ({role, content})),
        artifactTypes: context.artifacts.map((artifact) => artifact.type),
        runActive: context.tasks.some((task) => ["queued", "running", "started"].includes(task.status)),
        priorOutputs,
        entryJob: context.project?.entryJob ?? "origination_thesis",
      });
      const previewMessageId = randomUUID();
      const previewResponse = {state: "idle" as const, reply: decision.reply};
      await queue.recordAgentResponse(job, previewMessageId, previewResponse, undefined, decision.activation ?? undefined);
      await queue.writeStage(job, "agent_operation_brief", "succeeded", {messageId: previewMessageId, state: "idle", mode: "integration_preview", decision: decision.kind, composition: decision.activation?.composition, modelCalls: 0});
      await queue.complete(job, {mode: "integration_preview", decision: decision.kind, composition: decision.activation?.composition ?? null, assistantMessageId: previewMessageId, spend: gateway.spent()});
      log("integration_preview.turn_routed", {job: job.job_id, decision: decision.kind, composition: decision.activation?.composition ?? null});
      return {status: "succeeded"};
    }
    const conversationText = context.recent_messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n");
    const explicitCompanyName = companyProfileString(context.company_profile, "name", "companyName")
      ?? explicitCompanyNameFromConversation(context);
    const executionRoute = routeWorkspaceExecution({
      entryJob: context.project?.entryJob ?? null,
      accessBasis: context.project?.accessBasis ?? null,
      companyName: explicitCompanyName,
      documentCount: context.documents.length,
      artifactTypes: context.artifacts.map((artifact) => artifact.type),
      requestText: context.message,
      conversationText,
      requestIntent: route.intent,
      requestEffect: route.effect,
      // Only the institution profile answers what an institution can do. A person's own
      // description of their work is not evidence of their employer's capability.
      institutionOperatingModels: context.institution_capabilities?.operatingModels ?? [],
      professionalContextStatus: context.professional_context?.disclosureStatus ?? null,
      institutionCapabilityQuestionAsked: context.recent_messages.some((message) => message.role === "assistant"
        && /(?:como\s+(?:sua|a\s+sua)\s+institui[cç][aã]o\s+pode\s+atuar|how\s+can\s+your\s+institution\s+act)/i.test(message.content)),
      specializedWorkActive: context.tasks.some((task) => ["queued", "running", "started"].includes(task.status)),
    });
    const deterministicClarification = buildDeterministicCapabilityClarification(context, executionRoute);
    const deterministicActivation = deterministicClarification ? null : buildDeterministicActivation(context, executionRoute);
    const completion = deterministicClarification
      ? {
          output: deterministicClarification,
          usage: {inputTokens: 0, outputTokens: 0, cachedInputTokens: 0},
        }
      : deterministicActivation
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
              professionalContext: context.professional_context ?? null,
              institutionCapabilities: context.institution_capabilities ?? null,
              organizationMethodology: context.organization_methodology ?? null,
              relatedProjectMemory: context.related_project_memory,
              documentInventory: context.documents,
              workPlan: context.tasks.map((task) => ({
                ...task,
                label: localizedOffroadTaskLabel(task.taskId, task.label, context.locale),
              })),
              artifacts: context.artifacts,
              requestRoute: route,
              executionRoute,
              journeyBlueprint: executionRoute.analysisScope
                ? workspaceJourneyBlueprint(executionRoute.analysisScope)
                : null,
              collaborativeAdvisoryPolicy,
              recentConversation: context.recent_messages.map(({role, content}) => ({role, content})),
              latestUserMessage: context.message,
            }),
          }],
          schema: agentOperationBriefResponseSchema,
          schemaName: "agent_operation_brief_response_v2",
          dataHandling: {classification: "restricted", purpose: "case_analysis", requiredPolicyVersion: providerDataPolicyVersion},
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
    await queue.fail(job, describeJobFailure(error, {code: "agent_processing_failed", stage: "agent_operation_brief", spend: gateway.spent(), retryable: false}), {retryable: false});
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

function durableUserRequestContext(context: AgentContext, maxCharacters: number): string {
  const turns = [
    ...context.recent_messages
      .filter((message) => message.role === "user")
      .map((message) => message.content.trim()),
    context.message.trim(),
  ].filter(Boolean);
  const combined = turns.join("\n\n");
  if (combined.length <= maxCharacters) return combined;

  const separator = "\n\n[… contexto anterior condensado …]\n\n";
  const available = maxCharacters - separator.length;
  const leadingCharacters = Math.floor(available * 0.4);
  return `${combined.slice(0, leadingCharacters)}${separator}${combined.slice(-(available - leadingCharacters))}`;
}

function buildDeterministicActivation(
  context: AgentContext,
  route: WorkspaceExecutionRoute,
): WorkspaceJobActivation | null {
  const mayResearchWhileCollectingMeetingContext = route.action === "collect_required_context"
    && route.analysisScope === "origination_thesis"
    && route.requirements.length > 0
    && route.requirements.every((requirement) => [
      "meeting_audience", "desired_outcome", "relationship_context", "institution_capability_context",
    ].includes(requirement));
  if ((route.action !== "queue_specialized_job" && !mayResearchWhileCollectingMeetingContext) || !route.analysisScope) return null;
  const name = companyProfileString(context.company_profile, "name", "companyName")
    ?? explicitCompanyNameFromConversation(context);
  if (!name) return null;
  const websiteCandidate = companyProfileString(context.company_profile, "website");
  const website = websiteCandidate
    && websiteCandidate.startsWith("https://")
    && z.url().safeParse(websiteCandidate).success
    ? websiteCandidate
    : undefined;
  if (route.analysisScope === "company_debt_view") {
    return {
      job: "company_debt_view",
      company: {name, ...(website ? {website} : {})},
      brief: {focus: durableUserRequestContext(context, 2_900)},
    };
  }
  if (route.analysisScope === "capital_planning") {
    return {
      job: "capital_planning",
      company: {name, ...(website ? {website} : {})},
      brief: {capitalIntent: durableUserRequestContext(context, 4_900)},
    };
  }
  return {
    job: "origination_thesis",
    company: {name, ...(website ? {website} : {})},
    brief: {meetingContext: durableUserRequestContext(context, 4_900)},
  };
}

function buildDeterministicCapabilityClarification(
  context: AgentContext,
  route: WorkspaceExecutionRoute,
): AgentOperationBriefResponse | null {
  const capabilityOnly = route.action === "collect_required_context"
    && route.analysisScope === "origination_thesis"
    && route.requirements.length === 1
    && route.requirements[0] === "institution_capability_context";
  const researchAlreadyActive = context.tasks.some((task) => ["queued", "running", "started"].includes(task.status));
  if (!capabilityOnly || !researchAlreadyActive) return null;
  return capabilityContextResponse(context.locale, companyProfileString(context.company_profile, "name", "companyName")
    ?? explicitCompanyNameFromConversation(context));
}

function capabilityContextResponse(locale: "pt-BR" | "en-US", companyName: string | null): AgentOperationBriefResponse {
  const company = companyName ?? (locale === "pt-BR" ? "a companhia" : "the company");
  return {
    state: "asking",
    reply: locale === "pt-BR"
      ? `Já estou aprofundando a leitura de ${company}. Antes de organizar as alternativas para a conversa, há um ponto que me ajuda a deixá-las mais úteis para você.`
      : `I am already deepening the readout on ${company}. Before organizing the alternatives for the conversation, one point will help me make them more useful to you.`,
    clarification: {
      question: locale === "pt-BR"
        ? "Neste trabalho, vocês podem emprestar com balanço próprio, estruturar e distribuir, atuar como advisor ou combinar essas frentes?"
        : "For this assignment, can you lend from your balance sheet, structure and distribute, act as an advisor, or combine those roles?",
      whyItMatters: locale === "pt-BR"
        ? "Vou analisar primeiro o que faz sentido para a companhia. Essa resposta só calibra a ordem, o nível de detalhe e os caminhos de execução. Se não souber ou preferir não informar, sigo com uma visão ampla."
        : "I will first assess what makes sense for the company. This answer only calibrates the order, level of detail and execution paths. If you do not know or prefer not to say, I will continue with a broad view.",
      answerKind: "text",
      choices: [],
      priority: "high_value",
    },
  };
}

function activationResponse(
  locale: "pt-BR" | "en-US",
  activation: WorkspaceJobActivation,
  route?: WorkspaceExecutionRoute,
  context?: AgentContext,
): AgentOperationBriefResponse {
  const parallelMeetingContext = activation.job === "origination_thesis"
    && route?.action === "collect_required_context";
  const prior = context?.related_project_memory[0];
  if (parallelMeetingContext) {
    if (route?.requirements.length === 1 && route.requirements[0] === "institution_capability_context") {
      const capabilityPrompt = capabilityContextResponse(locale, activation.company.name);
      return {...capabilityPrompt, activation};
    }
    const question = prior
      ? locale === "pt-BR"
        ? `Vi o trabalho anterior “${prior.projectName}”. Ele ainda é um ponto de partida útil para esta reunião ou a pauta agora é diferente? Com quem será a conversa, o que você quer provocar e que relacionamento ou exposição já existe com a companhia?`
        : `I found the earlier “${prior.projectName}” work. Is it still a useful starting point for this meeting, or is the agenda now different? Who will be in the conversation, what do you want it to provoke, and what relationship or exposure already exists with the company?`
      : locale === "pt-BR"
        ? "Com quem será a conversa, o que você quer que ela provoque e que relacionamento ou exposição já existe com a companhia?"
        : "Who will be in the conversation, what do you want it to provoke, and what relationship or exposure already exists with the company?";
    return {
      state: "asking",
      reply: locale === "pt-BR"
        ? `${activation.company.name}. Vou começar pela companhia: negócio, setor, desempenho, geração de caixa, estrutura de capital, vencimentos e mercado de dívida. Enquanto essa leitura avança, quero alinhar o contexto que muda o que será realmente útil no pitch.`
        : `${activation.company.name}. I will start with the company: business, sector, performance, cash generation, capital structure, maturities and debt markets. While that readout progresses, I want to align the context that changes what will actually be useful in the pitch.`,
      clarification: {
        question,
        whyItMatters: locale === "pt-BR"
          ? "O interlocutor define a profundidade; o objetivo define o ângulo; e o relacionamento existente evita repetir o óbvio ou propor algo que já esteja em curso. Responda apenas o que souber."
          : "The audience determines depth; the objective determines the angle; and the existing relationship avoids repeating the obvious or proposing something already under way. Answer only what you know.",
        answerKind: "text",
        choices: [],
        priority: "high_value",
      },
      activation,
    };
  }
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
  const mayNormalizeOnlyIdentity = route.action === "collect_required_context"
    && route.requirements.length === 1
    && route.requirements[0] === "company_identity";
  const mayResearchWhileCollectingMeetingContext = route.action === "collect_required_context"
    && route.analysisScope === "origination_thesis"
    && route.requirements.length > 0
    && route.requirements.every((requirement) => [
      "meeting_audience", "desired_outcome", "relationship_context", "institution_capability_context",
    ].includes(requirement));
  if (!route.analysisScope
    || (route.action !== "queue_specialized_job" && !mayNormalizeOnlyIdentity && !mayResearchWhileCollectingMeetingContext)
    || activation.job !== route.analysisScope) {
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
  return activationResponse(context.locale, safeActivation, route, context);
}

/**
 * Reads only an explicit company mention from the user's own conversation. This is not entity
 * resolution and does not promote the string to Company Truth: the specialized public executor
 * still resolves the legal entity against official sources and abstains on ambiguity. Keeping
 * this narrow makes the first useful action deterministic and avoids paying a model merely to
 * copy “Camil” out of “reunião com a Camil”.
 */
function explicitCompanyNameFromConversation(context: AgentContext): string | null {
  const corpus = [context.message, ...context.recent_messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)]
    .join("\n")
    .normalize("NFKC");
  const patterns = [
    /\b(?:reuni[aã]o|meeting)\b[^?\n]{0,100}?\b(?:com|with)\s+(?:(?:a|o|the)\s+)?(?:ceo|cfo|tesour(?:aria|eiro)|treasur(?:y|er)|diretor(?:a)?|presidente|vp)\s+(?:da|do|de|at)\s+([\p{L}\d][\p{L}\d&.'’()\- ]{1,120}?)(?=\s+(?:amanh[ãa]|tomorrow|e\s+(?:quero|gostaria|preciso)|and\s+(?:i|we))|[.?!\n]|$)/iu,
    /\b(?:reuni[aã]o|meeting)\b[^?\n]{0,100}?\b(?:com|with)\s+(?:(?:a|o|the)\s+)?([\p{L}\d][\p{L}\d&.'’()\- ]{1,120}?)(?=\s+(?:amanh[ãa]|tomorrow|e\s+(?:quero|gostaria|preciso)|and\s+(?:i|we)|para\s+(?:preparar|discutir|apresentar)|to\s+(?:prepare|discuss|present))|[?!\n]|$)/iu,
    /\b(?:analisar|analise|estudar|entender|sobre|analyze|analyse|study|understand)\s+(?:(?:a|o|the)\s+)?([\p{L}\d][\p{L}\d&.'’()\- ]{1,120}?)(?=\s+(?:na\s+[oó]tica|sob\s+a|para\s+|com\s+foco|from\s+a|for\s+|with\s+a)|[,.?!\n]|$)/iu,
    /\b(?:empresa|companhia|company)\s+([\p{L}\d][\p{L}\d&.'’()\- ]{1,120}?)(?=\s+(?:que|e\s+quero|and\s+I|para\s+|to\s+)|[,.?!\n]|$)/iu,
  ];
  const generic = new Set(["empresa", "companhia", "company", "cliente", "client"]);
  for (const pattern of patterns) {
    const candidate = pattern.exec(corpus)?.[1]?.trim().replace(/[,;:!?]+$/u, "");
    if (!candidate || candidate.length < 2 || candidate.length > 120) continue;
    if (generic.has(candidate.toLocaleLowerCase("pt-BR"))) continue;
    return candidate;
  }
  return null;
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
