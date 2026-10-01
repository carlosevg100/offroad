import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {readCapitalCaptureBytes} from "./capital-body-read-client";

const uuid = z.uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const time = z.iso.datetime({offset: true});
const bucket = z.literal("capital-input-capture");
const path = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/payload\.json$/);
const location = {allocationId: uuid, bucket, path, payloadFingerprint: hash, byteLength: z.number().int().positive().max(1048576), expiresAt: time, purgeAt: time};
const allocationSchema = z.strictObject({
  ...location, deliveryId: uuid, canonicalPayload: z.string().min(1), retainedAt: time, uploadExpiresAt: time,
  state: z.literal("allocated"), replayed: z.boolean(),
});
const retainedSchema = z.strictObject({
  ...location, retainedPayloadId: uuid, storageObjectId: uuid,
  storageVersion: z.string().min(1), state: z.literal("complete"),
});
const commitSchema = z.strictObject({
  retainedPayloadId: uuid, allocationId: uuid, state: z.literal("complete"),
  expiresAt: time, purgeAt: time, replayed: z.boolean(),
});
const preparationSchema = z.discriminatedUnion("state", [allocationSchema, commitSchema.extend({replayed: z.literal(true)})]);
const purgeItemSchema = z.strictObject({
  purgeId: uuid, allocationId: uuid, bucket, path,
  storageObjectId: uuid.nullable(), storageVersion: z.string().min(1).nullable(),
  purgeCapability: z.string().min(1), leaseExpiresAt: time,
});
const purgeClaimSchema = z.strictObject({items: z.array(purgeItemSchema).max(20), polledAt: time});
const ackSchema = z.strictObject({purged: z.literal(true), replayed: z.boolean()});
const retrySchema = z.strictObject({retryScheduled: z.literal(true)});

export interface CapitalCaptureJobAuthority {jobId: string; capabilityToken: string}
export interface CapitalCaptureRetentionInput extends CapitalCaptureJobAuthority {deliveryId: string; requestId: string; payload: unknown}
export type CapitalCaptureRetentionReceipt = z.infer<typeof commitSchema>;
export type CapitalCapturePurgeReason = "storage_unavailable" | "storage_delete_failed" | "storage_absence_unconfirmed";
export type CapitalCapturePurgeResult = {purgeId: string; state: "purged" | "retry_scheduled"; reason?: CapitalCapturePurgeReason};

function digest(bytes: Uint8Array) {return createHash("sha256").update(bytes).digest("hex");}
function status(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as {status?: unknown; statusCode?: unknown; originalError?: {status?: unknown}};
  const raw = value.status ?? value.statusCode ?? value.originalError?.status;
  return raw === undefined ? undefined : Number(raw);
}
function exactStorageAbsence(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {status?: unknown; statusCode?: unknown; message?: unknown};
  return (Number(value.status) === 400 || Number(value.status) === 404)
    && Number(value.statusCode) === 404
    && typeof value.message === "string"
    && /^(object not found|the resource was not found)$/i.test(value.message);
}
function assertPath(scope: {allocationId: string; path: string}) {
  const parts = scope.path.split("/");
  uuid.parse(parts[0]);
  if (parts[1] !== scope.allocationId) throw new Error("capital capture storage scope mismatch");
}

/** Authenticated dedicated worker only. No queue integration, credentials, signed URLs or overwrite.
 * The bucket must have versioning disabled: path deletion in a versioned bucket is not byte purge.
 * SQL/RLS remain authority; all receipts describe actual Storage bytes, never ETags or local intent.
 */
