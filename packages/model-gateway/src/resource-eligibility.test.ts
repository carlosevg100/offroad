import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {conservativeTextReservationUsd} from "./conservative-reservation";
import {createModelGateway, type GatewayAttempt} from "./gateway";
import {listPrices} from "./pricing";
import {retentionMatrixVersion, type ProcessingEligibilityDecision} from "./retention-matrix";
import type {AdapterRequest, AdapterResponse, GatewayCallLog} from "./types";

const request = {task: "preliminary_understanding" as const, system: "Synthetic instructions",
  input: [{type: "text" as const, text: "Synthetic input"}], schema: z.object({ok: z.boolean()}), schemaName: "eligibility"};
const response: AdapterResponse = {output: {ok: true}, rawText: '{"ok":true}', usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, model: "gpt-5.6-terra", stopReason: "end"};
const result = (allowed: boolean): ProcessingEligibilityDecision => ({allowed, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: allowed ? [] : ["processing_assurance_missing"]});

describe("gateway eligibility transport boundary", () => {
  it("denies primary without transmission and checks the secondary independently", async () => {
    const primary = vi.fn(async () => response), secondary = vi.fn(async () => response);
    const authorize = vi.fn(async ({provider}: {provider: string}) => result(provider === "openai"));
    const gateway = createModelGateway({adapters: {anthropic: {provider: "anthropic", complete: primary}, openai: {provider: "openai", complete: secondary}}, processingEligibility: authorize});
    expect((await gateway.complete(request)).provider).toBe("openai");
    expect(primary).not.toHaveBeenCalled(); expect(secondary).toHaveBeenCalledOnce(); expect(authorize).toHaveBeenCalledTimes(2);
  });
  it("sends zero bytes to an incompatible fallback after primary failure", async () => {
    const secondary = vi.fn(async () => response);
    const gateway = createModelGateway({adapters: {anthropic: {provider: "anthropic", async complete() {throw new Error("synthetic failure");}}, openai: {provider: "openai", complete: secondary}},
      processingEligibility: async ({provider}) => result(provider === "anthropic")});
    await expect(gateway.complete(request)).rejects.toThrow(); expect(secondary).not.toHaveBeenCalled();
  });
  it("checks implicit cache and inline documents independently from inference", async () => {
    const transport = vi.fn(async () => response);
    const authorize = vi.fn(async ({resources}: {resources: string[]}) => result(!resources.includes("inline_document")));
    const gateway = createModelGateway({adapters: {anthropic: {provider: "anthropic", complete: transport}}, processingEligibility: authorize});
    await expect(gateway.complete({...request, allowFallback: false, input: [{type: "pdf", base64: "c3ludGhldGlj"}]})).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(authorize.mock.calls[0]?.[0].resources).toEqual(["inference", "prompt_cache", "schema_cache", "inline_document"]);
  });
  it("does not reuse approval after revocation between calls", async () => {
    let allowed = true;
    const transport = vi.fn(async () => response);
    const gateway = createModelGateway({adapters: {anthropic: {provider: "anthropic", complete: transport}}, processingEligibility: async () => result(allowed)});
    await gateway.complete({...request, allowFallback: false}); allowed = false;
    await expect(gateway.complete({...request, allowFallback: false})).rejects.toThrow(); expect(transport).toHaveBeenCalledOnce();
  });
  it("gives every send, repair and fallback its own identity and the reservation it is charged", async () => {
    const seen: AdapterRequest[] = [];
    const reply = (output: unknown): AdapterResponse => ({...response, output});
    const primary = vi.fn(async (sent: AdapterRequest) => { seen.push(sent); return reply({wrong: true}); });
    const secondary = vi.fn(async (sent: AdapterRequest) => { seen.push(sent); return reply({ok: true}); });
    const authorize = vi.fn(async (_input: {attempt: GatewayAttempt}) => result(true));
    const logs: GatewayCallLog[] = [];
    const gateway = createModelGateway({adapters: {anthropic: {provider: "anthropic", complete: primary}, openai: {provider: "openai", complete: secondary}},
      processingEligibility: authorize, budgetReservation: "conservative_text_v1", onCall: (log) => logs.push(log)});
    expect((await gateway.complete({...request, outputMode: "prompted_json"})).provider).toBe("openai");
    const attempts = authorize.mock.calls.map(([input]) => input.attempt);
    expect(attempts.map(({retryOrdinal, isSameModelRepair, usedProviderFallback}) => [retryOrdinal, isSameModelRepair, usedProviderFallback]))
      .toEqual([[0, false, false], [1, true, false], [0, false, true]]);
    expect(new Set(attempts.map(({invocationId}) => invocationId)).size).toBe(3);
    expect(logs.map(({invocationId}) => invocationId)).toEqual(attempts.map(({invocationId}) => invocationId));
    attempts.forEach((attempt, index) => expect(attempt.reservationUsd)
      .toBe(conservativeTextReservationUsd(index === 2 ? "openai" : "anthropic", seen[index]!, listPrices)));
  });
  it("fails closed when the live authority cannot be reached", async () => {
    const transport = vi.fn(async () => response);
    const gateway = createModelGateway({adapters: {anthropic: {provider: "anthropic", complete: transport}}, processingEligibility: async () => {throw new Error("authority unavailable");}});
    await expect(gateway.complete(request)).rejects.toThrow(); expect(transport).not.toHaveBeenCalled();
  });
});
