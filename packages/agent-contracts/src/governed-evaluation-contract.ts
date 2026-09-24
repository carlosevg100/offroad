import {z} from "zod";

/**
 * The governed evaluation contract, as `private.request_governed_evaluation_v1` accepts it: a
 * platform evaluation of one case version for one script, purpose `evaluation` only, provider
 * routes as read-only tools at a declared version, an integer budget with an expiry, and sources
 * as content hashes, never text or URLs. The database is the authority; this mirror lets the
 * worker refuse a malformed contract before any send and lets an author build one that the
 * database will accept. A parsed contract grants nothing.
 */
const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Lowercase UUID text, the only form the database pattern accepts. */
const identity = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
/** One to two hundred characters once the surrounding spaces are trimmed, as btrim counts them. */
const label = z.string().max(1000).refine((value) => {
  const trimmed = value.replace(/^ +| +$/g, "");
  return trimmed.length >= 1 && trimmed.length <= 200;
}, "label must hold one to two hundred characters");
const whole = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({offset: true});

export const governedEvaluationToolSchema = z.object({
  id: z.string().regex(/^provider:(openai|anthropic|perplexity|firecrawl):[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/),
  version: z.string().min(1).max(120),
  effect: z.literal("read_only"),
}).strict();
export type GovernedEvaluationTool = z.infer<typeof governedEvaluationToolSchema>;

export const governedEvaluationContractSchema = z.object({
  schemaVersion: z.literal("governed-evaluation-contract.v1"),
  executionId: identity,
  organizationId: identity,
  requestId: identity,
  processingRunId: identity,
  purpose: z.literal("evaluation"),
  audience: z.object({kind: z.literal("evaluation_panel"), caseId: label, caseVersion: label, scriptId: label}).strict(),
  tools: z.array(governedEvaluationToolSchema).min(1).max(32),
  budget: z.object({
    maxCostMicrousd: whole,
    maxModelCalls: whole.min(1),
    maxDurationMs: whole.min(1000),
    expiresAt: timestamp,
  }).strict(),
  inputs: z.object({fingerprint: hash, sources: z.array(z.object({contentHash: hash}).strict()).max(10000)}).strict(),
  requestedAt: timestamp,
}).strict().superRefine((value, context) => {
  if (new Set(value.tools.map((tool) => tool.id)).size !== value.tools.length) {
    context.addIssue({code: "custom", path: ["tools"], message: "each tool is declared once"});
  }
  if (new Set(value.inputs.sources.map((source) => source.contentHash)).size !== value.inputs.sources.length) {
    context.addIssue({code: "custom", path: ["inputs", "sources"], message: "each source is declared once"});
  }
  if (Date.parse(value.budget.expiresAt) <= Date.parse(value.requestedAt)) {
    context.addIssue({code: "custom", path: ["budget", "expiresAt"], message: "the budget expires after the request"});
  }
});
export type GovernedEvaluationContract = z.infer<typeof governedEvaluationContractSchema>;

/** The tool identity of one provider route, as a contract declares it and a reservation names it. */
export function governedEvaluationToolId(provider: string, model: string): string {
  return `provider:${provider}:${model}`;
}

export const governedEvaluationOutcomes = ["succeeded", "partial"] as const;
export type GovernedEvaluationOutcome = (typeof governedEvaluationOutcomes)[number];
/** The reasons the database records; success is `evaluated` and nothing else. */
export const governedEvaluationReasons = ["evaluated", "budget_exhausted", "operation_uncertain", "transport_denied", "evaluation_failed"] as const;
export type GovernedEvaluationReason = (typeof governedEvaluationReasons)[number];
export type GovernedEvaluationPartialReason = Exclude<GovernedEvaluationReason, "evaluated">;

/**
 * The bytes a partial evaluation publishes: its reason and nothing else, in canonical key order.
 * No output of a run that could not succeed survives into the result.
 */
export function governedEvaluationPartialResult(reason: GovernedEvaluationPartialReason): {reason: GovernedEvaluationPartialReason; status: "partial"} {
  return {reason, status: "partial"};
}
