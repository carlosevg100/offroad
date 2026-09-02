import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import {cassetteKey, type CassetteMode, type CassetteStore} from "./cassette";
import {defaultTaskPolicies, resolveModel, type TaskPolicy} from "./policy";
import {estimateCostUsd, estimateInputTokens, listPrices, type ModelPrice} from "./pricing";
import {redactPersonalIdentifiers, type RedactionOptions} from "./redaction";
import {stripNulls} from "./adapters/openai";
import {evaluateProviderDataPolicy, type ProviderDataAssurance} from "./data-policy";
import {
  ModelGatewayError,
  type AdapterRequest,
  type AdapterResponse,
  type ContentPart,
  type GatewayCallLog,
  type GatewayRequest,
  type GatewayResult,
  type ModelRef,
  type Provider,
  type ProviderAdapter,
  type ProviderErrorDiagnostic,
  type TaskKind,
  type ValidationIssueDiagnostic,
} from "./types";

export type ModelGatewayConfig = {
  adapters: Partial<Record<Provider, ProviderAdapter>>;
  policies?: Record<TaskKind, TaskPolicy>;
  prices?: Record<string, ModelPrice>;
  cassette?: {mode: CassetteMode; store: CassetteStore};
  /** `false` disables minimization (only for tasks whose object is the identifier itself). */
  redaction?: RedactionOptions | false;
  /** Per-gateway-instance ceilings (one instance per processing run). */
  budget?: {maxCostUsd?: number; maxCalls?: number};
  /**
   * Extra models this gateway instance may use, beyond the production allowlist.
   * Only the evals sweep sets it (P1 plan §15.1); the denylist still applies.
   */
  experimentalModels?: readonly string[];
  /** Off by default until current vendor contracts are entered; when on, every route fails closed. */
  providerDataPolicy?: {
    enforce: boolean;
    assurances: Partial<Record<Provider, ProviderDataAssurance>>;
  };
  /** Structured, content-free log of every call. */
  onCall?: (log: GatewayCallLog) => void;
  now?: () => number;
};

export type ModelGateway = {
  complete<TSchema extends z.ZodType>(request: GatewayRequest<TSchema>): Promise<GatewayResult<z.infer<TSchema>>>;
  spent(): {costUsd: number; calls: number; unknownCostCalls: number; budgetExposureUsd: number};
};

// OpenAI documents a 10% uplift for regional processing. Reserving that margin before a call
// keeps the budget valid regardless of whether a deployment uses global or regional routing;
// the ledger still records the provider-reported token estimate without inventing a surcharge.
const PREFLIGHT_PRICE_SAFETY_FACTOR = 1.1;

