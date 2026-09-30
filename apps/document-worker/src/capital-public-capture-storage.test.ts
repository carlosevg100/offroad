import {createHash} from "node:crypto";
import {createClient, type SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";
import {createCapitalPublicCaptureStorage} from "./capital-public-capture-storage";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clock = Date.parse("2026-09-30T12:00:00Z");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const canonicalPayload = '{"url": "https://example.invalid", "title": "Synthetic only"}';
const job = {jobId: id(1), capabilityToken: "synthetic-job-capability"};
const input = {...job, deliveryId: id(2), requestId: id(3), payload: {title: "Synthetic only", url: "https://example.invalid"}};
const allocation = {
  allocationId: id(4), deliveryId: id(2), bucket: "capital-input-capture", path: `${id(5)}/${id(4)}/payload.json`,
  payloadFingerprint: sha(canonicalPayload), byteLength: Buffer.byteLength(canonicalPayload), canonicalPayload,
  retainedAt: "2026-09-30T12:00:00Z", expiresAt: "2026-10-01T12:00:00Z", purgeAt: "2026-10-01T11:50:00Z", uploadExpiresAt: "2026-09-30T12:02:00Z", state: "allocated", replayed: false,
};
const receipt = {retainedPayloadId: id(6), allocationId: id(4), state: "complete", expiresAt: allocation.expiresAt, purgeAt: allocation.purgeAt, replayed: false};
const retained = {retainedPayloadId: id(6), allocationId: id(4), bucket: allocation.bucket, path: allocation.path, payloadFingerprint: allocation.payloadFingerprint, byteLength: allocation.byteLength, storageObjectId: id(7), storageVersion: "version-one", expiresAt: allocation.expiresAt, purgeAt: allocation.purgeAt, state: "complete"};
const purge = {purgeId: id(8), allocationId: id(4), bucket: allocation.bucket, path: allocation.path, storageObjectId: id(7), storageVersion: "version-one", purgeCapability: "synthetic-purge-capability", leaseExpiresAt: "2026-09-30T12:01:00Z"};

function fixture() {
  let instant = clock;
  const replies: Record<string, unknown> = {
    worker_prepare_capital_public_payload_v1: allocation,
    worker_commit_capital_public_payload_v1: receipt,
    worker_read_capital_public_payload_v1: retained,
    worker_claim_capital_capture_purge_v1: {items: [purge], polledAt: "2026-09-30T12:00:00Z"},
    worker_ack_capital_capture_purge_v1: {purged: true, replayed: false},
    worker_retry_capital_capture_purge_v1: {retryScheduled: true},
  };
  const rpc = vi.fn(async (name: string) => ({data: replies[name], error: null as unknown}));
  const upload = vi.fn().mockResolvedValue({data: {id: id(7)}, error: null});
  const info = vi.fn().mockResolvedValue({data: {id: id(7), version: "version-one", bucketId: allocation.bucket, name: allocation.path, isVersioned: false}, error: null});
  const download = vi.fn().mockResolvedValue({data: new Blob([canonicalPayload]), error: null});
  const remove = vi.fn().mockResolvedValue({data: [{name: allocation.path}], error: null});
  const exists = vi.fn().mockResolvedValue({data: false, error: {status: 404}});
  const from = vi.fn().mockReturnValue({upload, info, download, remove, exists});
  const client = createCapitalPublicCaptureStorage({rpc, storage: {from}} as unknown as SupabaseClient, () => instant);
  const calls = (name: string) => rpc.mock.calls.filter(([actual]) => actual === name);
  return {client, rpc, replies, upload, info, download, remove, exists, from, calls, advance: (next: number) => {instant = next;}};
}

describe("capital capture retained bytes", () => {
  it("stores SQL canonical bytes immutably, verifies an actual Storage version, and commits its proof", async () => {
    const f = fixture(); expect(await f.client.retain(input)).toEqual(receipt);
    expect(f.upload).toHaveBeenCalledWith(allocation.path, Buffer.from(canonicalPayload), {contentType: "application/json", cacheControl: "0", upsert: false});
    expect(f.download).toHaveBeenCalledWith(allocation.path, expect.objectContaining({versionId: "version-one", cacheNonce: expect.any(String)}), {cache: "no-store"});
    expect(f.rpc).toHaveBeenCalledWith("worker_commit_capital_public_payload_v1", expect.objectContaining({p_storage_object_id: id(7), p_storage_version: "version-one", p_verified_sha256: sha(canonicalPayload), p_verified_size: Buffer.byteLength(canonicalPayload)}));
    expect(f.upload.mock.invocationCallOrder[0]).toBeLessThan(f.download.mock.invocationCallOrder[0]!);
  });
  it("denies initial authorization without touching Storage", async () => {
    const f = fixture(); f.rpc.mockResolvedValue({data: null, error: {code: "42501"}});
    await expect(f.client.retain(input)).rejects.toThrow("authority denied"); expect(f.from).not.toHaveBeenCalled();
  });
  it.each([{bucket: "case-artifacts"}, {path: `${id(5)}/${id(9)}/payload.json`}, {deliveryId: id(9)}, {path: "../payload.json"}])("rejects mismatched server scope %j before Storage", async (override) => {
    const f = fixture(); f.replies.worker_prepare_capital_public_payload_v1 = {...allocation, ...override};
    await expect(f.client.retain(input)).rejects.toThrow(); expect(f.from).not.toHaveBeenCalled();
  });
  it("refuses local JSON reserialization or a mismatched SQL size as canonical proof", async () => {
    const f = fixture(); f.replies.worker_prepare_capital_public_payload_v1 = {...allocation, byteLength: allocation.byteLength + 1};
    await expect(f.client.retain(input)).rejects.toThrow("canonical bytes mismatch"); expect(f.upload).not.toHaveBeenCalled();
  });
  it("reuses a 409 object only after real readback matches", async () => {
    const f = fixture(); f.upload.mockResolvedValue({data: null, error: {statusCode: "409"}});
    expect(await f.client.retain(input)).toEqual(receipt); expect(f.upload).toHaveBeenCalledTimes(1); expect(f.download).toHaveBeenCalledTimes(1);
  });
  it("does not treat an ambiguous upload timeout as a confirmed write", async () => {
    const f = fixture(); f.upload.mockResolvedValue({data: null, error: {status: 504}});
    await expect(f.client.retain(input)).rejects.toThrow("write denied"); expect(f.download).not.toHaveBeenCalled(); expect(f.calls("worker_commit_capital_public_payload_v1")).toHaveLength(0);
  });
  it("rejects conflicting remote bytes before commit even with correct length", async () => {
    const f = fixture(); f.download.mockResolvedValue({data: new Blob([canonicalPayload.replace("Synthetic", "Different")]), error: null});
    await expect(f.client.retain(input)).rejects.toThrow("immutable bytes conflict"); expect(f.calls("worker_commit_capital_public_payload_v1")).toHaveLength(0);
  });
  it("requires a real Storage id/version and refuses a versioned object", async () => {
    const f = fixture(); f.info.mockResolvedValue({data: {id: id(7), name: allocation.path, bucketId: allocation.bucket, version: "version-one", isVersioned: true}, error: null});
    await expect(f.client.retain(input)).rejects.toThrow("identity unavailable"); expect(f.download).not.toHaveBeenCalled();
  });
  it.each([false, true])("uses the actual SDK info transformation from wire snake_case (versioned=%s)", async (versioned) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      id: id(7), version: "version-one", name: allocation.path, bucket_id: allocation.bucket,
      is_versioned: versioned, is_delete_marker: false,
    }), {status: 200, headers: {"Content-Type": "application/json"}}));
    const sdk = createClient("https://storage.synthetic.invalid", "synthetic-key", {global: {fetch}, auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
    const result = await sdk.storage.from(allocation.bucket).info(allocation.path);
    expect(result.data).toMatchObject({bucketId: allocation.bucket, isVersioned: versioned, isDeleteMarker: false});
    const f = fixture(); f.info.mockResolvedValue(result);
    if (versioned) await expect(f.client.retain(input)).rejects.toThrow("identity unavailable");
    else expect(await f.client.retain(input)).toEqual(receipt);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not declare complete when the SQL acknowledgment is denied", async () => {
    const f = fixture(); f.rpc.mockImplementation(async (name) => name === "worker_commit_capital_public_payload_v1" ? {data: null, error: {code: "42501"}} : {data: f.replies[name], error: null});
    await expect(f.client.retain(input)).rejects.toThrow("authority denied");
  });
  it("does not declare complete for a different allocation acknowledgment", async () => {
    const f = fixture(); f.replies.worker_commit_capital_public_payload_v1 = {...receipt, allocationId: id(9)};
    await expect(f.client.retain(input)).rejects.toThrow("receipt mismatch");
  });
  it("replays a committed lost response after upload expiry through fresh readback without any upload", async () => {
    const f = fixture(); const replay = {...receipt, replayed: true};
    f.replies.worker_prepare_capital_public_payload_v1 = replay;
    f.advance(Date.parse(allocation.uploadExpiresAt) + 1000);
    expect(await f.client.retain(input)).toEqual(replay);
    expect(f.download).toHaveBeenCalledTimes(1); expect(f.calls("worker_read_capital_public_payload_v1")).toHaveLength(2);
    expect(f.upload).not.toHaveBeenCalled(); expect(f.info).not.toHaveBeenCalled(); expect(f.calls("worker_commit_capital_public_payload_v1")).toHaveLength(0);
  });
  it("does not replay complete from a receipt whose bytes have changed", async () => {
    const f = fixture(); f.replies.worker_prepare_capital_public_payload_v1 = {...receipt, replayed: true};
    f.download.mockResolvedValue({data: new Blob([canonicalPayload.replace("Synthetic", "Different")]), error: null});
    await expect(f.client.retain(input)).rejects.toThrow("immutable bytes conflict"); expect(f.upload).not.toHaveBeenCalled();
  });
  it("does not replay complete if authority is revoked during physical readback", async () => {
    const f = fixture(); f.replies.worker_prepare_capital_public_payload_v1 = {...receipt, replayed: true}; let reads = 0;
    f.rpc.mockImplementation(async (name) => name === "worker_read_capital_public_payload_v1" && ++reads === 2 ? {data: null, error: {code: "42501"}} : {data: f.replies[name], error: null});
    await expect(f.client.retain(input)).rejects.toThrow("authority denied"); expect(f.upload).not.toHaveBeenCalled();
  });
  it("does not replay a complete receipt with another allocation read scope", async () => {
    const f = fixture(); f.replies.worker_prepare_capital_public_payload_v1 = {...receipt, replayed: true};
    f.replies.worker_read_capital_public_payload_v1 = {...retained, allocationId: id(9), path: `${id(5)}/${id(9)}/payload.json`};
    await expect(f.client.retain(input)).rejects.toThrow("receipt mismatch"); expect(f.download).not.toHaveBeenCalled();
  });
  it("does not accept a prepare complete result that is not a committed replay", async () => {
    const f = fixture(); f.replies.worker_prepare_capital_public_payload_v1 = receipt;
    await expect(f.client.retain(input)).rejects.toThrow(); expect(f.from).not.toHaveBeenCalled();
  });
  it("rejects an unfinished allocation after its upload window rather than rewriting bytes", async () => {
    const f = fixture(); f.advance(Date.parse(allocation.uploadExpiresAt));
    await expect(f.client.retain(input)).rejects.toThrow("upload expired"); expect(f.upload).not.toHaveBeenCalled();
  });
  it("does not replay a retained result once operational purge has begun", async () => {
    const f = fixture(); f.replies.worker_prepare_capital_public_payload_v1 = {...receipt, replayed: true}; f.advance(Date.parse(allocation.purgeAt));
    await expect(f.client.retain(input)).rejects.toThrow("retention expired"); expect(f.download).not.toHaveBeenCalled();
  });
  it("does not return bytes when the capability is revoked in transit", async () => {
    const f = fixture(); let reads = 0;
    f.rpc.mockImplementation(async (name) => name === "worker_read_capital_public_payload_v1" && ++reads === 2 ? {data: null, error: {code: "42501"}} : {data: f.replies[name], error: null});
    await expect(f.client.read(job, id(6))).rejects.toThrow("authority denied"); expect(f.download).toHaveBeenCalledTimes(1);
  });
  it("verifies read bytes and rechecks SQL scope before handing them to a consumer", async () => {
    const f = fixture(); expect(new TextDecoder().decode(await f.client.read(job, id(6)))).toBe(canonicalPayload);
    expect(f.calls("worker_read_capital_public_payload_v1")).toHaveLength(2);
  });
  it("refuses deadline expiration during read before exposing bytes", async () => {
    const f = fixture(); f.download.mockImplementation(async () => {f.advance(Date.parse(allocation.expiresAt)); return {data: new Blob([canonicalPayload]), error: null};});
    await expect(f.client.read(job, id(6))).rejects.toThrow("retention expired");
  });
  it("stops reading at purgeAt before the final legal deadline", async () => {
    const f = fixture(); f.advance(Date.parse(allocation.purgeAt));
    await expect(f.client.read(job, id(6))).rejects.toThrow("retention expired"); expect(f.download).not.toHaveBeenCalled();
  });
  it("does not return bytes if SQL changes the pinned version during transit", async () => {
    const f = fixture(); let reads = 0;
    f.rpc.mockImplementation(async (name) => ({data: name === "worker_read_capital_public_payload_v1" && ++reads === 2 ? {...retained, storageVersion: "another-version"} : f.replies[name], error: null}));
    await expect(f.client.read(job, id(6))).rejects.toThrow("read scope changed");
  });
  it("never uses an ETag or payload digest when Storage lacks a version identity", async () => {
    const f = fixture(); f.info.mockResolvedValue({data: {id: id(7), name: allocation.path, bucketId: allocation.bucket, etag: allocation.payloadFingerprint}, error: null});
    await expect(f.client.retain(input)).rejects.toThrow(); expect(f.calls("worker_commit_capital_public_payload_v1")).toHaveLength(0);
  });
});

