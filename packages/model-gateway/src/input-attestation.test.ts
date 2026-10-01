import {randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {createModelGateway, type GatewayInputAttestation, type GatewayInputReceipt, type ModelGatewayConfig} from "./gateway";
import {gatewayCallLogSchema} from "./lineage";
import type {AdapterRequest, AdapterResponse, GatewayCallLog, GatewayRequest} from "./types";

const schema = z.object({ok: z.boolean()});
const request = (): GatewayRequest<typeof schema> => ({task: "preliminary_understanding", system: "Review",
  input: [{type: "text", text: "Bounded input"}], schema, schemaName: "bounded", maxOutputTokens: 100});
const response: AdapterResponse = {output: {ok: true}, rawText: '{"ok":true}',
  usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: "claude-sonnet-5", stopReason: "end"};
const receipt = (a: GatewayInputAttestation): GatewayInputReceipt => ({invocationId: a.invocationId,
  requestFingerprint: a.requestFingerprint, receiptId: randomUUID()});
const adapter = (send: (r: AdapterRequest) => Promise<AdapterResponse>) => ({provider: "anthropic" as const, complete: send});

describe("effective gateway input attestation", () => {
  it("pins the receipt callback even if configuration changes during eligibility", async () => {
    let called = false;
    const config: ModelGatewayConfig = {attestInput: async a => {called = true; return receipt(a);},
      processingEligibility: async () => {delete config.attestInput; return {allowed: true, reasons: [], policyVersion: "offroad-provider-retention-v2", assuranceId: null};},
      adapters: {anthropic: adapter(async () => response)}};
    await createModelGateway(config).complete({...request(), requireInputAttestation: true});
    expect(called).toBe(true);
  });
  it("times out receipt authority without sending or retaining local reservations", async () => {
    vi.useFakeTimers();
    try {
      let sends = 0;
      const gateway = createModelGateway({attestInput: () => new Promise(() => {}),
        adapters: {anthropic: adapter(async () => {sends++; return response;})}});
      const pending = expect(gateway.complete(request())).rejects.toMatchObject({code: "input_attestation_denied"});
      await vi.advanceTimersByTimeAsync(10_000); await pending;
      expect(sends).toBe(0); expect(gateway.spent().budgetExposureUsd).toBe(0);
    } finally {vi.useRealTimers();}
  });
  it("denies a mutated Zod schema after asynchronous authority", async () => {
    const mutable = z.object({ok: z.boolean()});
    let sends = 0;
    const gateway = createModelGateway({attestInput: async a => {
      Object.assign(mutable.shape, {ok: z.string()}); return receipt(a);
    }, adapters: {anthropic: adapter(async () => {sends++; return response;})}});
    await expect(gateway.complete({...request(), schema: mutable})).rejects.toMatchObject({code: "input_attestation_denied"});
    expect(sends).toBe(0);
  });
  it("requires a configured authority before any provider call", async () => {
    let calls = 0;
    const gateway = createModelGateway({adapters: {anthropic: adapter(async () => {calls++; return response;})}});
    await expect(gateway.complete({...request(), requireInputAttestation: true})).rejects.toMatchObject({code: "input_attestation_denied"});
    expect(calls).toBe(0);
  });
  it("awaits a bound receipt before sending and emits its identity", async () => {
    let release!: (r: GatewayInputReceipt) => void;
    let attestation!: GatewayInputAttestation;
    let sent = false;
    const logs: GatewayCallLog[] = [];
    const gateway = createModelGateway({onCall: l => logs.push(l), attestInput: a => {
      attestation = a; return new Promise(resolve => {release = resolve;});
    }, adapters: {anthropic: adapter(async () => {sent = true; return response;})}});
    const pending = gateway.complete(request());
    expect(sent).toBe(false);
    const committed = receipt(attestation); release(committed); await pending;
    expect(sent).toBe(true);
    expect(logs[0]?.adapterRequestFingerprint).toBe(attestation.requestFingerprint);
    expect(logs[0]?.inputAttestationReceiptId).toBe(committed.receiptId);
    expect(gatewayCallLogSchema.parse(logs[0]).inputAttestationReceiptId).toBe(committed.receiptId);
    expect(gatewayCallLogSchema.parse(logs[0]).adapterRequestFingerprint).toBe(attestation.requestFingerprint);
  });
  it.each(["invocation", "fingerprint", "receipt"])("rejects a mismatched %s receipt without fallback", async field => {
    let sends = 0;
    const send = async () => {sends++; return response;};
    const gateway = createModelGateway({attestInput: async a => ({...receipt(a),
      ...(field === "invocation" ? {invocationId: randomUUID()} : field === "fingerprint" ? {requestFingerprint: "0".repeat(64)} : {receiptId: "private prompt"})}),
      adapters: {anthropic: adapter(send), openai: {provider: "openai", complete: send}}});
    await expect(gateway.complete(request())).rejects.toMatchObject({code: "input_attestation_denied"});
    expect(sends).toBe(0); expect(gateway.spent()).toEqual({calls: 0, costUsd: 0, unknownCostCalls: 0, budgetExposureUsd: 0});
  });
  it("sanitizes callback failure, terminates fallback and releases local exposure", async () => {
    let sends = 0;
    const logs: GatewayCallLog[] = [];
    const gateway = createModelGateway({budget: {maxCalls: 1}, onCall: l => logs.push(l),
      attestInput: async () => {throw new Error("private financial information");},
      adapters: {anthropic: adapter(async () => {sends++; return response;})}});
    for (let i = 0; i < 2; i++) await expect(gateway.complete(request())).rejects.toMatchObject({
      code: "input_attestation_denied", message: "input attestation failed before dispatch"});
    expect(sends).toBe(0); expect(logs).toHaveLength(2); expect(logs.every(l => l.costStatus === "not_called" && l.outcome === "policy_rejected")).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("private financial information"); expect(gateway.spent().budgetExposureUsd).toBe(0);
  });
  it("captures redacted input without disclosing raw prompt, document, schema or cache key", async () => {
    let captured!: GatewayInputAttestation;
    let sent!: AdapterRequest;
    const gateway = createModelGateway({attestInput: async a => {captured = a; return receipt(a);},
      adapters: {anthropic: adapter(async r => {sent = r; return response;})}});
    await gateway.complete({...request(), input: [{type: "text", text: "Email: private@example.com"}], cacheKey: "secret-key"});
    expect(JSON.stringify(captured)).not.toMatch(/private@example|secret-key|Review|Bounded|properties/);
    expect(JSON.stringify(sent.input)).not.toContain("private@example.com");
    expect(Object.isFrozen(captured)).toBe(true);
    expect(captured.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
  it("owns and freezes input and settings across asynchronous attestation", async () => {
    const r = {...request(), metadata: {userId: "original"}, cacheKey: "original"};
    let sent!: AdapterRequest;
    const gateway = createModelGateway({redaction: false, attestInput: async a => {
      r.system = "tampered"; r.input[0] = {type: "text", text: "tampered"}; r.metadata.userId = "tampered";
      r.maxOutputTokens = 500; r.cacheKey = "tampered"; return receipt(a);
    }, adapters: {anthropic: adapter(async built => {sent = built; return response;})}});
    await gateway.complete(r);
    expect(sent.system).toBe("Review"); expect(sent.input).toEqual([{type: "text", text: "Bounded input"}]);
    expect(sent.metadata).toEqual({userId: "original"}); expect(sent.maxOutputTokens).toBe(100); expect(sent.cacheKey).toBe("original");
    expect(Object.isFrozen(sent)).toBe(true); expect(Object.isFrozen(sent.input[0])).toBe(true);
  });
  it("reserves concurrent call capacity while waiting for a receipt", async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => {release = resolve;});
    let sends = 0;
    const gateway = createModelGateway({budget: {maxCalls: 1}, attestInput: async a => {await held; return receipt(a);},
      adapters: {anthropic: adapter(async () => {sends++; return response;})}});
    const first = gateway.complete(request());
    await expect(gateway.complete(request())).rejects.toMatchObject({code: "budget_exceeded"});
    expect(sends).toBe(0); release(); await first; expect(sends).toBe(1);
  });
  it("uses different complete fingerprints for repair and provider fallback", async () => {
    const receipts: GatewayInputAttestation[] = [];
    const logs: GatewayCallLog[] = [];
    const gateway = createModelGateway({attestInput: async a => {receipts.push(a); return receipt(a);}, onCall: l => logs.push(l),
      adapters: {anthropic: adapter(async () => ({...response, output: {ok: "invalid"}})),
        openai: {provider: "openai", async complete() {return {...response, model: "gpt-5.6-terra"};}}}});
    await gateway.complete({...request(), outputMode: "prompted_json"});
    expect(receipts).toHaveLength(3); expect(new Set(receipts.map(a => a.requestFingerprint)).size).toBe(3);
    expect(new Set(receipts.map(a => a.inputFingerprint)).size).toBe(1);
    expect(receipts[1]?.isSameModelRepair).toBe(true); expect(receipts[1]?.previousInvocationId).toBe(receipts[0]?.invocationId);
    expect(receipts[2]?.usedProviderFallback).toBe(true);
    expect(logs.map(l => l.adapterRequestFingerprint)).toEqual(receipts.map(a => a.requestFingerprint));
  });
  it("does not dispatch a repair after its receipt fails", async () => {
    let sends = 0;
    const gateway = createModelGateway({attestInput: async a => {if (a.isSameModelRepair) throw new Error("denied"); return receipt(a);},
      adapters: {anthropic: adapter(async () => {sends++; return {...response, output: {ok: "invalid"}};})}});
    await expect(gateway.complete({...request(), outputMode: "prompted_json"})).rejects.toMatchObject({code: "input_attestation_denied"});
    expect(sends).toBe(1); expect(gateway.spent().calls).toBe(1);
  });
  it("records the complete fingerprint for legacy calls without asserting a retained receipt", async () => {
    const logs: GatewayCallLog[] = [];
    await createModelGateway({onCall: l => logs.push(l), adapters: {anthropic: adapter(async () => response)}}).complete(request());
    expect(logs[0]?.adapterRequestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(logs[0]?.inputAttestationReceiptId).toBeUndefined();
  });
  it("changes the complete fingerprint when model settings or input change", async () => {
    const fingerprints: string[] = [];
    const gateway = createModelGateway({attestInput: async a => {fingerprints.push(a.requestFingerprint); return receipt(a);},
      adapters: {anthropic: adapter(async () => response)}});
    for (const delta of [{}, {maxOutputTokens: 101}, {timeoutMs: 190_000}, {cacheKey: "different"},
      {thinking: "off" as const}, {schemaName: "different"}, {metadata: {userId: "different"}},
      {input: [{type: "text" as const, text: "different"}]}]) await gateway.complete({...request(), ...delta});
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });
});
