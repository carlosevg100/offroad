import {describe, expect, it} from "vitest";

import type {GatewayCallLog} from "@offroad/model-gateway";

import {summarizeModelAttempts} from "./model-failure-lineage";

describe("model failure lineage", () => {
  it("retains operational diagnostics without prompts, fingerprints or metadata", () => {
    const call = {
      invocationId: "invocation",
      task: "origination_thesis",
      provider: "anthropic",
      model: "claude-sonnet-5",
      effort: "medium",
      outcome: "error",
      promptFingerprint: "prompt-secret",
      inputFingerprint: "input-secret",
      outputFingerprint: "output-secret",
      usage: {inputTokens: 0, outputTokens: 0, cachedInputTokens: 0},
      costUsd: 0,
      costStatus: "unknown",
      latencyMs: 60_000,
      stopReason: "other",
      usedFallback: false,
      fromCassette: false,
      schemaName: "origination_meeting_brief_v1",
      providerError: {name: "RateLimitError", status: 429, type: "rate_limit_error"},
      validationIssues: [{path: "meetingQuestions", code: "too_small", message: "Too small: expected array to have >=3 items"}],
      metadata: {projectId: "private-project"},
    } satisfies GatewayCallLog;

    expect(summarizeModelAttempts([call])).toEqual([{
      attempt: 1,
      invocationId: null,
      task: "origination_thesis",
      provider: "anthropic",
      effort: "medium",
      outcome: "error",
      costUsd: 0,
      latencyMs: 60_000,
      costStatus: "unknown",
      usedFallback: false,
      fromCassette: false,
      stopReason: "other",
      providerHttpStatus: 429,
      providerFailureCategory: "rate_limit",
      validationIssueCount: 1,
    }]);
    expect(JSON.stringify(summarizeModelAttempts([call]))).not.toContain("Too small");
    expect(JSON.stringify(summarizeModelAttempts([call]))).not.toContain("RateLimitError");
  });
});
