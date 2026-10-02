import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
type ReadScope = {allocationId: string; path: string; payloadFingerprint: string; byteLength: number;
  storageObjectId?: string | null; storageVersion?: string | null};
type JobAuthority = {jobId: string; capabilityToken: string};
/** User JWT stays in the SDK. Only the server transport accesses Storage bodies. */
export function readCapitalCaptureBytes(sdk: SupabaseClient, job: JobAuthority, scope: ReadScope,
  kind: "typed_body" | "public_source" | "m07_body") {
  return readBytes(sdk, job, scope, {allocationId: scope.allocationId, kind});
}
/** Successor recovery has its own SQL grant. It never dispatches a model and never
 * impersonates the original job to use the ordinary M07 allocation reader. */
export function readCapitalM07RecoveryBytes(sdk: SupabaseClient, job: JobAuthority, input: {
  recipeId: string; retainedPayloadId: string;
}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "m07_recovery", recipeId: input.recipeId, retainedPayloadId: input.retainedPayloadId},
    {"x-offroad-recipe-id": input.recipeId, "x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalM07RecoverySourceBytes(sdk: SupabaseClient, job: JobAuthority, input: {
  recipeId: string; retainedPayloadId: string;
}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "m07_recovery_source", recipeId: input.recipeId, retainedPayloadId: input.retainedPayloadId},
    {"x-offroad-recipe-id": input.recipeId, "x-offroad-retained-payload-id": input.retainedPayloadId});
}
async function readBytes(sdk: SupabaseClient, job: JobAuthority, scope: ReadScope, body: Record<string, string>, expected: Record<string, string> = {}) {
  try {
  const allocationId = z.uuid().parse(scope.allocationId), organizationId = z.uuid().parse(scope.path.split("/")[0]);
  z.string().regex(/^[a-f0-9]{64}$/).parse(scope.payloadFingerprint);
  z.number().int().min(1).max(1048576).parse(scope.byteLength);
  for (const value of Object.values(expected)) z.uuid().parse(value);
  const r = await sdk.functions.invoke("capital-body-read", {method: "POST", body,
    headers: {"x-offroad-workspace": organizationId, "x-offroad-job-id": z.uuid().parse(job.jobId), "x-offroad-capability": z.string().min(1).parse(job.capabilityToken)},
    timeout: 10000});
  if (r.error || !(r.data instanceof Blob) || !r.response || r.response.headers.get("content-type") !== "application/octet-stream"
    || !r.response.headers.get("cache-control")?.split(",").some(value => value.trim() === "no-store") || r.data.size !== scope.byteLength || r.data.size > 1048576) throw new Error("capital capture server read denied");
  const headers = r.response.headers;
  if (!Object.entries(expected).every(([key, value]) => headers.get(key) === value)) throw new Error("capital capture server scope mismatch");
  const objectId = z.uuid().parse(headers.get("x-offroad-object-id"));
  const version = z.string().regex(/^[a-zA-Z0-9._-]{1,200}$/).parse(headers.get("x-offroad-storage-version"));
  if (headers.get("x-offroad-allocation-id") !== allocationId || headers.get("x-offroad-payload-sha256") !== scope.payloadFingerprint
    || headers.get("x-offroad-byte-length") !== String(scope.byteLength) || (scope.storageObjectId && scope.storageObjectId !== objectId)
    || (scope.storageVersion && scope.storageVersion !== version)) throw new Error("capital capture server scope mismatch");
  const bytes = new Uint8Array(await r.data.arrayBuffer());
  if (bytes.byteLength !== scope.byteLength || createHash("sha256").update(bytes).digest("hex") !== scope.payloadFingerprint) throw new Error("capital capture server immutable bytes conflict");
  return {bytes, objectId, version};
  } catch (error) {
    const controlled = ["capital capture server read denied", "capital capture server scope mismatch", "capital capture server immutable bytes conflict"];
    throw new Error(error instanceof Error && controlled.includes(error.message) ? error.message : "capital capture server read denied");
  }
}
