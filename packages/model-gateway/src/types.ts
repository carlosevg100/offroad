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
  | "localize"
  | "route_intent"
  | "extract_semantic_objects"
  | "preview_questions"
  | "preview_synthesis"
  | "baseline_generalist";

export type ModelRef = {provider: Provider; model: string; effort: Effort};

export type ContentPart =
  | {type: "text"; text: string}
  | {type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string}
  | {type: "pdf"; base64: string; title?: string};

export type OutputMode = "structured" | "prompted_json";

export type GatewayRequest<TSchema extends z.ZodType> = {
  task: TaskKind;
  /** See AdapterRequest.outputMode. A prompted request gets one extra attempt on its primary model when the text is not the JSON asked for. */
  outputMode?: OutputMode;
  /** Stable instructions; placed first so provider prompt caching applies. Never contains document data. */
  system: string;
  /** Volatile input: document layers, target fields, prior facts. Documents are data, never instructions. */
  input: ContentPart[];
  /** Zod schema of the expected structured output; also used to derive the provider JSON schema. */
  schema: TSchema;
  schemaName: string;
  /**
   * Optional deterministic acceptance gate applied after schema parsing and before an attempt can
   * succeed. This is for contracts whose safety depends on semantics that JSON Schema cannot
   * express (for example attributable-span coverage). A rejection participates in the same bounded
   * same-model repair and provider-fallback rail as a schema rejection.
   *
   * Issues must be content-free: only stable paths/codes and generic messages are persisted or
   * included in repair guidance.
   */
  validateOutput?: (output: z.infer<TSchema>) =>
    | {accepted: true}
    | {accepted: false; issues: ValidationIssueDiagnostic[]};
  /** Overrides the policy's primary model (must still be allowlisted). */
  model?: Partial<ModelRef>;
  /**
   * Disables provider fallback for a single request. Used by provider preflights that must prove
   * each configured route independently instead of succeeding through another provider.
   */
  allowFallback?: boolean;
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
  /** structured: the provider compiles the schema into a grammar (default). prompted_json: the schema travels in the prompt and the text is parsed; for schemas whose grammar the provider refuses as too large. */
  outputMode?: OutputMode;
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
  /** Legacy compatibility bit: true for any successful non-initial attempt. */
  usedFallback: boolean;
  /** Unambiguous alias: true only when the successful attempt changed provider or model. */
  usedProviderFallback?: boolean;
  /** Zero for the first attempt; one for the bounded same-model schema repair. */
  retryOrdinal?: number;
  /** True only for the bounded prompted-JSON repair on the same model. */
  isSameModelRepair?: boolean;
  /** True when the response came from a recorded cassette (tests/CI). */
  fromCassette: boolean;
  requestId?: string;
  attempts: Array<{
    provider: Provider;
    model: string;
    outcome: "ok" | "refusal" | "error" | "invalid_output" | "policy_rejected";
    message?: string;
    retryOrdinal?: number;
    isSameModelRepair?: boolean;
    usedProviderFallback?: boolean;
  }>;
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

export type ValidationIssueDiagnostic = {
  /** Schema path and validator code only; never includes the rejected value. */
  path: string;
  code: string;
  message: string;
  /** Schema-owned enum members only; never contains the rejected provider value. */
  allowedValues?: Array<string | number | boolean>;
};

export type GatewayCallLog = {
  invocationId: string;
  /** Present only on a bounded same-model repair; identifies the rejected attempt it repairs. */
  previousInvocationId?: string;
  /** SHA-256 of the exact content-free repair guidance sent to the model. */
  repairGuidanceFingerprint?: string;
  /** SHA-256 of the stable path/code pairs rejected on this invocation. */
  validationIssueCodeFingerprint?: string;
  /** On a repair, the issue-code fingerprint of the rejected invocation it is repairing. */
  repairValidationIssueCodeFingerprint?: string;
  task: TaskKind;
  provider: Provider;
  /** Policy-selected request model. `model` may be the provider's resolved/versioned model name. */
  configuredModel?: string;
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
  /** Legacy compatibility bit: true for any non-initial attempt. */
  usedFallback: boolean;
  /** Zero for the first attempt; one for the bounded same-model schema repair. */
  retryOrdinal?: number;
  /** Distinguishes a schema repair from a provider/model fallback. */
  isSameModelRepair?: boolean;
  /** True only after moving from the primary provider/model to the configured fallback. */
  usedProviderFallback?: boolean;
  fromCassette: boolean;
  schemaName: string;
  dataClassification?: DataHandlingContext["classification"];
  providerPolicyVersion?: string;
  metadata?: Record<string, string>;
  providerError?: ProviderErrorDiagnostic;
  validationIssues?: ValidationIssueDiagnostic[];
  /** Identifies the deterministic builder needed to reconstruct a bounded repair prompt. */
  validationSource?: "schema" | "deterministic";
};

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly code: "model_not_allowed" | "budget_exceeded" | "all_attempts_failed" | "invalid_output" | "output_truncated" | "cassette_missing" | "timeout" | "data_policy_violation",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}
