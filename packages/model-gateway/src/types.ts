import type {z} from "zod";

export type Provider = "anthropic" | "openai";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Task kinds of the P1 pipeline (plan §15). The policy maps each task to a
 * primary model, an optional shadow model (second opinion) and a fallback.
 */
export type TaskKind =
  | "classify_document"
  | "locate_fields"
  | "extract_fields"
  | "extract_complex"
  | "map_accounts"
  | "explain_exception"
  | "case_brief"
  | "write_output"
  | "audit_evidence"
  | "localize";

export type ModelRef = {provider: Provider; model: string; effort: Effort};

export type ContentPart =
  | {type: "text"; text: string}
  | {type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string}
  | {type: "pdf"; base64: string; title?: string};

export type GatewayRequest<TSchema extends z.ZodType> = {
  task: TaskKind;
  /** Stable instructions; placed first so provider prompt caching applies. Never contains document data. */
  system: string;
  /** Volatile input: document layers, target fields, prior facts. Documents are data, never instructions. */
  input: ContentPart[];
  /** Zod schema of the expected structured output; also used to derive the provider JSON schema. */
  schema: TSchema;
  schemaName: string;
  /** Overrides the policy's primary model (must still be allowlisted). */
  model?: Partial<ModelRef>;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Route to the policy's shadow model instead of the primary (second opinion). */
  useShadow?: boolean;
  /** Free-form correlation ids recorded with the call (never content). */
  metadata?: Record<string, string>;
  /** Cache key hint forwarded to providers that support prompt caching by key. */
  cacheKey?: string;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens?: number;
};

export type StopReason = "end" | "max_tokens" | "refusal" | "other";

export type AdapterRequest = {
  model: string;
  effort: Effort;
  system: string;
  input: ContentPart[];
  schema: z.ZodType;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs: number;
  cacheKey?: string;
  metadata?: Record<string, string>;
};

export type AdapterResponse = {
  /** Parsed JSON output (not yet validated against the zod schema). */
  output: unknown;
  rawText: string;
  usage: Usage;
  model: string;
  stopReason: StopReason;
  requestId?: string;
};

export interface ProviderAdapter {
  readonly provider: Provider;
  complete(request: AdapterRequest): Promise<AdapterResponse>;
}

export type GatewayResult<T> = {
  output: T;
  provider: Provider;
  model: string;
  effort: Effort;
  usage: Usage;
  costUsd: number;
  latencyMs: number;
  stopReason: StopReason;
  /** True when the primary model failed/refused and a fallback produced this result. */
  usedFallback: boolean;
  /** True when the response came from a recorded cassette (tests/CI). */
  fromCassette: boolean;
  requestId?: string;
  attempts: Array<{provider: Provider; model: string; outcome: "ok" | "refusal" | "error" | "invalid_output"; message?: string}>;
};

export type GatewayCallLog = {
  task: TaskKind;
  provider: Provider;
  model: string;
  effort: Effort;
  usage: Usage;
  costUsd: number;
  latencyMs: number;
  stopReason: StopReason;
  usedFallback: boolean;
  fromCassette: boolean;
  schemaName: string;
  metadata?: Record<string, string>;
};

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly code: "model_not_allowed" | "budget_exceeded" | "all_attempts_failed" | "invalid_output" | "cassette_missing" | "timeout",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}
