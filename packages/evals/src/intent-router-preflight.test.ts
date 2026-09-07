import {intentClassifierOutputSchema} from "@offroad/agent-contracts";
import type {GatewayRequest, ModelGateway, ModelRef} from "@offroad/model-gateway";
import {describe, expect, it} from "vitest";

import {IntentRouterProviderPreflightError, preflightIntentRouterProviders} from "./intent-router-preflight";

const providers: ModelRef[] = [
  {provider: "anthropic", model: "claude-sonnet-5", effort: "low"},
  {provider: "openai", model: "gpt-5.6-terra", effort: "low"},
];

const request = {
  task: "route_intent" as const,
  system: "canonical intent classifier system",
  input: [{type: "text" as const, text: "canonical classifier input"}],
  schema: intentClassifierOutputSchema,
  schemaName: "shadow_routing_output",
  outputMode: "prompted_json" as const,
  thinking: "off" as const,
};

function fakeGateway(failProvider?: ModelRef["provider"]): {gateway: ModelGateway; requests: GatewayRequest<typeof intentClassifierOutputSchema>[]} {
  const requests: GatewayRequest<typeof intentClassifierOutputSchema>[] = [];
  const spend = {costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0};
  const gateway = {
    spent: () => ({...spend}),
    complete: async (received: GatewayRequest<typeof intentClassifierOutputSchema>) => {
      requests.push(received);
      spend.calls += 1;
      spend.costUsd += 0.01;
      spend.budgetExposureUsd += 0.01;
      if (received.model?.provider === failProvider) throw new Error("synthetic outage");
      return {
        output: {}, provider: received.model?.provider, model: received.model?.model, effort: received.model?.effort,
        usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, costUsd: 0.01, latencyMs: 1,
        stopReason: "end", usedFallback: false, fromCassette: false, attempts: [],
      };
    },
  } as unknown as ModelGateway;
  return {gateway, requests};
}

describe("intent router provider preflight", () => {
  it("proves each configured provider independently with the actual route contract", async () => {
    const {gateway, requests} = fakeGateway();
    const results = await preflightIntentRouterProviders(gateway, providers, request);

    expect(results.map(({provider, passed}) => ({provider, passed}))).toEqual([
      {provider: "anthropic", passed: true},
      {provider: "openai", passed: true},
    ]);
    expect(results.every(({task, schemaName}) => task === "route_intent" && schemaName === "shadow_routing_output")).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests.every((entry) => entry.task === "route_intent"
      && entry.system === request.system
      && entry.schema === intentClassifierOutputSchema
      && entry.outputMode === "prompted_json"
      && entry.allowFallback === false)).toBe(true);
  });

  it("checks all configured routes and aborts the corpus when any provider is unavailable", async () => {
    const {gateway, requests} = fakeGateway("anthropic");
    const error = await preflightIntentRouterProviders(gateway, providers, request).catch((cause) => cause);

    expect(error).toBeInstanceOf(IntentRouterProviderPreflightError);
    expect((error as IntentRouterProviderPreflightError).results).toMatchObject([
      {provider: "anthropic", passed: false, attemptCount: 1, error: "Error:unknown"},
      {provider: "openai", passed: true, attemptCount: 1, error: null},
    ]);
    expect(requests).toHaveLength(2);
  });
});
