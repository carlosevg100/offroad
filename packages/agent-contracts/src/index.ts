import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export * from "./work-system";

export const workspaceRequestIntentSchema = z.enum([
  "explain",
  "inspect",
  "simulate",
  "propose_change",
  "approve",
  "compile",
  "authorize_external",
  "clarify",
]);
export type WorkspaceRequestIntent = z.infer<typeof workspaceRequestIntentSchema>;

export const workspaceRequestScopeSchema = z.enum(["knowledge", "case", "market"]);
export type WorkspaceRequestScope = z.infer<typeof workspaceRequestScopeSchema>;

export const workspaceRequestEffectSchema = z.enum(["none", "proposal", "commit", "external"]);
export type WorkspaceRequestEffect = z.infer<typeof workspaceRequestEffectSchema>;

export const workspaceRequestSurfaceSchema = z.enum([
  "knowledge",
  "operation_brief",
  "case_workspace",
  "materials",
  "market",
]);
export type WorkspaceRequestSurface = z.infer<typeof workspaceRequestSurfaceSchema>;

export const workspaceRequestRouteSchema = z.object({
  intent: workspaceRequestIntentSchema,
  scope: workspaceRequestScopeSchema,
  effect: workspaceRequestEffectSchema,
  confidence: z.enum(["rule", "ambiguous"]),
  requiresExplicitConfirmation: z.boolean(),
  allowedOnCurrentSurface: z.boolean(),
  reasonCode: z.string().regex(/^[a-z0-9_]+$/),
});
export type WorkspaceRequestRoute = z.infer<typeof workspaceRequestRouteSchema>;

export const executableWorkspaceJobSchema = z.enum([
  "company_debt_view",
  "origination_thesis",
  "capital_planning",
  "structure_from_documents",
  "review_existing_operation",
  "prepare_materials_and_process",
]);
export type ExecutableWorkspaceJob = z.infer<typeof executableWorkspaceJobSchema>;

export const workspaceExecutionRouteSchema = z.object({
  action: z.enum([
    "queue_specialized_job",
    "continue_private_case",
    "collect_required_context",
    "conversation_only",
  ]),
  analysisScope: executableWorkspaceJobSchema.nullable(),
  requirements: z.array(z.enum([
    "company_identity",
    "assignment_context",
    "capital_intent",
    "meeting_audience",
    "desired_outcome",
    "relationship_context",
  ])).max(6),
  reasonCode: z.string().regex(/^[a-z0-9_]+$/),
  modelRoutingCalls: z.literal(0),
});
export type WorkspaceExecutionRoute = z.infer<typeof workspaceExecutionRouteSchema>;

/**
 * Decides whether a conversational turn may enter an already released TaskSpec executor.
 * This router is deliberately deterministic and costs zero model calls. The model may help
 * normalize user-stated context later, but it cannot select a different executor, broaden the
 * evidence basis or bypass a missing prerequisite.
 */