export function createCapitalPublicCaptureStorage(supabase: SupabaseClient, now: () => number = Date.now) {
  const rpc = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await supabase.rpc(name, args);
    if (result.error) throw new Error("capital capture database authority denied");
    return result.data;
  };
  const authorityArgs = (job: CapitalCaptureJobAuthority) => ({p_job_id: uuid.parse(job.jobId), p_capability_token: z.string().min(1).parse(job.capabilityToken)});
  const live = (scope: {expiresAt: string; purgeAt: string}) => {
    if (Date.parse(scope.purgeAt) <= now() || Date.parse(scope.purgeAt) >= Date.parse(scope.expiresAt)) throw new Error("capital capture retention expired");
  };
  const verifiedBytes = async (job: CapitalCaptureJobAuthority, scope: z.infer<typeof retainedSchema> | z.infer<typeof allocationSchema>) => {
    live(scope); const result = await readCapitalCaptureBytes(supabase, job, scope, "public_source"); live(scope); return result;
  };
  const readScope = async (job: CapitalCaptureJobAuthority, retainedPayloadId: string) => {
    const scope = retainedSchema.parse(await rpc("worker_read_capital_public_payload_v1", {...authorityArgs(job), p_retained_payload_id: uuid.parse(retainedPayloadId)}));
    if (scope.retainedPayloadId !== retainedPayloadId) throw new Error("capital capture receipt mismatch");
    assertPath(scope); live(scope);
    return scope;
  };
  const read = async (job: CapitalCaptureJobAuthority, retainedPayloadId: string, expected?: CapitalCaptureRetentionReceipt): Promise<Uint8Array> => {
    const before = await readScope(job, retainedPayloadId);
    if (expected && (before.allocationId !== expected.allocationId || before.expiresAt !== expected.expiresAt || before.purgeAt !== expected.purgeAt)) throw new Error("capital capture receipt mismatch");
    const {bytes} = await verifiedBytes(job, before);
    const after = await readScope(job, retainedPayloadId);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("capital capture read scope changed");
    return bytes;
  };
  return {
    async retain(callerInput: CapitalCaptureRetentionInput): Promise<CapitalCaptureRetentionReceipt> {
      const input = structuredClone(callerInput);
      const prepared = preparationSchema.parse(await rpc("worker_prepare_capital_public_payload_v1", {
        ...authorityArgs(input), p_delivery_id: uuid.parse(input.deliveryId), p_request_id: uuid.parse(input.requestId), p_payload: input.payload,
      }));
      if (prepared.state === "complete") {
        live(prepared);
        // A committed lost-response replay requires fresh physical bytes and fresh authority,
        // even though its original upload window has closed. No new write is attempted.
        await read(input, prepared.retainedPayloadId, prepared);
        return prepared;
      }
      const allocation = prepared;
      assertPath(allocation); live(allocation);
      if (allocation.deliveryId !== input.deliveryId || Date.parse(allocation.retainedAt) >= Date.parse(allocation.purgeAt)) throw new Error("capital capture allocation mismatch");
      if (Date.parse(allocation.uploadExpiresAt) <= now()) throw new Error("capital capture upload expired");
      // Hash the exact JSONB::text bytes supplied by SQL; JS JSON.stringify is not its canonicalizer.
      const bytes = Buffer.from(allocation.canonicalPayload, "utf8");
      if (bytes.byteLength !== allocation.byteLength || digest(bytes) !== allocation.payloadFingerprint) throw new Error("capital capture canonical bytes mismatch");
      const storage = supabase.storage.from(allocation.bucket);
      const upload = await storage.upload(allocation.path, bytes, {contentType: "application/json", cacheControl: "0", upsert: false,
        headers: Object.freeze({"x-offroad-workspace": uuid.parse(allocation.path.split("/")[0]), "x-offroad-job-id": uuid.parse(input.jobId),
          "x-offroad-capability": z.string().min(1).parse(input.capabilityToken)})});
      if (upload.error && status(upload.error) !== 409) throw new Error("capital capture storage write denied");
      const {objectId, version} = await verifiedBytes(input, allocation);
      const receipt = commitSchema.parse(await rpc("worker_commit_capital_public_payload_v1", {
        ...authorityArgs(input), p_allocation_id: allocation.allocationId, p_storage_object_id: objectId,
        p_storage_version: version, p_verified_sha256: digest(bytes), p_verified_size: bytes.byteLength,
      }));
      if (receipt.allocationId !== allocation.allocationId || receipt.expiresAt !== allocation.expiresAt || receipt.purgeAt !== allocation.purgeAt) throw new Error("capital capture receipt mismatch");
      live(receipt);
      return receipt;
    },
    read: (job: CapitalCaptureJobAuthority, retainedPayloadId: string, expected?: CapitalCaptureRetentionReceipt) => read(structuredClone(job), retainedPayloadId, expected ? structuredClone(expected) : undefined),
    async purgeOnce(workerToken: string, limit = 20): Promise<CapitalCapturePurgeResult[]> {
      z.string().min(1).parse(workerToken); z.number().int().min(1).max(20).parse(limit);
      const claim = purgeClaimSchema.parse(await rpc("worker_claim_capital_capture_purge_v1", {p_worker_token: workerToken, p_limit: limit}));
      const results: CapitalCapturePurgeResult[] = [];
      for (const item of claim.items) {
        assertPath(item);
        const leaseLive = () => {if (Date.parse(item.leaseExpiresAt) <= now()) throw new Error("capital capture purge lease expired");};
        const args = {p_worker_token: workerToken, p_purge_id: item.purgeId, p_purge_capability: item.purgeCapability};
        let reason: CapitalCapturePurgeReason = "storage_unavailable";
        try {
          leaseLive();
          const storage = supabase.storage.from(item.bucket);
          reason = "storage_delete_failed";
          const removed = await storage.remove([item.path]);
          if (removed.error || !Array.isArray(removed.data)) throw new Error("storage delete denied");
          if (removed.data.some((object) => object.name !== item.path)) throw new Error("storage delete scope mismatch");
          leaseLive(); reason = "storage_absence_unconfirmed";
          const absence = await storage.info(item.path);
          // Storage's info route can report HTTP 400 with statusCode 404. Require
          // its exact object-not-found response after DELETE; a bare 400 or an
          // authorization failure is never physical erasure evidence.
          if (absence.data || !exactStorageAbsence(absence.error)) throw new Error("storage absence unconfirmed");
          leaseLive();
        } catch {
          retrySchema.parse(await rpc("worker_retry_capital_capture_purge_v1", {...args, p_reason: reason}));
          results.push({purgeId: item.purgeId, state: "retry_scheduled", reason});
          continue;
        }
        // Do not catch an ambiguous ACK and report success: a later claim safely reconciles it.
        ackSchema.parse(await rpc("worker_ack_capital_capture_purge_v1", {...args, p_storage_delete_confirmed: true}));
        results.push({purgeId: item.purgeId, state: "purged"});
      }
      return results;
    },
  };
}
