import {test} from "vitest";
import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {createCapitalBodyReadHandler, capitalBodyReadServerConfigFromEnvironment} from "./capital-body-read-handler";
const token = (role: string, sub: string) => `synthetic.${Buffer.from(JSON.stringify({role, sub})).toString("base64url")}.signature`;
function fixture(opts: {denyBefore?: boolean; denyAfter?: boolean; wrongBytes?: boolean; wrongInfo?: boolean; oversized?: boolean; changedScope?: boolean; expiresDuring?: boolean; wrongActor?: boolean; publicSource?: boolean; modernKeys?: boolean; pending?: number; pendingForever?: boolean; pendingMessage?: string; throwTransport?: boolean; human?: boolean; wrongRevision?: boolean; extraScopeField?: boolean; humanAllocated?: boolean; recovery?: boolean; recoverySource?: boolean; wrongRetained?: boolean; changedNativeProof?: boolean; invalidNativeProof?: boolean; revision?: boolean; revisionSource?: boolean; s11?: boolean; task?: boolean; recoveredTask?: boolean; revisionTask?: boolean; material?: boolean; wrongMaterialKind?: boolean; wrongMaterialWork?: boolean; materialExtra?: boolean; debt?: boolean; previewHuman?:boolean; changedPreviewIdentity?:boolean} = {}) {
  let clock = Date.parse("2026-10-01T00:00:00Z"), scopes = 0;
  const actor = randomUUID(), org = randomUUID(), job = randomUUID(), allocation = randomUUID(), objectId = randomUUID(), revision = randomUUID();
  const bytes = new TextEncoder().encode('{"text":"ação € 漢字 🧮"}');
  const hash = createHash("sha256").update(bytes).digest("hex"), version = randomUUID(), retainedPayloadId = randomUUID();
  const scope = {schemaVersion: "capital-retained-body.v1", retentionState: "allocated", allocationId: allocation, retainedPayloadId: null,
    bodyBasisId: randomUUID(), bucket: "capital-input-capture", path: `${org}/${allocation}/payload.json`, payloadFingerprint: hash, byteLength: bytes.length,
    storageObjectId: objectId, storageVersion: version, retainedAt: "2026-10-01T00:00:00Z", uploadExpiresAt: "2026-10-01T00:02:00Z",
    expiresAt: "2026-10-01T00:10:00Z", purgeAt: "2026-10-01T00:09:00Z", replayed: false};
  const publicScope = {schemaVersion: "capital-public-storage-scope.v1", state: "allocated", allocationId: allocation, retainedPayloadId: null,
    deliveryId: randomUUID(), bucket: scope.bucket, path: scope.path, payloadFingerprint: hash, byteLength: bytes.length, storageObjectId: objectId,
    storageVersion: version, retainedAt: scope.retainedAt, uploadExpiresAt: scope.uploadExpiresAt, expiresAt: scope.expiresAt, purgeAt: scope.purgeAt};
  const materialScope = {schemaVersion: "capital-material-body-scope.v1", organizationId: org, workId: revision, recipeId: allocation, allocationId: allocation,
    retainedPayloadId: null, kind: "context", payloadFingerprint: hash, byteLength: bytes.length, bucket: scope.bucket, path: scope.path,
    storageObjectId: objectId, storageVersion: version, expiresAt: scope.expiresAt, purgeAt: scope.purgeAt};
  const calls: {path: string; init: RequestInit}[] = [];
  const bodyJSON = (v: unknown, status = 200) => new Response(JSON.stringify(v), {status, headers: {"content-type": "application/json"}});
  const handler = createCapitalBodyReadHandler({supabaseUrl: "https://synthetic.supabase.co", anonKey: opts.modernKeys ? "sb_publishable_synthetic" : token("anon", actor), serviceRoleKey: opts.modernKeys ? "sb_secret_synthetic" : token("service_role", actor), now: () => clock,
    fetch: async (input, init = {}) => {
      const path = String(input); calls.push({path, init}); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      if (path.includes("/auth/")) return bodyJSON({id: opts.wrongActor ? randomUUID() : actor});
      if (path.includes("/rest/")) {
        scopes++;
        if (opts.throwTransport) throw new Error("sensitive transport message");
        if (opts.pendingForever || (opts.pending ?? 0) >= scopes) return bodyJSON({code: "40001", message: opts.pendingMessage ?? "sensitive SQL pending"}, 409); assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token("authenticated", actor)}`);
        assert.deepEqual(JSON.parse(String(init.body)), opts.human ? {p_revision_id: revision} : opts.task ? {p_job_id: job, p_capability_token: "synthetic-job-capability", ...(!opts.revisionTask ? {p_recipe_id: revision} : {}), p_task_run_id: retainedPayloadId} : opts.revision ? {p_job_id: job, p_capability_token: "synthetic-job-capability", p_retained_payload_id: retainedPayloadId} : opts.recovery ? {p_job_id: job, p_capability_token: "synthetic-job-capability", p_recipe_id: revision, p_retained_payload_id: retainedPayloadId} : {p_job_id: job, p_capability_token: "synthetic-job-capability", p_allocation_id: allocation});
        if (opts.revision) assert.ok(path.endsWith(`/worker_read_capital_${opts.debt ? "debt" : opts.s11 ? "s11" : "m07"}_revision_${opts.revisionSource ? "source" : "body"}_v1`));
        if (opts.recovery) assert.ok(path.endsWith(`/worker_read_capital_${opts.debt ? "debt" : opts.s11 ? "s11" : "m07"}_recovery_${opts.recoverySource ? "source" : "body"}_v1`));
        if (opts.task) assert.ok(path.endsWith(opts.revisionTask ? opts.debt ? "/worker_read_capital_debt_revision_task_v1" : "/worker_read_capital_s11_revision_task_v1" : opts.debt ? "/worker_read_capital_debt_recovered_task_body_v1" : opts.recoveredTask ? "/worker_read_capital_s11_recovered_task_body_v1" : "/worker_read_capital_s11_task_body_v1"));
        if (opts.human) {
          assert.ok(path.endsWith(opts.previewHuman ? "/read_capital_preview_result_body_v1" : opts.material ? "/read_material_production_result_v1" : opts.debt ? "/read_capital_debt_result_v1" : opts.s11 ? "/read_capital_s11_result_v1" : "/read_capital_m07_result_v1"));
          assert.ok(!new Headers(init.headers).has("x-offroad-job-id"));
          assert.ok(!new Headers(init.headers).has("x-offroad-capability"));
        }
        if (opts.denyBefore || (opts.denyAfter && scopes > 1)) return bodyJSON({code: "42501", error: "secret SQL payload"}, 403);
        if (opts.material) {
          if (!opts.human) assert.ok(path.endsWith("/worker_read_material_production_allocation_v1"));
          const result = {...materialScope, ...(opts.human ? {kind: "material_package", retainedPayloadId} : {}), ...(opts.changedScope && scopes > 1 ? {workId: randomUUID()} : {}),
            ...(opts.wrongMaterialKind ? {kind: "arbitrary_body"} : {}), ...(opts.wrongMaterialWork ? {organizationId: randomUUID()} : {}),
            ...(opts.materialExtra ? {retainedAt: scope.retainedAt} : {})};
          if (opts.human) return bodyJSON({schemaVersion: "capital-material-read-scope.v1", revisionId: opts.wrongRevision ? randomUUID() : revision,
            recipeId: allocation, bundleFingerprint: opts.changedNativeProof && scopes > 1 ? "b".repeat(64) : hash, scope: result,
            ...(opts.extraScopeField ? {body: "PRIVATE_CANARY"} : {})});
          return bodyJSON(result);
        }
        const resolved = {...opts.publicSource ? publicScope : scope, ...(opts.changedScope && scopes > 1 ? {storageVersion: randomUUID()} : {})};
        if (opts.recovery || opts.revision || opts.task) return bodyJSON({...resolved, ...(opts.recoverySource || opts.revisionSource ? {state: "complete"} : {retentionState: "retained"}), retainedPayloadId: opts.wrongRetained ? randomUUID() : retainedPayloadId});
        if (opts.debt && !opts.human) {
          assert.ok(path.endsWith("/worker_read_capital_debt_allocation_v1"));
          return bodyJSON({schemaVersion: "capital-debt-worker-read-scope.v1", recipeId: opts.changedNativeProof && scopes > 1 ? randomUUID() : allocation,
            retention: resolved, ...(opts.extraScopeField ? {body: "PRIVATE_CANARY"} : {})});
        }
        return bodyJSON(opts.human ? {schemaVersion: opts.previewHuman ? "capital-preview-read-scope.v1" : opts.debt ? "capital-debt-read-scope.v1" : opts.s11 ? "capital-s11-read-scope.v1" : "capital-m07-read-scope.v1", recipeId: opts.invalidNativeProof ? "invalid" : allocation, finalFingerprint: opts.changedNativeProof && scopes > 1 ? "b".repeat(64) : "a".repeat(64), revisionId: opts.wrongRevision ? randomUUID() : revision,
          ...(opts.previewHuman ? {workId: opts.changedPreviewIdentity && scopes > 1 ? randomUUID() : job, artifactId: objectId} : {}),
          retention: {...resolved, ...(!opts.humanAllocated ? {retentionState: "retained", retainedPayloadId} : {})},
          ...(opts.extraScopeField ? {body: "PRIVATE_CANARY"} : {})} : resolved);
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
  const request = (body: unknown = opts.human ? {revisionId: revision, kind: opts.previewHuman ? "preview_result" : opts.material ? "material_result" : opts.debt ? "debt_result" : opts.s11 ? "s11_result" : "m07_result"} : opts.task ? {kind: opts.debt ? "debt_recovered_task" : opts.recoveredTask ? "s11_recovered_task" : "s11_task", recipeId: revision, taskRunId: retainedPayloadId} : opts.revision ? {kind: opts.revisionSource ? "m07_revision_source" : "m07_revision_body", retainedPayloadId} : opts.recovery ? {kind: opts.recoverySource ? (opts.debt ? "debt_recovery_source" : opts.s11 ? "s11_recovery_source" : "m07_recovery_source") : (opts.debt ? "debt_recovery" : opts.s11 ? "s11_recovery" : "m07_recovery"), recipeId: revision, retainedPayloadId} : {allocationId: allocation, kind: opts.material ? "material_body" : opts.debt ? "debt_body" : opts.publicSource ? "public_source" : "typed_body"}, extra: Record<string, string> = {}, method = "POST") => new Request("https://synthetic.supabase.co/functions/v1/capital-body-read", {
    method, headers: {authorization: `Bearer ${token("authenticated", actor)}`, "content-type": "application/json", "x-offroad-workspace": org,
      ...(!opts.human ? {"x-offroad-job-id": job, "x-offroad-capability": "synthetic-job-capability"} : {}), ...extra}, ...(method === "POST" ? {body: JSON.stringify(body)} : {})});
  return {handler, request, calls, bytes, hash, allocation, objectId, version, revision, retainedPayloadId, revoke: () => {opts.denyBefore = true;}};
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
test("M07 body selects its own worker authority command and verifies the exact physical body", async () => {
  const f = fixture();
  const response = await f.handler(f.request({kind: "m07_body", allocationId: f.allocation}));
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
  assert.equal(f.calls.filter(c => c.path.includes("/worker_read_capital_m07_allocation_v1")).length, 2);
  assert.equal(f.calls.filter(c => c.path.includes("/worker_read_capital_body_allocation_v1")).length, 0);
});
for (const phase of ["before", "after"] as const) {
  test(`M07 worker body denies revocation ${phase} physical reading`, async () => {
    const f = fixture(phase === "before" ? {denyBefore: true} : {denyAfter: true});
    const response = await f.handler(f.request({kind: "m07_body", allocationId: f.allocation}));
    assert.equal(response.status, 403);
    assert.equal(await response.text(), '{"error":"capital_body_read_denied"}');
    if (phase === "before") assert.ok(!f.calls.some(c => c.path.includes("/storage/")));
  });
}
test("M07 worker body cannot use human credentials without a current job capability", async () => {
  const f = fixture();
  assert.equal((await f.handler(f.request({kind: "m07_body", allocationId: f.allocation}, {"x-offroad-capability": ""}))).status, 403);
  assert.equal(f.calls.length, 0);
});
test("human result resolves an exact revision without a historical job lease or caller allocation", async () => {
  const f = fixture({human: true, modernKeys: true});
  const response = await f.handler(f.request());
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
  assert.equal(response.headers.get("x-offroad-revision-id"), f.revision);
  assert.equal(response.headers.get("x-offroad-recipe-id"), f.allocation);
  assert.equal(response.headers.get("x-offroad-final-fingerprint"), "a".repeat(64));
  assert.equal(f.calls.filter(c => c.path.includes("/read_capital_m07_result_v1")).length, 2);
  assert.ok(response.headers.get("cache-control")?.includes("no-store"));
});
for (const [label, opts] of Object.entries({changedNativeProof: {changedNativeProof: true}, invalidNativeProof: {invalidNativeProof: true}, wrongRevision: {wrongRevision: true}, privateField: {extraScopeField: true}, uncommittedBody: {humanAllocated: true},
  revokedBefore: {denyBefore: true}, revokedAfter: {denyAfter: true}, swappedStorageVersion: {changedScope: true}, expiredDuringRead: {expiresDuring: true}})) {
  test(`human result denies ${label} and returns no protected bytes`, async () => {
    const f = fixture({human: true, ...opts});
    const response = await f.handler(f.request());
    assert.equal(response.status, 403);
    assert.equal(await response.text(), '{"error":"capital_body_read_denied"}');
    if (["wrongRevision", "privateField", "uncommittedBody", "revokedBefore"].includes(label)) assert.ok(!f.calls.some(c => c.path.includes("/storage/")));
  });
}
test("human result refuses caller paths, allocations and an omitted revision before authenticating", async () => {
  const f = fixture({human: true});
  for (const body of [{kind: "m07_result", allocationId: f.allocation}, {kind: "m07_result", revisionId: f.revision, path: "PRIVATE_PATH"},
    {kind: "m07_result", revisionId: f.revision, allocationId: f.allocation}]) {
    assert.equal((await f.handler(f.request(body))).status, 403);
  }
  assert.equal(f.calls.length, 0);
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

test("successor recovery resolves its own grant and reads immutable retained bytes without original-job impersonation", async () => {
  const f = fixture({recovery: true}); const response = await f.handler(f.request());
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
  assert.equal(response.headers.get("x-offroad-recipe-id"), f.revision);
  assert.equal(response.headers.get("x-offroad-retained-payload-id"), f.retainedPayloadId);
  assert.equal(f.calls.filter(c => c.path.includes("/worker_read_capital_m07_recovery_body_v1")).length, 2);
});
for (const [label, opts] of Object.entries({wrongRetained: {wrongRetained: true}, revokedBefore: {denyBefore: true},
  revokedAfter: {denyAfter: true}, storageSwapped: {changedScope: true}, expired: {expiresDuring: true}})) {
  test(`successor recovery denies ${label} without protected bytes`, async () => {
    const f = fixture({recovery: true, ...opts}); const response = await f.handler(f.request());
    assert.equal(response.status, 403); assert.equal(await response.text(), '{"error":"capital_body_read_denied"}');
  });
}
test("successor recovery refuses caller allocation and path before authorization", async () => {
  const f = fixture({recovery: true});
  assert.equal((await f.handler(f.request({kind: "m07_recovery", recipeId: f.revision, retainedPayloadId: f.retainedPayloadId, allocationId: f.allocation}))).status, 403);
  assert.equal((await f.handler(f.request({kind: "m07_recovery", recipeId: f.revision, retainedPayloadId: f.retainedPayloadId}, {"x-offroad-capability": ""}))).status, 403);
  assert.equal(f.calls.length, 0);
});


test("recovery source resolves the licensed delivery from the successor recipe, never a caller path", async () => {
  const f = fixture({recovery: true, recoverySource: true, publicSource: true});
  const response = await f.handler(f.request());
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
  assert.equal(response.headers.get("x-offroad-recipe-id"), f.revision);
  assert.equal(response.headers.get("x-offroad-retained-payload-id"), f.retainedPayloadId);
  assert.equal(f.calls.filter(c => c.path.includes("/worker_read_capital_m07_recovery_source_v1")).length, 2);
});
for (const [label, opts] of Object.entries({revokedBefore: {denyBefore: true}, revokedAfter: {denyAfter: true},
  wrongRetained: {wrongRetained: true}, swappedStorage: {changedScope: true}, expiredDuring: {expiresDuring: true}})) {
  test(`recovery source denies ${label} without licensed bytes`, async () => {
    const f = fixture({recovery: true, recoverySource: true, publicSource: true, ...opts});
    const response = await f.handler(f.request());
    assert.equal(response.status, 403); assert.equal(await response.text(), '{"error":"capital_body_read_denied"}');
    if (label === "revokedBefore") assert.ok(!f.calls.some(c => c.path.includes("/storage/")));
  });
}
test("recovery source refuses caller delivery/path and omitted current job capability", async () => {
  const f = fixture({recovery: true, recoverySource: true, publicSource: true});
  for (const body of [{kind: "m07_recovery_source", recipeId: f.revision, retainedPayloadId: f.retainedPayloadId, deliveryId: f.objectId},
    {kind: "m07_recovery_source", recipeId: f.revision, retainedPayloadId: f.retainedPayloadId, path: "PRIVATE_PATH"}]) {
    assert.equal((await f.handler(f.request(body))).status, 403);
  }
  assert.equal((await f.handler(f.request(undefined, {"x-offroad-capability": ""}))).status, 403);
  assert.equal(f.calls.length, 0);
});

for (const source of [false,true]) {
  test(`native revision ${source?'source':'body'} uses the new exact-job grant and returns no recipe chosen by caller`, async()=>{
    const f=fixture({revision:true,revisionSource:source,publicSource:source});
    const response=await f.handler(f.request());assert.equal(response.status,200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes);
    assert.equal(response.headers.get('x-offroad-retained-payload-id'),f.retainedPayloadId);
    assert.equal(response.headers.get('x-offroad-recipe-id'),null);
    assert.equal(f.calls.filter(c=>c.path.includes(source?'worker_read_capital_m07_revision_source_v1':'worker_read_capital_m07_revision_body_v1')).length,2);
  });
  for(const [label,options] of Object.entries({revokedBefore:{denyBefore:true},revokedAfter:{denyAfter:true},swappedRetention:{wrongRetained:true},expiredDuring:{expiresDuring:true}})){
    test(`native revision ${source?'source':'body'} denies ${label} without delivering bytes`,async()=>{
      const f=fixture({revision:true,revisionSource:source,publicSource:source,...options});
      const response=await f.handler(f.request());assert.equal(response.status,403);
      assert.equal(await response.text(),'{"error":"capital_body_read_denied"}');
      if(label==='revokedBefore')assert.ok(!f.calls.some(c=>c.path.includes('/storage/')));
    });
  }
}
test('native revision denies caller recipe, path and extra authority before Auth or Storage',async()=>{
  const f=fixture({revision:true});
  for(const extra of [{recipeId:f.revision},{path:'PRIVATE_PATH'},{allocationId:f.allocation}]){
    assert.equal((await f.handler(f.request({kind:'m07_revision_body',retainedPayloadId:f.retainedPayloadId,...extra}))).status,403);
  }
  assert.equal(f.calls.length,0);
});

for (const mode of ["body", "human", "recovery", "source", "task", "recoveredTask"] as const) {
  const options = {s11: true, human: mode === "human", recovery: mode === "recovery" || mode === "source", recoverySource: mode === "source", publicSource: mode === "source", task: mode === "task" || mode === "recoveredTask", recoveredTask: mode === "recoveredTask"};
  test(`S11 ${mode} selects its own authority and preserves physical identity`, async () => {
    const f = fixture(options); const response = await f.handler(mode === "body" ? f.request({kind: "s11_body", allocationId: f.allocation}) : f.request());
    assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
    const calls = f.calls.filter(call => call.path.includes("/rest/")); assert.equal(calls.length, 2); assert.ok(calls.every(call => call.path.includes("s11")));
    if (options.task) {assert.equal(response.headers.get("x-offroad-recipe-id"), f.revision); assert.equal(response.headers.get("x-offroad-task-run-id"), f.retainedPayloadId);}
  });
  test(`S11 ${mode} revocation after physical read returns no body`, async () => {
    const f = fixture({...options, denyAfter: true}); const response = await f.handler(mode === "body" ? f.request({kind: "s11_body", allocationId: f.allocation}) : f.request());
    assert.equal(response.status, 403); assert.equal(await response.text(), '{"error":"capital_body_read_denied"}');
  });
}
test("S11 task command cannot be selected using a retained ID or caller RPC", async () => {
  const f = fixture({s11: true, task: true});
  for (const input of [{kind: "s11_task", recipeId: f.revision, retainedPayloadId: f.retainedPayloadId}, {kind: "s11_task", recipeId: f.revision, taskRunId: f.retainedPayloadId, rpc: "worker_read_capital_m07_allocation_v1"}]) {
    assert.equal((await f.handler(f.request(input))).status, 403);
  }
  assert.equal(f.calls.length, 0);
});

test("material body resolves its strict independent scope without fabricated retention fields", async () => {
  const f = fixture({material: true, modernKeys: true}); const r = await f.handler(f.request());
  assert.equal(r.status, 200); assert.deepEqual(new Uint8Array(await r.arrayBuffer()), f.bytes);
  assert.equal(r.headers.get("x-offroad-work-id"), f.revision); assert.equal(r.headers.get("x-offroad-recipe-id"), f.allocation);
  assert.equal(f.calls.filter(c => c.path.includes("/worker_read_material_production_allocation_v1")).length, 2);
});
for (const option of ["denyBefore", "denyAfter", "changedScope", "wrongMaterialKind", "wrongMaterialWork", "materialExtra", "expiresDuring", "wrongBytes", "wrongInfo"] as const) {
  test(`material body denies ${option} without returning physical bytes`, async () => {
    const f = fixture({material: true, [option]: true}); const r = await f.handler(f.request());
    assert.equal(r.status, 403); assert.equal(await r.text(), '{"error":"capital_body_read_denied"}');
    if (["denyBefore", "wrongMaterialKind", "wrongMaterialWork", "materialExtra"].includes(option)) assert.ok(!f.calls.some(c => c.path.includes("/storage/")));
  });
}

test("human material package resolves an exact review revision under current rights", async () => {
  const f = fixture({material: true, human: true}); const r = await f.handler(f.request());
  assert.equal(r.status, 200); assert.deepEqual(new Uint8Array(await r.arrayBuffer()), f.bytes);
  assert.equal(r.headers.get("x-offroad-revision-id"), f.revision); assert.equal(r.headers.get("x-offroad-bundle-fingerprint"), f.hash);
  assert.equal(f.calls.filter(c => c.path.includes("/read_material_production_result_v1")).length, 2);
});
for (const option of ["denyAfter", "changedNativeProof", "wrongRevision", "extraScopeField", "wrongMaterialWork"] as const) {
  test(`human material package denies ${option}`, async () => {
    const f = fixture({material: true, human: true, [option]: true}); const r = await f.handler(f.request());
    assert.equal(r.status, 403); assert.equal(await r.text(), '{"error":"capital_body_read_denied"}');
  });
}

for (const mode of ["body", "source", "task"] as const) {
  const kind = `s11_revision_${mode}`;
  const options = {s11: true, revision: mode !== "task", revisionSource: mode === "source", publicSource: mode === "source", task: mode === "task", revisionTask: mode === "task"};
  test(`${kind} binds only the original physical target under the new lease`, async () => {
    const f = fixture(options), input = {kind, ...(mode === "task" ? {taskRunId: f.retainedPayloadId} : {retainedPayloadId: f.retainedPayloadId})};
    const r = await f.handler(f.request(input)); assert.equal(r.status, 200);
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), f.bytes);
    assert.equal(r.headers.get(mode === "task" ? "x-offroad-task-run-id" : "x-offroad-retained-payload-id"), f.retainedPayloadId);
    assert.equal(r.headers.get("x-offroad-recipe-id"), null);
    assert.equal(f.calls.filter(call => call.path.includes("/rest/")).length, 2);
  });
  for (const negative of [{denyBefore: true}, {denyAfter: true}, {changedScope: true}, {wrongInfo: true}, {wrongBytes: true}, {expiresDuring: true}])
    test(`${kind} refuses revoked, changed or absent physical input ${JSON.stringify(negative)}`, async () => {
      const f = fixture({...options, ...negative});
      const r = await f.handler(f.request({kind, ...(mode === "task" ? {taskRunId: f.retainedPayloadId} : {retainedPayloadId: f.retainedPayloadId})}));
      assert.equal(r.status, 403); assert.equal(await r.text(), '{"error":"capital_body_read_denied"}');
    });
  test(`${kind} rejects caller recipe and arbitrary path before authority lookup`, async () => {
    const f = fixture(options);
    for (const extra of [{recipeId: f.revision}, {path: "PRIVATE_PATH"}, {allocationId: f.allocation}])
      assert.equal((await f.handler(f.request({kind, ...(mode === "task" ? {taskRunId: f.retainedPayloadId} : {retainedPayloadId: f.retainedPayloadId}), ...extra}))).status, 403);
    assert.equal(f.calls.length, 0);
  });
}

for (const mode of ["body", "source", "task"] as const) {
  const kind = `debt_revision_${mode}`;
  const options = {debt: true, revision: mode !== "task", revisionSource: mode === "source", publicSource: mode === "source", task: mode === "task", revisionTask: mode === "task"};
  test(`${kind} binds only the original physical target under the new lease`, async () => {
    const f = fixture(options), input = {kind, ...(mode === "task" ? {taskRunId: f.retainedPayloadId} : {retainedPayloadId: f.retainedPayloadId})};
    const r = await f.handler(f.request(input)); assert.equal(r.status, 200);
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), f.bytes);
    assert.equal(r.headers.get(mode === "task" ? "x-offroad-task-run-id" : "x-offroad-retained-payload-id"), f.retainedPayloadId);
    assert.equal(r.headers.get("x-offroad-recipe-id"), null);
    assert.equal(f.calls.filter(call => call.path.includes("/rest/")).length, 2);
  });
  for (const negative of [{denyBefore: true}, {denyAfter: true}, {changedScope: true}, {wrongInfo: true}, {wrongBytes: true}, {expiresDuring: true}])
    test(`${kind} refuses revoked, changed or absent physical input ${JSON.stringify(negative)}`, async () => {
      const f = fixture({...options, ...negative});
      const r = await f.handler(f.request({kind, ...(mode === "task" ? {taskRunId: f.retainedPayloadId} : {retainedPayloadId: f.retainedPayloadId})}));
      assert.equal(r.status, 403); assert.equal(await r.text(), '{"error":"capital_body_read_denied"}');
    });
  test(`${kind} rejects caller recipe and arbitrary path before authority lookup`, async () => {
    const f = fixture(options);
    for (const extra of [{recipeId: f.revision}, {path: "PRIVATE_PATH"}, {allocationId: f.allocation}])
      assert.equal((await f.handler(f.request({kind, ...(mode === "task" ? {taskRunId: f.retainedPayloadId} : {retainedPayloadId: f.retainedPayloadId}), ...extra}))).status, 403);
    assert.equal(f.calls.length, 0);
  });
}

function nativeProviderFixture(kind: "native_provider_recipe" | "native_provider_allocation" | "native_provider_result" | "native_provider_human", opts: {scope?: "context" | "catalog"; task?: boolean; before?: Record<string, unknown>; after?: Record<string, unknown>; denyAfter?: boolean; retryMessage?: string} = {}) {
  const actor=randomUUID(), org=randomUUID(), job=randomUUID(), recipeId=randomUUID(), allocationId=randomUUID(), retainedPayloadId=randomUUID(), revisionId=randomUUID(), objectId=randomUUID(), workId=randomUUID();
  const bytes=new TextEncoder().encode('{"value":"ação"}'), hash=createHash("sha256").update(bytes).digest("hex"), storageVersion="provider-native-v1";
  const human=kind==="native_provider_human", task=human||kind==="native_provider_result"||opts.task;
  const input=human?{kind,revisionId}:kind==="native_provider_recipe"?{kind,recipeId,retainedPayloadId,scope:opts.scope??"context"}:kind==="native_provider_result"?{kind,recipeId,retainedPayloadId,taskId:"K02",artifactType:"provider_research"}:{kind,recipeId,allocationId,...(task?{taskId:"K02",artifactType:"provider_research"}:{})};
  const result={schemaVersion:"capital-retained-body.v1",retentionState:"retained",allocationId,retainedPayloadId,bodyBasisId:randomUUID(),bucket:"capital-input-capture",path:`${org}/${allocationId}/payload.json`,payloadFingerprint:hash,byteLength:bytes.length,storageObjectId:objectId,storageVersion,retainedAt:"2026-10-01T00:00:00Z",uploadExpiresAt:"2026-10-01T00:02:00Z",expiresAt:"2026-10-01T00:10:00Z",purgeAt:"2026-10-01T00:09:00Z",replayed:true,recipeId,
    ...(kind==="native_provider_recipe"?{scope:opts.scope??"context"}:{taskId:task?"K02":null,artifactType:task?"provider_research":null}),
    ...(human?{organizationId:org,workId,revisionId,family:"provider_research"}:{})};
  let scopes=0;const calls:string[]=[];
  const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json"}});
  const handler=createCapitalBodyReadHandler({supabaseUrl:"https://synthetic.supabase.co",anonKey:token("anon",actor),serviceRoleKey:token("service_role",actor),now:()=>Date.parse("2026-10-01T00:00:01Z"),fetch:async(url,init)=>{
    const path=new URL(String(url)).pathname;calls.push(path);
    if(path==="/auth/v1/user")return response({id:actor});
    if(path.includes("/rest/")){
      scopes++;const headers=new Headers(init?.headers);assert.equal(headers.get("x-offroad-workspace"),org);
      if(scopes===1&&opts.retryMessage)return response({code:"40001",message:opts.retryMessage},409);
      if(human){assert.ok(!headers.has("x-offroad-capability"));assert.ok(!headers.has("x-offroad-job-id"));assert.ok(path.endsWith("/read_capital_native_provider_result_body_v1"));assert.deepEqual(JSON.parse(String(init?.body)),{p_revision_id:revisionId});}
      else {const common={p_job_id:job,p_capability_token:"synthetic-cap",p_recipe_id:recipeId};
        const body=kind==="native_provider_recipe"?{...common,p_retained_payload_id:retainedPayloadId,p_scope:opts.scope??"context"}:kind==="native_provider_result"?{...common,p_retained_payload_id:retainedPayloadId,p_task_id:"K02",p_artifact_type:"provider_research"}:{...common,p_allocation_id:allocationId,p_task_id:task?"K02":null,p_artifact_type:task?"provider_research":null};
        assert.deepEqual(JSON.parse(String(init?.body)),body);assert.ok(path.endsWith(`/worker_read_capital_native_${kind==="native_provider_recipe"?"recipe":kind==="native_provider_result"?"result":"allocation"}_v1`));}
      if(scopes>1&&opts.denyAfter)return response({code:"42501"},403);
      return response({...result,...(scopes===1?opts.before:opts.after??opts.before)});
    }
    assert.equal(new Headers(init?.headers).get("x-offroad-capability"),null);
    if(path.includes("/info/"))return response({id:objectId,version:storageVersion,name:result.path,bucket_id:"capital-input-capture",size:bytes.length,content_type:"application/json"});
    return new Response(bytes);
  }});
  const request=(change:Record<string,unknown>={})=>new Request("https://synthetic.supabase.co/functions/v1/capital-body-read",{method:"POST",headers:{authorization:`Bearer ${token("authenticated",actor)}`,"content-type":"application/json","x-offroad-workspace":org,...(!human?{"x-offroad-job-id":job,"x-offroad-capability":"synthetic-cap"}:{})},body:JSON.stringify({...input,...change})});
  return{handler,request,calls,bytes,recipeId,retainedPayloadId,workId};
}
for(const kind of ["native_provider_recipe","native_provider_allocation","native_provider_result","native_provider_human"] as const){
  test(`${kind} exact authenticated RPC and physical bytes with closed proof headers`,async()=>{
    const f=nativeProviderFixture(kind);const r=await f.handler(f.request());assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),f.bytes);assert.equal(r.headers.get("x-offroad-recipe-id"),f.recipeId);assert.equal(r.headers.get("x-offroad-retained-payload-id"),f.retainedPayloadId);
    assert.equal(f.calls.filter(v=>v.includes("/rest/")).length,2);if(kind==="native_provider_human")assert.equal(r.headers.get("x-offroad-work-id"),f.workId);
  });
  test(`${kind} rejects caller extras before any authenticated or physical request`,async()=>{const f=nativeProviderFixture(kind);assert.equal((await f.handler(f.request({path:"PRIVATE_CANARY"}))).status,403);assert.equal(f.calls.length,0);});
  test(`${kind} current authority revocation after physical read denies bytes`,async()=>{const f=nativeProviderFixture(kind,{denyAfter:true});const r=await f.handler(f.request());assert.equal(r.status,403);assert.equal(await r.text(),'{"error":"capital_body_read_denied"}');});
  test(`${kind} recipe identity mutation during physical read is denied`,async()=>{const f=nativeProviderFixture(kind,{after:{recipeId:randomUUID()}});assert.equal((await f.handler(f.request())).status,403);});
  test(`${kind} result scope extra body or arbitrary identity is denied before transport`,async()=>{const f=nativeProviderFixture(kind,{before:{body:"PRIVATE_CANARY"}});assert.equal((await f.handler(f.request())).status,403);assert.ok(!f.calls.some(v=>v.includes("/storage/")));});
}
test("native provider catalogue uses exact captured catalogue retained id and scope",async()=>{const f=nativeProviderFixture("native_provider_recipe",{scope:"catalog",before:{bodyBasisId:null}});assert.equal((await f.handler(f.request())).status,200);});
test("native provider allocation task tuple remains closed",async()=>{const f=nativeProviderFixture("native_provider_allocation",{task:true});const r=await f.handler(f.request());assert.equal(r.status,200);assert.equal(r.headers.get("x-offroad-task-id"),"K02");assert.equal(r.headers.get("x-offroad-artifact-type"),"provider_research");});
for(const before of [{taskId:"K01"},{artifactType:"provider_case_fit"},{organizationId:randomUUID()},{family:"company_debt_view"}])test(`native human exact family/work/revision/task proof rejects ${Object.keys(before)[0]}`,async()=>{const f=nativeProviderFixture("native_provider_human",{before});assert.equal((await f.handler(f.request())).status,403);});

test("native human retained identity changes between scopes are denied",async()=>{const f=nativeProviderFixture("native_provider_human",{after:{retainedPayloadId:randomUUID()}});assert.equal((await f.handler(f.request())).status,403);});

test("native provider context never accepts missing native body basis",async()=>{const f=nativeProviderFixture("native_provider_recipe",{before:{bodyBasisId:null}});assert.equal((await f.handler(f.request())).status,403);});

test("native provider retries only exact transient capture conflict with identical authority tuple",async()=>{const f=nativeProviderFixture("native_provider_result",{retryMessage:"capital_capture_retry"});assert.equal((await f.handler(f.request())).status,200);assert.equal(f.calls.filter(v=>v.includes("/rest/")).length,3);});
test("native provider does not retry context-changed serialization failure",async()=>{const f=nativeProviderFixture("native_provider_result",{retryMessage:"capital_capture_context_changed"});assert.equal((await f.handler(f.request())).status,403);assert.equal(f.calls.filter(v=>v.includes("/rest/")).length,1);assert.ok(!f.calls.some(v=>v.includes("/storage/")));});

for (const scenario of ["allocation", "human", "recovery", "source", "task"] as const) {
  const options = {debt:true, human:scenario==="human", recovery:scenario==="recovery"||scenario==="source",
    recoverySource:scenario==="source",publicSource:scenario==="source",task:scenario==="task",recoveredTask:scenario==="task"};
  test(`C11 ${scenario} reads exact bytes under closed distinct authority before and after`, async () => {
    const f=fixture(options),response=await f.handler(f.request());assert.equal(response.status,200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes);
    assert.equal(f.calls.filter(c=>c.path.includes("/rest/")).length,2);
    assert.equal(response.headers.get("x-offroad-recipe-id"),scenario==="recovery"||scenario==="source"||scenario==="task"?f.revision:f.allocation);
  });
  for (const failure of ["denyBefore","denyAfter","wrongActor","wrongInfo","wrongBytes","changedScope","expiresDuring"] as const) {
    test(`C11 ${scenario} refuses ${failure}`,async()=>{
      const f=fixture({...options,[failure]:true}),response=await f.handler(f.request());assert.equal(response.status,403);
      assert.equal(await response.text(),'{"error":"capital_body_read_denied"}');
    });
  }
  test(`C11 ${scenario} rejects additional caller body fields before authority/storage`,async()=>{
    const f=fixture(options),input=await f.request().json();const response=await f.handler(f.request({...input,path:"arbitrary"}));
    assert.equal(response.status,403);assert.equal(f.calls.length,0);
  });
}
for(const human of [false,true]) {
  test(`C11 ${human?"human":"allocation"} rejects recipe/proof drift after physical read`,async()=>{
    const f=fixture({debt:true,human,changedNativeProof:true});assert.equal((await f.handler(f.request())).status,403);
  });
  test(`C11 ${human?"human":"allocation"} rejects uncontracted envelope field`,async()=>{
    const f=fixture({debt:true,human,extraScopeField:true});assert.equal((await f.handler(f.request())).status,403);
  });
}
test("C11 pending context change is denied without retry or Storage",async()=>{
  const f=fixture({debt:true,pending:1});assert.equal((await f.handler(f.request())).status,403);
  assert.equal(f.calls.filter(c=>c.path.includes("/rest/")).length,1);
  assert.equal(f.calls.some(c=>c.path.includes("/storage/")),false);
});

for(const source of [false,true]) {
 test(`C11 recovery${source?" source":""} rejects a different retained receipt`,async()=>{const f=fixture({debt:true,recovery:true,recoverySource:source,publicSource:source,wrongRetained:true});assert.equal((await f.handler(f.request())).status,403);});
}
test("C11 capture_retry retries only exact same command and authority within bounded attempts",async()=>{
 const f=fixture({debt:true,pending:2,pendingMessage:"capital_capture_retry"}),response=await f.handler(f.request());assert.equal(response.status,200);
 const calls=f.calls.filter(c=>c.path.includes("/rest/"));assert.equal(calls.length,4);const first=calls[0];assert.ok(first);assert.ok(calls.every(c=>c.init.body===first.init.body&&c.path===first.path));
});
test("C11 capture_retry exhaustion denies without Storage",async()=>{const f=fixture({debt:true,pendingForever:true,pendingMessage:"capital_capture_retry"});assert.equal((await f.handler(f.request())).status,403);assert.equal(f.calls.filter(c=>c.path.includes("/rest/")).length,3);assert.equal(f.calls.some(c=>c.path.includes("/storage/")),false);});
test("C11 human rejects malformed native recipe identity",async()=>{const f=fixture({debt:true,human:true,invalidNativeProof:true});assert.equal((await f.handler(f.request())).status,403);});

for(const option of[undefined,"denyBefore","denyAfter","wrongBytes","changedScope"]as const){
 test(`preview_body closed allocation ${option??"positive"}`,async()=>{
  const f=fixture(option?{[option]:true}:{});const response=await f.handler(f.request({kind:"preview_body",allocationId:f.allocation}));
  assert.equal(response.status,option?403:200);
  if(!option){assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes);assert.ok(response.headers.get("cache-control")?.includes("no-store"));}
  const reads=f.calls.filter(c=>c.path.includes("/rest/"));assert.ok(reads.every(c=>c.path.endsWith("/worker_read_capital_preview_allocation_v1")));
 });
}
test("preview_body rejects caller paths, retained ids and RPC before Auth",async()=>{
 const f=fixture();for(const extra of[{path:"PRIVATE_PATH"},{retainedPayloadId:f.retainedPayloadId},{rpc:"worker_read_capital_public_payload_allocation_v1"}]){
  assert.equal((await f.handler(f.request({kind:"preview_body",allocationId:f.allocation,...extra}))).status,403);
 }assert.equal(f.calls.length,0);
});

test("human preview uses exact revision, Auth/WORK and two closed native scopes", async () => {
  const f=fixture({human:true,previewHuman:true});const r=await f.handler(f.request());assert.equal(r.status,200);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),f.bytes);assert.equal(r.headers.get("x-offroad-artifact-id"),f.objectId);
  assert.equal(f.calls.filter(c=>c.path.endsWith("/read_capital_preview_result_body_v1")).length,2);
});
for(const [label,opts]of Object.entries({before:{denyBefore:true},after:{denyAfter:true},changedIdentity:{changedPreviewIdentity:true},proof:{changedNativeProof:true},bytes:{wrongBytes:true},version:{changedScope:true},ttl:{expiresDuring:true},extra:{extraScopeField:true},revision:{wrongRevision:true},allocated:{humanAllocated:true}}))test(`human preview fails closed ${label}`,async()=>{
 const f=fixture({human:true,previewHuman:true,...opts});const r=await f.handler(f.request());assert.equal(r.status,403);assert.equal(await r.text(),'{"error":"capital_body_read_denied"}');
});
test("human preview rejects arbitrary payload, path or capability as request fields",async()=>{
 const f=fixture({human:true,previewHuman:true});for(const extra of[{path:"PRIVATE"},{workId:f.revision},{accepted:true},{allocationId:f.allocation}])assert.equal((await f.handler(f.request({kind:"preview_result",revisionId:f.revision,...extra}))).status,403);
});
