import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {expect, test, vi} from "vitest";
import {readCapitalM07RecoveryBytes, readCapitalM07RecoverySourceBytes} from "./capital-body-read-client";

const org = "10000000-0000-4000-8000-000000000001", allocation = "20000000-0000-4000-8000-000000000001";
const recipe = "30000000-0000-4000-8000-000000000001", retained = "40000000-0000-4000-8000-000000000001";
const originalJob = "50000000-0000-4000-8000-000000000001", successorJob = "50000000-0000-4000-8000-000000000002";
const text = '{"synthetic":true}', digest = createHash("sha256").update(text).digest("hex");
const scope = {allocationId: allocation, path: `${org}/${allocation}/payload.json`, payloadFingerprint: digest,
  byteLength: Buffer.byteLength(text), storageObjectId: retained, storageVersion: "storage-v1"};
function fixture(overrides: Record<string, string> = {}, body = text) {
  const invoke = vi.fn().mockResolvedValue({error: null, data: new Blob([body]), response: new Response(null, {headers: {
    "content-type": "application/octet-stream", "cache-control": "private, no-store", "x-offroad-allocation-id": allocation,
    "x-offroad-object-id": retained, "x-offroad-storage-version": "storage-v1", "x-offroad-payload-sha256": digest,
    "x-offroad-byte-length": String(scope.byteLength), "x-offroad-recipe-id": recipe, "x-offroad-retained-payload-id": retained, ...overrides,
  }})});
  return {invoke, sdk: {functions: {invoke}} as unknown as SupabaseClient};
}
test("recovery client sends only the successor grant keys and never impersonates the original job", async () => {
  const f = fixture();
  const read = await readCapitalM07RecoveryBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope);
  expect(new TextDecoder().decode(read.bytes)).toBe(text);
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", {method: "POST",
    body: {kind: "m07_recovery", recipeId: recipe, retainedPayloadId: retained}, headers: {
      "x-offroad-workspace": org, "x-offroad-job-id": successorJob, "x-offroad-capability": "synthetic-capability",
    }, timeout: 10000});
  expect(JSON.stringify(f.invoke.mock.calls)).not.toContain(originalJob);
});
test.each<Record<string, string>>([{"x-offroad-recipe-id": org}, {"x-offroad-retained-payload-id": org},
  {"x-offroad-storage-version": "storage-v2"}, {"x-offroad-object-id": org}, {"cache-control": "public, not-no-store"}])("recovery client refuses scope/header drift %j", async headers => {
  const f = fixture(headers);
  await expect(readCapitalM07RecoveryBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope)).rejects.toThrow(/capital capture server/);
});
test("recovery client rehashes retained bytes after accepted headers", async () => {
  const f = fixture({}, text.replace("true", "null"));
  await expect(readCapitalM07RecoveryBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope)).rejects.toThrow("capital capture server immutable bytes conflict");
});


test("source recovery client sends retained recipe identity and the current successor lease only", async () => {
  const f = fixture();
  const read = await readCapitalM07RecoverySourceBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope);
  expect(new TextDecoder().decode(read.bytes)).toBe(text);
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith("capital-body-read", {method: "POST",
    body: {kind: "m07_recovery_source", recipeId: recipe, retainedPayloadId: retained}, headers: {
      "x-offroad-workspace": org, "x-offroad-job-id": successorJob, "x-offroad-capability": "synthetic-capability",
    }, timeout: 10000});
});
test("source recovery client refuses a retained source swap despite valid physical headers", async () => {
  const f = fixture({"x-offroad-retained-payload-id": org});
  await expect(readCapitalM07RecoverySourceBytes(f.sdk, {jobId: successorJob, capabilityToken: "synthetic-capability"}, {recipeId: recipe, retainedPayloadId: retained}, scope)).rejects.toThrow(/capital capture server/);
});