describe("capital capture physical purge", () => {
  it("removes only the leased exact path, checks absence, then acknowledges SQL", async () => {
    const f = fixture(); expect(await f.client.purgeOnce("synthetic-worker-token")).toEqual([{purgeId: id(8), state: "purged"}]);
    expect(f.remove).toHaveBeenCalledWith([allocation.path]); expect(f.exists).toHaveBeenCalledWith(allocation.path);
    expect(f.rpc).toHaveBeenCalledWith("worker_ack_capital_capture_purge_v1", {p_worker_token: "synthetic-worker-token", p_purge_id: id(8), p_purge_capability: purge.purgeCapability, p_storage_delete_confirmed: true});
    expect(f.remove.mock.invocationCallOrder[0]).toBeLessThan(f.exists.mock.invocationCallOrder[0]!);
  });
  it("supports lost-response retry only through another successful DELETE plus absence and DB proof", async () => {
    const f = fixture(); f.remove.mockResolvedValue({data: [], error: null}); f.replies.worker_ack_capital_capture_purge_v1 = {purged: true, replayed: true};
    expect((await f.client.purgeOnce("synthetic-worker-token"))[0]?.state).toBe("purged"); expect(f.exists).toHaveBeenCalledTimes(1);
  });
  it.each([{data: false, error: null}, {data: false, error: {status: 400}}, {data: false, error: {status: 403}}, {data: true, error: null}])("never confirms ambiguous absence %j", async (absence) => {
    const f = fixture(); f.exists.mockResolvedValue(absence);
    expect(await f.client.purgeOnce("synthetic-worker-token")).toEqual([{purgeId: id(8), state: "retry_scheduled", reason: "storage_absence_unconfirmed"}]);
    expect(f.calls("worker_ack_capital_capture_purge_v1")).toHaveLength(0);
  });
  it("does not use a 404 DELETE failure as absence proof", async () => {
    const f = fixture(); f.remove.mockResolvedValue({data: null, error: {status: 404}});
    expect((await f.client.purgeOnce("synthetic-worker-token"))[0]?.reason).toBe("storage_delete_failed");
    expect(f.exists).not.toHaveBeenCalled(); expect(f.calls("worker_ack_capital_capture_purge_v1")).toHaveLength(0);
  });
  it("does not acknowledge when the lease expires during DELETE", async () => {
    const f = fixture(); f.remove.mockImplementation(async () => {f.advance(Date.parse(purge.leaseExpiresAt)); return {data: [], error: null};});
    expect((await f.client.purgeOnce("synthetic-worker-token"))[0]?.state).toBe("retry_scheduled"); expect(f.exists).not.toHaveBeenCalled(); expect(f.calls("worker_ack_capital_capture_purge_v1")).toHaveLength(0);
  });
  it("reports no successful purge after SQL rejects the acknowledgment", async () => {
    const f = fixture(); f.rpc.mockImplementation(async (name) => name === "worker_ack_capital_capture_purge_v1" ? {data: null, error: {code: "42501"}} : {data: f.replies[name], error: null});
    await expect(f.client.purgeOnce("synthetic-worker-token")).rejects.toThrow("authority denied"); expect(f.remove).toHaveBeenCalledTimes(1);
  });
  it("does not touch Storage when the worker claim is denied", async () => {
    const f = fixture(); f.rpc.mockResolvedValue({data: null, error: {code: "42501"}});
    await expect(f.client.purgeOnce("synthetic-worker-token")).rejects.toThrow("authority denied"); expect(f.from).not.toHaveBeenCalled();
  });
  it("returns an empty poll without touching Storage", async () => {
    const f = fixture(); f.replies.worker_claim_capital_capture_purge_v1 = {items: [], polledAt: "2026-09-30T12:00:00Z"};
    expect(await f.client.purgeOnce("synthetic-worker-token")).toEqual([]); expect(f.from).not.toHaveBeenCalled();
  });
  it("does not delete under an expired lease", async () => {
    const f = fixture(); f.advance(Date.parse(purge.leaseExpiresAt));
    expect((await f.client.purgeOnce("synthetic-worker-token"))[0]?.state).toBe("retry_scheduled"); expect(f.remove).not.toHaveBeenCalled();
  });
  it("does not accept a deletion receipt from another object", async () => {
    const f = fixture(); f.remove.mockResolvedValue({data: [{name: "other/path.json"}], error: null});
    expect((await f.client.purgeOnce("synthetic-worker-token"))[0]?.reason).toBe("storage_delete_failed"); expect(f.exists).not.toHaveBeenCalled();
  });
  it("never downloads revoked payload bytes during purge", async () => {
    const f = fixture(); await f.client.purgeOnce("synthetic-worker-token");
    expect(f.download).not.toHaveBeenCalled(); expect(f.info).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();
  });
});
