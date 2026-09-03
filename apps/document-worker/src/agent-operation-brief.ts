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
import {providerDataPolicyVersion, type ModelGateway} from "@offroad/model-gateway";
import {localizedOffroadTaskLabel} from "@offroad/work-plan";
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
  professional_context: z.object({
    affiliationKind: z.string().nullable(),
    professionalRole: z.string().nullable(),
    teamName: z.string().nullable(),
    institutionName: z.string().nullable(),
    operatingModels: z.array(z.string()).max(20),
    productFamilies: z.array(z.string()).max(30),
    primaryObjectives: z.array(z.string()).max(20),
    contextNotes: z.string().nullable(),
    disclosureStatus: z.enum(["complete", "partial", "skipped"]),
    lastConfirmedAt: z.string().nullable(),
  }).nullable().optional(),
  institution_capabilities: z.object({
    institutionName: z.string().nullable(),
    institutionKind: z.string().nullable(),
    operatingModels: z.array(z.string()).max(20),
    productFamilies: z.array(z.string()).max(30),
    geographies: z.array(z.string()).max(40),
    currencies: z.array(z.string()).max(20),
    capabilityNotes: z.string().nullable(),
    sourceKind: z.enum(["self_declared", "public_observed", "mixed", "unknown"]),
    disclosureStatus: z.enum(["complete", "partial", "skipped"]),
    lastConfirmedAt: z.string().nullable(),
  }).nullable().optional(),
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
- If executionRoute requires institution_capability_context, ask how the institution can act in
  this assignment: lend from its balance sheet, structure, distribute, advise, invest, or combine
  those roles. Explain that this prevents proposing a path the user cannot execute. Do not open
  with an instrument catalogue. If the user does not know or prefers not to disclose it, continue
  with an institution-neutral analysis and label the execution paths instead of asking again.
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
      institutionOperatingModels: [
        ...(context.professional_context?.operatingModels ?? []),
        ...(context.institution_capabilities?.operatingModels ?? []),
      ],
      professionalContextStatus: context.professional_context?.disclosureStatus ?? null,
      institutionCapabilityQuestionAsked: context.recent_messages.some((message) => message.role === "assistant"
        && /(?:como\s+(?:sua|a\s+sua)\s+institui[cç][aã]o\s+pode\s+atuar|how\s+can\s+your\s+institution\s+act)/i.test(message.content)),
      specializedWorkActive: context.tasks.some((task) => ["queued", "waiting", "running", "started"].includes(task.status)),
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
              relatedProjectMemory: context.related_project_memory,
              documentInventory: context.documents,
              workPlan: context.tasks.map((task) => ({
                ...task,
                label: localizedOffroadTaskLabel(task.taskId, task.label, context.locale),
              })),
              artifacts: context.artifacts,
              requestRoute: route,
              executionRoute,
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

function buildDeterministicCapabilityClarification(
  context: AgentContext,
  route: WorkspaceExecutionRoute,
): AgentOperationBriefResponse | null {
  const capabilityOnly = route.action === "collect_required_context"
    && route.analysisScope === "origination_thesis"
    && route.requirements.length === 1
    && route.requirements[0] === "institution_capability_context";
  const researchAlreadyActive = context.tasks.some((task) => ["queued", "waiting", "running", "started"].includes(task.status));
  if (!capabilityOnly || !researchAlreadyActive) return null;
  return capabilityContextResponse(context.locale, companyProfileString(context.company_profile, "name", "companyName")
    ?? explicitCompanyNameFromConversation(context));
}

function capabilityContextResponse(locale: "pt-BR" | "en-US", companyName: string | null): AgentOperationBriefResponse {
  const company = companyName ?? (locale === "pt-BR" ? "a companhia" : "the company");
  return {
    state: "asking",
    reply: locale === "pt-BR"
      ? `A pesquisa sobre ${company} continua avançando. Como este é um primeiro contato, quero calibrar as alternativas ao que sua instituição realmente consegue levar adiante: vocês podem emprestar com balanço próprio, estruturar e distribuir, atuar apenas como advisor, investir, ou combinar essas capacidades? Não preciso ainda de uma lista de produtos; esse enquadramento evita sugerir uma solução que dependa de uma capacidade que vocês não têm. Se preferir não informar ou ainda não souber, sigo com uma análise neutra e separo os caminhos por modelo de execução.`
      : `Research on ${company} is continuing. Because this is a first contact, I want to calibrate the alternatives to what your institution can actually advance: can you lend from your balance sheet, structure and distribute, act only as an advisor, invest, or combine those capabilities? I do not need a product catalogue yet; this framing prevents proposing a path that depends on a capability you do not have. If you would rather not share or do not yet know, I will continue with a neutral analysis and separate the alternatives by execution model.`,
    clarification: {
      question: locale === "pt-BR" ? "Como sua instituição pode atuar nesta oportunidade?" : "How can your institution act on this opportunity?",
      whyItMatters: locale === "pt-BR"
        ? "A mesma tese pode exigir balanço, distribuição, advisory ou capital de terceiros; saber seu papel torna a recomendação executável."
        : "The same thesis may require balance sheet, distribution, advisory or third-party capital; knowing your role makes the recommendation executable.",
      answerKind: "text",
      choices: [],
      priority: "required_now",
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
      return {state: "idle", reply: capabilityPrompt.reply, activation};
    }
    const history = prior
      ? locale === "pt-BR"
        ? ` Encontrei também o projeto “${prior.projectName}”, atualizado em ${prior.updatedAt.slice(0, 10)}; diga se esta reunião atualiza aquela tese ou abre uma agenda nova.`
        : ` I also found the “${prior.projectName}” project, updated on ${prior.updatedAt.slice(0, 10)}; tell me whether this meeting updates that thesis or starts a new agenda.`
      : "";
    return {
      state: "idle",
      reply: locale === "pt-BR"
        ? `Entendi o pedido para ${activation.company.name}. Já iniciei em paralelo a pesquisa pública sobre a companhia, o setor, o endividamento e as operações observadas.${history} Para calibrar o pitch, responda em uma única mensagem: (1) com quem será a reunião — por exemplo, CEO, CFO ou tesouraria; (2) o que você quer provocar — mercado de dívida, refinanciamento, alavancagem, expansão ou outra agenda; e (3) qual é hoje o relacionamento ou a exposição da sua instituição com a companhia. Esses pontos definem a profundidade, o ângulo e o que seria realmente novo ou executável para o interlocutor.`
        : `I understood the assignment for ${activation.company.name}. I have already started the public research on the company, sector, debt profile and observed transactions in parallel.${history} To calibrate the pitch, answer in one message: (1) who will attend — for example the CEO, CFO or treasury; (2) what you want to provoke — debt markets, refinancing, leverage, expansion or another agenda; and (3) your institution's current relationship or exposure to the company. These points determine the depth, angle and what would actually be new or actionable for the audience.`,
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
