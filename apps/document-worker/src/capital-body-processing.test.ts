import {createHash, randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import * as gatewayModule from "@offroad/model-gateway";
import {legacyGatewayFingerprint, retentionMatrixVersion, type AdapterRequest, type GatewayCallLog} from "@offroad/model-gateway";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createCapitalBodyProcessingAuthority, type CapitalBodyProcessingConfig} from "./capital-body-processing";
type FixtureSchema = {const?: unknown; enum?: unknown[]; anyOf?: FixtureSchema[]; type?: string; required?: string[]; properties?: Record<string, FixtureSchema>; items?: FixtureSchema; minItems?: number; format?: string; pattern?: string; minLength?: number; minimum?: number};
function synthetic(s: FixtureSchema): unknown {
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  if (s.anyOf) return synthetic(s.anyOf.find(x => x.type !== "null") ?? s.anyOf[0]!);
  if (s.type === "object") return Object.fromEntries((s.required ?? []).map(key => [key, synthetic(s.properties![key]!)]));
  if (s.type === "array") return Array.from({length: s.minItems ?? 0}, () => synthetic(s.items!));
  if (s.type === "string") return s.format === "uri" ? "https://example.test/synthetic" : s.pattern ? "assumption_1" : "x".repeat(Math.max(1, s.minLength ?? 1));
  if (s.type === "integer" || s.type === "number") return s.minimum ?? 0;
  if (s.type === "boolean") return true;
  if (s.type === "null") return null;
  throw new Error("unsupported test schema");
}
function harness(options: {primaryAllowed?: boolean; invalidOutput?: boolean; decisionPatch?: Record<string, unknown>; wrongReceipt?: boolean;
  errors?: Array<{code: string; message: string}>; denyRead?: number; changedBytes?: number; changedScope?: number; badBody?: boolean; beforeRpc?: () => void} = {}) {
  const content = {schemaVersion: "capital-body.contribution.v1", content: "Synthetic authorized contribution: CPF 123.456.789-09, ação € 漢字"};
  const bytes = Buffer.from(options.badBody ? '{"unknown":"sensitive"}' : JSON.stringify(content));
  const receipt = {schemaVersion: "capital-retained-body.v1" as const, retentionState: "retained" as const, allocationId: randomUUID(), retainedPayloadId: randomUUID(),
    bodyBasisId: randomUUID(), bucket: "capital-input-capture" as const, path: "server-owned", payloadFingerprint: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length,
    storageObjectId: randomUUID(), storageVersion: "server-version", retainedAt: "2026-10-01T00:00:00Z", uploadExpiresAt: "2026-10-01T00:10:00Z", expiresAt: "2026-10-02T00:00:00Z", purgeAt: "2026-10-01T23:00:00Z", replayed: false};
  const command = {contributionRevisionId: randomUUID(), retentionRequestId: randomUUID()};
  let reads = 0;
  const body = {retainContribution: vi.fn(async () => ({retention: receipt, body: content})), readOriginal: vi.fn(async () => {
    reads++; if (reads === options.denyRead) throw new Error("sensitive authority error");
    return {bytes: reads === options.changedBytes ? Buffer.from("other source") : bytes,
      scope: reads === options.changedScope ? {...receipt, bodyBasisId: randomUUID()} : {...receipt, replayed: true}};
  })} as unknown as CapitalBodyProcessingConfig["body"];
  const requests: Array<{name: string; args: Record<string, unknown>}> = [], decisions = new Map<string, {attempt: Record<string, unknown>; id: string}>();
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    requests.push({name, args}); options.beforeRpc?.();
    if (options.errors?.length) return {data: null, error: options.errors.shift()};
    if (name === "worker_authorize_capital_body_processing_v1") {
      const attempt = args.p_attempt as Record<string, unknown>, id = randomUUID(); decisions.set(id, {attempt, id});
      const allowed = Boolean(attempt.usedProviderFallback) || options.primaryAllowed === true;
      const assurances = [randomUUID(), randomUUID(), randomUUID()];
      return {error: null, data: {schemaVersion: "capital-body-processing-decision.v1", allowed, policyVersion: retentionMatrixVersion,
        assuranceId: null, assuranceIds: allowed ? assurances : [], decisionId: randomUUID(), classification: "restricted",
        reasons: allowed ? [] : ["processing_resource_ineligible:inference"], attemptReceiptId: id, invocationId: attempt.invocationId,
        requestFingerprint: attempt.requestFingerprint, eligibilityFingerprint: "d".repeat(64), replayed: false, ...options.decisionPatch}};
    }
    const record = decisions.get(args.p_attempt_receipt_id as string)!;
    return {error: null, data: {receiptId: randomUUID(), invocationId: options.wrongReceipt ? randomUUID() : record.attempt.invocationId, requestFingerprint: record.attempt.requestFingerprint}};
  });
  const sends: Array<{provider: string; request: AdapterRequest}> = [], logs: GatewayCallLog[] = [];
  const output = originationSeniorReadoutSchema.parse(synthetic(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const adapters = Object.fromEntries(["anthropic", "openai"].map(provider => [provider, {provider, async complete(request: AdapterRequest) {
    sends.push({provider, request}); return {output: options.invalidOutput ? {} : structuredClone(output), model: request.model,
      usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, stopReason: "end"};
  }}])) as CapitalBodyProcessingConfig["adapters"];
  const binding = {accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-version", region: "global"};
  const config: CapitalBodyProcessingConfig = {supabase: {rpc} as unknown as SupabaseClient, body,
    authority: {jobId: randomUUID(), capabilityToken: "synthetic-job-capability"}, connections: {anthropic: {...binding}, openai: {...binding}}, adapters, onCall: log => logs.push(log)};
  const factory = createCapitalBodyProcessingAuthority(config);
  return {factory, command, config, receipt, bytes, requests, rpc, sends, logs, body};
}
describe("closed capital body processing authority", () => {
  it("dispatches only SQL-admitted fallback from the exact governed/redacted contribution and binds its input receipt", async () => {
    const h = harness(); const {result} = await h.factory.run(h.command);
    expect(h.sends.map(send => send.provider)).toEqual(["openai"]);
    expect(h.sends[0]!.request.input[0]).toMatchObject({type: "text"});
    expect(JSON.stringify(h.sends[0]!.request.input)).not.toContain("123.456.789-09");
    const attempts = h.requests.filter(row => row.name === "worker_authorize_capital_body_processing_v1");
    expect(attempts).toHaveLength(2);
    expect(attempts[1]!.args.p_attempt).toMatchObject({previousInvocationId: (attempts[0]!.args.p_attempt as {invocationId: string}).invocationId,
      inputFingerprint: legacyGatewayFingerprint(h.sends[0]!.request.input)});
    for (const row of attempts) {
      expect(row.args.p_resources).toEqual(["inference", "prompt_cache", "schema_cache"]);
      expect(row.args.p_components).toEqual([{kind: "retained_payload", id: h.receipt.retainedPayloadId}]);
      expect(JSON.stringify(row.args)).not.toContain("123.456.789-09");
    }
    expect(h.requests.filter(row => row.name === "worker_record_capital_body_input_v2")).toHaveLength(1);
    expect(result.acceptedInvocation?.invocationId).toBe((attempts[1]!.args.p_attempt as {invocationId: string}).invocationId);
    expect(result.acceptedInvocation?.inputAttestationReceiptId).toBeTruthy();
  });
  it("admits a primary success without creating an artificial fallback", async () => {
    const h = harness({primaryAllowed: true}); await h.factory.run(h.command);
    expect(h.sends.map(send => send.provider)).toEqual(["anthropic"]);
    expect(h.requests.filter(row => row.name === "worker_authorize_capital_body_processing_v1")).toHaveLength(1);
  });
  it("does not turn sent primary rejection into proven predecessor outcome", async () => {
    const h = harness({primaryAllowed: true, invalidOutput: true}); await expect(h.factory.run(h.command)).rejects.toThrow("capital_body_processing_denied");
    expect(h.sends.map(send => send.provider)).toEqual(["anthropic"]);
    expect(h.requests.filter(row => row.name === "worker_authorize_capital_body_processing_v1")).toHaveLength(1);
  });
  it.each([{prompt: "private extra prompt"}, {components: [{kind: "contribution", id: randomUUID()}]}, {input: []}])("rejects arbitrary renderer inputs before source or SQL access (%j)", async extra => {
    const h = harness(); await expect(h.factory.run({...h.command, ...extra})).rejects.toThrow("capital_body_processing_denied");
    expect(h.body.retainContribution).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled(); expect(h.sends).toHaveLength(0);
  });
  it.each([null, "private-client-content", "10000000-0000-4000-0000-000000000001"])("rejects malformed SQL decision identity with sanitized failure (%s)", async decisionId => {
    const h = harness({decisionPatch: {decisionId}}); await expect(h.factory.run(h.command)).rejects.toThrow(/^capital_body_processing_denied$/); expect(h.sends).toHaveLength(0);
  });
  it.each([{invocationId: randomUUID()}, {requestFingerprint: "e".repeat(64)}, {allowed: true, reasons: ["private_code"]}, {extraSensitiveKey: "private content"}])("rejects unbound or contradictory SQL decision (%j)", async decisionPatch => {
    const h = harness({decisionPatch}); await expect(h.factory.run(h.command)).rejects.toThrow(/^capital_body_processing_denied$/); expect(h.sends).toHaveLength(0);
  });
  it("rejects a receipt for another invocation without dispatch", async () => {
    const h = harness({wrongReceipt: true}); await expect(h.factory.run(h.command)).rejects.toThrow("capital_body_processing_denied"); expect(h.sends).toHaveLength(0);
  });
  it.each([{denyRead: 2}, {denyRead: 4}, {changedBytes: 2}, {changedScope: 2}, {badBody: true}])("revalidates physical bytes and receipt before each SQL frontier (%j)", async options => {
    const h = harness(options); await expect(h.factory.run(h.command)).rejects.toThrow("capital_body_processing_denied"); expect(h.sends).toHaveLength(0);
  });
  it.each(["capital_capture_retry", "capital_body_retention_pending", "capital_body_processing_retry"])("retries only the same transient authority command (%s)", async message => {
    const h = harness({errors: [{code: "40001", message}]}); await h.factory.run(h.command);
    expect(h.requests[0]).toEqual(h.requests[1]); expect(h.sends).toHaveLength(1);
  });
  it.each([{code: "40001", message: "capital_body_processing_changed"}, {code: "40001", message: "private unexpected error"}, {code: "42501", message: "capital_body_processing_retry"}, {code: "TIMEOUT", message: "private timeout"}])("terminal authority failures do not retry, regenerate IDs or dispatch (%j)", async error => {
    const h = harness({errors: [error]}); await expect(h.factory.run(h.command)).rejects.toThrow(/^capital_body_processing_denied$/);
    expect(h.rpc).toHaveBeenCalledTimes(1); expect(h.sends).toHaveLength(0);
  });
  it("exhausts bounded transient retry without model calls", async () => {
    const h = harness({errors: Array.from({length: 3}, () => ({code: "40001", message: "capital_body_processing_retry"}))});
    await expect(h.factory.run(h.command)).rejects.toThrow("capital_body_processing_denied");
    expect(h.rpc).toHaveBeenCalledTimes(3); expect(h.requests.every(row => JSON.stringify(row) === JSON.stringify(h.requests[0]))).toBe(true); expect(h.sends).toHaveLength(0);
  });
  it("pins connection, authority, adapters and command identities across awaits without freezing caller objects", async () => {
    const h = harness(); const before = structuredClone(h.config.connections);
    const promise = h.factory.run(h.command); h.command.contributionRevisionId = randomUUID(); h.config.authority.capabilityToken = "other-capability";
    h.config.connections.openai!.accountRef = "private-mutated-account"; delete h.config.adapters.openai;
    await promise;
    expect((h.requests[1]!.args.p_route as {accountRef: string}).accountRef).toBe(before.openai!.accountRef);
    expect(h.requests[0]!.args.p_capability_token).toBe("synthetic-job-capability"); expect(Object.isFrozen(h.config.connections)).toBe(false); expect(h.sends).toHaveLength(1);
  });
  it.each(["system", "input", "maxOutputTokens", "metadata", "effort", "outputMode", "purpose", "contextExtra", "schemaName", "cacheKey"])("refuses an altered effective request before authority or dispatch (%s)", async field => {
    const original = gatewayModule.createModelGateway;
    const spy = vi.spyOn(gatewayModule, "createModelGateway").mockImplementationOnce(config => {
      const gateway = original(config);
      return {...gateway, complete: request => gateway.complete({...request,
        ...(field === "system" ? {system: "private unexpected prompt"} : {}),
        ...(field === "input" ? {input: [...request.input, {type: "text" as const, text: "private ungoverned source"}]} : {}),
        ...(field === "maxOutputTokens" ? {maxOutputTokens: 1001} : {}),
        ...(field === "metadata" ? {metadata: {privateUnexpectedKey: "private value"}} : {}),
        ...(field === "effort" ? {model: {effort: "high" as const}} : {}),
        ...(field === "outputMode" ? {outputMode: "prompted_json" as const} : {}),
        ...(field === "purpose" ? {dataHandling: {...request.dataHandling!, purpose: "public_research" as const}} : {}),
        ...(field === "contextExtra" ? {dataHandling: {...request.dataHandling!, extraPrivateContext: "private value"} as typeof request.dataHandling} : {}),
        ...(field === "schemaName" ? {schemaName: "other-schema"} : {}),
        ...(field === "cacheKey" ? {cacheKey: "private caller cache"} : {}),
      })};
    });
    try {
      const h = harness(); await expect(h.factory.run(h.command)).rejects.toThrow(/^capital_body_processing_denied$/);
      expect(h.rpc).not.toHaveBeenCalled(); expect(h.sends).toHaveLength(0);
    } finally {spy.mockRestore();}
  });
  it("does not redispatch or reset its per-operation budget on repeated factory run", async () => {
    const h = harness(); await h.factory.run(h.command);
    await expect(h.factory.run(h.command)).rejects.toThrow("capital_body_processing_denied"); expect(h.sends).toHaveLength(1);
  });
  it.each([{assuranceIds: [randomUUID()]}, {assuranceIds: ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001", randomUUID()]}])("requires distinct assurances for all three resources (%j)", async ({assuranceIds}) => {
    const h = harness({decisionPatch: {allowed: true, reasons: [], assuranceIds}}); await expect(h.factory.run(h.command)).rejects.toThrow("capital_body_processing_denied"); expect(h.sends).toHaveLength(0);
  });
  it("requires both declared connections before retaining source", () => {
    const h = harness(); delete h.config.connections.openai;
    expect(() => createCapitalBodyProcessingAuthority(h.config)).toThrow("capital_body_processing_denied");
    expect(h.body.retainContribution).not.toHaveBeenCalled();
  });
});
