import {test, vi} from "vitest";
import {createClient} from "@supabase/supabase-js";
vi.mock("@supabase/supabase-js", async importOriginal => {const actual = await importOriginal<typeof import("@supabase/supabase-js")>(); return {...actual, createClient: vi.fn(actual.createClient)};});
import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {createCapitalBodyRetention} from "./capital-body-retention";
import {z} from "zod";
import {originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import {legacyGatewayFingerprint, type GatewayResult} from "@offroad/model-gateway";
const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
function harness(options: {badBytes?: boolean; denyAfter?: boolean; wrongVersion?: boolean; expireDuring?: boolean; longerDeadline?: boolean; replay?: boolean; error409?: boolean; acceptedOutput?: unknown; wrongAcceptedReceipt?: boolean; changedReadScope?: boolean; beforeAcceptedReturn?: () => void; beforePrepareReturn?: () => void; rpcError?: unknown; extraScopeKey?: string; rpcFailures?: unknown[]; rpcThrown?: boolean} = {}) {
  const calls: {name: string; args: Record<string, unknown>}[] = [];
  let uploads = 0, downloads = 0, reads = 0, clock = Date.parse("2026-10-01T00:00:00Z");
  const allocationId = randomUUID(), retainedPayloadId = randomUUID(), objectId = randomUUID();
  const canonicalBody = options.acceptedOutput ? JSON.stringify(options.acceptedOutput, null, 1) : '{"content": "Synthetic author contribution", "schemaVersion": "capital-body.contribution.v1"}';
  const bytes = Buffer.from(canonicalBody);
  const base = {schemaVersion: "capital-retained-body.v1", allocationId, bodyBasisId: randomUUID(), bucket: "capital-input-capture",
    path: `${randomUUID()}/${allocationId}/payload.json`, payloadFingerprint: sha(bytes), byteLength: bytes.byteLength,
    retainedAt: "2026-10-01T00:00:00Z", uploadExpiresAt: "2026-10-01T00:02:00Z", purgeAt: "2026-10-01T00:10:00Z", expiresAt: "2026-10-01T00:20:00Z", replayed: false};
  const retained = {...base, retentionState: "retained", retainedPayloadId, storageObjectId: objectId, storageVersion: "immutable-version"};
  const transport = {
    async rpc(name: string, args: Record<string, unknown>) {calls.push({name, args});
      if (options.rpcThrown) throw new Error("sensitive transport timeout");
      if (options.rpcFailures?.length) return {error: options.rpcFailures.shift(), data: null};
      if (options.rpcError) return {error: options.rpcError, data: null};
      if (name === "worker_record_capital_body_accepted_v1") {const a = args.p_accepted as Record<string, unknown>; options.beforeAcceptedReturn?.(); return {error: null, data: {acceptedInvocationId: randomUUID(), inputReceiptId: options.wrongAcceptedReceipt ? randomUUID() : a.inputAttestationReceiptId, invocationId: a.invocationId, outputFingerprint: a.outputFingerprint}};}
      if (name === "worker_prepare_capital_body_v1") {options.beforePrepareReturn?.(); return {error: null, data: options.replay ? {...retained, replayed: true} : {...base, retentionState: "allocated", retainedPayloadId: null, storageObjectId: null, storageVersion: null, canonicalBody, ...(options.extraScopeKey ? {[options.extraScopeKey]: "sensitive value"} : {})}};}
      if (name === "worker_commit_capital_body_v1") return {error: null, data: {...retained, ...(options.longerDeadline ? {expiresAt: "2026-10-01T00:30:00Z"} : {})}};
      if (name === "worker_read_capital_body_v1") {reads++; return options.denyAfter && reads > 1 ? {data: null, error: {message: "DO NOT LEAK PRIVATE TEXT"}} : {data: {...retained, replayed: true, ...(options.changedReadScope && reads > 1 ? {bodyBasisId: randomUUID()} : {})}, error: null};}
      throw new Error(`Unexpected RPC ${name}`);
    },
    storage: {from() {return {
      async upload(_p: string, b: Uint8Array, config: {upsert: boolean}) {uploads++; assert.deepEqual(Buffer.from(b), bytes); assert.equal(config.upsert, false); return {error: options.error409 ? {statusCode: 409} : null};},
    };}},
    functions: {async invoke(_name: string, command: {body: {allocationId: string; kind: string}; headers: Record<string, string>}) {
      downloads++; assert.equal(command.body.kind, "typed_body"); assert.equal(command.body.allocationId, allocationId);
      if (options.expireDuring) clock = Date.parse(base.purgeAt);
      const downloaded = options.badBytes ? Buffer.from("wrong") : bytes;
      return {error: null, data: new Blob([downloaded]), response: new Response(null, {headers: {"content-type": "application/octet-stream", "cache-control": "no-store",
        "x-offroad-allocation-id": allocationId, "x-offroad-object-id": objectId, "x-offroad-storage-version": options.wrongVersion ? "other" : "immutable-version",
        "x-offroad-payload-sha256": base.payloadFingerprint, "x-offroad-byte-length": String(bytes.byteLength)}})};
    }},
  };
  const authority = {jobId: randomUUID(), capabilityToken: "synthetic-live-job-capability"};
  vi.mocked(createClient).mockReturnValueOnce(transport as unknown as ReturnType<typeof createClient>);
  const client = createCapitalBodyRetention({supabaseUrl: "https://synthetic.supabase.co", publishableKey: "sb_publishable_synthetic", organizationId: randomUUID(), accessToken: async () => null}, authority, () => clock);
  return {client, calls, base, retained, authority, count: () => ({uploads, downloads}), revisionId: randomUUID()};
}
test("SQL-owned canonical UTF8 is roundtripped, SHA physical retained, original body RPC before/after read", async () => {
  const h = harness(); const r = await h.client.retainContribution(h.revisionId, randomUUID());
  assert.deepEqual(r.body, {content: "Synthetic author contribution", schemaVersion: "capital-body.contribution.v1"});
  assert.equal(h.count().uploads, 1); assert.equal(h.count().downloads, 2);
  assert.deepEqual(h.calls.map(c => c.name), ["worker_prepare_capital_body_v1", "worker_commit_capital_body_v1", "worker_read_capital_body_v1", "worker_read_capital_body_v1"]);
  assert.equal(h.calls[0]!.args.p_body, null); assert.equal(h.calls[0]!.args.p_origin_or_accepted_id, h.revisionId);
  assert.equal(h.calls[1]!.args.p_verified_sha256, h.base.payloadFingerprint);
});
test("wrong physical bytes never commit", async () => {const h = harness({badBytes: true}); await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID())); assert.equal(h.calls.length, 1);});
test("revocation after bytes and before second SQL read denies consumer and sanitizes remote errors", async () => {const h = harness({denyAfter: true}); await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID()), /capital_body_adapter_denied/);});
test("expiry during HTTP download does not commit", async () => {const h = harness({expireDuring: true}); await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID())); assert.equal(h.calls.length, 1);});
test("changed committed storage version denies consumer", async () => {const h = harness({wrongVersion: true}); await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID()));});
test("server response cannot extend originally allocated deadline", async () => {const h = harness({longerDeadline: true}); await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID()));});
test("lost response retained replay reauthorizes and rereads without upload", async () => {const h = harness({replay: true}); await h.client.retainContribution(h.revisionId, randomUUID()); assert.equal(h.count().uploads, 0); assert.equal(h.count().downloads, 1); assert.equal(h.calls.filter(c => c.name === "worker_read_capital_body_v1").length, 2);});
test("409 is tolerated only with subsequent exact physical readback", async () => {const h = harness({error409: true, badBytes: true}); await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID())); assert.equal(h.calls.length, 1);});
test("accepted DTO absent or cassette true cannot produce SQL/body", async () => {
  const h = harness(); await assert.rejects(h.client.retainAccepted({output: {}} as GatewayResult<unknown>, randomUUID()));
  await assert.rejects(h.client.retainAccepted({output: {}, acceptedInvocation: {fromCassette: true}} as GatewayResult<unknown>, randomUUID())); assert.equal(h.calls.length, 0);
});