export function routeWorkspaceExecution(input: {
  entryJob?: string | null;
  accessBasis?: string | null;
  companyName?: string | null;
  documentCount: number;
  artifactTypes: string[];
  requestText: string;
  conversationText?: string;
  requestIntent?: WorkspaceRequestIntent;
  requestEffect?: WorkspaceRequestEffect;
}): WorkspaceExecutionRoute {
  const analysisScope = executableWorkspaceJobSchema.safeParse(input.entryJob);
  if (!analysisScope.success) {
    return workspaceExecutionRouteSchema.parse({
      action: "conversation_only",
      analysisScope: null,
      requirements: [],
      reasonCode: "executor_not_released",
      modelRoutingCalls: 0,
    });
  }

  if (input.requestEffect && input.requestEffect !== "none") {
    return workspaceExecutionRouteSchema.parse({
      action: "conversation_only",
      analysisScope: analysisScope.data,
      requirements: [],
      reasonCode: "governed_action_requires_exact_surface",
      modelRoutingCalls: 0,
    });
  }
  if (input.requestIntent === "simulate") {
    return workspaceExecutionRouteSchema.parse({
      action: "conversation_only",
      analysisScope: analysisScope.data,
      requirements: [],
      reasonCode: "hypothetical_requires_case_context",
      modelRoutingCalls: 0,
    });
  }

  if (input.accessBasis === "authorized_private" || input.documentCount > 0) {
    return workspaceExecutionRouteSchema.parse({
      action: "continue_private_case",
      analysisScope: analysisScope.data,
      requirements: [],
      reasonCode: "private_case_pipeline_active",
      modelRoutingCalls: 0,
    });
  }

  if (["structure_from_documents", "review_existing_operation", "prepare_materials_and_process"].includes(analysisScope.data)) {
    return workspaceExecutionRouteSchema.parse({
      action: "collect_required_context",
      analysisScope: analysisScope.data,
      requirements: ["assignment_context"],
      reasonCode: "private_case_context_required",
      modelRoutingCalls: 0,
    });
  }

  const finalArtifact = analysisScope.data === "company_debt_view"
    ? "company_debt_diagnostic"
    : analysisScope.data === "origination_thesis"
      ? "meeting_brief"
      : "alternative_map";
  if (input.artifactTypes.includes(finalArtifact)) {
    return workspaceExecutionRouteSchema.parse({
      action: "conversation_only",
      analysisScope: analysisScope.data,
      requirements: [],
      reasonCode: "specialized_work_product_exists",
      modelRoutingCalls: 0,
    });
  }

  const requirements: WorkspaceExecutionRoute["requirements"] = [];
  if (!input.companyName?.trim()) requirements.push("company_identity");
  if (analysisScope.data === "origination_thesis") {
    const corpus = `${input.conversationText ?? ""}\n${input.requestText}`.normalize("NFKC");
    if (!originationContextPatterns.audience.test(corpus)) requirements.push("meeting_audience");
    if (!originationContextPatterns.outcome.test(corpus)) requirements.push("desired_outcome");
    if (!originationContextPatterns.relationship.test(corpus)) requirements.push("relationship_context");
  }
  if (analysisScope.data === "capital_planning" && input.requestText.trim().length < 10) {
    requirements.push("capital_intent");
  }
  return workspaceExecutionRouteSchema.parse({
    action: requirements.length > 0 ? "collect_required_context" : "queue_specialized_job",
    analysisScope: analysisScope.data,
    requirements,
    reasonCode: requirements.length > 0 ? "specialized_context_incomplete" : "specialized_executor_ready",
    modelRoutingCalls: 0,
  });
}

const originationContextPatterns = {
  audience: /\b(ceo|cfo|chief\s+(?:executive|financial)|tesour(?:aria|eiro)|treasur(?:y|er)|ri\b|investor\s+relations|controladoria|controller|conselho|board|acionista|s[oó]cio|diretor(?:a)?|presidente|vice[- ]?presidente|vp\b)\b/i,
  outcome: /\b(refinanc|refi\b|along|liability|mercado\s+de\s+d[ií]vida|debt\s+market|alavancagem|estrutura\s+de\s+capital|capital\s+structure|capex|expans[aã]o|aquisi[cç][aã]o|m\s*&\s*a|capital\s+de\s+giro|working\s+capital|liquidez|dividend|reperfil|vencimentos?|maturit(?:y|ies)|covenants?|garantias?|pricing|emiss[aã]o|deb[eê]nture|bond)\b/i,
  relationship: /\b(relacionamento|relationship|exposi[cç][aã]o|exposure|credor|creditor|cr[eé]dito\s+(?:existente|atual)|linha\s+(?:existente|atual)|opera[cç][aã]o\s+(?:anterior|existente)|sem\s+relacionamento|nenhum\s+relacionamento|n[aã]o\s+temos\s+exposi[cç][aã]o|first\s+contact|primeiro\s+contato)\b/i,
} as const;

