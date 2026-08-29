import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

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

const patterns = {
  authorizeExternal: /\b(enviar|envie|mandar|mande|apresentar|apresente|introduzir|introduza|contatar|contate|abordar|aborde|send|introduce|contact|approach)\b/i,
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