// Synthetic only: generate the minimum shape from the ACTUAL published JSON schema.
type FixtureSchema = {const?: unknown; enum?: unknown[]; anyOf?: FixtureSchema[]; type?: string; required?: string[]; properties?: Record<string, FixtureSchema>; items?: FixtureSchema; minItems?: number; format?: string; pattern?: string; minLength?: number; minimum?: number};
function fixture(s: FixtureSchema): unknown {
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  if (s.anyOf) return fixture(s.anyOf.find((x: FixtureSchema) => x.type !== "null") ?? s.anyOf[0]!);
  if (s.type === "object") return Object.fromEntries((s.required ?? []).map((key: string) => [key, fixture(s.properties![key]!)]));
  if (s.type === "array") return Array.from({length: s.minItems ?? 0}, () => fixture(s.items!));
  if (s.type === "string") return s.format === "uri" ? "https://example.test/synthetic" : s.pattern ? "assumption_1" : "x".repeat(Math.max(1, s.minLength ?? 1));
  if (s.type === "number" || s.type === "integer") return s.minimum ?? 0;
  if (s.type === "boolean") return true;
  if (s.type === "null") return null;
  throw new Error("unhandled synthetic schema");
}
function nativeResult(output: unknown) {
  return {output, acceptedInvocation: {schemaVersion: "gateway-accepted-invocation.v1", invocationId: randomUUID(),
    adapterInputVersion: "gateway-adapter-input.v1", adapterRequestFingerprint: "a".repeat(64), outputFingerprintVersion: "gateway-parsed-output.v1",
    outputFingerprint: legacyGatewayFingerprint(output), inputFingerprint: "b".repeat(64), promptFingerprint: "c".repeat(64),
    provider: "anthropic", configuredModel: "claude-sonnet-5", reportedModel: "claude-sonnet-5", schemaName: "origination_senior_readout_v2",
    retryOrdinal: 0, isSameModelRepair: false, usedProviderFallback: false, fromCassette: false, inputAttestationReceiptId: randomUUID()}} as GatewayResult<unknown>;
}
test("real senior readout parsed output is body retained with JS fingerprint distinct from canonical physical SHA", async () => {
  const output = originationSeniorReadoutSchema.parse(fixture(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const h = harness({acceptedOutput: output}); const result = await h.client.retainAccepted(nativeResult(output), randomUUID());
  assert.deepEqual(result.body, output); assert.notEqual(result.retention.payloadFingerprint, legacyGatewayFingerprint(output));
  assert.equal(h.calls[0]!.name, "worker_record_capital_body_accepted_v1");
  assert.equal(h.calls[1]!.args.p_gateway_output_fingerprint, legacyGatewayFingerprint(output));
});
test("mutated output, wrong semantic hash, or schema invalid cannot register an accepted response", async () => {
  const output = originationSeniorReadoutSchema.parse(fixture(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const h = harness({acceptedOutput: output}); const result = nativeResult(output);
  (result.output as {executiveRead: string}).executiveRead = "changed".repeat(20);
  await assert.rejects(h.client.retainAccepted(result, randomUUID()));
  await assert.rejects(h.client.retainAccepted(nativeResult({}), randomUUID())); assert.equal(h.calls.length, 0);
});

test("accepted receipt from another attempt cannot prepare or upload a body", async () => {
  const output = originationSeniorReadoutSchema.parse(fixture(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const h = harness({acceptedOutput: output, wrongAcceptedReceipt: true});
  await assert.rejects(h.client.retainAccepted(nativeResult(output), randomUUID()), /capital_body_adapter_denied/);
  assert.deepEqual(h.calls.map(c => c.name), ["worker_record_capital_body_accepted_v1"]); assert.equal(h.count().uploads, 0);
});
test("physical SHA of a different valid senior body does not satisfy accepted semantic fingerprint", async () => {
  const output = originationSeniorReadoutSchema.parse(fixture(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const changed = {...output, executiveRead: "Another synthetic body".repeat(8)};
  const h = harness({acceptedOutput: changed});
  await assert.rejects(h.client.retainAccepted(nativeResult(output), randomUUID()), /capital_body_adapter_denied/);
  assert.equal(h.count().uploads, 0);
});
test("result and accepted DTO are pinned before async SQL yields", async () => {
  const output = originationSeniorReadoutSchema.parse(fixture(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const candidate = nativeResult(output);
  const h = harness({acceptedOutput: structuredClone(output), beforeAcceptedReturn() {
    (candidate.output as {executiveRead: string}).executiveRead = "Mutated".repeat(20);
    candidate.acceptedInvocation = {...candidate.acceptedInvocation!, outputFingerprint: "f".repeat(64)};
  }});
  const r = await h.client.retainAccepted(candidate, randomUUID());
  assert.notDeepEqual(r.body, candidate.output); assert.equal(h.count().uploads, 1);
});
test("changed provenance basis after physical download never escapes", async () => {
  const h = harness({changedReadScope: true}); await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID()), /capital_body_adapter_denied/);
});
test("original job and capability remain pinned through caller mutation", async () => {
  let h: ReturnType<typeof harness>;
  h = harness({beforePrepareReturn() {h.authority.jobId = randomUUID(); h.authority.capabilityToken = "other-synthetic-capability";}});
  const original = {...h.authority}; await h.client.retainContribution(h.revisionId, randomUUID());
  for (const c of h.calls) {assert.equal(c.args.p_job_id, original.jobId); assert.equal(c.args.p_capability_token, original.capabilityToken);}
});
test("missing receipt, foreign fields and impossible repair flags deny before accepted RPC", async () => {
  const output = originationSeniorReadoutSchema.parse(fixture(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const h = harness({acceptedOutput: output});
  for (const changes of [{inputAttestationReceiptId: undefined}, {extraContent: "must never enter receipt"}, {retryOrdinal: 1, isSameModelRepair: false}]) {
    const original = nativeResult(output);
    const r = {...original, acceptedInvocation: {...original.acceptedInvocation!, ...changes}} as unknown as GatewayResult<unknown>;
    await assert.rejects(h.client.retainAccepted(r, randomUUID()), /capital_body_adapter_denied/);
  }
  assert.equal(h.calls.length, 0);
});

test("arbitrary sensitive DTO/scope keys and provider values cannot escape through Zod error text", async () => {
  const marker = "PRIVATE_FINANCIAL_DATA_SHOULD_NEVER_ESCAPE";
  const output = originationSeniorReadoutSchema.parse(fixture(z.toJSONSchema(originationSeniorReadoutSchema) as FixtureSchema));
  const h = harness({acceptedOutput: output});
  for (const changes of [{[marker]: "sensitive data"}, {provider: marker}]) {
    const original = nativeResult(output);
    const candidate = {...original, acceptedInvocation: {...original.acceptedInvocation!, ...changes}} as unknown as GatewayResult<unknown>;
    await assert.rejects(h.client.retainAccepted(candidate, randomUUID()), (error: Error) => {
      assert.equal(error.message, "capital_body_adapter_denied"); assert.equal(error.cause, undefined); return true;
    });
  }
  assert.equal(h.calls.length, 0);
  const badScope = harness({extraScopeKey: marker});
  await assert.rejects(badScope.client.retainContribution(badScope.revisionId, randomUUID()), (error: Error) => {
    assert.equal(error.message, "capital_body_adapter_denied"); assert.equal(error.cause, undefined); return true;
  });
});
test("outbound RPC failure cannot leak body, capability, SQL detail or sensitive keys", async () => {
  const h = harness({rpcError: {message: "PRIVATE_FINANCIAL_DATA", details: "SELECT full_body and capability", hint: "private secret", arbitrary: "secret"}});
  await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID()), (error: Error) => {
    assert.equal(error.message, "capital_body_adapter_denied"); assert.equal(error.cause, undefined); return true;
  });
  assert.equal(h.count().uploads, 0);
});

test("pending40001 retries the same immutable request and succeeds without model dispatch", async () => {
  const h = harness({rpcFailures: [{code: "40001", message: "capital_body_retention_pending"}, {code: "40001", message: "capital_capture_retry"}]});
  const requestId = randomUUID(); await h.client.retainContribution(h.revisionId, requestId);
  const attempts = h.calls.slice(0, 3); assert.equal(attempts.length, 3);
  assert.deepEqual(attempts.map(c => c.name), Array(3).fill("worker_prepare_capital_body_v1"));
  for (const c of attempts) {assert.deepEqual(c.args, attempts[0]!.args); assert.equal(c.args.p_request_id, requestId);}
  assert.equal(h.count().uploads, 1);
});
test("pending40001 exhausts exactly three attempts and sanitizes failure", async () => {
  const h = harness({rpcError: {code: "40001", message: "capital_body_retention_pending private text"}});
  await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID()), {message: "capital_body_adapter_denied"});
  assert.equal(h.calls.length, 3); assert.equal(h.count().uploads, 0);
});
test("authority42501 and transport timeout never retry", async () => {
  for (const options of [{rpcError: {code: "42501", message: "denied private text"}}, {rpcThrown: true}]) {
    const h = harness(options);
    await assert.rejects(h.client.retainContribution(h.revisionId, randomUUID()), {message: "capital_body_adapter_denied"});
    assert.equal(h.calls.length, 1); assert.equal(h.count().uploads, 0);
  }
});

const syntheticJWT = (role = "authenticated") => `synthetic.${Buffer.from(JSON.stringify({role})).toString("base64url")}.signature`;
test("real SDK isolates concurrent job headers and pins connection before asynchronous token resolution", async () => {
  const h = harness();
  const bytes = Buffer.from('{"content": "Synthetic author contribution", "schemaVersion": "capital-body.contribution.v1"}');
  const organizationId = h.base.path.split("/")[0]!;
  const first = {jobId: randomUUID(), capabilityToken: "first-job-capability"};
  const second = {jobId: randomUUID(), capabilityToken: "second-job-capability"};
  const observed: {job: string | null; cap: string | null; workspace: string | null; path: string}[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers), path = String(input);
    assert.equal(headers.get("authorization"), `Bearer ${syntheticJWT()}`);
    assert.equal(init?.redirect, "error");
    observed.push({job: headers.get("x-offroad-job-id"), cap: headers.get("x-offroad-capability"), workspace: headers.get("x-offroad-workspace"), path});
    await new Promise(resolve => setTimeout(resolve, 1));
    return path.includes("/rest/v1/rpc/")
      ? new Response(JSON.stringify(h.retained), {headers: {"content-type": "application/json"}})
      : new Response(bytes, {headers: {"content-type": "application/octet-stream", "cache-control": "no-store", "x-offroad-allocation-id": h.retained.allocationId,
        "x-offroad-object-id": h.retained.storageObjectId, "x-offroad-storage-version": h.retained.storageVersion, "x-offroad-payload-sha256": h.retained.payloadFingerprint,
        "x-offroad-byte-length": String(h.retained.byteLength)}});
  };
  const connection = {supabaseUrl: "https://synthetic.supabase.co", publishableKey: "sb_publishable_synthetic", organizationId,
    accessToken: async () => {await new Promise(resolve => setTimeout(resolve, 1)); return syntheticJWT();}, fetch: fetcher};
  const a = createCapitalBodyRetention(connection, first, () => Date.parse(h.base.retainedAt));
  const b = createCapitalBodyRetention(connection, second, () => Date.parse(h.base.retainedAt));
  connection.organizationId = randomUUID(); connection.fetch = async () => {throw new Error("mutated caller fetch");};
  first.capabilityToken = "mutated caller capability";
  await Promise.all([a.readOriginal(h.retained.retainedPayloadId), b.readOriginal(h.retained.retainedPayloadId)]);
  assert.equal(observed.length, 6);
  for (const v of observed) {
    assert.equal(v.workspace, organizationId);
    assert.equal(v.cap, v.job === first.jobId ? "first-job-capability" : "second-job-capability");
  }
  assert.equal(observed.filter(v => v.path.includes("/functions/v1/capital-body-read")).length, 2);
});
test("connection forbids privileged keys, preserves safe token errors and refuses token role escalation", async () => {
  const base = {supabaseUrl: "https://synthetic.supabase.co", publishableKey: "sb_publishable_synthetic", organizationId: randomUUID(), accessToken: async () => syntheticJWT()};
  const authority = {jobId: randomUUID(), capabilityToken: "synthetic-capability"};
  for (const publishableKey of ["sb_secret_sensitive", syntheticJWT("service_role")]) {
    assert.throws(() => createCapitalBodyRetention({...base, publishableKey}, authority), {message: "capital_body_adapter_denied"});
  }
  for (const accessToken of [async () => {throw new Error("private sensitive token getter error");}, async () => syntheticJWT("service_role")]) {
    let requests = 0;
    const body = createCapitalBodyRetention({...base, accessToken, fetch: async (_input, init) => {
      requests++; assert.equal(new Headers(init?.headers).get("authorization"), "Bearer sb_publishable_synthetic");
      return new Response(JSON.stringify({code: "42501", message: "private remote message"}), {status: 403, headers: {"content-type": "application/json"}});
    }}, authority);
    await assert.rejects(body.readOriginal(randomUUID()), {message: "capital_body_adapter_denied"});
    assert.equal(requests, 1);
  }
});
