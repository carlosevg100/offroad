import {randomUUID} from "node:crypto";
import {describe, expect, it} from "vitest";
import {z} from "zod";
import {createModelGateway, type GatewayInputAttestation} from "./gateway";
import {gatewayCallLogSchema} from "./lineage";
import type {AdapterRequest, AdapterResponse, GatewayCallLog, GatewayRequest} from "./types";

const schema = z.object({supported: z.boolean()});
const request = (optIn = true): GatewayRequest<typeof schema> => ({task: "preliminary_understanding", system: "Only use supplied evidence.", input: [{type: "text", text: "Synthetic source"}], schema, schemaName: "bounded_native_contract", maxOutputTokens: 100, allowFallback: false,
  allowDeterministicRepair: optIn, validateOutput: output => output.supported ? {accepted: true} : {accepted: false, issues: [{path: "supported", code: "source_support_missing", message: "No source support."}]}});
const response = (output: unknown): AdapterResponse => ({output, rawText: JSON.stringify(output), usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: "claude-sonnet-5", stopReason: "end"});
function scripted(outputs: unknown[]) {const calls: AdapterRequest[] = [];return {calls, provider: "anthropic" as const, complete: async (r: AdapterRequest) => {calls.push(r);return response(outputs.shift());}};}

describe("explicit bounded repair of a native deterministic contract", () => {
  it.each(["structured", undefined] as const)("repairs on the primary without changing output mode %s", async outputMode => {
    const adapter = scripted([{supported: false}, {supported: true}]), logs: GatewayCallLog[] = [], attestations: GatewayInputAttestation[] = [];
    const gateway = createModelGateway({adapters: {anthropic: adapter}, budget: {maxCalls: 2, maxCostUsd: 1}, onCall: l => logs.push(l), attestInput: async a => {attestations.push(a);return {invocationId: a.invocationId, requestFingerprint: a.requestFingerprint, receiptId: randomUUID()};}});
    const result = await gateway.complete({...request(), ...(outputMode ? {outputMode} : {}), requireInputAttestation: true});
    expect(result.output).toEqual({supported: true});expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls.map(c => c.outputMode)).toEqual([outputMode, outputMode]);
    expect(adapter.calls[1]?.system).toContain("CONTRACT REPAIR (one bounded retry)");
    expect(adapter.calls[1]?.input).toEqual(adapter.calls[0]?.input);
    expect(result).toMatchObject({provider: "anthropic", isSameModelRepair: true, retryOrdinal: 1, usedProviderFallback: false});
    expect(attestations).toHaveLength(2);expect(attestations[1]?.previousInvocationId).toBe(attestations[0]?.invocationId);
    expect(attestations[1]?.requestFingerprint).not.toBe(attestations[0]?.requestFingerprint);
    expect(logs.map(l => gatewayCallLogSchema.parse(l))).toHaveLength(2);
    expect(logs[1]?.repairValidationIssueCodeFingerprint).toBe(logs[0]?.validationIssueCodeFingerprint);
    expect(gateway.spent().calls).toBe(2);
  });
  it("keeps native callers without the explicit option at one attempt", async () => {
    const adapter = scripted([{supported: false}, {supported: true}]);
    await expect(createModelGateway({adapters: {anthropic: adapter}}).complete(request(false))).rejects.toMatchObject({code: "all_attempts_failed"});
    expect(adapter.calls).toHaveLength(1);
  });
  it("never loops after the single permitted repair also fails", async () => {
    const adapter = scripted([{supported: false}, {supported: false}, {supported: true}]);
    await expect(createModelGateway({adapters: {anthropic: adapter}, budget: {maxCalls: 3, maxCostUsd: 1}}).complete(request())).rejects.toMatchObject({code: "all_attempts_failed"});
    expect(adapter.calls).toHaveLength(2);
  });
  it("respects a one-call budget before sending the repair", async () => {
    const adapter = scripted([{supported: false}, {supported: true}]);
    await expect(createModelGateway({adapters: {anthropic: adapter}, budget: {maxCalls: 1, maxCostUsd: 1}}).complete(request())).rejects.toMatchObject({code: "all_attempts_failed"});
    expect(adapter.calls).toHaveLength(1);
  });
  it("requires a fresh input authorization for the repair", async () => {
    const adapter = scripted([{supported: false}, {supported: true}]);
    const gateway = createModelGateway({adapters: {anthropic: adapter}, attestInput: async a => {if(a.isSameModelRepair) throw new Error("authorization withdrawn");return {invocationId: a.invocationId, requestFingerprint: a.requestFingerprint, receiptId: randomUUID()};}});
    await expect(gateway.complete({...request(), requireInputAttestation: true})).rejects.toMatchObject({code: "input_attestation_denied"});
    expect(adapter.calls).toHaveLength(1);
  });
  it("does not repair an already accepted first response", async () => {
    const adapter = scripted([{supported: true}]);
    await createModelGateway({adapters: {anthropic: adapter}}).complete(request());expect(adapter.calls).toHaveLength(1);
  });
  it("does not extend native schema repair when only contract repair is enabled", async () => {
    const adapter = scripted([{supported: "invalid schema"}, {supported: true}]);
    await expect(createModelGateway({adapters: {anthropic: adapter}}).complete(request())).rejects.toMatchObject({code: "all_attempts_failed"});
    expect(adapter.calls).toHaveLength(1);
  });
});
