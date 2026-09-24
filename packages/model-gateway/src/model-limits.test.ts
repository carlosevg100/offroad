import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {createModelGateway} from "./gateway";
import {assertWithinModelLimits, modelLimits} from "./model-limits";
import {retentionMatrixVersion, type ProcessingEligibilityDecision} from "./retention-matrix";
import {estimateRequestInputTokens} from "./token-estimate";
import type {AdapterRequest, AdapterResponse, GatewayRequest, ProviderAdapter} from "./types";

const schema = z.object({ok: z.boolean()});
const base: GatewayRequest<typeof schema> = {task: "baseline_generalist", system: "Synthetic system.", input: [{type: "text", text: "Synthetic question."}], schema, schemaName: "limits"};
function spy(provider: "anthropic" | "openai", outputs: unknown[] = [{ok: true}]) {
  const calls: AdapterRequest[] = [];
  const implementation: ProviderAdapter = {provider, async complete(request) {
    calls.push(request);
    const output = outputs.shift();
    return {output, rawText: JSON.stringify(output), usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: request.model, stopReason: "end"} as AdapterResponse;
  }};
  return {calls, implementation};
}
/** Text whose estimate is `tokens` other-byte units for a provider: letters only, no dense characters. */
const letters = (tokens: number, provider: "anthropic" | "openai") => "a".repeat(Math.ceil(tokens / (provider === "anthropic" ? 0.45 : 0.25)));

describe("model limits", () => {
  it("records every limit with the window, the input and output ceilings and a source", () => {
    expect(modelLimits["claude-opus-5"]).toMatchObject({contextWindowTokens: 1_000_000, maxInputTokens: 1_000_000, maxOutputTokens: 128_000});
    expect(modelLimits["gpt-5.6-sol"]).toMatchObject({contextWindowTokens: 1_050_000, maxInputTokens: 922_000, maxOutputTokens: 128_000});
    expect(() => assertWithinModelLimits({provider: "anthropic", model: "claude-opus-5", estimatedInputTokens: 1_000_000, maxOutputTokens: 128_000})).not.toThrow();
    expect(() => assertWithinModelLimits({provider: "anthropic", model: "claude-opus-5", estimatedInputTokens: 1_000_001, maxOutputTokens: 1})).toThrow(/input limit/);
    expect(() => assertWithinModelLimits({provider: "anthropic", model: "unlisted-model", estimatedInputTokens: 10_000_000, maxOutputTokens: 1})).not.toThrow();
  });

  it("refuses an input above the primary's limit before any hook, reservation or provider call", async () => {
    const primary = spy("anthropic"), fallback = spy("openai");
    const hook = vi.fn(async (): Promise<ProcessingEligibilityDecision> => ({allowed: true, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: []}));
    const gateway = createModelGateway({adapters: {anthropic: primary.implementation, openai: fallback.implementation}, processingEligibility: hook,
      budgetReservation: "conservative_text_v1", budget: {maxCostUsd: 1_000, maxCalls: 4}});
    await expect(gateway.complete({...base, input: [{type: "text", text: letters(1_000_000, "anthropic")}]}))
      .rejects.toMatchObject({code: "input_limit_exceeded", details: {provider: "anthropic", model: "claude-opus-5", maxInputTokens: 1_000_000}});
    expect([hook.mock.calls.length, primary.calls.length, fallback.calls.length, gateway.spent().budgetExposureUsd, gateway.spent().calls]).toEqual([0, 0, 0, 0, 0]);
  });

  it("refuses a request its fallback cannot take, before the primary is sent", async () => {
    const primary = spy("anthropic"), fallback = spy("openai");
    // About 930K tokens by the OpenAI estimate, above GPT-5.6 Sol's 922K input limit. Opus 5's own
    // limit is raised here so that only the fallback's limit is at stake.
    const text = letters(930_000, "openai");
    const request = {...base, input: [{type: "text" as const, text}], model: {provider: "anthropic" as const, model: "claude-opus-5", effort: "high" as const}};
    const gateway = createModelGateway({adapters: {anthropic: primary.implementation, openai: fallback.implementation},
      limits: {...modelLimits, "claude-opus-5": {...modelLimits["claude-opus-5"]!, maxInputTokens: 10_000_000, contextWindowTokens: 10_000_000}}});
    await expect(gateway.complete(request)).rejects.toMatchObject({code: "input_limit_exceeded", details: {provider: "openai", model: "gpt-5.6-sol", maxInputTokens: 922_000}});
    expect([primary.calls.length, fallback.calls.length]).toEqual([0, 0]);
    // Without the fallback, the same request goes to the primary alone.
    await gateway.complete({...request, allowFallback: false});
    expect(primary.calls).toHaveLength(1);
  });

  it("refuses an output ceiling above the model's maximum output", async () => {
    const primary = spy("anthropic");
    const gateway = createModelGateway({adapters: {anthropic: primary.implementation}});
    await expect(gateway.complete({...base, allowFallback: false, maxOutputTokens: 128_001})).rejects.toMatchObject({code: "output_limit_exceeded"});
    expect(primary.calls).toHaveLength(0);
    await gateway.complete({...base, allowFallback: false, maxOutputTokens: 128_000});
    expect(primary.calls).toHaveLength(1);
  });

  it("checks the repair attempt too, whose system carries the guidance", async () => {
    const primary = spy("anthropic", [{ok: "not a boolean"}, {ok: true}]);
    const request = {...base, outputMode: "prompted_json" as const, allowFallback: false};
    const first = estimateRequestInputTokens("anthropic", {...request, model: "claude-opus-5", effort: "high", maxOutputTokens: 32_000, timeoutMs: 1});
    const gateway = createModelGateway({adapters: {anthropic: primary.implementation},
      limits: {"claude-opus-5": {...modelLimits["claude-opus-5"]!, maxInputTokens: first.inputTokens}}});
    await expect(gateway.complete(request)).rejects.toMatchObject({code: "input_limit_exceeded"});
    expect(primary.calls).toHaveLength(1);
  });
});
