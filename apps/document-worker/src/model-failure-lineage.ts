import type {GatewayCallLog} from "@offroad/model-gateway";

/**
 * Content-free provider telemetry safe to persist with a failed job. It deliberately excludes
 * prompts, provider error messages and outputs while retaining enough information to distinguish
 * a timeout/transport failure from an invalid structured response or a refusal.
 */
export function summarizeModelAttempts(calls: GatewayCallLog[]) {
  return calls.map((call) => ({
    provider: call.provider,
    model: call.model,
    outcome: call.outcome,
    latencyMs: call.latencyMs,
    costStatus: call.costStatus,
    usedFallback: call.usedFallback,
    stopReason: call.stopReason,
    ...(call.providerError ? {providerError: call.providerError} : {}),
    ...(call.validationIssues ? {validationIssues: call.validationIssues} : {}),
  }));
}
