import type {Effort, ModelRef, Provider, TaskKind} from "./types";
import {ModelGatewayError} from "./types";

/**
 * Model policy (P1 plan §15). Two founder decisions shape it (18 Aug 2026):
 * 1. **No Haiku, no cheap sub-tiers** on any production path — the quality bar is
 *    the product.
 * 2. **Do not use a stronger model than necessary**: extraction runs on the
 *    cheapest *current-generation* model that clears the eval thresholds and
 *    escalates only on evidence (unverified anchors, conflicts, invalid output);
 *    reasoning/writing runs on the strong tier.
 *
 * Everything here is configuration, so the evals sweep can move a task to another
 * model without touching the pipeline.
 */

/** Models allowed on production paths. */
export const allowedModels: Record<Provider, readonly string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5"],
  openai: ["gpt-5.6-sol", "gpt-5.6-terra"],
};

/**
 * Never usable, in any context, not even in an evals sweep: the tiers the founder
 * judged below the bar for a credit product.
 */
export const deniedModelPatterns: readonly RegExp[] = [/haiku/i, /mini/i, /nano/i];

/**
 * Models an evals sweep may exercise to prove or disprove that a cheaper option
 * is enough (P1 plan §15.1). They are **not** allowed in production: reaching them
 * requires `experimentalModels` on the gateway config, which only the evals CLI sets.
 */
export const sweepCandidateModels: Record<Provider, readonly string[]> = {
  anthropic: ["claude-sonnet-4-6"],
  openai: ["gpt-5.6-luna", "gpt-4.1", "gpt-4o"],
};

export type TaskPolicy = {
  primary: ModelRef;
  shadow?: ModelRef;
  fallback?: ModelRef;
  /**
   * Cheap → strong ladder for this task. The pipeline calls the gateway again with
   * the next step when the verifier reports weak evidence for a material document
   * (P1 plan §7.7); it never escalates because a value "looks wrong".
   */
  escalation?: ModelRef[];
  maxOutputTokens: number;
  timeoutMs: number;
};

const anthropic = (model: string, effort: Effort): ModelRef => ({provider: "anthropic", model, effort});
const openai = (model: string, effort: Effort): ModelRef => ({provider: "openai", model, effort});

