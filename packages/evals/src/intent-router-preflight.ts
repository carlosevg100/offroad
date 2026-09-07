import {intentClassifierOutputSchema} from "@offroad/agent-contracts";
import {ModelGatewayError, type GatewayRequest, type ModelGateway, type ModelRef, type Provider} from "@offroad/model-gateway";

type IntentRouterRequest = Omit<GatewayRequest<typeof intentClassifierOutputSchema>, "model" | "allowFallback" | "metadata"> & {
  metadata?: Record<string, string>;
};

export type IntentRouterProviderPreflight = {
  provider: Provider;
  configuredModel: string;
  resolvedModel: string | null;
  passed: boolean;
  attemptCount: number;
  measuredCostUsd: number;
  conservativeExposureUsd: number;
  latencyMs: number;
  error: string | null;
};

export class IntentRouterProviderPreflightError extends Error {
  constructor(readonly results: IntentRouterProviderPreflight[]) {
    const failed = results.find(({passed}) => !passed);
    super(`intent_router_provider_preflight_failed:${failed?.provider ?? "unknown"}`);
    this.name = "IntentRouterProviderPreflightError";
  }
}

/**
 * Proves every configured route with the exact route_intent prompt/input/schema/output mode before
 * the paid 52-observation run starts. Fallback is disabled so one healthy provider cannot conceal
 * another provider's outage or contract rejection.
 */
export async function preflightIntentRouterProviders(
  gateway: ModelGateway,
  providers: readonly ModelRef[],
  request: IntentRouterRequest,
): Promise<IntentRouterProviderPreflight[]> {
  const uniqueProviders = providers.filter((ref, index, values) =>
    values.findIndex((candidate) => candidate.provider === ref.provider && candidate.model === ref.model && candidate.effort === ref.effort) === index);
  const results: IntentRouterProviderPreflight[] = [];

  for (const ref of uniqueProviders) {
    const before = gateway.spent();
    const startedAt = Date.now();
    try {
      const result = await gateway.complete({
        ...request,
        model: ref,
        allowFallback: false,
        metadata: {...request.metadata, surface: "intent_router_provider_preflight", provider: ref.provider},
      });
      const after = gateway.spent();
      results.push({
        provider: ref.provider,
        configuredModel: ref.model,
        resolvedModel: result.model,
        passed: result.provider === ref.provider,
        attemptCount: after.calls - before.calls,
        measuredCostUsd: after.costUsd - before.costUsd,
        conservativeExposureUsd: after.budgetExposureUsd - before.budgetExposureUsd,
        latencyMs: Date.now() - startedAt,
        error: result.provider === ref.provider ? null : "provider_route_mismatch",
      });
    } catch (cause) {
      const after = gateway.spent();
      results.push({
        provider: ref.provider,
        configuredModel: ref.model,
        resolvedModel: null,
        passed: false,
        attemptCount: after.calls - before.calls,
        measuredCostUsd: after.costUsd - before.costUsd,
        conservativeExposureUsd: after.budgetExposureUsd - before.budgetExposureUsd,
        latencyMs: Date.now() - startedAt,
        error: safeError(cause),
      });
    }
  }

  if (results.some(({passed}) => !passed)) throw new IntentRouterProviderPreflightError(results);
  return results;
}

function safeError(cause: unknown): string {
  if (cause instanceof ModelGatewayError) return `${cause.name}:${cause.code}`;
  if (cause instanceof Error) return `${cause.name}:unknown`.slice(0, 160);
  return "UnknownError:unknown";
}
