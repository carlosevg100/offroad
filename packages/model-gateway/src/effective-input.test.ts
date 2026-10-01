import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {prepareGatewayInput, buildEffectiveAdapterRequest, assertGatewaySchemaUnchanged} from "./effective-input";
import {ordinalGatewayStableText} from "./input-serialization";
import {buildRepairGuidance} from "./repair";
import {createModelGateway} from "./gateway";
import {defaultTaskPolicies} from "./policy";
import type {AdapterRequest, GatewayCallLog, GatewayRequest} from "./types";
const schema = z.object({"é": z.boolean(), "Z": z.string()});
const request = (): GatewayRequest<typeof schema> => ({task: "preliminary_understanding", system: "Review",
  input: [{type: "text", text: "Email: private@example.com"}], schema, schemaName: "bounded", metadata: {userId: "synthetic"}});
const route = {provider: "anthropic" as const, model: "claude-sonnet-5", effort: "low" as const};
const defaults = {maxOutputTokens: 100, timeoutMs: 1000};
function oldText(v: unknown): string {
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return `[${v.map(oldText).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => `${JSON.stringify(k)}:${oldText(c)}`).join(",")}}`;
  return JSON.stringify(v) ?? "undefined";
}
const oldHash = (v: unknown) => createHash("sha256").update(oldText(v)).digest("hex");
describe("shared effective adapter builder", () => {
  it("rejects sparse arrays disguised by extra keys instead of colliding with empty arrays", () => {
    const disguised = Array(1); Object.assign(disguised, {extra: 7});
    expect(() => ordinalGatewayStableText(disguised)).toThrow("serialization_invalid");
    const dense = [1]; Object.assign(dense, {extra: 7});
    expect(() => ordinalGatewayStableText(dense)).toThrow("serialization_invalid");
    expect(ordinalGatewayStableText([])).toBe("[]");
  });
  it("rejects symbol and nonenumerable properties on strict JSON objects and arrays", () => {
    const symbol = {[Symbol("synthetic")]: 1};
    expect(() => ordinalGatewayStableText(symbol)).toThrow("serialization_invalid");
    expect(() => ordinalGatewayStableText(Object.defineProperty({}, "hidden", {value: 1}))).toThrow("serialization_invalid");
    expect(() => ordinalGatewayStableText(Object.defineProperty([], Symbol("synthetic"), {value: 1}))).toThrow("serialization_invalid");
  });
  it("rejects accessors without invoking getters on objects or indexed array elements", () => {
    const getter = vi.fn(() => 1);
    const object = Object.defineProperty({}, "value", {enumerable: true, get: getter});
    const array = Object.defineProperty(Array(1), "0", {enumerable: true, get: getter});
    expect(() => ordinalGatewayStableText(object)).toThrow("serialization_invalid");
    expect(() => ordinalGatewayStableText(array)).toThrow("serialization_invalid");
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects explicit non-JSON metadata in v2 while leaving accepted legacy v1 intact", () => {
    const r = {...request(), metadata: {key: undefined} as unknown as Record<string, string>};
    const b = buildEffectiveAdapterRequest(prepareGatewayInput(r), route, defaults);
    expect(b.requestFingerprintV1).toMatch(/^[a-f0-9]{64}$/); expect(() => b.ordinalFingerprints()).toThrow("gateway_input_serialization_invalid");
  });
  it("rejects cyclic/deep v2 values but permits repeated non-cyclic references", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => ordinalGatewayStableText(cycle)).toThrow("serialization_invalid");
    let deep: unknown = 1; for (let i = 0; i < 130; i++) deep = {child: deep};
    expect(() => ordinalGatewayStableText(deep)).toThrow("serialization_invalid");
    const child = {a: 1}; expect(ordinalGatewayStableText([child, child])).toBe('[{"a":1},{"a":1}]');
  });
  it("pins defaults and fallback routes before async eligibility and ignores telemetry mutation of repair data", async () => {
    const policy = structuredClone(defaultTaskPolicies.preliminary_understanding);
    const sent: AdapterRequest[] = []; let sends = 0;
    const gateway = createModelGateway({policies: {...defaultTaskPolicies, preliminary_understanding: policy},
      processingEligibility: async () => {policy.maxOutputTokens = 1; policy.timeoutMs = 1; if (policy.fallback) policy.fallback.model = "tampered";
        return {allowed: true, reasons: [], policyVersion: "offroad-provider-retention-v2", assuranceId: null};},
      onCall: log => {if (log.validationIssues) log.validationIssues[0]!.path = "tampered";},
      adapters: {anthropic: {provider: "anthropic", async complete(r) {sent.push(r); sends++; return {output: {}, rawText: "", model: route.model,
        usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, stopReason: "end"};}},
        openai: {provider: "openai", async complete(r) {sent.push(r); return {output: {"é": true, Z: "ok"}, rawText: "", model: "gpt-5.6-terra",
          usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, stopReason: "end"};}}}});
    await gateway.complete({...request(), outputMode: "prompted_json"});
    expect(sends).toBe(2); expect(sent[1]!.system).not.toContain("tampered"); expect(sent[2]!.system).toBe("Review");
    expect(sent.every(r => r.maxOutputTokens === 8000 && r.timeoutMs === 180000)).toBe(true); expect(sent[2]!.model).toBe("gpt-5.6-terra");
  });
  it("preserves all v1 hashes under the historical representation", () => {
    const p = prepareGatewayInput(request()); const b = buildEffectiveAdapterRequest(p, route, defaults);
    expect(b.requestFingerprintV1).toBe(oldHash({schemaVersion: "gateway-adapter-input.v1", provider: route.provider, ...b.adapterRequest, schema: p.schemaJson}));
    expect(b.inputFingerprint).toBe(oldHash(b.adapterRequest.input));
    expect(b.promptFingerprint).toBe(oldHash({system: b.adapterRequest.system, schemaName: b.adapterRequest.schemaName, schema: p.schemaJson}));
  });
  it("clones caller data without freezing the caller or Zod internals", () => {
    const original = request(); const p = prepareGatewayInput(original, false);
    original.input[0] = {type: "text", text: "changed"}; original.metadata!.userId = "changed";
    const b = buildEffectiveAdapterRequest(p, route, defaults);
    expect(b.adapterRequest.input[0]).toEqual({type: "text", text: "Email: private@example.com"});
    expect(b.adapterRequest.metadata?.userId).toBe("synthetic");
    expect(Object.isFrozen(original)).toBe(false); expect(Object.isFrozen(original.metadata)).toBe(false);
    expect(Object.isFrozen(schema)).toBe(false); expect(Object.isFrozen(p.schemaJson)).toBe(true);
    expect(Object.isFrozen(b.adapterRequest)).toBe(true); expect(Object.isFrozen(b.adapterRequest.input[0])).toBe(true);
  });
  it("uses unchanged redaction defaults and explicit opt-out", () => {
    const text = (b: ReturnType<typeof buildEffectiveAdapterRequest>) => JSON.stringify(b.adapterRequest.input);
    expect(text(buildEffectiveAdapterRequest(prepareGatewayInput(request()), route, defaults))).not.toContain("private@example.com");
    expect(text(buildEffectiveAdapterRequest(prepareGatewayInput(request(), {email: false}), route, defaults))).toContain("private@example.com");
  });
  it("preserves PDF/image parts and their owned identities", () => {
    const original = {...request(), input: [{type: "pdf" as const, base64: "synthetic", title: "Synthetic"}]};
    const p = prepareGatewayInput(original); original.input[0]!.title = "changed";
    expect(p.input).toEqual([{type: "pdf", base64: "synthetic", title: "Synthetic"}]);
  });
  it("uses request settings before pinned defaults", () => {
    const p = prepareGatewayInput({...request(), maxOutputTokens: 150, timeoutMs: 2500, cacheKey: "synthetic", thinking: "off", outputMode: "prompted_json"});
    expect(buildEffectiveAdapterRequest(p, route, defaults).adapterRequest).toMatchObject({maxOutputTokens: 150, timeoutMs: 2500, cacheKey: "synthetic", thinking: "off", outputMode: "prompted_json"});
  });
  it("builds repair guidance from the same helper and leaves fallback on the base system", () => {
    const p = prepareGatewayInput(request()); const guidance = buildRepairGuidance("schema", [{path: "Z", code: "invalid_type", message: "unused"}]);
    const primary = buildEffectiveAdapterRequest(p, route, defaults);
    const repair = buildEffectiveAdapterRequest(p, route, defaults, guidance);
    const fallback = buildEffectiveAdapterRequest(p, {provider: "openai", model: "gpt-5.6-terra", effort: "low"}, defaults);
    expect(repair.adapterRequest.system).toBe(`Review\n\n${guidance}`); expect(fallback.adapterRequest.system).toBe("Review");
    expect(new Set([primary, repair, fallback].map(b => b.requestFingerprintV1)).size).toBe(3);
    expect(new Set([primary, repair, fallback].map(b => b.ordinalFingerprints().requestFingerprint)).size).toBe(3);
  });
  it("rejects mutable schema before dispatch without freezing shared internals", () => {
    const mutable = z.object({ok: z.boolean()}); const p = prepareGatewayInput({task: "preliminary_understanding", system: "Review", input: [], schemaName: "mutable", schema: mutable});
    Object.assign(mutable.shape, {ok: z.string()}); expect(() => assertGatewaySchemaUnchanged(p)).toThrow("schema changed");
  });
  it("explicit v2 is independent of host localeCompare and does not rebrand v1", () => {
    const b = buildEffectiveAdapterRequest(prepareGatewayInput(request()), route, defaults);
    const expected = b.ordinalFingerprints(); const spy = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {throw new Error("host locale invoked");});
    try {expect(b.ordinalFingerprints()).toEqual(expected); expect(ordinalGatewayStableText({"é": 1, Z: 2, "😀": 3})).toBe('{"Z":2,"é":1,"😀":3}');} finally {spy.mockRestore();}
    expect(expected.schemaVersion).toBe("gateway-adapter-input.v2"); expect(expected.requestFingerprint).not.toBe(b.requestFingerprintV1);
  });
  it.each([NaN, Infinity, {a: undefined}, new Date(), Array(1)])("v2 rejects non-JSON values without silent normalization: %j", value => {
    expect(() => ordinalGatewayStableText(value)).toThrow("serialization_invalid");
  });
  it("keeps historical dispatch and receipts on v1 while reconstruction reuses the builder", async () => {
    const r = {...request(), model: route, maxOutputTokens: 100, timeoutMs: 1000}; const expected = buildEffectiveAdapterRequest(prepareGatewayInput(r), route, defaults);
    const logs: GatewayCallLog[] = []; let sent!: AdapterRequest;
    const gateway = createModelGateway({onCall: l => logs.push(l), attestInput: async a => {
      expect(a.schemaVersion).toBe("gateway-adapter-input.v1"); expect(a.requestFingerprint).toBe(expected.requestFingerprintV1);
      return {invocationId: a.invocationId, requestFingerprint: a.requestFingerprint, receiptId: "00000000-0000-4000-8000-000000000001"};
    }, adapters: {anthropic: {provider: "anthropic", async complete(value) {sent = value; return {output: {"é": true, Z: "ok"}, model: route.model,
      rawText: "", usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, stopReason: "end"};}}}});
    await gateway.complete(r); expect(sent).toEqual(expected.adapterRequest); expect(logs[0]?.adapterRequestFingerprint).toBe(expected.requestFingerprintV1);
  });
});
