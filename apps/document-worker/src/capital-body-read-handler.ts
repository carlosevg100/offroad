/** Server-only POST transport. No caller path, signed URL, redirect, SDK-global
 * mutation, payload logging or service credential returned to the worker. */
export interface CapitalBodyReadServerConfig {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}
/** Built-in modern dictionaries preferred; local legacy built-ins remain supported.
 * Diagnostics contain only fixed configuration categories, never keys or values. */
export function capitalBodyReadServerConfigFromEnvironment(get: (name: string) => string | undefined): CapitalBodyReadServerConfig {
  const defaultKey = (name: string, code: string): string | undefined => {
    const raw = get(name); if (!raw) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      const value = (parsed as Record<string, unknown>).default;
      if (value === undefined) return undefined;
      if (typeof value !== "string" || !value) throw new Error();
      return value;
    } catch {throw new Error(code);}
  };
  return {supabaseUrl: get("SUPABASE_URL") ?? "",
    anonKey: defaultKey("SUPABASE_PUBLISHABLE_KEYS", "capital_body_read_config_anon_dictionary_invalid") ?? get("SUPABASE_ANON_KEY") ?? "",
    serviceRoleKey: defaultKey("SUPABASE_SECRET_KEYS", "capital_body_read_config_service_dictionary_invalid") ?? get("SUPABASE_SERVICE_ROLE_KEY") ?? ""};
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const SCOPE_KEYS = ["schemaVersion", "retentionState", "allocationId", "retainedPayloadId", "bodyBasisId", "bucket", "path", "payloadFingerprint", "byteLength", "storageObjectId", "storageVersion", "retainedAt", "uploadExpiresAt", "expiresAt", "purgeAt", "replayed"];
const NO_CACHE = "private, no-store, no-cache, max-age=0, must-revalidate";
type Scope = Record<string, unknown> & {allocationId: string; storageObjectId: string; storageVersion: string; path: string; payloadFingerprint: string; byteLength: number; retentionState: string; retainedAt: string; uploadExpiresAt: string; expiresAt: string; purgeAt: string};
function denied(): never {throw new Error("capital_body_read_denied");}
function object(v: unknown): Record<string, unknown> {if (!v || typeof v !== "object" || Array.isArray(v)) denied(); return v as Record<string, unknown>;}
async function bounded(response: Response | Request, limit: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const claimed = response.headers.get("content-length");
  if (claimed !== null && (!/^\d+$/.test(claimed) || Number(claimed) > limit)) denied();
  const reader = response.body?.getReader(); if (!reader) denied();
  const onAbort = () => {void reader.cancel().catch(() => undefined);};
  signal?.addEventListener("abort", onAbort, {once: true});
  const parts: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {const next = await reader.read(); if (next.done) break; length += next.value.byteLength;
      if (length > limit) {await reader.cancel(); denied();} parts.push(next.value);}
  } finally {signal?.removeEventListener("abort", onAbort); reader.releaseLock();}
  if (signal?.aborted) denied();
  const bytes = new Uint8Array(length); let offset = 0; for (const p of parts) {bytes.set(p, offset); offset += p.length;} return bytes;
}
async function json(response: Response | Request, limit = 16384, signal?: AbortSignal) {return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(await bounded(response, limit, signal))) as unknown;}
function scope(v: unknown, allocation: string, now: number, kind: "typed_body" | "public_source", nativeCatalogue = false): Scope {
  const s = object(v);
  const keys = kind === "typed_body" ? SCOPE_KEYS : SCOPE_KEYS.filter(key => !["retentionState", "bodyBasisId", "replayed"].includes(key)).concat(["state", "deliveryId"]);
  const state = kind === "typed_body" ? s.retentionState : s.state;
  if (Object.keys(s).length !== keys.length || !keys.every(key => Object.hasOwn(s, key)) || s.schemaVersion !== (kind === "typed_body" ? "capital-retained-body.v1" : "capital-public-storage-scope.v1")
    || !["allocated", kind === "typed_body" ? "retained" : "complete"].includes(String(state)) || s.allocationId !== allocation || s.bucket !== "capital-input-capture"
    || (!(nativeCatalogue && kind === "typed_body" && s.bodyBasisId === null) && (typeof s[kind === "typed_body" ? "bodyBasisId" : "deliveryId"] !== "string" || !UUID.test(String(s[kind === "typed_body" ? "bodyBasisId" : "deliveryId"])))) || typeof s.storageObjectId !== "string" || !UUID.test(s.storageObjectId)
    || typeof s.storageVersion !== "string" || !/^[a-zA-Z0-9._-]{1,200}$/.test(s.storageVersion)
    || typeof s.path !== "string" || !new RegExp(`^[a-f0-9-]{36}/${allocation}/payload\\.json$`).test(s.path)
    || !UUID.test(s.path.split("/")[0] ?? "") || typeof s.payloadFingerprint !== "string" || !HASH.test(s.payloadFingerprint)
    || !Number.isSafeInteger(s.byteLength) || Number(s.byteLength) < 1 || Number(s.byteLength) > 1048576 || (kind === "typed_body" && typeof s.replayed !== "boolean")) denied();
  if (state === "allocated" ? s.retainedPayloadId !== null : typeof s.retainedPayloadId !== "string" || !UUID.test(s.retainedPayloadId)) denied();
  for (const field of ["retainedAt", "uploadExpiresAt", "expiresAt", "purgeAt"]) if (typeof s[field] !== "string" || !Number.isFinite(Date.parse(s[field]))) denied();
  if (Date.parse(String(s.retainedAt)) >= Date.parse(String(s.purgeAt)) || Date.parse(String(s.purgeAt)) >= Date.parse(String(s.expiresAt))
    || Date.parse(String(s.purgeAt)) <= now || (state === "allocated" && Date.parse(String(s.uploadExpiresAt)) <= now)) denied();
  return s as Scope;
}
type MaterialScope = Record<string, unknown> & {allocationId: string; organizationId: string; workId: string; recipeId: string; storageObjectId: string; storageVersion: string; path: string; payloadFingerprint: string; byteLength: number; expiresAt: string; purgeAt: string};
function materialScope(v: unknown, allocation: string, workspace: string, now: number): MaterialScope {
  const s = object(v);
  const keys = ["schemaVersion", "organizationId", "workId", "recipeId", "allocationId", "retainedPayloadId", "kind", "payloadFingerprint", "byteLength", "bucket", "path", "storageObjectId", "storageVersion", "expiresAt", "purgeAt"];
  if (Object.keys(s).length !== keys.length || !keys.every(key => Object.hasOwn(s, key))
    || s.schemaVersion !== "capital-material-body-scope.v1" || s.organizationId !== workspace || s.allocationId !== allocation
    || !["organizationId", "workId", "recipeId", "allocationId", "storageObjectId"].every(key => typeof s[key] === "string" && UUID.test(String(s[key])))
    || (s.retainedPayloadId !== null && (typeof s.retainedPayloadId !== "string" || !UUID.test(s.retainedPayloadId)))
    || !["context", "calculation_report", "case_state", "material_package"].includes(String(s.kind))
    || s.bucket !== "capital-input-capture" || s.path !== `${workspace}/${allocation}/payload.json`
    || typeof s.storageVersion !== "string" || !/^[a-zA-Z0-9._-]{1,200}$/.test(s.storageVersion)
    || typeof s.payloadFingerprint !== "string" || !HASH.test(s.payloadFingerprint)
    || !Number.isSafeInteger(s.byteLength) || Number(s.byteLength) < 1 || Number(s.byteLength) > 1048576
    || !["expiresAt", "purgeAt"].every(key => typeof s[key] === "string" && Number.isFinite(Date.parse(String(s[key]))))
    || Date.parse(String(s.purgeAt)) >= Date.parse(String(s.expiresAt)) || Date.parse(String(s.purgeAt)) <= now) denied();
  return s as MaterialScope;
}
type ProviderScope = Scope & {recipeId: string; taskId?: string | null; artifactType?: string | null};
function providerScope(value: unknown, input: Record<string, unknown>, workspace: string, now: number): ProviderScope {
  const v = object(value), human = input.kind === "native_provider_human", recipe = input.kind === "native_provider_recipe";
  const extra = human ? ["organizationId", "workId", "revisionId", "recipeId", "family", "taskId", "artifactType"] : recipe ? ["recipeId", "scope"] : ["recipeId", "taskId", "artifactType"];
  if (Object.keys(v).length !== SCOPE_KEYS.length + extra.length || !extra.every(key => Object.hasOwn(v, key))
    || typeof v.recipeId !== "string" || !UUID.test(v.recipeId) || (!human && v.recipeId !== input.recipeId)
    || (recipe && (v.scope !== input.scope || v.retainedPayloadId !== input.retainedPayloadId))) denied();
  if (human) {
    if (v.organizationId !== workspace || v.revisionId !== input.revisionId || typeof v.workId !== "string" || !UUID.test(v.workId)
      || !["provider_research", "provider_case_fit"].includes(String(v.family))) denied();
  }
  if (!recipe) {
    const taskId = human ? v.taskId : input.taskId ?? null, artifactType = human ? v.artifactType : input.artifactType ?? null;
    if ((human && taskId === null) || v.taskId !== taskId || v.artifactType !== artifactType || (taskId !== null && (!["M01", "K01", "K02"].includes(String(taskId))
      || !["provider_research", "provider_case_fit"].some(family => artifactType === family + (taskId === "M01" ? "_scope" : taskId === "K01" ? "_sources" : ""))))
      || (human && artifactType !== String(v.family) + (taskId === "M01" ? "_scope" : taskId === "K01" ? "_sources" : ""))) denied();
  }
  if ((human || recipe || input.kind === "native_provider_result") && v.retentionState !== "retained") denied();
  if (input.kind === "native_provider_result" && v.retainedPayloadId !== input.retainedPayloadId) denied();
  if (input.kind === "native_provider_allocation" && v.allocationId !== input.allocationId) denied();
  const base = Object.fromEntries(SCOPE_KEYS.map(key => [key, v[key]]));
  const checked = scope(base, String(v.allocationId), now, "typed_body", recipe && input.scope === "catalog");
  if (checked.path.split("/")[0] !== workspace) denied();
  return {...checked, ...Object.fromEntries(extra.map(key => [key, v[key]]))} as ProviderScope;
}
function same(a: Scope | MaterialScope, b: Scope | MaterialScope) {return Object.keys(a).filter(key => key !== "replayed").every(key => a[key] === b[key]);}
export function createCapitalBodyReadHandler(config: CapitalBodyReadServerConfig): (request: Request) => Promise<Response> {
  let base: URL;
  try {base = new URL(config.supabaseUrl);} catch {throw new Error("capital_body_read_config_url_invalid");}
  const fetcher = config.fetch ?? globalThis.fetch, now = config.now ?? Date.now;
  if (base.username || base.password || base.search || base.hash || !["https:", "http:"].includes(base.protocol)
    || (base.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]", "kong"].includes(base.hostname))) throw new Error("capital_body_read_config_url_invalid");
  const origin = base.origin, anonKey = config.anonKey, serviceKey = config.serviceRoleKey;
  const role = (value: string): unknown => {
    try {return object(JSON.parse(atob((value.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")))).role;}
    catch {return null;}
  };
  if (!anonKey) throw new Error("capital_body_read_config_anon_missing");
  if (!serviceKey) throw new Error("capital_body_read_config_service_missing");
  const modernSecret = /^sb_secret_[A-Za-z0-9_-]+$/.test(serviceKey);
  if (!modernSecret && role(serviceKey) !== "service_role") throw new Error("capital_body_read_config_service_type_invalid");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(anonKey) && role(anonKey) !== "anon") throw new Error("capital_body_read_config_anon_type_invalid");
  if (typeof fetcher !== "function" || typeof now !== "function") throw new Error("capital_body_read_config_transport_invalid");
  return async request => {
    const cacheHeaders = {"Cache-Control": NO_CACHE, "Pragma": "no-cache", "Expires": "0", "X-Content-Type-Options": "nosniff"};
    if (request.method !== "POST") return new Response(null, {status: 405, headers: {...cacheHeaders, Allow: "POST"}});
    try {
      const signal = AbortSignal.timeout(10000);
      const authorization = request.headers.get("authorization") ?? "", workspace = request.headers.get("x-offroad-workspace") ?? "";
      const job = request.headers.get("x-offroad-job-id") ?? "", capability = request.headers.get("x-offroad-capability") ?? "";
      if (!/^Bearer [A-Za-z0-9._-]{1,16384}$/.test(authorization) || !UUID.test(workspace)
        || request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") denied();
      const claims = object(JSON.parse(atob((authorization.slice(7).split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))));
      if (claims.role !== "authenticated" || typeof claims.sub !== "string" || !UUID.test(claims.sub)) denied();
      const input = object(await json(request, 4096, signal));
      const s11 = ["s11_result", "s11_body", "s11_recovery", "s11_recovery_source", "s11_task", "s11_recovered_task", "s11_revision_body", "s11_revision_task", "s11_revision_source"].includes(String(input.kind));
      const debt = ["debt_body", "debt_result", "debt_recovery", "debt_recovery_source", "debt_recovered_task", "debt_revision_body", "debt_revision_task", "debt_revision_source"].includes(String(input.kind));
      const material = input.kind === "material_body" || input.kind === "material_result";
      const provider = ["native_provider_recipe", "native_provider_allocation", "native_provider_result", "native_provider_human"].includes(String(input.kind));
      const previewHuman = input.kind === "preview_result";
      const human = previewHuman || input.kind === "debt_result" || input.kind === "native_provider_human" || input.kind === "m07_result" || input.kind === "s11_result" || input.kind === "material_result";
      const revisionTask = input.kind === "s11_revision_task" || input.kind === "debt_revision_task";
      const task = input.kind === "debt_recovered_task" || input.kind === "s11_task" || input.kind === "s11_recovered_task" || revisionTask;
      const recoverySource = input.kind === "debt_recovery_source" || input.kind === "m07_recovery_source" || input.kind === "s11_recovery_source";
      const recovery = input.kind === "debt_recovery" || input.kind === "m07_recovery" || input.kind === "s11_recovery" || recoverySource;
      const revisionSource = input.kind === "debt_revision_source" || input.kind === "m07_revision_source" || input.kind === "s11_revision_source";
      const revision = input.kind === "debt_revision_body" || input.kind === "m07_revision_body" || input.kind === "s11_revision_body" || revisionSource;
      if (debt) {
        const keys = human ? ["kind", "revisionId"] : revisionTask ? ["kind", "taskRunId"] : task ? ["kind", "recipeId", "taskRunId"]
          : revision ? ["kind", "retainedPayloadId"] : recovery ? ["kind", "recipeId", "retainedPayloadId"] : ["kind", "allocationId"];
        if (Object.keys(input).length !== keys.length || !keys.every(key => Object.hasOwn(input, key))) denied();
        for (const key of keys.filter(key => key !== "kind")) if (typeof input[key] !== "string" || !UUID.test(String(input[key]))) denied();
        if (!human && (!UUID.test(job) || !capability || capability.length > 4096)) denied();
      } else if (provider) {
        const keys = input.kind === "native_provider_human" ? ["kind", "revisionId"] : input.kind === "native_provider_recipe" ? ["kind", "recipeId", "retainedPayloadId", "scope"]
          : input.kind === "native_provider_result" ? ["kind", "recipeId", "retainedPayloadId", "taskId", "artifactType"]
          : input.taskId === undefined && input.artifactType === undefined ? ["kind", "recipeId", "allocationId"] : ["kind", "recipeId", "allocationId", "taskId", "artifactType"];
        if (Object.keys(input).length !== keys.length || !keys.every(key => Object.hasOwn(input, key))) denied();
        for (const key of keys.filter(key => ["recipeId", "retainedPayloadId", "allocationId", "revisionId"].includes(key))) if (typeof input[key] !== "string" || !UUID.test(String(input[key]))) denied();
        if (!human && (!UUID.test(job) || !capability || capability.length > 4096)) denied();
        if (input.kind === "native_provider_recipe" && !["context", "catalog"].includes(String(input.scope))) denied();
        if (keys.includes("taskId") && (!["M01", "K01", "K02"].includes(String(input.taskId)) || !["provider_research", "provider_case_fit"].some(family => input.artifactType === family + (input.taskId === "M01" ? "_scope" : input.taskId === "K01" ? "_sources" : "")))) denied();
      } else {
      if (Object.keys(input).length !== (recovery || task && !revisionTask ? 3 : 2)) denied();
      if (human) {
        if (typeof input.revisionId !== "string" || !UUID.test(input.revisionId)) denied();
      } else if (task) {
        if (!revisionTask && (typeof input.recipeId !== "string" || !UUID.test(input.recipeId))
          || typeof input.taskRunId !== "string" || !UUID.test(input.taskRunId)
          || !UUID.test(job) || !capability || capability.length > 4096) denied();
      } else if (revision) {
        if (typeof input.retainedPayloadId !== "string" || !UUID.test(input.retainedPayloadId)
          || !UUID.test(job) || !capability || capability.length > 4096) denied();
      } else if (recovery) {
        if (typeof input.recipeId !== "string" || !UUID.test(input.recipeId)
          || typeof input.retainedPayloadId !== "string" || !UUID.test(input.retainedPayloadId)
          || !UUID.test(job) || !capability || capability.length > 4096) denied();
      } else if (!["typed_body", "public_source", "m07_body", "s11_body", "material_body", "preview_body"].includes(String(input.kind)) || typeof input.allocationId !== "string" || !UUID.test(input.allocationId)
        || !UUID.test(job) || !capability || capability.length > 4096) denied();
            }
      const kind = provider ? "typed_body" : recoverySource || revisionSource ? "public_source" : human || recovery || revision || task || input.kind === "m07_body" || input.kind === "s11_body" || input.kind === "debt_body" || input.kind === "preview_body" ? "typed_body" : input.kind as "typed_body" | "public_source";
      const userHeaders = {apikey: anonKey, Authorization: authorization, "Content-Type": "application/json", "x-offroad-workspace": workspace,
        ...(!human ? {"x-offroad-job-id": job, "x-offroad-capability": capability} : {}), "Cache-Control": "no-store"};
      const options = {redirect: "error" as const, cache: "no-store" as const, signal};
      // Verification happens at Auth, not by trusting decoded JWT claims alone.
      const user = await fetcher(`${origin}/auth/v1/user`, {...options, headers: userHeaders});
      if (!user.ok || object(await json(user, 16384, signal)).id !== claims.sub) denied();
      let nativeProof: {recipeId: string; finalFingerprint: string; workId?: string; artifactId?: string} | undefined;
      const authorize = async () => {
        const providerBody = {p_job_id: job, p_capability_token: capability, p_recipe_id: input.recipeId};
        const body = JSON.stringify(provider ? human ? {p_revision_id: input.revisionId} : input.kind === "native_provider_recipe"
          ? {...providerBody, p_retained_payload_id: input.retainedPayloadId, p_scope: input.scope} : input.kind === "native_provider_result"
          ? {...providerBody, p_retained_payload_id: input.retainedPayloadId, p_task_id: input.taskId, p_artifact_type: input.artifactType}
          : {...providerBody, p_allocation_id: input.allocationId, p_task_id: input.taskId ?? null, p_artifact_type: input.artifactType ?? null} : human ? {p_revision_id: input.revisionId} : task
          ? {p_job_id: job, p_capability_token: capability, ...(!revisionTask ? {p_recipe_id: input.recipeId} : {}), p_task_run_id: input.taskRunId} : revision
          ? {p_job_id: job, p_capability_token: capability, p_retained_payload_id: input.retainedPayloadId} : recovery
          ? {p_job_id: job, p_capability_token: capability, p_recipe_id: input.recipeId, p_retained_payload_id: input.retainedPayloadId}
          : {p_job_id: job, p_capability_token: capability, p_allocation_id: input.allocationId});
        const command = debt ? human ? "read_capital_debt_result_v1" : task ? revisionTask ? "worker_read_capital_debt_revision_task_v1" : "worker_read_capital_debt_recovered_task_body_v1"
          : revisionSource ? "worker_read_capital_debt_revision_source_v1" : revision ? "worker_read_capital_debt_revision_body_v1" : recoverySource ? "worker_read_capital_debt_recovery_source_v1" : recovery ? "worker_read_capital_debt_recovery_body_v1" : "worker_read_capital_debt_allocation_v1" : provider ? human ? "read_capital_native_provider_result_body_v1" : input.kind === "native_provider_recipe" ? "worker_read_capital_native_recipe_v1"
          : input.kind === "native_provider_result" ? "worker_read_capital_native_result_v1" : "worker_read_capital_native_allocation_v1" : human ? (previewHuman ? "read_capital_preview_result_body_v1" : material ? "read_material_production_result_v1" : s11 ? "read_capital_s11_result_v1" : "read_capital_m07_result_v1")
          : task ? (revisionTask ? "worker_read_capital_s11_revision_task_v1" : input.kind === "s11_recovered_task" ? "worker_read_capital_s11_recovered_task_body_v1" : "worker_read_capital_s11_task_body_v1") : revisionSource ? (s11 ? "worker_read_capital_s11_revision_source_v1" : "worker_read_capital_m07_revision_source_v1") : revision ? (s11 ? "worker_read_capital_s11_revision_body_v1" : "worker_read_capital_m07_revision_body_v1") : recoverySource ? (s11 ? "worker_read_capital_s11_recovery_source_v1" : "worker_read_capital_m07_recovery_source_v1") : recovery ? (s11 ? "worker_read_capital_s11_recovery_body_v1" : "worker_read_capital_m07_recovery_body_v1")
          : input.kind === "preview_body" ? "worker_read_capital_preview_allocation_v1" : material ? "worker_read_material_production_allocation_v1" : input.kind === "s11_body" ? "worker_read_capital_s11_allocation_v1" : input.kind === "m07_body" ? "worker_read_capital_m07_allocation_v1"
          : kind === "typed_body" ? "worker_read_capital_body_allocation_v1" : "worker_read_capital_public_payload_allocation_v1";
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetcher(`${origin}/rest/v1/rpc/${command}`, {...options, method: "POST", headers: userHeaders, body});
          if (r.ok) {
            const result = await json(r, 16384, signal);
            if (provider) return providerScope(result, input, workspace, now());
            if (debt && !human && !recovery && !revision && !task) {
              const envelope = object(result);
              const keys = ["schemaVersion", "recipeId", "retention"];
              if (Object.keys(envelope).length !== keys.length || !keys.every(key => Object.hasOwn(envelope, key))
                || envelope.schemaVersion !== "capital-debt-worker-read-scope.v1" || typeof envelope.recipeId !== "string" || !UUID.test(envelope.recipeId)
                || (nativeProof && nativeProof.recipeId !== envelope.recipeId)) denied();
              nativeProof ??= {recipeId: envelope.recipeId, finalFingerprint: ""};
              return scope(envelope.retention, String(input.allocationId), now(), kind);
            }
            if (recovery || revision) {
              const retained = object(result);
              if (retained.retainedPayloadId !== input.retainedPayloadId || (recoverySource || revisionSource ? retained.state !== "complete" : retained.retentionState !== "retained")
                || typeof retained.allocationId !== "string" || !UUID.test(retained.allocationId)) denied();
              return scope(retained, retained.allocationId, now(), kind);
            }
            if (task) {
              const retained = object(result);
              if (retained.retentionState !== "retained" || typeof retained.retainedPayloadId !== "string" || !UUID.test(retained.retainedPayloadId)
                || typeof retained.allocationId !== "string" || !UUID.test(retained.allocationId)) denied();
              return scope(retained, retained.allocationId, now(), kind);
            }
            if (material && !human) return materialScope(result, String(input.allocationId), workspace, now());
            if (!human) return scope(result, String(input.allocationId), now(), kind);
            const envelope = object(result);
            if (previewHuman) {
              const keys = ["schemaVersion", "workId", "artifactId", "revisionId", "recipeId", "finalFingerprint", "retention"];
              if (Object.keys(envelope).length !== keys.length || !keys.every(key => Object.hasOwn(envelope, key))
                || envelope.schemaVersion !== "capital-preview-read-scope.v1" || envelope.revisionId !== input.revisionId
                || !["workId", "artifactId", "recipeId"].every(key => typeof envelope[key] === "string" && UUID.test(String(envelope[key])))
                || typeof envelope.finalFingerprint !== "string" || !HASH.test(envelope.finalFingerprint)) denied();
              if (nativeProof && (nativeProof.recipeId !== envelope.recipeId || nativeProof.finalFingerprint !== envelope.finalFingerprint
                || nativeProof.workId !== envelope.workId || nativeProof.artifactId !== envelope.artifactId)) denied();
              nativeProof ??= {recipeId: String(envelope.recipeId), finalFingerprint: envelope.finalFingerprint, workId: String(envelope.workId), artifactId: String(envelope.artifactId)};
              const retained = object(envelope.retention);
              if (typeof retained.allocationId !== "string" || !UUID.test(retained.allocationId) || retained.retentionState !== "retained") denied();
              return scope(retained, retained.allocationId, now(), kind);
            }
            if (material) {
              if (Object.keys(envelope).length !== 5 || envelope.schemaVersion !== "capital-material-read-scope.v1" || envelope.revisionId !== input.revisionId
                || !Object.hasOwn(envelope, "scope") || typeof envelope.recipeId !== "string" || !UUID.test(envelope.recipeId)
                || typeof envelope.bundleFingerprint !== "string" || !HASH.test(envelope.bundleFingerprint)) denied();
              if (nativeProof && (nativeProof.recipeId !== envelope.recipeId || nativeProof.finalFingerprint !== envelope.bundleFingerprint)) denied();
              nativeProof ??= {recipeId: envelope.recipeId, finalFingerprint: envelope.bundleFingerprint};
              const retained = object(envelope.scope);
              if (retained.recipeId !== envelope.recipeId || retained.kind !== "material_package" || typeof retained.retainedPayloadId !== "string" || !UUID.test(retained.retainedPayloadId)
                || typeof retained.allocationId !== "string" || !UUID.test(retained.allocationId)) denied();
              return materialScope(retained, retained.allocationId, workspace, now());
            }
            if (Object.keys(envelope).length !== 5 || envelope.schemaVersion !== (debt ? "capital-debt-read-scope.v1" : s11 ? "capital-s11-read-scope.v1" : "capital-m07-read-scope.v1") || envelope.revisionId !== input.revisionId
              || !Object.hasOwn(envelope, "retention") || typeof envelope.recipeId !== "string" || !UUID.test(envelope.recipeId)
              || typeof envelope.finalFingerprint !== "string" || !HASH.test(envelope.finalFingerprint)) denied();
            if (nativeProof && (nativeProof.recipeId !== envelope.recipeId || nativeProof.finalFingerprint !== envelope.finalFingerprint)) denied();
            nativeProof ??= {recipeId: envelope.recipeId, finalFingerprint: envelope.finalFingerprint};
            const retained = object(envelope.retention);
            if (typeof retained.allocationId !== "string" || !UUID.test(retained.allocationId) || retained.retentionState !== "retained") denied();
            return scope(retained, retained.allocationId, now(), kind);
          }
          const error = object(await json(r, 16384, signal));
          if (error.code !== "40001" || ((provider || debt || previewHuman) && error.message !== "capital_capture_retry") || attempt === 2 || signal.aborted) denied();
          // Retry only this same authority command. No provider dispatch, read
          // body, caller IDs, or request lineage is regenerated by this retry.
          await new Promise<void>(resolve => setTimeout(resolve, 20 * (attempt + 1)));
        }
        return denied();
      };
      const before = await authorize();
      if (before.path.split("/")[0] !== workspace) denied();
      const objectPath = `capital-input-capture/${before.path.split("/").map(encodeURIComponent).join("/")}`;
      const storageHeaders: Record<string, string> = {apikey: serviceKey, "Cache-Control": "no-store"};
      // Opaque secret keys are API credentials, never JWT Bearer tokens.
      if (!modernSecret) storageHeaders.Authorization = `Bearer ${serviceKey}`;
      const query = `versionId=${encodeURIComponent(before.storageVersion)}&cacheNonce=${crypto.randomUUID()}`;
      const infoResponse = await fetcher(`${origin}/storage/v1/object/info/authenticated/${objectPath}?${query}`, {...options, headers: storageHeaders});
      if (!infoResponse.ok) denied(); const info = object(await json(infoResponse, 16384, signal));
      if (info.id !== before.storageObjectId || info.version !== before.storageVersion || info.name !== before.path || info.bucket_id !== "capital-input-capture"
        || info.size !== before.byteLength || info.content_type !== "application/json" || info.is_versioned === true || info.is_delete_marker === true) denied();
      const download = await fetcher(`${origin}/storage/v1/object/authenticated/${objectPath}?${query}`, {...options, headers: storageHeaders});
      if (!download.ok) denied(); const bytes = await bounded(download, before.byteLength, signal);
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
      if (bytes.byteLength !== before.byteLength || digest !== before.payloadFingerprint) denied();
      const after = await authorize(); if (!same(before, after)) denied();
      if (provider) providerScope(after, input, workspace, now()); else if (material) materialScope(after, before.allocationId, workspace, now()); else scope(after, before.allocationId, now(), kind);
      return new Response(bytes, {headers: {...cacheHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength),
        "x-offroad-allocation-id": after.allocationId, "x-offroad-object-id": after.storageObjectId, "x-offroad-storage-version": after.storageVersion,
        "x-offroad-payload-sha256": after.payloadFingerprint, "x-offroad-byte-length": String(after.byteLength),
        ...(debt && !human && !recovery && !revision && !task ? {"x-offroad-recipe-id": nativeProof!.recipeId} : {}),
        ...(material ? {"x-offroad-recipe-id": String(after.recipeId), "x-offroad-work-id": String(after.workId)} : {}),
        ...(provider ? {"x-offroad-recipe-id": String(after.recipeId), ...(after.retainedPayloadId ? {"x-offroad-retained-payload-id": String(after.retainedPayloadId)} : {}),
          ...(after.taskId ? {"x-offroad-task-id": String(after.taskId), "x-offroad-artifact-type": String(after.artifactType)} : {}),
          ...(human ? {"x-offroad-revision-id": String(input.revisionId), "x-offroad-work-id": String(after.workId), "x-offroad-organization-id": workspace} : {})} : {}),
        ...(human && !provider ? {"x-offroad-revision-id": String(input.revisionId), "x-offroad-recipe-id": nativeProof!.recipeId,
          ...(material ? {"x-offroad-bundle-fingerprint": nativeProof!.finalFingerprint} : {"x-offroad-final-fingerprint": nativeProof!.finalFingerprint})} : {}),
        ...(previewHuman ? {"x-offroad-work-id": nativeProof!.workId!, "x-offroad-artifact-id": nativeProof!.artifactId!, "x-offroad-organization-id": workspace} : {}),
        ...(recovery ? {"x-offroad-recipe-id": String(input.recipeId), "x-offroad-retained-payload-id": String(input.retainedPayloadId)} : {}),
        ...(revision ? {"x-offroad-retained-payload-id": String(input.retainedPayloadId)} : {}),
        ...(task ? {...(!revisionTask ? {"x-offroad-recipe-id": String(input.recipeId)} : {}), "x-offroad-task-run-id": String(input.taskRunId)} : {})}});
    } catch {return new Response('{"error":"capital_body_read_denied"}', {status: 403, headers: {...cacheHeaders, "Content-Type": "application/json"}});}
  };
}
