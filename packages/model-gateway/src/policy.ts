import type {Effort, ModelRef, Provider, TaskKind} from "./types";
import {ModelGatewayError} from "./types";

/**
 * Model policy (P1 plan §15). Founder decision 18 Aug 2026: no Haiku anywhere;
 * Anthropic (Opus 5, Sonnet 5) and OpenAI (GPT-5.6 family) via API only.
 * Everything is configuration so evals can move a task to another model
 * without touching the pipeline.
 */
export const allowedModels: Record<Provider, readonly string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5"],
  openai: ["gpt-5.6-sol", "gpt-5.6-terra"],
};

/** Explicit denylist — a substring match so no variant slips in through an override. */
export const deniedModelPatterns: readonly RegExp[] = [/haiku/i, /mini/i, /nano/i, /luna/i, /gpt-4/i, /gpt-3/i, /o[134]-mini/i];

export type TaskPolicy = {
  primary: ModelRef;
  shadow?: ModelRef;
  fallback?: ModelRef;
  maxOutputTokens: number;
  timeoutMs: number;
};

const anthropic = (model: string, effort: Effort): ModelRef => ({provider: "anthropic", model, effort});
const openai = (model: string, effort: Effort): ModelRef => ({provider: "openai", model, effort});

export const defaultTaskPolicies: Record<TaskKind, TaskPolicy> = {
  classify_document: {primary: anthropic("claude-sonnet-5", "low"), shadow: openai("gpt-5.6-terra", "low"), fallback: openai("gpt-5.6-terra", "low"), maxOutputTokens: 4_000, timeoutMs: 60_000},
  locate_fields: {primary: anthropic("claude-sonnet-5", "low"), fallback: openai("gpt-5.6-terra", "low"), maxOutputTokens: 4_000, timeoutMs: 90_000},
  extract_fields: {primary: anthropic("claude-sonnet-5", "medium"), shadow: openai("gpt-5.6-terra", "medium"), fallback: anthropic("claude-opus-5", "medium"), maxOutputTokens: 16_000, timeoutMs: 240_000},
  extract_complex: {primary: anthropic("claude-opus-5", "high"), shadow: openai("gpt-5.6-sol", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 24_000, timeoutMs: 360_000},
  map_accounts: {primary: anthropic("claude-sonnet-5", "medium"), fallback: anthropic("claude-opus-5", "medium"), maxOutputTokens: 16_000, timeoutMs: 240_000},
  explain_exception: {primary: anthropic("claude-opus-5", "high"), shadow: openai("gpt-5.6-sol", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 4_000, timeoutMs: 180_000},
  case_brief: {primary: anthropic("claude-opus-5", "high"), shadow: openai("gpt-5.6-sol", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 32_000, timeoutMs: 600_000},
  write_output: {primary: anthropic("claude-opus-5", "high"), fallback: openai("gpt-5.6-sol", "high"), maxOutputTokens: 32_000, timeoutMs: 600_000},
  audit_evidence: {primary: openai("gpt-5.6-sol", "high"), fallback: anthropic("claude-opus-5", "high"), maxOutputTokens: 16_000, timeoutMs: 300_000},
  localize: {primary: anthropic("claude-opus-5", "medium"), fallback: openai("gpt-5.6-sol", "medium"), maxOutputTokens: 16_000, timeoutMs: 300_000},
};

export function assertModelAllowed(ref: {provider: Provider; model: string}): void {
  if (deniedModelPatterns.some((pattern) => pattern.test(ref.model))) {
    throw new ModelGatewayError(`model "${ref.model}" is denied by policy`, "model_not_allowed", ref);
  }
  if (!allowedModels[ref.provider]?.includes(ref.model)) {
    throw new ModelGatewayError(`model "${ref.model}" (${ref.provider}) is not in the allowlist`, "model_not_allowed", ref);
  }
}

export function resolveModel(task: TaskKind, policies: Record<TaskKind, TaskPolicy>, options: {override?: Partial<ModelRef> | undefined; useShadow?: boolean | undefined}): {primary: ModelRef; fallback?: ModelRef; policy: TaskPolicy} {
  const policy = policies[task];
  const base = options.useShadow && policy.shadow ? policy.shadow : policy.primary;
  const primary: ModelRef = {
    provider: options.override?.provider ?? base.provider,
    model: options.override?.model ?? base.model,
    effort: options.override?.effort ?? base.effort,
  };
  assertModelAllowed(primary);
  const fallback = policy.fallback && (policy.fallback.provider !== primary.provider || policy.fallback.model !== primary.model) ? policy.fallback : undefined;
  if (fallback) assertModelAllowed(fallback);
  return fallback ? {primary, fallback, policy} : {primary, policy};
}
