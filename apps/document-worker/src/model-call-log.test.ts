import {describe, expect, it} from "vitest";
import type {GatewayCallLog} from "@offroad/model-gateway";

import {modelCallLogDetail, safeGatewayFailureCode, safeModelAttemptDiagnostics, safeModelSpend, safeSuccessfulModelCall} from "./model-call-log";

const call: GatewayCallLog = {
  invocationId: "10000000-0000-4000-8000-000000000001",
  task: "route_intent",
  provider: "anthropic",
  model: "claude-sonnet-5",
  effort: "low",
  outcome: "invalid_output",
  promptFingerprint: "a".repeat(64),
  inputFingerprint: "b".repeat(64),
  outputFingerprint: "c".repeat(64),
  usage: {inputTokens: 100, outputTokens: 20, cachedInputTokens: 0},
  costUsd: 0.02,
  costStatus: "measured",
  latencyMs: 1234,
  stopReason: "end",
  usedFallback: false,
  fromCassette: false,
  schemaName: "live_preview_routing_output",
  metadata: {surface: "live_preview_router", accidentalFutureContent: "must-not-be-logged"},
  validationIssues: [{path: "routingCore.action", code: "invalid_type", message: "rejected value must-not-be-logged"}],
  previousInvocationId: "10000000-0000-4000-8000-000000000000",
  repairGuidanceFingerprint: "d".repeat(64),
  validationIssueCodeFingerprint: "e".repeat(64),
  repairValidationIssueCodeFingerprint: "f".repeat(64),
};

describe("modelCallLogDetail", () => {
  it("binds the call to its job and excludes open-ended metadata and diagnostic messages", () => {
    const detail = modelCallLogDetail("20000000-0000-4000-8000-000000000002", call);
    expect(detail).toMatchObject({
      job: "20000000-0000-4000-8000-000000000002",
      task: "route_intent",
      provider: "anthropic",
      model: "claude-sonnet-5",
      outcome: "invalid_output",
      providerHttpStatus: null,
      providerFailureCategory: "unknown",
      validationIssueCount: 1,
      previousInvocationId: "10000000-0000-4000-8000-000000000000",
      repairGuidanceFingerprint: "d".repeat(64),
      validationIssueCodeFingerprint: "e".repeat(64),
      repairValidationIssueCodeFingerprint: "f".repeat(64),
    });
    expect(JSON.stringify(detail)).not.toContain("must-not-be-logged");
    expect(detail).not.toHaveProperty("metadata");
    expect(detail).not.toHaveProperty("schemaName");
    expect(detail).not.toHaveProperty("providerError");
    expect(detail).not.toHaveProperty("validationIssues");
  });

  it("persists only allowlisted successful provider/model lineage", () => {
    expect(safeSuccessfulModelCall({...call, retryOrdinal: 1, isSameModelRepair: true})).toMatchObject({
      provider: "anthropic", model: "claude-sonnet-5", effort: "low", retryOrdinal: 1,
      isSameModelRepair: true, usedProviderFallback: false,
    });
    expect(safeSuccessfulModelCall({...call, provider: "customer-secret", model: "customer-secret-model"})).toMatchObject({
      provider: "unknown", model: "unknown",
    });
  });

  it("reduces malicious provider strings to closed values and counts", () => {
    const poisoned = {
      ...call,
      provider: "customer-secret" as never,
      model: "customer-secret-model",
      task: "customer-secret-task" as never,
      schemaName: "customer-secret-schema",
      providerError: {name: "customer-secret-error", status: 429, code: "customer-secret-code", type: "customer-secret-type"},
      validationIssues: [{path: "customer.secret.account", code: "customer-secret-code", message: "customer-secret-message"}],
      promptFingerprint: "customer-secret-prompt",
      previousInvocationId: "customer-secret-previous-id",
      repairGuidanceFingerprint: "customer-secret-guidance",
      validationIssueCodeFingerprint: "customer-secret-issues",
      repairValidationIssueCodeFingerprint: "customer-secret-repair-issues",
    } satisfies GatewayCallLog;

    const detail = modelCallLogDetail("20000000-0000-4000-8000-000000000002", poisoned);
    const attempts = safeModelAttemptDiagnostics([poisoned]);
    const serialized = JSON.stringify({detail, attempts});
    expect(detail).toMatchObject({provider: "unknown", task: "unknown", providerHttpStatus: 429, providerFailureCategory: "rate_limit", validationIssueCount: 1, promptFingerprint: null});
    expect(serialized).not.toContain("customer-secret");
  });

  it("closes failure codes and spend against forged or future runtime fields", () => {
    expect(safeGatewayFailureCode("timeout")).toBe("timeout");
    expect(safeGatewayFailureCode("CLIENT_SECRET_FROM_PROVIDER")).toBe("unknown");
    const spend = safeModelSpend({
      costUsd: Number.NaN,
      calls: Number.POSITIVE_INFINITY,
      unknownCostCalls: -1,
      budgetExposureUsd: 20_000,
      futureMetadata: "CLIENT_SECRET",
    });
    expect(spend).toEqual({costUsd: null, calls: null, unknownCostCalls: null, budgetExposureUsd: null});
    expect(JSON.stringify(spend)).not.toContain("CLIENT_SECRET");
  });

  it("applies semantic ceilings to diagnostic numbers", () => {
    const extreme = {...call, providerError: {name: "Odd", status: 99}, latencyMs: 86_400_001, costUsd: 10_001};
    expect(modelCallLogDetail("20000000-0000-4000-8000-000000000002", extreme)).toMatchObject({
      providerHttpStatus: null,
      providerFailureCategory: "unknown",
      latencyMs: null,
      costUsd: null,
    });
  });

  it("keeps legacy fallback telemetry while distinguishing repair from provider fallback", () => {
    const repair = {...call, retryOrdinal: 1, isSameModelRepair: true, usedProviderFallback: false};
    const fallback = {...call, outcome: "ok" as const, retryOrdinal: 0, isSameModelRepair: false, usedFallback: true, usedProviderFallback: true};
    expect(safeModelAttemptDiagnostics([repair, fallback])).toMatchObject([
      {usedFallback: false, retryOrdinal: 1, isSameModelRepair: true, usedProviderFallback: false},
      {usedFallback: true, retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: true},
    ]);
  });
});
