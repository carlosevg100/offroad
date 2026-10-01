import {test} from "vitest";
import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {createCapitalBodyReadHandler, capitalBodyReadServerConfigFromEnvironment} from "./capital-body-read-handler";
const token = (role: string, sub: string) => `synthetic.${Buffer.from(JSON.stringify({role, sub})).toString("base64url")}.signature`;
function fixture(opts: {denyBefore?: boolean; denyAfter?: boolean; wrongBytes?: boolean; wrongInfo?: boolean; oversized?: boolean; changedScope?: boolean; expiresDuring?: boolean; wrongActor?: boolean; publicSource?: boolean; modernKeys?: boolean; pending?: number; pendingForever?: boolean; throwTransport?: boolean} = {}) {
  let clock = Date.parse("2026-10-01T00:00:00Z"), scopes = 0;
  const actor = randomUUID(), org = randomUUID(), job = randomUUID(), allocation = randomUUID(), objectId = randomUUID();
  const bytes = new TextEncoder().encode('{"text":"ação € 漢字 🧮"}');
  const hash = createHash("sha256").update(bytes).digest("hex"), version = randomUUID();
  const scope = {schemaVersion: "capital-retained-body.v1", retentionState: "allocated", allocationId: allocation, retainedPayloadId: null,
    bodyBasisId: randomUUID(), bucket: "capital-input-capture", path: `${org}/${allocation}/payload.json`, payloadFingerprint: hash, byteLength: bytes.length,
    storageObjectId: objectId, storageVersion: version, retainedAt: "2026-10-01T00:00:00Z", uploadExpiresAt: "2026-10-01T00:02:00Z",
    expiresAt: "2026-10-01T00:10:00Z", purgeAt: "2026-10-01T00:09:00Z", replayed: false};
  const publicScope = {schemaVersion: "capital-public-storage-scope.v1", state: "allocated", allocationId: allocation, retainedPayloadId: null,
    deliveryId: randomUUID(), bucket: scope.bucket, path: scope.path, payloadFingerprint: hash, byteLength: bytes.length, storageObjectId: objectId,
    storageVersion: version, retainedAt: scope.retainedAt, uploadExpiresAt: scope.uploadExpiresAt, expiresAt: scope.expiresAt, purgeAt: scope.purgeAt};
  const calls: {path: string; init: RequestInit}[] = [];
  const bodyJSON = (v: unknown, status = 200) => new Response(JSON.stringify(v), {status, headers: {"content-type": "application/json"}});
  const handler = createCapitalBodyReadHandler({supabaseUrl: "https://synthetic.supabase.co", anonKey: opts.modernKeys ? "sb_publishable_synthetic" : token("anon", actor), serviceRoleKey: opts.modernKeys ? "sb_secret_synthetic" : token("service_role", actor), now: () => clock,
    fetch: async (input, init = {}) => {
      const path = String(input); calls.push({path, init}); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      if (path.includes("/auth/")) return bodyJSON({id: opts.wrongActor ? randomUUID() : actor});
      if (path.includes("/rest/")) {
        scopes++;
        if (opts.throwTransport) throw new Error("sensitive transport message");
        if (opts.pendingForever || (opts.pending ?? 0) >= scopes) return bodyJSON({code: "40001", message: "sensitive SQL pending"}, 409); assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token("authenticated", actor)}`);
        assert.deepEqual(JSON.parse(String(init.body)), {p_job_id: job, p_capability_token: "synthetic-job-capability", p_allocation_id: allocation});
        if (opts.denyBefore || (opts.denyAfter && scopes > 1)) return bodyJSON({code: "42501", error: "secret SQL payload"}, 403);
        return bodyJSON({...opts.publicSource ? publicScope : scope, ...(opts.changedScope && scopes > 1 ? {storageVersion: randomUUID()} : {})});
      }
      if (opts.modernKeys) {
        assert.equal(new Headers(init.headers).get("authorization"), null);
        assert.equal(new Headers(init.headers).get("apikey"), "sb_secret_synthetic");
      } else assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token("service_role", actor)}`);
      assert.ok(!new Headers(init.headers).has("x-offroad-capability"));
      if (path.includes("/info/")) return bodyJSON({id: opts.wrongInfo ? randomUUID() : objectId, name: scope.path, version,
        bucket_id: scope.bucket, size: bytes.length, content_type: "application/json"});
      if (opts.expiresDuring) clock = Date.parse(scope.purgeAt);
      return new Response(opts.oversized ? new Uint8Array(1048577) : opts.wrongBytes ? new TextEncoder().encode("wrong") : bytes);
    }});
  const request = (body: unknown = {allocationId: allocation, kind: opts.publicSource ? "public_source" : "typed_body"}, extra: Record<string, string> = {}, method = "POST") => new Request("https://synthetic.supabase.co/functions/v1/capital-body-read", {
    method, headers: {authorization: `Bearer ${token("authenticated", actor)}`, "content-type": "application/json", "x-offroad-workspace": org, "x-offroad-job-id": job,
      "x-offroad-capability": "synthetic-job-capability", ...extra}, ...(method === "POST" ? {body: JSON.stringify(body)} : {})});
  return {handler, request, calls, bytes, hash, allocation, objectId, version, revoke: () => {opts.denyBefore = true;}};
}
test("POST returns exact multibyte bytes only after two real authority scopes and server-only physical identity", async () => {
  const f = fixture(); const response = await f.handler(f.request()); assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes); assert.equal(response.headers.get("x-offroad-object-id"), f.objectId);
  assert.equal(response.headers.get("x-offroad-payload-sha256"), f.hash); assert.ok(response.headers.get("cache-control")?.includes("no-store"));
  assert.deepEqual(f.calls.map(c => c.path.includes("/auth/") ? "auth" : c.path.includes("/rest/") ? "scope" : c.path.includes("/info/") ? "info" : "bytes"), ["auth", "scope", "info", "bytes", "scope"]);
});
test("public source discriminant uses its exact allocation RPC with the same server-only read barrier", async () => {
  const f = fixture({publicSource: true}); assert.equal((await f.handler(f.request())).status, 200);
  assert.equal(f.calls.filter(c => c.path.includes("/worker_read_capital_public_payload_allocation_v1")).length, 2);
});
for (const [label, opts] of Object.entries({before: {denyBefore: true}, after: {denyAfter: true}, wrongBytes: {wrongBytes: true}, wrongInfo: {wrongInfo: true}, oversized: {oversized: true}, changedScope: {changedScope: true}, expiry: {expiresDuring: true}, wrongActor: {wrongActor: true}})) {
  test(`server denies ${label} without body or credentials in response`, async () => {
    const f = fixture(opts); const response = await f.handler(f.request()); assert.equal(response.status, 403);
    assert.equal(await response.text(), '{"error":"capital_body_read_denied"}');
    if (label === "before" || label === "wrongActor") assert.ok(!f.calls.some(c => c.path.includes("/storage/")));
  });
}
test("GET, caller path, missing capability and privileged token never reach Storage", async () => {
  const f = fixture(); assert.equal((await f.handler(f.request(undefined, {}, "GET"))).status, 405);
  for (const r of [f.request({allocationId: f.allocation, kind: "typed_body", path: "secret/outside"}), f.request(undefined, {"x-offroad-capability": ""}),
    f.request(undefined, {authorization: "Bearer malformed"})]) {
    assert.equal((await f.handler(r)).status, 403);
  }
  assert.equal(f.calls.length, 0);
});
test("same POST URL with revocation reauthorizes rather than serving previously accepted bytes", async () => {
  const f = fixture(); assert.equal((await f.handler(f.request())).status, 200); f.revoke();
  assert.equal((await f.handler(f.request())).status, 403);
  assert.equal(f.calls.filter(c => c.path.includes("/storage/")).length, 2);
});

