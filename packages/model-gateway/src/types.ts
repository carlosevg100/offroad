import type {z} from "zod";
import type {DataHandlingContext} from "./data-policy";

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
  | "structure_design"
  | "case_brief"
  | "preliminary_understanding"
  | "origination_thesis"
  | "company_debt_view"
  | "capital_planning"
  | "agent_operation_brief"
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
  /**
   * `off` for mechanical passes: "read this row and return these fields" has nothing to reason
   * about, and reasoning tokens bill at the output rate. Omitted means the provider default.
   */
  thinking?: "off";
  /** Required when provider data-policy enforcement is enabled. Never inferred from content. */
  dataHandling?: DataHandlingContext;
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
  thinking?: "off";
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
  attempts: Array<{provider: Provider; model: string; outcome: "ok" | "refusal" | "error" | "invalid_output" | "policy_rejected"; message?: string}>;
};

export type ProviderErrorDiagnostic = {
  /** Error class only; provider messages are deliberately never persisted. */
  name: string;
  /** HTTP status when exposed by the provider SDK. */
  status?: number;
  /** Machine-readable provider code/type only. */
  code?: string;
  type?: string;
};

export type GatewayCallLog = {
  invocationId: string;
  task: TaskKind;
  provider: Provider;
  model: string;
  effort: Effort;
  outcome: "ok" | "refusal" | "error" | "invalid_output" | "policy_rejected";
  promptFingerprint: string;
  inputFingerprint: string;
  outputFingerprint: string;
  usage: Usage;
  costUsd: number;
  /** `unknown` means the provider call failed before usage was returned; it is never "free". */
  costStatus: "measured" | "unknown" | "cassette" | "not_called";
  latencyMs: number;
  stopReason: StopReason;
  usedFallback: boolean;
  fromCassette: boolean;
  schemaName: string;
  dataClassification?: DataHandlingContext["classification"];
  providerPolicyVersion?: string;
  metadata?: Record<string, string>;
  providerError?: ProviderErrorDiagnostic;
};

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly code: "model_not_allowed" | "budget_exceeded" | "all_attempts_failed" | "invalid_output" | "cassette_missing" | "timeout" | "data_policy_violation",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}
