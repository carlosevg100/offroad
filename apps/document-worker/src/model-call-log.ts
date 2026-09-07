import type {GatewayCallLog} from "@offroad/model-gateway";

const providers = new Set(["anthropic", "openai"]);
const efforts = new Set(["low", "medium", "high", "xhigh", "max"]);
const outcomes = new Set(["ok", "refusal", "error", "invalid_output", "policy_rejected"]);
const costStatuses = new Set(["measured", "unknown", "cassette", "not_called"]);
const stopReasons = new Set(["end", "max_tokens", "refusal", "other"]);
const tasks = new Set([
  "classify_document", "locate_fields", "extract_fields", "extract_complex", "map_accounts",
  "explain_exception", "structure_design", "case_brief", "preliminary_understanding",
  "origination_thesis", "company_debt_view", "capital_planning", "agent_operation_brief",
  "write_output", "audit_evidence", "localize", "route_intent", "preview_questions",
  "preview_synthesis", "baseline_generalist",
]);

function closed(value: unknown, allowed: Set<string>): string {
  return typeof value === "string" && allowed.has(value) ? value : "unknown";
}

function boundedNumber(value: unknown, integer = false, maximum = 1_000_000_000): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum && (!integer || Number.isInteger(value))
    ? value
    : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function fingerprint(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null;
}

const gatewayFailureCodes = new Set([
  "model_not_allowed", "budget_exceeded", "all_attempts_failed", "invalid_output",
  "output_truncated", "cassette_missing", "timeout", "data_policy_violation",
]);

export function safeGatewayFailureCode(value: unknown): string {
  return closed(value, gatewayFailureCodes);
}

export function safeModelSpend(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    costUsd: boundedNumber(record.costUsd, false, 10_000),
    calls: boundedNumber(record.calls, true, 10_000),
    unknownCostCalls: boundedNumber(record.unknownCostCalls, true, 10_000),
    budgetExposureUsd: boundedNumber(record.budgetExposureUsd, false, 10_000),
  };
}

export const governedModelRoute = "governed_model_route" as const;

/**
 * Validates the telemetry delta for one governed model operation before it is allowed into a
 * reply, an envelope, a stage or an operational log. Invalid accounting fails closed instead of
 * being presented as zero or carrying a non-finite/provider-controlled value downstream.
 */
export function safeModelTurnTelemetry(
  before: unknown,
  after: unknown,
  latencyMs: unknown,
): {costUsd: number; calls: number; latencyMs: number} {
  const safeBefore = safeModelSpend(before);
  const safeAfter = safeModelSpend(after);
  const safeLatency = boundedNumber(latencyMs, true, 86_400_000);
  if (
    safeBefore.costUsd === null
    || safeAfter.costUsd === null
    || safeBefore.calls === null
    || safeAfter.calls === null
    || safeLatency === null
  ) throw new Error("invalid_model_telemetry");
  const costUsd = safeAfter.costUsd - safeBefore.costUsd;
  const calls = safeAfter.calls - safeBefore.calls;
  if (!Number.isFinite(costUsd) || costUsd < 0 || costUsd > 10_000 || !Number.isInteger(calls) || calls < 1 || calls > 32) {
    throw new Error("invalid_model_telemetry");
  }
  return {costUsd, calls, latencyMs: safeLatency};
}

function providerFailureCategory(call: GatewayCallLog): "timeout" | "rate_limit" | "auth" | "bad_request" | "server" | "network" | "unknown" {
  const status = boundedNumber(call.providerError?.status, true, 599);
  if (status !== null && status >= 100) {
    if (status === 408) return "timeout";
    if (status === 429) return "rate_limit";
    if (status === 401 || status === 403) return "auth";
    if (status >= 400 && status < 500) return "bad_request";
    if (status >= 500) return "server";
  }
  const name = call.providerError?.name;
  if (["TimeoutError", "APIConnectionTimeoutError", "AbortError"].includes(name ?? "")) return "timeout";
  if (["APIConnectionError", "NetworkError", "FetchError"].includes(name ?? "")) return "network";
  return "unknown";
}

/** Closed, content-free telemetry that is safe to persist with a failed job. */
export function safeModelAttemptDiagnostics(calls: GatewayCallLog[]) {
  return calls.slice(0, 32).map((call, index) => ({
    attempt: index + 1,
    invocationId: uuid(call.invocationId),
    task: closed(call.task, tasks),
    provider: closed(call.provider, providers),
    effort: closed(call.effort, efforts),
    outcome: closed(call.outcome, outcomes),
    costUsd: boundedNumber(call.costUsd, false, 10_000),
    costStatus: closed(call.costStatus, costStatuses),
    latencyMs: boundedNumber(call.latencyMs, true, 86_400_000),
    stopReason: closed(call.stopReason, stopReasons),
    usedFallback: call.usedFallback === true,
    fromCassette: call.fromCassette === true,
    providerHttpStatus: (() => {
      const status = boundedNumber(call.providerError?.status, true, 599);
      return status !== null && status >= 100 ? status : null;
    })(),
    providerFailureCategory: providerFailureCategory(call),
    validationIssueCount: Array.isArray(call.validationIssues) ? Math.min(call.validationIssues.length, 100) : 0,
  }));
}

/**
 * Content-free projection for operational logs.
 *
 * Keep this as an explicit allowlist: a future gateway field must not become observable merely
 * because it was added to GatewayCallLog. In particular, prompts, responses and provider error
 * messages never cross this boundary.
 */
export function modelCallLogDetail(jobId: string, call: GatewayCallLog): Record<string, unknown> {
  return {
    job: uuid(jobId),
    invocationId: uuid(call.invocationId),
    task: closed(call.task, tasks),
    provider: closed(call.provider, providers),
    effort: closed(call.effort, efforts),
    outcome: closed(call.outcome, outcomes),
    promptFingerprint: fingerprint(call.promptFingerprint),
    inputFingerprint: fingerprint(call.inputFingerprint),
    outputFingerprint: fingerprint(call.outputFingerprint),
    usage: {
      inputTokens: boundedNumber(call.usage?.inputTokens, true, 1_000_000_000),
      outputTokens: boundedNumber(call.usage?.outputTokens, true, 1_000_000_000),
      cachedInputTokens: boundedNumber(call.usage?.cachedInputTokens, true, 1_000_000_000),
      reasoningTokens: boundedNumber(call.usage?.reasoningTokens, true, 1_000_000_000),
    },
    costUsd: boundedNumber(call.costUsd, false, 10_000),
    costStatus: closed(call.costStatus, costStatuses),
    latencyMs: boundedNumber(call.latencyMs, true, 86_400_000),
    stopReason: closed(call.stopReason, stopReasons),
    usedFallback: call.usedFallback === true,
    fromCassette: call.fromCassette === true,
    providerHttpStatus: (() => {
      const status = boundedNumber(call.providerError?.status, true, 599);
      return status !== null && status >= 100 ? status : null;
    })(),
    providerFailureCategory: providerFailureCategory(call),
    validationIssueCount: Array.isArray(call.validationIssues) ? Math.min(call.validationIssues.length, 100) : 0,
  };
}
