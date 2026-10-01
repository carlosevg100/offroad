/** Typed retention for admitted contribution bodies and gateway parsed output.
 * Original live job only: SQL/RLS decide current rights, identity and deadlines.
 * This service does not construct input recipes, activate M07 or certify native materials. */
import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import {legacyGatewayFingerprint, type GatewayAcceptedInvocation, type GatewayResult} from "@offroad/model-gateway";
const uuid = z.uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/), time = z.iso.datetime({offset: true});
const acceptedSchema = z.strictObject({schemaVersion: z.literal("gateway-accepted-invocation.v1"), invocationId: uuid,
  adapterInputVersion: z.literal("gateway-adapter-input.v1"), adapterRequestFingerprint: hash,
  outputFingerprintVersion: z.literal("gateway-parsed-output.v1"), outputFingerprint: hash, inputFingerprint: hash, promptFingerprint: hash,
  provider: z.enum(["anthropic", "openai"]), configuredModel: z.string().min(1).max(160), reportedModel: z.string().min(1).max(160),
  schemaName: z.literal("origination_senior_readout_v2"), retryOrdinal: z.number().int().min(0).max(1),
  isSameModelRepair: z.boolean(), usedProviderFallback: z.boolean(), fromCassette: z.literal(false), inputAttestationReceiptId: uuid}).refine(value =>
    (value.retryOrdinal === 0 && !value.isSameModelRepair)
    || (value.retryOrdinal === 1 && value.isSameModelRepair && !value.usedProviderFallback));
const scopeSchema = z.strictObject({schemaVersion: z.literal("capital-retained-body.v1"), retentionState: z.enum(["allocated", "retained"]),
  allocationId: uuid, retainedPayloadId: uuid.nullable(), bodyBasisId: uuid, bucket: z.literal("capital-input-capture"),
  path: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/payload\.json$/), payloadFingerprint: hash,
  byteLength: z.number().int().positive().max(1048576), storageObjectId: uuid.nullable(), storageVersion: z.string().min(1).nullable(),
  retainedAt: time, uploadExpiresAt: time, expiresAt: time, purgeAt: time, replayed: z.boolean()});
