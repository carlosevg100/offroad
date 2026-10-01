import {randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {createModelGateway, type GatewayInputAttestation} from "./gateway";
import {InMemoryCassetteStore} from "./cassette";
import {legacyGatewayFingerprint} from "./input-serialization";
import type {AdapterResponse, GatewayCallLog, GatewayRequest} from "./types";
const schema = z.object({ok: z.boolean()});
const request = (): GatewayRequest<typeof schema> => ({task: "preliminary_understanding", system: "Review synthetic data",
  input: [{type: "text", text: "Synthetic input"}], schema, schemaName: "synthetic", maxOutputTokens: 100});
const response = (output: unknown = {ok: true}): AdapterResponse => ({output, rawText: "synthetic provider text", model: "claude-sonnet-5",
  usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, stopReason: "end", requestId: "provider-request-id"});
const receipt = (a: GatewayInputAttestation) => ({invocationId: a.invocationId, requestFingerprint: a.requestFingerprint, receiptId: randomUUID()});
describe("accepted invocation response binding", () => {
  it("binds parsed output to the accepted primary receipt without raw response or external request-id confusion", async () => {
    const logs: GatewayCallLog[] = []; const receipts = new Map<string, string>();
    const result = await createModelGateway({onCall: log => logs.push(log), attestInput: async a => {
      const r = receipt(a); receipts.set(a.invocationId, r.receiptId); return r;
    }, adapters: {anthropic: {provider: "anthropic", async complete() {return response();}}}}).complete(request());
    expect(result.acceptedInvocation).toEqual({schemaVersion: "gateway-accepted-invocation.v1", invocationId: logs[0]!.invocationId,
      adapterInputVersion: "gateway-adapter-input.v1", adapterRequestFingerprint: logs[0]!.adapterRequestFingerprint,
      outputFingerprintVersion: "gateway-parsed-output.v1", outputFingerprint: legacyGatewayFingerprint(result.output),
      inputFingerprint: logs[0]!.inputFingerprint, promptFingerprint: logs[0]!.promptFingerprint,
      provider: "anthropic", configuredModel: "claude-sonnet-5", reportedModel: "claude-sonnet-5", schemaName: "synthetic",
      retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, fromCassette: false,
      inputAttestationReceiptId: receipts.get(logs[0]!.invocationId)});
    expect(result.requestId).toBe("provider-request-id"); expect(result.acceptedInvocation!.invocationId).not.toBe(result.requestId);
    expect(Object.isFrozen(result.acceptedInvocation)).toBe(true);
    expect(JSON.stringify(result.acceptedInvocation)).not.toMatch(/synthetic provider text|Synthetic input|Review synthetic|provider-request-id/);
  });
  it("returns the accepted same-model repair rather than its rejected predecessor", async () => {
    const logs: GatewayCallLog[] = []; let sends = 0;
    const result = await createModelGateway({onCall: l => logs.push(l), adapters: {anthropic: {provider: "anthropic", async complete() {
      return response(++sends === 1 ? {ok: "bad"} : {ok: true});
    }}}}).complete({...request(), outputMode: "prompted_json", allowFallback: false});
    expect(logs.map(l => l.outcome)).toEqual(["invalid_output", "ok"]);
    expect(result.acceptedInvocation!.invocationId).toBe(logs[1]!.invocationId);
    expect(result.acceptedInvocation!.invocationId).not.toBe(logs[0]!.invocationId);
    expect(result.acceptedInvocation!.adapterRequestFingerprint).toBe(logs[1]!.adapterRequestFingerprint);
    expect(result.acceptedInvocation!.adapterRequestFingerprint).not.toBe(logs[0]!.adapterRequestFingerprint);
    expect(result.acceptedInvocation).toMatchObject({retryOrdinal: 1, isSameModelRepair: true, usedProviderFallback: false, provider: "anthropic"});
  });
  it("binds successful fallback after failed primary and repair to its own accepted attempt", async () => {
    const logs: GatewayCallLog[] = [];
    const result = await createModelGateway({onCall: l => logs.push(l), adapters: {
      anthropic: {provider: "anthropic", async complete() {return response({ok: "bad"});}},
      openai: {provider: "openai", async complete() {return {...response(), model: "gpt-5.6-terra"};}},
    }}).complete({...request(), outputMode: "prompted_json"});
    expect(logs.map(l => l.outcome)).toEqual(["invalid_output", "invalid_output", "ok"]);
    expect(result.acceptedInvocation!.invocationId).toBe(logs[2]!.invocationId);
    expect(logs.slice(0, 2).some(l => l.invocationId === result.acceptedInvocation!.invocationId)).toBe(false);
    expect(result.provider).toBe("openai"); expect(result.isSameModelRepair).toBe(false);
    expect(result.acceptedInvocation).toMatchObject({retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: true,
      provider: "openai", configuredModel: "gpt-5.6-terra", reportedModel: "gpt-5.6-terra"});
  });
  it("does not accept the policy-rejected predecessor when the next route succeeds", async () => {
    const logs: GatewayCallLog[] = []; const primary = vi.fn(async () => response());
    const result = await createModelGateway({onCall: l => logs.push(l), processingEligibility: async ({provider}) => ({allowed: provider === "openai",
      reasons: provider === "openai" ? [] : ["processing_assurance_missing"], policyVersion: "offroad-provider-retention-v2", assuranceId: null}),
      adapters: {anthropic: {provider: "anthropic", complete: primary}, openai: {provider: "openai", async complete() {return {...response(), model: "gpt-5.6-terra"};}}},
    }).complete(request());
    expect(primary).not.toHaveBeenCalled(); expect(logs[0]!.outcome).toBe("policy_rejected");
    expect(result.acceptedInvocation!.invocationId).not.toBe(logs[0]!.invocationId); expect(result.acceptedInvocation!.invocationId).toBe(logs[1]!.invocationId);
  });
  it("pins accepted identity independently of telemetry callback mutation", async () => {
    let originalId = ""; let originalHash = "";
    const result = await createModelGateway({onCall: l => {originalId = l.invocationId; originalHash = l.adapterRequestFingerprint!;
      l.invocationId = randomUUID(); l.adapterRequestFingerprint = "f".repeat(64); l.outputFingerprint = "f".repeat(64);
    }, adapters: {anthropic: {provider: "anthropic", async complete() {return response();}}}}).complete(request());
    expect(result.acceptedInvocation!.invocationId).toBe(originalId); expect(result.acceptedInvocation!.adapterRequestFingerprint).toBe(originalHash);
    expect(result.acceptedInvocation!.outputFingerprint).toBe(legacyGatewayFingerprint(result.output));
  });
  it("does not return an accepted invocation when the input receipt is rejected", async () => {
    const send = vi.fn(async () => response()); const logs: GatewayCallLog[] = [];
    const gateway = createModelGateway({onCall: l => logs.push(l), attestInput: async a => ({...receipt(a), requestFingerprint: "f".repeat(64)}),
      adapters: {anthropic: {provider: "anthropic", complete: send}}});
    await expect(gateway.complete({...request(), requireInputAttestation: true})).rejects.toMatchObject({code: "input_attestation_denied"});
    expect(send).not.toHaveBeenCalled(); expect(logs.every(l => l.outcome !== "ok")).toBe(true);
  });
  it("distinguishes cassette acceptance from provider dispatch and creates a fresh local invocation", async () => {
    const store = new InMemoryCassetteStore();
    const original = await createModelGateway({cassette: {mode: "record", store}, adapters: {anthropic: {provider: "anthropic", async complete() {return response();}}}}).complete(request());
    const send = vi.fn(async () => response()); const logs: GatewayCallLog[] = [];
    const replay = await createModelGateway({onCall: l => logs.push(l), cassette: {mode: "replay", store}, adapters: {anthropic: {provider: "anthropic", complete: send}}}).complete(request());
    expect(send).not.toHaveBeenCalled(); expect(original.acceptedInvocation!.fromCassette).toBe(false); expect(replay.acceptedInvocation!.fromCassette).toBe(true);
    expect(replay.acceptedInvocation!.invocationId).not.toBe(original.acceptedInvocation!.invocationId);
    expect(replay.acceptedInvocation!.adapterRequestFingerprint).toBe(original.acceptedInvocation!.adapterRequestFingerprint);
    expect(replay.acceptedInvocation!.invocationId).toBe(logs[0]!.invocationId); expect(replay.acceptedInvocation).not.toHaveProperty("inputAttestationReceiptId");
  });
  it("owns unknown parsed output and usage before telemetry mutates the provider object", async () => {
    const raw = response({nested: {value: "original"}});
    const result = await createModelGateway({onCall: log => {
      (raw.output as {nested: {value: string}}).nested.value = "changed";
      raw.model = "changed-model"; raw.usage.inputTokens = 900; log.usage.outputTokens = 800;
    }, adapters: {anthropic: {provider: "anthropic", async complete() {return raw;}}}})
      .complete({task: "preliminary_understanding", system: "Review synthetic data", input: [], schema: z.unknown(), outputMode: "prompted_json", schemaName: "synthetic", maxOutputTokens: 100});
    expect(result.output).toEqual({nested: {value: "original"}});
    expect(result.usage.inputTokens).toBe(10); expect(result.usage.outputTokens).toBe(10);
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.acceptedInvocation!.reportedModel).toBe("claude-sonnet-5");
    expect(result.acceptedInvocation!.outputFingerprint).toBe(legacyGatewayFingerprint(result.output));
    expect(Object.isFrozen(raw)).toBe(false);
  });
  it("isolates record-store mutation from the accepted provider response", async () => {
    const result = await createModelGateway({cassette: {mode: "record", store: {
      get() {return undefined;}, set(_key, value) {
        (value.output as {ok: boolean}).ok = false; value.model = "mutated-store"; value.usage.inputTokens = 999;
      },
    }}, adapters: {anthropic: {provider: "anthropic", async complete() {return response();}}}}).complete(request());
    expect(result.output).toEqual({ok: true}); expect(result.model).toBe("claude-sonnet-5"); expect(result.usage.inputTokens).toBe(10);
    expect(result.acceptedInvocation!.outputFingerprint).toBe(legacyGatewayFingerprint({ok: true}));
  });
  it("owns replay response independently from the store and telemetry", async () => {
    const stored = response({nested: {value: "recorded"}});
    const result = await createModelGateway({adapters: {}, cassette: {mode: "replay", store: {get() {return stored;}, set() {throw new Error("unexpected record");}}},
      onCall() {(stored.output as {nested: {value: string}}).nested.value = "mutated";},
    }).complete({task: "preliminary_understanding", system: "Review synthetic data", input: [], schema: z.unknown(), outputMode: "prompted_json", schemaName: "synthetic", maxOutputTokens: 100});
    expect(result.output).toEqual({nested: {value: "recorded"}}); expect(result.acceptedInvocation!.fromCassette).toBe(true);
    expect(result.acceptedInvocation!.outputFingerprint).toBe(legacyGatewayFingerprint(result.output));
  });
  it("rejects a mutating deterministic validator with sanitized diagnostics", async () => {
    const logs: GatewayCallLog[] = [];
    const gateway = createModelGateway({onCall: l => logs.push(l), adapters: {anthropic: {provider: "anthropic", async complete() {
      return response({ok: true, nested: {value: "original"}});
    }}}});
    await expect(gateway.complete({...request(), schema: z.object({ok: z.boolean(), nested: z.object({value: z.string()})}),
      allowFallback: false, validateOutput: output => {
        expect(Object.isFrozen(output.nested)).toBe(true);
        output.nested.value = "mutated"; return {accepted: true};
      }})).rejects.toMatchObject({code: "all_attempts_failed"});
    expect(logs).toHaveLength(1); expect(logs[0]!.outcome).toBe("invalid_output");
    expect(logs[0]!.validationIssues).toEqual([{path: "contract.0", code: "deterministic_validator_failed", message: "Deterministic validation failed: deterministic_validator_failed."}]);
  });
  it("validates defaults and transforms once, binding parsed output rather than raw response", async () => {
    let transforms = 0;
    const transformedSchema = z.object({value: z.number().default(2).overwrite(value => {transforms += 1; return value + 1;})});
    let validationView: unknown;
    const raw = response({});
    const result = await createModelGateway({adapters: {anthropic: {provider: "anthropic", async complete() {return raw;}}}})
      .complete({...request(), schema: transformedSchema, validateOutput: output => {
        validationView = output; expect(Object.isFrozen(output)).toBe(true); return {accepted: true};
      }});
    expect(transforms).toBe(1); expect(result.output).toEqual({value: 3}); expect(validationView).not.toBe(result.output);
    expect(result.acceptedInvocation!.outputFingerprintVersion).toBe("gateway-parsed-output.v1");
    expect(result.acceptedInvocation!.outputFingerprint).toBe(legacyGatewayFingerprint({value: 3}));
    expect(result.acceptedInvocation!.outputFingerprint).not.toBe(legacyGatewayFingerprint(raw.output));
  });

});