export const defaultTaskPolicies: Record<TaskKind, TaskPolicy> = {
  classify_document: {primary: openai("gpt-5.6-terra", "low"), shadow: anthropic("claude-sonnet-5", "low"), fallback: anthropic("claude-sonnet-5", "low"), maxOutputTokens: 4_000, timeoutMs: 60_000},
  locate_fields: {primary: openai("gpt-5.6-terra", "low"), fallback: anthropic("claude-sonnet-5", "low"), maxOutputTokens: 4_000, timeoutMs: 90_000},
  extract_fields: {
    primary: anthropic("claude-sonnet-5", "medium"),
    shadow: openai("gpt-5.6-terra", "medium"),
    fallback: openai("gpt-5.6-terra", "medium"),
    escalation: [anthropic("claude-sonnet-5", "medium"), anthropic("claude-opus-5", "high"), openai("gpt-5.6-sol", "high")],
    // Extraction is evidence enumeration, not long-form writing. The previous 16k ceiling
    // doubled both worst-case exposure and the preflight reservation without improving the
    // measured documents; bounded chunks and table passes fit inside 8k.
    maxOutputTokens: 8_000,
    timeoutMs: 240_000,
  },
  extract_complex: {
    primary: anthropic("claude-opus-5", "high"),
    shadow: openai("gpt-5.6-sol", "high"),
    fallback: openai("gpt-5.6-sol", "high"),
    escalation: [anthropic("claude-opus-5", "high"), anthropic("claude-opus-5", "max")],
    maxOutputTokens: 24_000,
    timeoutMs: 360_000,
  },
  map_accounts: {primary: anthropic("claude-sonnet-5", "medium"), fallback: anthropic("claude-opus-5", "medium"), escalation: [anthropic("claude-sonnet-5", "medium"), anthropic("claude-opus-5", "high")], maxOutputTokens: 16_000, timeoutMs: 240_000},
  explain_exception: {primary: anthropic("claude-opus-5", "high"), shadow: openai("gpt-5.6-sol", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 4_000, timeoutMs: 180_000},
  structure_design: {primary: anthropic("claude-opus-5", "high"), shadow: openai("gpt-5.6-sol", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 8_000, timeoutMs: 300_000},
  case_brief: {primary: anthropic("claude-opus-5", "high"), shadow: openai("gpt-5.6-sol", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 32_000, timeoutMs: 600_000},
  preliminary_understanding: {primary: anthropic("claude-sonnet-5", "medium"), shadow: openai("gpt-5.6-terra", "medium"), fallback: openai("gpt-5.6-terra", "medium"), maxOutputTokens: 8_000, timeoutMs: 180_000},
  // This is the customer-facing senior-banker synthesis. A production gold test showed Terra
  // exhausting the former 8k ceiling before it could close the structured object, while the
  // Anthropic fallback rejected that large schema. A production run then showed Sol exhausting
  // 16k with reasoning before closing the JSON, while Terra completed the same schema. Keep both
  // production attempts on OpenAI and give the strongest route enough headroom to close the
  // governed object; the prompt still targets a concise customer-facing readout below 10k.
  origination_thesis: {primary: openai("gpt-5.6-sol", "high"), shadow: openai("gpt-5.6-terra", "high"), fallback: openai("gpt-5.6-terra", "high"), maxOutputTokens: 24_000, timeoutMs: 360_000},
  company_debt_view: {primary: anthropic("claude-sonnet-5", "medium"), shadow: openai("gpt-5.6-terra", "medium"), fallback: openai("gpt-5.6-terra", "medium"), maxOutputTokens: 8_000, timeoutMs: 240_000},
  capital_planning: {primary: anthropic("claude-sonnet-5", "medium"), shadow: openai("gpt-5.6-terra", "medium"), fallback: openai("gpt-5.6-terra", "medium"), maxOutputTokens: 8_000, timeoutMs: 240_000},
  agent_operation_brief: {primary: anthropic("claude-sonnet-5", "medium"), shadow: openai("gpt-5.6-sol", "medium"), fallback: openai("gpt-5.6-sol", "medium"), maxOutputTokens: 6_000, timeoutMs: 180_000},
  write_output: {primary: anthropic("claude-opus-5", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 32_000, timeoutMs: 600_000},
  audit_evidence: {primary: openai("gpt-5.6-sol", "high"), fallback: anthropic("claude-opus-5", "high"), maxOutputTokens: 16_000, timeoutMs: 300_000},
  localize: {primary: anthropic("claude-opus-5", "medium"), fallback: openai("gpt-5.6-sol", "medium"), maxOutputTokens: 16_000, timeoutMs: 300_000},
  // Shadow classification of a turn into an Intent Envelope. Cheap, structured, never on the answer path.
  route_intent: {primary: anthropic("claude-sonnet-5", "low"), shadow: openai("gpt-5.6-terra", "low"), fallback: openai("gpt-5.6-terra", "low"), maxOutputTokens: 4_000, timeoutMs: 60_000},
};

export type AllowOptions = {
  /** Extra models the caller may use (evals sweep only); the denylist still applies. */
  experimentalModels?: readonly string[] | undefined;
};

export function assertModelAllowed(ref: {provider: Provider; model: string}, options: AllowOptions = {}): void {
  if (deniedModelPatterns.some((pattern) => pattern.test(ref.model))) {
    throw new ModelGatewayError(`model "${ref.model}" is denied by policy and can never be used`, "model_not_allowed", ref);
  }
  if (allowedModels[ref.provider]?.includes(ref.model)) return;
  if (options.experimentalModels?.includes(ref.model)) return;
  throw new ModelGatewayError(`model "${ref.model}" (${ref.provider}) is not in the production allowlist`, "model_not_allowed", ref);
}

export function resolveModel(
  task: TaskKind,
  policies: Record<TaskKind, TaskPolicy>,
  options: {override?: Partial<ModelRef> | undefined; useShadow?: boolean | undefined} & AllowOptions,
): {primary: ModelRef; fallback?: ModelRef; policy: TaskPolicy} {
  const policy = policies[task];
  const base = options.useShadow && policy.shadow ? policy.shadow : policy.primary;
  const primary: ModelRef = {
    provider: options.override?.provider ?? base.provider,
    model: options.override?.model ?? base.model,
    effort: options.override?.effort ?? base.effort,
  };
  assertModelAllowed(primary, options);
  const fallback = policy.fallback && (policy.fallback.provider !== primary.provider || policy.fallback.model !== primary.model) ? policy.fallback : undefined;
  if (fallback) assertModelAllowed(fallback, options);
  return fallback ? {primary, fallback, policy} : {primary, policy};
}

/** Why the pipeline asked for a stronger model. Recorded on the run for the flywheel. */
export type EscalationReason = "unverified_anchors" | "low_confidence" | "shadow_disagreement" | "invalid_output" | "open_conflict";

/**
 * Next step of the ladder for a task, or `undefined` when the strongest step already
 * ran. Comparison is by provider+model+effort so `(opus-5, high) → (opus-5, max)` works.
 */
export function nextEscalation(task: TaskKind, current: ModelRef, policies: Record<TaskKind, TaskPolicy> = defaultTaskPolicies): ModelRef | undefined {
  const ladder = policies[task].escalation;
  if (!ladder || ladder.length === 0) return undefined;
  const index = ladder.findIndex((step) => step.provider === current.provider && step.model === current.model && step.effort === current.effort);
  if (index < 0) return ladder[0];
  return ladder[index + 1];
}
