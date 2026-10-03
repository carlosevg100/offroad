import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
type ReadScope = {allocationId: string; path: string; payloadFingerprint: string; byteLength: number;
  storageObjectId?: string | null; storageVersion?: string | null};
type JobAuthority = {jobId: string; capabilityToken: string};
/** Closed C11 transport DTOs; allocation paths and authority flags are never inputs. */
export type CapitalDebtBodyReadRequest =
  | {kind: "debt_body"; allocationId: string}
  | {kind: "debt_result"; revisionId: string}
  | {kind: "debt_recovery" | "debt_recovery_source"; recipeId: string; retainedPayloadId: string}
  | {kind: "debt_recovered_task"; recipeId: string; taskRunId: string}
  | {kind: "debt_revision_body" | "debt_revision_source"; retainedPayloadId: string}
  | {kind: "debt_revision_task"; taskRunId: string};
/** User JWT stays in the SDK. Only the server transport accesses Storage bodies. */
export function readCapitalCaptureBytes(sdk: SupabaseClient, job: JobAuthority, scope: ReadScope,
  kind: "typed_body" | "public_source" | "m07_body" | "s11_body") {
  return readBytes(sdk, job, scope, {allocationId: scope.allocationId, kind});
}
/** Exact preview allocation only. It never falls through to public_source. */
export function readCapitalPreviewBodyBytes(sdk: SupabaseClient, job: JobAuthority, input: {allocationId: string}, scope: ReadScope) {
  const allocationId=z.uuid().parse(input.allocationId);
  if(allocationId!==scope.allocationId)throw new Error("capital_preview_body_scope_mismatch");
  return readBytes(sdk,job,scope,{kind:"preview_body",allocationId});
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
/** A human return binds the new lease to the exact previous physical product.
 * Its scope is distinct from replay and from human display authorization. */
export function readCapitalM07RevisionBodyBytes(sdk: SupabaseClient, job: JobAuthority, input: {
  retainedPayloadId: string;
}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "m07_revision_body", retainedPayloadId: input.retainedPayloadId},
    {"x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalM07RevisionSourceBytes(sdk: SupabaseClient, job: JobAuthority, input: {
  retainedPayloadId: string;
}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "m07_revision_source", retainedPayloadId: input.retainedPayloadId},
    {"x-offroad-retained-payload-id": input.retainedPayloadId});
}
/** S11 scopes never use M07 commands or impersonate a preceding lease. */
function readS11RecoveryBytes(sdk: SupabaseClient, job: JobAuthority, input: {
  recipeId: string; retainedPayloadId: string;
}, scope: ReadScope, source = false) {
  return readBytes(sdk, job, scope, {kind: source ? "s11_recovery_source" : "s11_recovery", ...input},
    {"x-offroad-recipe-id": input.recipeId, "x-offroad-retained-payload-id": input.retainedPayloadId});
}
function readS11TaskBytes(sdk: SupabaseClient, job: JobAuthority, input: {
  recipeId: string; taskRunId: string;
}, scope: ReadScope, recovered = false) {
  return readBytes(sdk, job, scope, {kind: recovered ? "s11_recovered_task" : "s11_task", ...input},
    {"x-offroad-recipe-id": input.recipeId, "x-offroad-task-run-id": input.taskRunId});
}
export function readCapitalS11RecoveryBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string; retainedPayloadId: string}, scope: ReadScope) {
  return readS11RecoveryBytes(sdk, job, input, scope);
}
export function readCapitalS11RecoverySourceBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string; retainedPayloadId: string}, scope: ReadScope) {
  return readS11RecoveryBytes(sdk, job, input, scope, true);
}
export function readCapitalS11TaskBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string; taskRunId: string}, scope: ReadScope) {
  return readS11TaskBytes(sdk, job, input, scope);
}
export function readCapitalS11RecoveredTaskBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string; taskRunId: string}, scope: ReadScope) {
  return readS11TaskBytes(sdk, job, input, scope, true);
}
/** A revision reads original inputs under its current human return and lease. */
export function readCapitalS11RevisionBodyBytes(sdk: SupabaseClient, job: JobAuthority, input: {retainedPayloadId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "s11_revision_body", ...input}, {"x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalS11RevisionSourceBytes(sdk: SupabaseClient, job: JobAuthority, input: {retainedPayloadId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "s11_revision_source", ...input}, {"x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalS11RevisionTaskBytes(sdk: SupabaseClient, job: JobAuthority, input: {taskRunId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "s11_revision_task", ...input}, {"x-offroad-task-run-id": input.taskRunId});
}
/** Human C11 return scopes select the exact historical physical inputs under
 * the new current lease, without a new recipe or original capability. */
export function readCapitalDebtRevisionBodyBytes(sdk: SupabaseClient, job: JobAuthority, input: {retainedPayloadId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "debt_revision_body", ...input}, {"x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalDebtRevisionSourceBytes(sdk: SupabaseClient, job: JobAuthority, input: {retainedPayloadId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "debt_revision_source", ...input}, {"x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalDebtRevisionTaskBytes(sdk: SupabaseClient, job: JobAuthority, input: {taskRunId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "debt_revision_task", ...input}, {"x-offroad-task-run-id": input.taskRunId});
}
/** C11 closed worker scopes. No M07/S11 identity or original capability is reused. */
export function readCapitalDebtBodyBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "debt_body", allocationId: scope.allocationId}, {"x-offroad-recipe-id": input.recipeId});
}
export function readCapitalDebtRecoveryBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string; retainedPayloadId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "debt_recovery", ...input}, {"x-offroad-recipe-id": input.recipeId, "x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalDebtRecoverySourceBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string; retainedPayloadId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "debt_recovery_source", ...input}, {"x-offroad-recipe-id": input.recipeId, "x-offroad-retained-payload-id": input.retainedPayloadId});
}
export function readCapitalDebtRecoveredTaskBytes(sdk: SupabaseClient, job: JobAuthority, input: {recipeId: string; taskRunId: string}, scope: ReadScope) {
  return readBytes(sdk, job, scope, {kind: "debt_recovered_task", ...input}, {"x-offroad-recipe-id": input.recipeId, "x-offroad-task-run-id": input.taskRunId});
}
/** Human C11 display is authenticated by JWT and WORK, with no worker lease. */
export function readCapitalDebtResultBytes(sdk: SupabaseClient, input: {revisionId: string; recipeId: string; finalFingerprint: string}, scope: ReadScope) {
  return readBytes(sdk, null, scope, {kind: "debt_result", revisionId: input.revisionId}, {
    "x-offroad-revision-id": input.revisionId, "x-offroad-recipe-id": input.recipeId, "x-offroad-final-fingerprint": input.finalFingerprint});
}
async function readBytes(sdk: SupabaseClient, job: JobAuthority | null, scope: ReadScope, body: Record<string, string>, expected: Record<string, string> = {}) {
  try {
  const allocationId = z.uuid().parse(scope.allocationId), organizationId = z.uuid().parse(scope.path.split("/")[0]);
  z.string().regex(/^[a-f0-9]{64}$/).parse(scope.payloadFingerprint);
  z.number().int().min(1).max(1048576).parse(scope.byteLength);
  for (const [key, value] of Object.entries(expected)) {
    if (key === "x-offroad-final-fingerprint") z.string().regex(/^[a-f0-9]{64}$/).parse(value); else z.uuid().parse(value);
  }
  const r = await sdk.functions.invoke("capital-body-read", {method: "POST", body,
    headers: {"x-offroad-workspace": organizationId, ...(job ? {"x-offroad-job-id": z.uuid().parse(job.jobId), "x-offroad-capability": z.string().min(1).parse(job.capabilityToken)} : {})},
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


/** Human preview reads the exact current revision, never a paid-boundary recipe. */
export function readCapitalPreviewResultBytes(sdk: SupabaseClient, input: {
  revisionId: string; recipeId: string; workId: string; artifactId: string; finalFingerprint: string;
}, scope: ReadScope) {
  return readBytes(sdk, null, scope, {kind: "preview_result", revisionId: input.revisionId}, {
    "x-offroad-revision-id": input.revisionId, "x-offroad-recipe-id": input.recipeId,
    "x-offroad-work-id": input.workId, "x-offroad-artifact-id": input.artifactId,
    "x-offroad-final-fingerprint": input.finalFingerprint,
  });
}