export function createModelGateway(config: ModelGatewayConfig): ModelGateway {
  const policies = config.policies ?? defaultTaskPolicies;
  const prices = config.prices ?? listPrices;
  const now = config.now ?? (() => Date.now());
  const spent = {costUsd: 0, calls: 0, unknownCostCalls: 0};
  // Budget exposure is deliberately more conservative than the billing estimate. A provider
  // error can happen after tokens were consumed but before usage reaches us; that call keeps
  // its preflight reservation instead of being treated as free.
  let budgetExposureUsd = 0;

  const adapterFor = (provider: Provider): ProviderAdapter => {
    const adapter = config.adapters[provider];
    if (!adapter) throw new ModelGatewayError(`no adapter configured for provider "${provider}"`, "model_not_allowed", {provider});
    return adapter;
  };

  const complete = async <TSchema extends z.ZodType>(request: GatewayRequest<TSchema>): Promise<GatewayResult<z.infer<TSchema>>> => {
    const {primary, fallback, policy} = resolveModel(request.task, policies, {
      override: request.model,
      useShadow: request.useShadow,
      experimentalModels: config.experimentalModels,
    });
    const input = config.redaction === false ? request.input : redactParts(request.input, config.redaction ?? {});
    const schemaJson = z.toJSONSchema(request.schema);
    const promptFingerprint = fingerprint({system: request.system, schemaName: request.schemaName, schema: schemaJson});
    const inputFingerprint = fingerprint(input);
    const attempts: GatewayResult<unknown>["attempts"] = [];
    const candidates: ModelRef[] = fallback ? [primary, fallback] : [primary];
    let policyRejected = 0;

    for (const [index, ref] of candidates.entries()) {
      let providerPolicyVersion: string | undefined;
      if (config.providerDataPolicy?.enforce) {
        if (!request.dataHandling) {
          throw new ModelGatewayError("data handling context is required when provider policy enforcement is enabled", "data_policy_violation", {
            task: request.task,
          });
        }
        const policyDecision = evaluateProviderDataPolicy({
          provider: ref.provider,
          context: request.dataHandling,
          assurance: config.providerDataPolicy.assurances[ref.provider],
          now: new Date(now()),
        });
        providerPolicyVersion = policyDecision.policyVersion ?? undefined;
        if (!policyDecision.allowed) {
          policyRejected += 1;
          attempts.push({provider: ref.provider, model: ref.model, outcome: "policy_rejected", message: policyDecision.reasons.join(",")});
          emit(config, {
            request,
            ref,
            costUsd: 0,
            latencyMs: 0,
            usedFallback: index > 0,
            fromCassette: false,
            outcome: "policy_rejected",
            promptFingerprint,
            inputFingerprint,
            outputFingerprint: fingerprint({outcome: "policy_rejected", reasons: policyDecision.reasons}),
            notCalled: true,
            providerPolicyVersion,
          });
          continue;
        }
      }
      if (config.budget?.maxCalls !== undefined && spent.calls >= config.budget.maxCalls) {
        throw new ModelGatewayError(`call budget exhausted (${spent.calls}/${config.budget.maxCalls})`, "budget_exceeded", {...spent, exposureUsd: budgetExposureUsd});
      }
      const adapterRequest: AdapterRequest = {
        model: ref.model,
        effort: ref.effort,
        system: request.system,
        input,
        schema: request.schema,
        schemaName: request.schemaName,
        maxOutputTokens: request.maxOutputTokens ?? policy.maxOutputTokens,
        timeoutMs: request.timeoutMs ?? policy.timeoutMs,
      };
      if (request.cacheKey) adapterRequest.cacheKey = request.cacheKey;
      if (request.thinking) adapterRequest.thinking = request.thinking;
      if (request.metadata) adapterRequest.metadata = request.metadata;

      // Refuse before the provider call, not after it. The old check only looked at already
      // spent dollars, so a single large request could cross the ceiling and be billed in full.
      const inputTokens = adapterRequest.input.reduce((total, part) => total + (part.type === "text" ? estimateInputTokens(part.text) : 0), 0);
      const reservationUsd = estimateCostUsd(ref.model, {
        inputTokens,
        cachedInputTokens: 0,
        outputTokens: adapterRequest.maxOutputTokens,
      }, prices) * PREFLIGHT_PRICE_SAFETY_FACTOR;
      if (config.budget?.maxCostUsd !== undefined && budgetExposureUsd + reservationUsd > config.budget.maxCostUsd) {
        throw new ModelGatewayError(
          `cost budget would be exceeded (${budgetExposureUsd.toFixed(4)} + ${reservationUsd.toFixed(4)} > ${config.budget.maxCostUsd})`,
          "budget_exceeded",
          {...spent, exposureUsd: budgetExposureUsd, reservationUsd},
        );
      }
      budgetExposureUsd += reservationUsd;

      const startedAt = now();
      let response: AdapterResponse | undefined;
      let fromCassette = false;
      const key = config.cassette ? cassetteKey(ref.provider, adapterRequest, schemaJson) : undefined;
      try {
        if (config.cassette && key && config.cassette.mode !== "off") {
          const stored = config.cassette.store.get(key);
          if (stored) {
            response = stored;
            fromCassette = true;
          } else if (config.cassette.mode === "replay") {
            throw new ModelGatewayError(`no cassette for ${ref.provider}/${ref.model} (${request.task}); record it before running in replay mode`, "cassette_missing", {key});
          }
        }
        if (!response) {
          response = await withTimeout(adapterFor(ref.provider).complete(adapterRequest), adapterRequest.timeoutMs);
          if (config.cassette && key && config.cassette.mode === "record") {
            config.cassette.store.set(key, response, {provider: ref.provider, model: ref.model, schemaName: request.schemaName});
          }
        }
      } catch (error) {
        if (error instanceof ModelGatewayError && error.code === "cassette_missing") throw error;
        const providerError = providerErrorDiagnostic(error);
        attempts.push({provider: ref.provider, model: ref.model, outcome: "error", message: errorMessage(error)});
        spent.calls += 1;
        spent.unknownCostCalls += 1;
        emit(config, {
          request,
          ref,
          costUsd: 0,
          latencyMs: now() - startedAt,
          usedFallback: index > 0,
          fromCassette: false,
          outcome: "error",
          promptFingerprint,
          inputFingerprint,
          outputFingerprint: fingerprint({outcome: "error", kind: error instanceof Error ? error.name : "unknown"}),
          providerPolicyVersion,
          providerError,
        });
        continue;
      }

      const latencyMs = now() - startedAt;
      const costUsd = fromCassette ? 0 : estimateCostUsd(ref.model, response.usage, prices);
      // Successful usage replaces the conservative reservation with the measured estimate.
      // Cassette calls release it entirely because no provider was invoked.
      budgetExposureUsd += costUsd - reservationUsd;
      spent.costUsd += costUsd;
      spent.calls += fromCassette ? 0 : 1;

      if (response.stopReason === "refusal") {
        attempts.push({provider: ref.provider, model: ref.model, outcome: "refusal"});
        emit(config, {request, ref, response, costUsd, latencyMs, usedFallback: index > 0, fromCassette, outcome: "refusal", promptFingerprint, inputFingerprint, outputFingerprint: fingerprint(response.output), providerPolicyVersion});
        continue;
      }

      const parsed = request.schema.safeParse(stripNulls(response.output));
      if (!parsed.success) {
        const validationIssues: ValidationIssueDiagnostic[] = parsed.error.issues.slice(0, 5).map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message.slice(0, 180),
        }));
        attempts.push({provider: ref.provider, model: ref.model, outcome: "invalid_output", message: parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")});
        emit(config, {request, ref, response, costUsd, latencyMs, usedFallback: index > 0, fromCassette, outcome: "invalid_output", promptFingerprint, inputFingerprint, outputFingerprint: fingerprint(response.output), providerPolicyVersion, validationIssues});
        continue;
      }

      attempts.push({provider: ref.provider, model: ref.model, outcome: "ok"});
      emit(config, {request, ref, response, costUsd, latencyMs, usedFallback: index > 0, fromCassette, outcome: "ok", promptFingerprint, inputFingerprint, outputFingerprint: fingerprint(parsed.data), providerPolicyVersion});
      const result: GatewayResult<z.infer<TSchema>> = {
        output: parsed.data as z.infer<TSchema>,
        provider: ref.provider,
        model: response.model || ref.model,
        effort: ref.effort,
        usage: response.usage,
        costUsd,
        latencyMs,
        stopReason: response.stopReason,
        usedFallback: index > 0,
        fromCassette,
        attempts,
      };
      if (response.requestId) result.requestId = response.requestId;
      return result;
    }

    if (policyRejected === candidates.length) {
      throw new ModelGatewayError(`no provider satisfies the data policy for task "${request.task}"`, "data_policy_violation", attempts);
    }
    throw new ModelGatewayError(`all model attempts failed for task "${request.task}"`, "all_attempts_failed", attempts);
  };

  return {complete, spent: () => ({...spent, budgetExposureUsd})};
}