const preparedSchema = scopeSchema.extend({canonicalBody: z.string().optional()});
export type CapitalBodyRetentionReceipt = z.infer<typeof scopeSchema>;
type Scope = CapitalBodyRetentionReceipt;
const receiptSchema = z.strictObject({acceptedInvocationId: uuid, inputReceiptId: uuid, invocationId: uuid, outputFingerprint: hash});
export interface CapitalBodyJobAuthority {jobId: string; capabilityToken: string}
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function deny(): never {throw new Error("capital_body_adapter_denied");}
function freeze<T>(value: T): T {if (value && typeof value === "object") {for (const v of Object.values(value)) freeze(v); Object.freeze(value);} return value;}
function sameObject(left: unknown, right: unknown) {return legacyGatewayFingerprint(left) === legacyGatewayFingerprint(right);}
export function createCapitalBodyRetention(transport: SupabaseClient, authority: CapitalBodyJobAuthority, now = Date.now) {
  const job = (() => {
    try {return freeze(z.strictObject({jobId: uuid, capabilityToken: z.string().min(1)}).parse(authority));}
    catch {return deny();}
  })();
  const jobArgs = {p_job_id: job.jobId, p_capability_token: job.capabilityToken};
  async function rpc(name: string, args: Record<string, unknown>) {
    // Retry only PostgreSQL serialization/lock frontier failures. Every retry is
    // the same command, request identity and body; never redispatch a model.
    const pinnedArgs = freeze(structuredClone({...jobArgs, ...args}));
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await transport.rpc(name, structuredClone(pinnedArgs));
      if (!r.error) return r.data;
      if (r.error.code !== "40001" || attempt === 2) deny();
      await new Promise<void>(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
    return deny();
  }
  function live(s: Scope) {
    uuid.parse(s.path.split("/")[0]);
    if (s.path.split("/")[1] !== s.allocationId || Date.parse(s.retainedAt) >= Date.parse(s.purgeAt)
      || Date.parse(s.purgeAt) >= Date.parse(s.expiresAt) || Date.parse(s.purgeAt) <= now()) deny();
  }
  function retained(s: Scope) {live(s); if (s.retentionState !== "retained" || !s.retainedPayloadId || !s.storageObjectId || !s.storageVersion) deny();}
  function exact(before: Scope, after: Scope) {
    // Authority may shrink deadlines. This read is refused and retried from fresh scope;
    // no bytes escape with a stale or changed receipt, identity or deadline.
    const {replayed: _beforeReplay, ...beforeIdentity} = before;
    const {replayed: _afterReplay, ...afterIdentity} = after;
    if (!sameObject(beforeIdentity, afterIdentity)) deny();
  }
  async function readScope(id: string) {
    const s = scopeSchema.parse(await rpc("worker_read_capital_body_v1", {p_retained_payload_id: uuid.parse(id)}));
    retained(s); if (s.retainedPayloadId !== id) deny(); return s;
  }
  async function physical(s: Scope, version: string) {
    live(s); const r = await transport.storage.from(s.bucket).download(s.path, {versionId: version, cacheNonce: randomUUID()}, {cache: "no-store"});
    if (r.error || !r.data) deny(); const bytes = new Uint8Array(await r.data.arrayBuffer());
    if (sha(bytes) !== s.payloadFingerprint || bytes.byteLength !== s.byteLength) deny(); live(s); return bytes;
  }
  async function read(id: string, expected?: Scope) {
    const before = await readScope(id); if (expected) exact(expected, before);
    const bytes = await physical(before, before.storageVersion!); const after = await readScope(id); exact(before, after); live(after);
    return {bytes, scope: after};
  }
  function body(bytes: Uint8Array, kind: "contribution_input" | "gateway_accepted_output", semantic?: string) {
    const raw: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
    if (kind === "contribution_input") return z.strictObject({schemaVersion: z.literal("capital-body.contribution.v1"), content: z.string().min(1).max(16000).refine(v => v.trim().length > 0)}).parse(raw);
    const parsed = originationSeniorReadoutSchema.parse(raw);
    // Reject schema-stripped fields as well: this service stores ONLY accepted parsed output.
    if (!sameObject(raw, parsed) || legacyGatewayFingerprint(parsed) !== semantic) deny(); return parsed;
  }
  async function retain(args: {requestId: string; kind: "contribution_input" | "gateway_accepted_output"; origin: string; output?: unknown; semantic?: string}) {
    const p = preparedSchema.parse(await rpc("worker_prepare_capital_body_v1", {p_request_id: uuid.parse(args.requestId), p_kind: args.kind,
      p_origin_or_accepted_id: uuid.parse(args.origin), p_body: args.output ?? null, p_gateway_output_fingerprint: args.semantic ?? null}));
    live(p);
    if (p.retentionState === "retained") {
      if (p.canonicalBody !== undefined) deny(); const r = await read(p.retainedPayloadId!, scopeSchema.parse(p));
      return {retention: r.scope, body: body(r.bytes, args.kind, args.semantic)};
    }
    if (p.retainedPayloadId !== null || p.storageObjectId !== null || p.storageVersion !== null || !p.canonicalBody || Date.parse(p.uploadExpiresAt) <= now()) deny();
    const bytes = Buffer.from(p.canonicalBody, "utf8"); if (sha(bytes) !== p.payloadFingerprint || bytes.byteLength !== p.byteLength) deny();
    body(bytes, args.kind, args.semantic); const storage = transport.storage.from(p.bucket);
    const upload = await storage.upload(p.path, bytes, {contentType: "application/json", cacheControl: "0", upsert: false});
    const status = upload.error && typeof upload.error === "object" ? Number((upload.error as {statusCode?: unknown; status?: unknown}).statusCode ?? (upload.error as {status?: unknown}).status) : undefined;
    if (upload.error && status !== 409) deny(); live(p); if (Date.parse(p.uploadExpiresAt) <= now()) deny();
    const info = await storage.info(p.path); if (info.error || !info.data || info.data.isVersioned || info.data.isDeleteMarker
      || info.data.name !== p.path || info.data.bucketId !== p.bucket) deny();
    const objectId = uuid.parse(info.data.id), version = z.string().min(1).parse(info.data.version);
    const actual = await physical(p, version); body(actual, args.kind, args.semantic);
    const committed = scopeSchema.parse(await rpc("worker_commit_capital_body_v1", {p_allocation_id: p.allocationId,
      p_storage_object_id: objectId, p_storage_version: version, p_verified_sha256: sha(actual), p_verified_size: actual.byteLength}));
    retained(committed);
    if (committed.allocationId !== p.allocationId || committed.bodyBasisId !== p.bodyBasisId || committed.bucket !== p.bucket || committed.path !== p.path
      || committed.retainedAt !== p.retainedAt || committed.uploadExpiresAt !== p.uploadExpiresAt
      || committed.payloadFingerprint !== p.payloadFingerprint || committed.byteLength !== p.byteLength
      || committed.storageObjectId !== objectId || committed.storageVersion !== version
      || Date.parse(committed.expiresAt) > Date.parse(p.expiresAt) || Date.parse(committed.purgeAt) > Date.parse(p.purgeAt)) deny();
    // New SQL read is mandatory after commit; never reuse public payload v1 for body authority.
    const reread = await read(committed.retainedPayloadId!, committed);
    return {retention: reread.scope, body: body(reread.bytes, args.kind, args.semantic)};
  }
  const sanitized = async <T>(operation: () => Promise<T>): Promise<T> => {try {return await operation();} catch {return deny();}};
  return Object.freeze({
    retainContribution: (revisionId: string, requestId: string) => sanitized(() => retain({origin: revisionId, requestId, kind: "contribution_input"})),
    retainAccepted: (result: GatewayResult<unknown>, requestId: string) => sanitized(async () => {
      // Snapshot before await, never infer winner from logs/result.model/last invocation.
      const accepted: GatewayAcceptedInvocation & {inputAttestationReceiptId: string} = freeze(acceptedSchema.parse(structuredClone(result.acceptedInvocation)));
      const output = freeze(structuredClone(result.output)); const parsed = originationSeniorReadoutSchema.parse(output);
      if (!sameObject(output, parsed) || legacyGatewayFingerprint(parsed) !== accepted.outputFingerprint) deny();
      const r = receiptSchema.parse(await rpc("worker_record_capital_body_accepted_v1", {p_input_receipt_id: accepted.inputAttestationReceiptId, p_accepted: accepted}));
      if (r.inputReceiptId !== accepted.inputAttestationReceiptId || r.invocationId !== accepted.invocationId || r.outputFingerprint !== accepted.outputFingerprint) deny();
      return retain({origin: r.acceptedInvocationId, requestId, kind: "gateway_accepted_output", output, semantic: accepted.outputFingerprint});
    }),
    readOriginal: (id: string, expected?: CapitalBodyRetentionReceipt) => sanitized(() => {
      const pinned = expected ? freeze(scopeSchema.parse(structuredClone(expected))) : undefined;
      return read(id, pinned);
    }),
  });
}