const patterns = {
  negatedGovernedAction: /(?:\b(?:n[aã]o|nao)\s+(?:aprovo|confirmo|aceito|envie|enviar|mande|mandar|contate|contatar|introduza|introduzir|apresente|apresentar|pode\s+seguir)\b|\b(?:do\s+not|don't|cannot|can't)\s+(?:approve|confirm|accept|send|contact|introduce|present|go\s+ahead)\b)/i,
  authorizeExternal: /(?:\b(?:enviar|envie|mandar|mande|introduzir|introduza|contatar|contate|abordar|aborde|send|introduce|contact|approach)\b.{0,140}\b(?:fundo|financiador|investidor|lender|fund|investor|destinat[aá]rio|recipient)\b|\b(?:apresentar|apresente|present)\b.{0,80}\b(?:ao|à|para\s+(?:o|a)|to)\b.{0,80}\b(?:fundo|financiador|investidor|lender|fund|investor)\b)/i,
  compile: /\b(gerar|gere|produzir|produza|montar|monte|compilar|compile|generate|prepare|preparar)\b.*\b(teaser|memo|memorando|term\s*sheet|modelo|model|material|pacote|package|data\s*room)\b/i,
  simulate: /\b(e\s+se|simular|simule|simula[cç][aã]o|cen[aá]rio|what\s+if|simulate|scenario)\b/i,
  approve: /\b(aprovo|aprovado|confirmo|confirmado|pode\s+seguir|de\s+acordo|aceito|approve|approved|confirm|confirmed|go\s+ahead)\b/i,
  proposeChange: /(?:\b(?:alterar|altere|mudar|mude|trocar|troque|atualizar|atualize|corrigir|corrija|aumentar|aumente|reduzir|reduza|change|update|replace|correct|increase|decrease|set)\b|agora\s+(?:e|é)(?:\s|$)|passou\s+para(?:\s|$))/i,
  explain: /\b(como\s+funciona|o\s+que\s+[eé]|qual\s+(?:a\s+)?diferen[cç]a|explique|por\s+que|how\s+does|what\s+is|difference|explain|why)\b/i,
  inspect: /\b(mostre|mostrar|consultar|consulte|status|situa[cç][aã]o|quais|qual\s+[eé]|onde|show|inspect|status|which|where)\b/i,
  marketScope: /\b(fundo|fidc|financeira|factor(?:ing|y)?|lender|financiador|investidor|mandato|mercado|shortlist|provider|fund|investor)\b/i,
  caseScope: /\b(companhia|empresa|opera[cç][aã]o|capta[cç][aã]o|caso|estrutura|prazo|valor|garantia|company|transaction|deal|case|structure|term|amount|collateral)\b/i,
} as const;

/**
 * A deterministic first line of defence between conversation and canonical state. It does not
 * pretend to understand every sentence. Ambiguity routes to clarification, and no route mutates
 * the case or performs an external action by itself.
 */
