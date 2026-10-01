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
function scope(v: unknown, allocation: string, now: number, kind: "typed_body" | "public_source"): Scope {
  const s = object(v);
  const keys = kind === "typed_body" ? SCOPE_KEYS : SCOPE_KEYS.filter(key => !["retentionState", "bodyBasisId", "replayed"].includes(key)).concat(["state", "deliveryId"]);
  const state = kind === "typed_body" ? s.retentionState : s.state;
  if (Object.keys(s).length !== keys.length || !keys.every(key => Object.hasOwn(s, key)) || s.schemaVersion !== (kind === "typed_body" ? "capital-retained-body.v1" : "capital-public-storage-scope.v1")
    || !["allocated", kind === "typed_body" ? "retained" : "complete"].includes(String(state)) || s.allocationId !== allocation || s.bucket !== "capital-input-capture"
    || typeof s[kind === "typed_body" ? "bodyBasisId" : "deliveryId"] !== "string" || !UUID.test(String(s[kind === "typed_body" ? "bodyBasisId" : "deliveryId"])) || typeof s.storageObjectId !== "string" || !UUID.test(s.storageObjectId)
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
function same(a: Scope, b: Scope) {return Object.keys(a).filter(key => key !== "replayed").every(key => a[key] === b[key]);}
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
      if (!/^Bearer [A-Za-z0-9._-]{1,16384}$/.test(authorization) || !UUID.test(workspace) || !UUID.test(job) || !capability || capability.length > 4096
        || request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") denied();
      const claims = object(JSON.parse(atob((authorization.slice(7).split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))));
      if (claims.role !== "authenticated" || typeof claims.sub !== "string" || !UUID.test(claims.sub)) denied();
      const input = object(await json(request, 4096, signal));
      if (Object.keys(input).length !== 2 || !["typed_body", "public_source"].includes(String(input.kind)) || typeof input.allocationId !== "string" || !UUID.test(input.allocationId)) denied();
      const allocation = input.allocationId, kind = input.kind as "typed_body" | "public_source";
      const userHeaders = {apikey: anonKey, Authorization: authorization, "Content-Type": "application/json", "x-offroad-workspace": workspace,
        "x-offroad-job-id": job, "x-offroad-capability": capability, "Cache-Control": "no-store"};
      const options = {redirect: "error" as const, cache: "no-store" as const, signal};
      // Verification happens at Auth, not by trusting decoded JWT claims alone.
      const user = await fetcher(`${origin}/auth/v1/user`, {...options, headers: userHeaders});
      if (!user.ok || object(await json(user, 16384, signal)).id !== claims.sub) denied();
      const authorize = async () => {
        const body = JSON.stringify({p_job_id: job, p_capability_token: capability, p_allocation_id: allocation});
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetcher(`${origin}/rest/v1/rpc/${kind === "typed_body" ? "worker_read_capital_body_allocation_v1" : "worker_read_capital_public_payload_allocation_v1"}`, {...options, method: "POST", headers: userHeaders, body});
          if (r.ok) return scope(await json(r, 16384, signal), allocation, now(), kind);
          const error = object(await json(r, 16384, signal));
          if (error.code !== "40001" || attempt === 2 || signal.aborted) denied();
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
      const after = await authorize(); if (!same(before, after)) denied(); scope(after, allocation, now(), kind);
      return new Response(bytes, {headers: {...cacheHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength),
        "x-offroad-allocation-id": after.allocationId, "x-offroad-object-id": after.storageObjectId, "x-offroad-storage-version": after.storageVersion,
        "x-offroad-payload-sha256": after.payloadFingerprint, "x-offroad-byte-length": String(after.byteLength)}});
    } catch {return new Response('{"error":"capital_body_read_denied"}', {status: 403, headers: {...cacheHeaders, "Content-Type": "application/json"}});}
  };
}
