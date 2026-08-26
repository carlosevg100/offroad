import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

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