export function routeWorkspaceRequest(input: {
  message: string;
  surface: WorkspaceRequestSurface;
}): WorkspaceRequestRoute {
  const message = input.message.normalize("NFKC").trim();
  const scope: WorkspaceRequestScope = input.surface === "knowledge"
    ? "knowledge"
    : input.surface === "market" || patterns.marketScope.test(message)
      ? "market"
      : "case";

  const route = (
    intent: WorkspaceRequestIntent,
    effect: WorkspaceRequestEffect,
    reasonCode: string,
    allowedOnCurrentSurface: boolean,
    requiresExplicitConfirmation = effect === "commit" || effect === "external",
    confidence: WorkspaceRequestRoute["confidence"] = "rule",
  ): WorkspaceRequestRoute => workspaceRequestRouteSchema.parse({
    intent,
    scope,
    effect,
    confidence,
    requiresExplicitConfirmation,
    allowedOnCurrentSurface,
    reasonCode,
  });

  if (!message) return route("clarify", "none", "empty_request", true, false, "ambiguous");
  if (patterns.negatedGovernedAction.test(message)) {
    return route("clarify", "none", "negated_governed_action", true, false);
  }
  if (patterns.authorizeExternal.test(message)) {
    return route("authorize_external", "external", "external_action_language", input.surface === "market");
  }
  if (patterns.compile.test(message)) {
    return route("compile", "proposal", "artifact_language", input.surface === "materials" || input.surface === "case_workspace");
  }
  if (patterns.simulate.test(message)) return route("simulate", "none", "hypothetical_language", scope !== "knowledge", false);
  if (patterns.approve.test(message)) return route("approve", "commit", "approval_language", input.surface !== "knowledge");
  if (patterns.proposeChange.test(message)) return route("propose_change", "proposal", "change_language", input.surface !== "knowledge", false);
  if (patterns.explain.test(message)) return route("explain", "none", "explanation_language", true, false);
  if (patterns.inspect.test(message)) return route("inspect", "none", "inspection_language", true, false);
  return route("clarify", "none", "no_unambiguous_rule", true, false, "ambiguous");
}

export const agentStates = ["analyzing", "asking", "proposing", "assembling", "idle"] as const;
export const agentStateSchema = z.enum(agentStates);

