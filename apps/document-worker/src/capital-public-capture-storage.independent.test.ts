import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";
import {createCapitalPublicCaptureStorage} from "./capital-public-capture-storage";

const uuid = (n: number) => `a63d2000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const start = Date.parse("2026-09-30T21:00:00Z");
const expiry = "2026-09-30T21:20:00Z";
const purgeAt = "2026-09-30T21:19:00Z";
const sha = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");
const job = {jobId: uuid(1), capabilityToken: "synthetic-independent-retention-capability"};

function fixture(body = '{"title": "ação € 漢字 🧮", "snippet": "Exact SQL canonical bytes"}') {
  const allocation = {allocationId: uuid(2), deliveryId: uuid(3), bucket: "capital-input-capture",
    path: `${uuid(9)}/${uuid(2)}/payload.json`, payloadFingerprint: sha(body), byteLength: Buffer.byteLength(body),
    retainedAt: new Date(start).toISOString(), uploadExpiresAt: "2026-09-30T21:02:00Z", expiresAt: expiry, purgeAt, canonicalPayload: body,
    state: "allocated", replayed: false};
  const receipt = {retainedPayloadId: uuid(4), allocationId: allocation.allocationId,
    expiresAt: expiry, purgeAt, state: "complete", replayed: false};
  const retained = {retainedPayloadId: receipt.retainedPayloadId, allocationId: allocation.allocationId,
    bucket: allocation.bucket, path: allocation.path, payloadFingerprint: allocation.payloadFingerprint,
    byteLength: allocation.byteLength, storageObjectId: uuid(5), storageVersion: "exact-storage-version", expiresAt: expiry, purgeAt, state: "complete"};
  const replies: Record<string, unknown> = {worker_prepare_capital_public_payload_v1: allocation,
    worker_commit_capital_public_payload_v1: receipt, worker_read_capital_public_payload_v1: retained};
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({data: replies[name], error: null as unknown}));
  const upload = vi.fn().mockResolvedValue({data: {id: uuid(5)}, error: null});
  // Only the real SDK's camelCase fields; no snake_case compatibility fixture.
  const info = vi.fn().mockResolvedValue({data: {id: uuid(5), bucketId: allocation.bucket,
    name: allocation.path, version: retained.storageVersion, isVersioned: false, isDeleteMarker: false}, error: null});
  const download = vi.fn().mockResolvedValue({data: new Blob([body]), error: null});
  const from = vi.fn().mockReturnValue({upload, info, download});
  const client = createCapitalPublicCaptureStorage({rpc, storage: {from}} as unknown as SupabaseClient, () => start);
  const input = {...job, deliveryId: allocation.deliveryId, requestId: uuid(6), payload: JSON.parse(body)};
  return {client, input, allocation, receipt, retained, rpc, upload, info, download, replies};
}

describe("independent SQL/Storage capture contract", () => {
  it("accepts the actual SQL deadline tuple: retainedAt < purgeAt < expiresAt", async () => {
    const f = fixture();
    expect(await f.client.retain(f.input)).toEqual(f.receipt);
    expect(f.rpc).toHaveBeenCalledWith("worker_commit_capital_public_payload_v1", expect.objectContaining({
      p_verified_sha256: f.allocation.payloadFingerprint, p_verified_size: f.allocation.byteLength,
    }));
  });

  it.each([["empty", ""], ["multibyte", "ação € 漢字 🧮"], ["escaped", "\\n\\u0000"], ["repeated multibyte", "é".repeat(200)], ["large", "a".repeat(5000)]])("keeps UTF8 bytes, not character counts: %s", async (_label, value) => {
    const body = JSON.stringify({url: "https://example.invalid/independent", title: value});
    const f = fixture(body);
    await f.client.retain(f.input);
    expect(f.upload).toHaveBeenCalledWith(f.allocation.path, Buffer.from(body), {contentType: "application/json", cacheControl: "0", upsert: false});
    expect(f.rpc).toHaveBeenCalledWith("worker_commit_capital_public_payload_v1", expect.objectContaining({p_verified_size: Buffer.byteLength(body), p_verified_sha256: sha(body)}));
  });

  it("blocks a same-size byte substitution before any SQL commit", async () => {
    const f = fixture('{"title": "AAAA"}');
    f.download.mockResolvedValue({data: new Blob(['{"title": "BBBB"}']), error: null});
    await expect(f.client.retain(f.input)).rejects.toThrow("immutable bytes conflict");
    expect(f.rpc.mock.calls.filter(([name]) => name === "worker_commit_capital_public_payload_v1")).toHaveLength(0);
  });

  it("does not release correctly hashed bytes when the exact binding is revoked during download", async () => {
    const f = fixture();
    let reads = 0;
    f.rpc.mockImplementation(async name => name === "worker_read_capital_public_payload_v1" && ++reads === 2
      ? {data: null, error: {code: "42501"}} : {data: f.replies[name], error: null});
    await expect(f.client.read(job, f.receipt.retainedPayloadId)).rejects.toThrow("authority denied");
    expect(f.download).toHaveBeenCalledTimes(1);
  });

  it("does not return a different body under an unchanged SQL fingerprint", async () => {
    const f = fixture();
    f.download.mockResolvedValue({data: new Blob(["synthetic-corruption"]), error: null});
    await expect(f.client.read(job, f.receipt.retainedPayloadId)).rejects.toThrow("immutable bytes conflict");
    expect(f.rpc.mock.calls.filter(([name]) => name === "worker_read_capital_public_payload_v1")).toHaveLength(1);
  });
});