test("modern server secret stays only in apikey and parsed user JWT remains on authority RPCs", async () => {
  const f = fixture({modernKeys: true}); const response = await f.handler(f.request());
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
  assert.ok(![...response.headers.values()].some(v => v.includes("sb_secret_")));
});
test("builtin preferred key dictionaries resolve default, legacy is explicit compatibility, diagnostics exclude values", () => {
  const modern = {SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_modern"}',
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_modern"}', SUPABASE_ANON_KEY: "legacy", SUPABASE_SERVICE_ROLE_KEY: "legacy"};
  assert.deepEqual(capitalBodyReadServerConfigFromEnvironment(k => modern[k as keyof typeof modern]),
    {supabaseUrl: modern.SUPABASE_URL, anonKey: "sb_publishable_modern", serviceRoleKey: "sb_secret_modern"});
  assert.deepEqual(capitalBodyReadServerConfigFromEnvironment(k => ({SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_ANON_KEY: "legacy_anon", SUPABASE_SERVICE_ROLE_KEY: "legacy_service"})[k]),
    {supabaseUrl: "https://synthetic.supabase.co", anonKey: "legacy_anon", serviceRoleKey: "legacy_service"});
  assert.throws(() => capitalBodyReadServerConfigFromEnvironment(k => k === "SUPABASE_SECRET_KEYS" ? 'sensitive invalid secret JSON' : undefined), {message: "capital_body_read_config_service_dictionary_invalid"});
  const config = {supabaseUrl: modern.SUPABASE_URL, anonKey: "sb_publishable_modern", serviceRoleKey: "sb_secret_modern"};
  for (const [delta, message] of [
    [{supabaseUrl: "sensitive invalid URL"}, "capital_body_read_config_url_invalid"],
    [{anonKey: ""}, "capital_body_read_config_anon_missing"],
    [{serviceRoleKey: ""}, "capital_body_read_config_service_missing"],
    [{anonKey: "sensitive wrong key"}, "capital_body_read_config_anon_type_invalid"],
    [{serviceRoleKey: "sensitive wrong key"}, "capital_body_read_config_service_type_invalid"],
  ] as const) assert.throws(() => createCapitalBodyReadHandler({...config, ...delta}), {message});
});
test("scoped pending retries only the exact allocation command twice then succeeds, no repeated physical read", async () => {
  const f = fixture({pending: 2}); assert.equal((await f.handler(f.request())).status, 200);
  const calls = f.calls.filter(c => c.path.includes("/rest/")); assert.equal(calls.length, 4);
  assert.ok(calls.every(c => c.init.body === calls[0]!.init.body));
  assert.equal(f.calls.filter(c => c.path.includes("/storage/")).length, 2);
});
test("pending exhaustion stays bounded; 42501 denial and transport exception never retry", async () => {
  for (const opts of [{pendingForever: true}, {denyBefore: true}, {throwTransport: true}]) {
    const f = fixture(opts); const response = await f.handler(f.request()); assert.equal(response.status, 403);
    assert.equal(await response.text(), '{"error":"capital_body_read_denied"}');
    assert.equal(f.calls.filter(c => c.path.includes("/rest/")).length, "pendingForever" in opts ? 3 : 1);
    assert.ok(!f.calls.some(c => c.path.includes("/storage/")));
  }
});