export const agentEvidenceRefSchema = z.object({
  kind: z.enum(["user_statement", "document_anchor", "reconciled_fact", "calculation", "public_source", "procedure", "mandate_criterion"]),
  id: z.string().trim().min(1).max(300),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type AgentEvidenceRef = z.infer<typeof agentEvidenceRefSchema>;

export const operationBriefPatchPaths = [
  "/objective", "/requestedAmount", "/currency", "/urgency", "/requestedTermMonths",
  "/requestedGraceMonths", "/consequenceIfNotExecuted", "/sector", "/geography",
  "/instruments", "/collateralKinds", "/expectedRate",
] as const;
export const operationBriefPatchPathSchema = z.enum(operationBriefPatchPaths);
const setPatch = <TPath extends z.ZodLiteral<string>, TValue extends z.ZodType>(path: TPath, value: TValue) =>
  z.object({operation: z.literal("set"), path, value});
export const agentOperationBriefPatchSchema = z.discriminatedUnion("path", [
  setPatch(z.literal("/objective"), z.string().trim().min(1).max(4_000)),
  setPatch(z.literal("/requestedAmount"), z.number().positive().max(1_000_000_000_000)),
  setPatch(z.literal("/currency"), z.enum(["BRL", "USD", "EUR"])),
  setPatch(z.literal("/urgency"), z.enum(["up_to_3_months", "3_to_6_months", "6_to_12_months", "no_rush"])),
  setPatch(z.literal("/requestedTermMonths"), z.number().int().min(1).max(360)),
  setPatch(z.literal("/requestedGraceMonths"), z.number().int().min(0).max(120)),
  setPatch(z.literal("/consequenceIfNotExecuted"), z.string().trim().min(1).max(4_000)),
  setPatch(z.literal("/sector"), z.string().trim().min(1).max(120)),
  setPatch(z.literal("/geography"), z.string().regex(/^[A-Z]{2}$/)),
  setPatch(z.literal("/instruments"), z.array(z.enum([
    "debenture", "nota_comercial", "ccb", "cri", "cra", "fidc", "direct_loan",
    "receivables_purchase", "project_finance", "equity_kicker_debt",
  ])).max(10)),
  setPatch(z.literal("/collateralKinds"), z.array(z.enum([
    "recebiveis", "imovel", "equipamento", "estoque", "aval_fianca",
    "cessao_fiduciaria", "alienacao_fiduciaria_quotas", "conta_reserva", "quirografario",
  ])).max(9)),
  setPatch(z.literal("/expectedRate"), z.string().trim().min(1).max(80)),
]);
export type AgentOperationBriefPatch = z.infer<typeof agentOperationBriefPatchSchema>;

export const agentPatchSchema = z.object({
  operation: z.enum(["set", "append", "remove", "replace"]),
  path: z.string().regex(/^\/(?:[^/~]|~0|~1)+(?:\/(?:[^/~]|~0|~1)+)*$/),
  value: z.unknown().optional(),
  previousFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).superRefine((patch, context) => {
  if (patch.operation !== "remove" && patch.value === undefined) {
    context.addIssue({code: "custom", path: ["value"], message: "a mutating patch requires a proposed value"});
  }
  if (patch.operation === "remove" && patch.value !== undefined) {
    context.addIssue({code: "custom", path: ["value"], message: "a remove patch cannot carry a value"});
  }
});
export type AgentPatch = z.infer<typeof agentPatchSchema>;

export const agentChangeProposalSchema = z.object({
  schemaVersion: z.literal("2026.08.26-v1"),
  id: z.uuid(),
  caseId: z.uuid(),
  baseManifestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  target: z.enum([
    "company_profile",
    "operation_brief",
    "information_request",
    "case_claim",
    "structure_alternative",
    "material_section",
    "market_shortlist",
  ]),
  title: z.string().trim().min(3).max(180),
  rationale: z.string().trim().min(10).max(2_000),
  impactSummary: z.string().trim().min(3).max(1_000),
  patches: z.array(agentPatchSchema).min(1).max(20),
  evidence: z.array(agentEvidenceRefSchema).min(1).max(50),
  recompute: z.array(z.enum([
    "reconciliation", "metrics", "gaps", "structure", "red_flags", "claims",
    "materials", "language_conduct", "matching", "outcome",
  ])).max(10),
  proposedBy: z.enum(["user", "offroad_agent", "offroad_operator"]),
  proposedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  proposalFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((proposal, context) => {
  const onlyPublicContext = proposal.evidence.every((evidence) => evidence.kind === "public_source");
  const changesNumericValue = proposal.patches.some((patch) => containsNumber(patch.value));
  if (onlyPublicContext && changesNumericValue) {
    context.addIssue({
      code: "custom",
      path: ["evidence"],
      message: "public context alone cannot support a numerical change to the case",
    });
  }
});
export type AgentChangeProposal = z.infer<typeof agentChangeProposalSchema>;

export const agentClarificationSchema = z.object({
  schemaVersion: z.literal("2026.08.26-v1"),
  id: z.uuid(),
  caseId: z.uuid(),
  question: z.string().trim().min(5).max(1_000),
  whyItMatters: z.string().trim().min(5).max(1_000),
  answerKind: z.enum(["text", "number", "date", "choice", "document"]),
  choices: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  evidence: z.array(agentEvidenceRefSchema).max(50),
  priority: z.enum(["required_now", "high_value", "later"]),
});
export type AgentClarification = z.infer<typeof agentClarificationSchema>;

export const agentMessageRoleSchema = z.enum(["user", "assistant"]);
export const agentMessageStatusSchema = z.enum(["queued", "processing", "completed", "failed"]);

const workspaceActivationCompanySchema = z.object({
  name: z.string().trim().min(2).max(160),
  website: z.url().max(500).refine((value) => value.startsWith("https://"), {
    message: "website must use https",
  }).optional(),
});

/** A model may normalize only the context needed by the deterministic executor selected above. */
export const workspaceJobActivationSchema = z.discriminatedUnion("job", [
  z.object({
    job: z.literal("company_debt_view"),
    company: workspaceActivationCompanySchema,
    brief: z.object({
      focus: z.string().trim().max(3_000).optional(),
      knownContext: z.string().trim().max(5_000).optional(),
    }),
  }),
  z.object({
    job: z.literal("origination_thesis"),
    company: workspaceActivationCompanySchema,
    brief: z.object({
      meetingContext: z.string().trim().min(10).max(5_000),
      thesisToTest: z.string().trim().max(3_000).optional(),
      audience: z.string().trim().max(240).optional(),
      meetingDate: z.iso.date().optional(),
    }),
  }),
  z.object({
    job: z.literal("capital_planning"),
    company: workspaceActivationCompanySchema,
    brief: z.object({
      capitalIntent: z.string().trim().min(10).max(5_000),
      knownConstraints: z.string().trim().max(3_000).optional(),
      decisionContext: z.string().trim().max(3_000).optional(),
    }),
  }),
]);
export type WorkspaceJobActivation = z.infer<typeof workspaceJobActivationSchema>;

/**
 * The first executable Agent vertical is intentionally narrow. It may explain the current
 * operation brief, ask one useful question or propose direct-field edits. It cannot mutate the
 * case, write materials, choose investors or invent a nested patch language.
 */
export const agentOperationBriefResponseSchema = z.object({
  state: z.enum(["asking", "proposing", "idle"]),
  reply: z.string().trim().min(1).max(4_000),
  clarification: z.object({
    question: z.string().trim().min(5).max(1_000),
    whyItMatters: z.string().trim().min(5).max(1_000),
    answerKind: z.enum(["text", "number", "date", "choice"]),
    choices: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    priority: z.enum(["required_now", "high_value", "later"]),
  }).optional(),
  proposal: z.object({
    title: z.string().trim().min(3).max(180),
    rationale: z.string().trim().min(10).max(2_000),
    impactSummary: z.string().trim().min(3).max(1_000),
    patches: z.array(agentOperationBriefPatchSchema).min(1).max(12),
    recompute: z.array(z.enum([
      "reconciliation", "metrics", "gaps", "structure", "red_flags", "claims",
      "materials", "language_conduct", "matching", "outcome",
    ])).max(10),
  }).optional(),
  activation: workspaceJobActivationSchema.optional(),
}).superRefine((response, context) => {
  if (response.state === "asking" && !response.clarification) {
    context.addIssue({code: "custom", path: ["clarification"], message: "asking requires one clarification"});
  }
  if (response.state === "proposing" && !response.proposal) {
    context.addIssue({code: "custom", path: ["proposal"], message: "proposing requires a typed proposal"});
  }
  if (response.state !== "asking" && response.clarification) {
    context.addIssue({code: "custom", path: ["clarification"], message: "only asking may carry a clarification"});
  }
  if (response.state !== "proposing" && response.proposal) {
    context.addIssue({code: "custom", path: ["proposal"], message: "only proposing may carry a proposal"});
  }
  if (response.clarification && response.proposal) {
    context.addIssue({code: "custom", message: "one response cannot ask and propose at the same time"});
  }
  if (response.activation && response.state !== "idle") {
    context.addIssue({code: "custom", path: ["activation"], message: "activation must be an idle handoff"});
  }
  if (response.activation && (response.clarification || response.proposal)) {
    context.addIssue({code: "custom", path: ["activation"], message: "activation cannot carry a clarification or proposal"});
  }
});
export type AgentOperationBriefResponse = z.infer<typeof agentOperationBriefResponseSchema>;

export function createAgentChangeProposal(
  input: Omit<AgentChangeProposal, "schemaVersion" | "proposalFingerprint">,
): AgentChangeProposal {
  const payload = {...input, schemaVersion: "2026.08.26-v1" as const};
  return agentChangeProposalSchema.parse({...payload, proposalFingerprint: fingerprintJson(payload)});
}

export function proposalIsCurrent(proposal: AgentChangeProposal, input: {
  manifestFingerprint: string;
  now: Date;
}): boolean {
  return proposal.baseManifestFingerprint === input.manifestFingerprint
    && Date.parse(proposal.expiresAt) > input.now.getTime();
}

function containsNumber(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.some(containsNumber);
  if (value && typeof value === "object") return Object.values(value).some(containsNumber);
  return false;
}
