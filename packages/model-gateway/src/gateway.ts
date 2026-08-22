import {z} from "zod";
import {cassetteKey, type CassetteMode, type CassetteStore} from "./cassette";
import {defaultTaskPolicies, resolveModel, type TaskPolicy} from "./policy";
import {estimateCostUsd, listPrices, type ModelPrice} from "./pricing";
import {redactPersonalIdentifiers, type RedactionOptions} from "./redaction";
import {stripNulls} from "./adapters/openai";
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
  type TaskKind,
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
  /** Structured, content-free log of every call. */
  onCall?: (log: GatewayCallLog) => void;
  now?: () => number;
};

export type ModelGateway = {
  complete<TSchema extends z.ZodType>(request: GatewayRequest<TSchema>): Promise<GatewayResult<z.infer<TSchema>>>;
  spent(): {costUsd: number; calls: number};
};

export function createModelGateway(config: ModelGatewayConfig): ModelGateway {
  const policies = config.policies ?? defaultTaskPolicies;
  const prices = config.prices ?? listPrices;
  const now = config.now ?? (() => Date.now());
  const spent = {costUsd: 0, calls: 0};

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
    if (config.budget?.maxCalls !== undefined && spent.calls >= config.budget.maxCalls) {
      throw new ModelGatewayError(`call budget exhausted (${spent.calls}/${config.budget.maxCalls})`, "budget_exceeded", spent);
    }
    if (config.budget?.maxCostUsd !== undefined && spent.costUsd >= config.budget.maxCostUsd) {
      throw new ModelGatewayError(`cost budget exhausted (${spent.costUsd.toFixed(4)}/${config.budget.maxCostUsd})`, "budget_exceeded", spent);
    }

    const input = config.redaction === false ? request.input : redactParts(request.input, config.redaction ?? {});
    const schemaJson = z.toJSONSchema(request.schema);
    const attempts: GatewayResult<unknown>["attempts"] = [];
    const candidates: ModelRef[] = fallback ? [primary, fallback] : [primary];

    for (const [index, ref] of candidates.entries()) {
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
        attempts.push({provider: ref.provider, model: ref.model, outcome: "error", message: errorMessage(error)});
        continue;
      }

      const latencyMs = now() - startedAt;
      const costUsd = fromCassette ? 0 : estimateCostUsd(ref.model, response.usage, prices);
      spent.costUsd += costUsd;
      spent.calls += fromCassette ? 0 : 1;

      if (response.stopReason === "refusal") {
        attempts.push({provider: ref.provider, model: ref.model, outcome: "refusal"});
        emit(config, {request, ref, response, costUsd, latencyMs, usedFallback: index > 0, fromCassette});
        continue;
      }

      const parsed = request.schema.safeParse(stripNulls(response.output));
      if (!parsed.success) {
        attempts.push({provider: ref.provider, model: ref.model, outcome: "invalid_output", message: parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")});
        emit(config, {request, ref, response, costUsd, latencyMs, usedFallback: index > 0, fromCassette});
        continue;
      }

      attempts.push({provider: ref.provider, model: ref.model, outcome: "ok"});
      emit(config, {request, ref, response, costUsd, latencyMs, usedFallback: index > 0, fromCassette});
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

    throw new ModelGatewayError(`all model attempts failed for task "${request.task}"`, "all_attempts_failed", attempts);
  };

  return {complete, spent: () => ({...spent})};
}

function redactParts(parts: ContentPart[], options: RedactionOptions): ContentPart[] {
  return parts.map((part) => (part.type === "text" ? {type: "text", text: redactPersonalIdentifiers(part.text, options).text} : part));
}

function emit(
  config: ModelGatewayConfig,
  entry: {request: GatewayRequest<z.ZodType>; ref: ModelRef; response: AdapterResponse; costUsd: number; latencyMs: number; usedFallback: boolean; fromCassette: boolean},
): void {
  if (!config.onCall) return;
  const log: GatewayCallLog = {
    task: entry.request.task,
    provider: entry.ref.provider,
    model: entry.response.model || entry.ref.model,
    effort: entry.ref.effort,
    usage: entry.response.usage,
    costUsd: entry.costUsd,
    latencyMs: entry.latencyMs,
    stopReason: entry.response.stopReason,
    usedFallback: entry.usedFallback,
    fromCassette: entry.fromCassette,
    schemaName: entry.request.schemaName,
  };
  if (entry.request.metadata) log.metadata = entry.request.metadata;
  config.onCall(log);
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