function redactParts(parts: ContentPart[], options: RedactionOptions): ContentPart[] {
  return parts.map((part) => (part.type === "text" ? {type: "text", text: redactPersonalIdentifiers(part.text, options).text} : part));
}

function emit(
  config: ModelGatewayConfig,
  entry: {
    request: GatewayRequest<z.ZodType>;
    ref: ModelRef;
    response?: AdapterResponse;
    costUsd: number;
    latencyMs: number;
    usedFallback: boolean;
    fromCassette: boolean;
    outcome: GatewayCallLog["outcome"];
    promptFingerprint: string;
    inputFingerprint: string;
    outputFingerprint: string;
    notCalled?: boolean;
    providerPolicyVersion: string | undefined;
    providerError?: ProviderErrorDiagnostic;
    validationIssues?: ValidationIssueDiagnostic[];
  },
): void {
  if (!config.onCall) return;
  const usage = entry.response?.usage ?? {inputTokens: 0, outputTokens: 0, cachedInputTokens: 0};
  const log: GatewayCallLog = {
    invocationId: randomUUID(),
    task: entry.request.task,
    provider: entry.ref.provider,
    model: entry.response?.model || entry.ref.model,
    effort: entry.ref.effort,
    outcome: entry.outcome,
    promptFingerprint: entry.promptFingerprint,
    inputFingerprint: entry.inputFingerprint,
    outputFingerprint: entry.outputFingerprint,
    usage,
    costUsd: entry.costUsd,
    costStatus: entry.notCalled ? "not_called" : entry.fromCassette ? "cassette" : entry.response ? "measured" : "unknown",
    latencyMs: entry.latencyMs,
    stopReason: entry.response?.stopReason ?? "other",
    usedFallback: entry.usedFallback,
    fromCassette: entry.fromCassette,
    schemaName: entry.request.schemaName,
  };
  if (entry.request.dataHandling) log.dataClassification = entry.request.dataHandling.classification;
  if (entry.providerPolicyVersion) log.providerPolicyVersion = entry.providerPolicyVersion;
  if (entry.request.metadata) log.metadata = entry.request.metadata;
  if (entry.providerError) log.providerError = entry.providerError;
  if (entry.validationIssues) log.validationIssues = entry.validationIssues;
  config.onCall(log);
}

function providerErrorDiagnostic(error: unknown): ProviderErrorDiagnostic {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const nested = value.error && typeof value.error === "object" ? value.error as Record<string, unknown> : {};
  const diagnostic: ProviderErrorDiagnostic = {
    name: error instanceof Error ? error.name : "UnknownError",
  };
  const status = typeof value.status === "number" ? value.status : undefined;
  const code = firstShortString(value.code, nested.code);
  const type = firstShortString(value.type, nested.type);
  if (status !== undefined) diagnostic.status = status;
  if (code) diagnostic.code = code;
  if (type) diagnostic.type = type;
  return diagnostic;
}

function firstShortString(...values: unknown[]): string | undefined {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.length > 0);
  return typeof value === "string" ? value.slice(0, 80) : undefined;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ModelGatewayError(`provider call exceeded ${timeoutMs}ms`, "timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 300);
  return String(error).slice(0, 300);
}
