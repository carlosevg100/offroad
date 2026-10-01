import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {describe, expect, it, vi} from "vitest";
import {openCapitalPublicCaptureAdapter} from "./capital-public-capture-adapter";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = Date.parse("2026-09-30T12:00:00Z");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const job = {jobId: id(1), capabilityToken: "synthetic-job-capability"};
const payload = {url: "https://source.synthetic.invalid", title: "Análise sintética", snippet: "çã😀\n", contentHash: "a".repeat(64)};
// Deliberately differs from JSON.stringify in key order, spaces and Unicode escapes.
const canonical = `{"title": "Análise sintética", "url": "https://source.synthetic.invalid", "snippet": "çã😀\\n", "contentHash": "${payload.contentHash}"}`;
const request = {deliveryKey: "research/source-1", requestId: id(2), payload};
const capsule = {context: null, capture: {id: id(3), fingerprint: "b".repeat(64), state: "unresolved", schemaVersion: "capital-public-capture.v1"}};
const delivery = {deliveryId: id(4), payloadFingerprint: sha(canonical), state: "unresolved", replayed: false, unresolvedReasons: ["retention_storage_not_resolved"]};
const allocation = {allocationId: id(5), deliveryId: id(4), bucket: "capital-input-capture", path: `${id(9)}/${id(5)}/payload.json`,
  canonicalPayload: canonical, payloadFingerprint: sha(canonical), byteLength: Buffer.byteLength(canonical),
  retainedAt: "2026-09-30T12:00:00Z", expiresAt: "2026-10-01T12:00:00Z", purgeAt: "2026-10-01T11:50:00Z", uploadExpiresAt: "2026-09-30T12:02:00Z", state: "allocated", replayed: false};
const receipt = {allocationId: id(5), retainedPayloadId: id(6), expiresAt: allocation.expiresAt, purgeAt: allocation.purgeAt, state: "complete", replayed: false};
const scope = {allocationId: id(5), retainedPayloadId: id(6), bucket: allocation.bucket, path: allocation.path, payloadFingerprint: allocation.payloadFingerprint,
  byteLength: allocation.byteLength, expiresAt: allocation.expiresAt, purgeAt: allocation.purgeAt, storageObjectId: id(7), storageVersion: "synthetic-version", state: "complete"};
function fixture() {
  const replies: Record<string, unknown> = {worker_load_capital_project_capture_context_v1: capsule, worker_capture_capital_project_delivery_v1: delivery,
    worker_prepare_capital_public_payload_v1: allocation, worker_commit_capital_public_payload_v1: receipt, worker_read_capital_public_payload_v1: scope};
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({data: replies[name], error: null as unknown}));
  const upload = vi.fn().mockResolvedValue({data: {id: id(7)}, error: null});
  const info = vi.fn().mockResolvedValue({data: {id: id(7), version: scope.storageVersion, bucketId: allocation.bucket, name: allocation.path, isVersioned: false}, error: null});
  const download = vi.fn().mockResolvedValue({data: new Blob([canonical]), error: null});
  const from = vi.fn().mockReturnValue({upload, info, download});
  const client = {rpc, storage: {from}} as unknown as SupabaseClient;
  return {replies, rpc, upload, download, from, open: () => openCapitalPublicCaptureAdapter(client, job, () => now)};
}

describe("capital public delivery admission", () => {
  it("exposes only canonical retained bytes after post-download authority and exact receipt checks", async () => {
    const f = fixture(); const adapter = await f.open(); const result = await adapter.deliver(request);
    if (result.state !== "retained") throw new Error("expected retained payload");
    expect(result).toEqual({state: "retained", captureId: id(3), deliveryId: id(4), payloadFingerprint: sha(canonical), retention: receipt, payload});
    expect(adapter.capture.state).toBe("unresolved");
    expect(f.rpc).toHaveBeenCalledWith("worker_capture_capital_project_delivery_v1", {...jobArgs(), p_capture_id: id(3), p_delivery_key: request.deliveryKey, p_payload: payload, p_origin_refs: [{kind: "published_public_payload"}]});
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["worker_load_capital_project_capture_context_v1", "worker_capture_capital_project_delivery_v1", "worker_prepare_capital_public_payload_v1", "worker_commit_capital_public_payload_v1", "worker_read_capital_public_payload_v1", "worker_read_capital_public_payload_v1"]);
    expect(f.download).toHaveBeenCalledTimes(2); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.payload)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(job.capabilityToken);
  });
  it("passes complete explicit license pins without inventing audience or projection evidence", async () => {
    const f = fixture(); const adapter = await f.open(); const origin = {licensingOrganizationId: id(10), sourceVersionId: id(11), rightsVersionId: id(12), sourceBindingId: id(13)};
    await adapter.deliver({...request, origin});
    expect(f.rpc.mock.calls[1]?.[1].p_origin_refs).toEqual([{kind: "published_public_payload", ...origin}]);
  });
  it.each(["public_license_missing", "public_source_closure_unresolved", "origin_adapter_not_resolved"])("withholds bytes and storage when SQL reports %s", async reason => {
    const f = fixture(); f.replies.worker_capture_capital_project_delivery_v1 = {...delivery, unresolvedReasons: [reason]};
    const result = await (await f.open()).deliver(request);
    expect(result.state).toBe("unresolved"); expect(result).not.toHaveProperty("payload"); expect(result).not.toHaveProperty("retention");
    expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("does not admit a mixed set of unresolved reasons", async () => {
    const f = fixture(); f.replies.worker_capture_capital_project_delivery_v1 = {...delivery, unresolvedReasons: ["retention_storage_not_resolved", "public_license_missing"]};
    expect((await (await f.open()).deliver(request)).state).toBe("unresolved"); expect(f.from).not.toHaveBeenCalled();
  });
  it.each(["worker_load_capital_project_capture_context_v1", "worker_capture_capital_project_delivery_v1", "worker_prepare_capital_public_payload_v1", "worker_commit_capital_public_payload_v1", "worker_read_capital_public_payload_v1"])("propagates denial at %s without returning a delivery", async denied => {
    const f = fixture(); f.rpc.mockImplementation(async (name) => name === denied ? {data: null, error: {message: payload.snippet, code: "42501"}} : {data: f.replies[name], error: null});
    await expect((async () => (await f.open()).deliver(request))()).rejects.toThrow(/authority denied/);
    if (["worker_load_capital_project_capture_context_v1", "worker_capture_capital_project_delivery_v1", "worker_prepare_capital_public_payload_v1"].includes(denied)) expect(f.from).not.toHaveBeenCalled();
  });
  it("rejects revocation in the last authorization check after physical download", async () => {
    const f = fixture(); let reads = 0;
    f.rpc.mockImplementation(async (name) => name === "worker_read_capital_public_payload_v1" && ++reads === 2 ? {data: null, error: {code: "42501"}} : {data: f.replies[name], error: null});
    await expect((await f.open()).deliver(request)).rejects.toThrow("authority denied"); expect(f.download).toHaveBeenCalledTimes(2);
  });
  it("isolates caller mutation while the delivery RPC is pending", async () => {
    const f = fixture(); const mutable = {...request, payload: {...payload}};
    f.rpc.mockImplementation(async name => {if (name === "worker_capture_capital_project_delivery_v1") {mutable.payload.snippet = "changed"; mutable.deliveryKey = "changed";} return {data: f.replies[name], error: null};});
    expect((await (await f.open()).deliver(mutable)).state).toBe("retained");
    expect(f.rpc.mock.calls[1]?.[1].p_payload).toEqual(payload); expect(f.rpc.mock.calls[2]?.[1].p_payload).toEqual(payload);
  });
  it("binds reread to the allocation and deadlines returned by retention", async () => {
    const f = fixture(); f.replies.worker_read_capital_public_payload_v1 = {...scope, allocationId: id(20), path: `${id(9)}/${id(20)}/payload.json`};
    await expect((await f.open()).deliver(request)).rejects.toThrow("receipt mismatch"); expect(f.download).toHaveBeenCalledTimes(1);
  });
  it("rejects retained bytes whose hash differs from the captured delivery", async () => {
    const f = fixture(); f.replies.worker_capture_capital_project_delivery_v1 = {...delivery, payloadFingerprint: "f".repeat(64)};
    await expect((await f.open()).deliver(request)).rejects.toThrow("delivery bytes mismatch");
  });
  it("rejects a self-consistent server response for a different payload", async () => {
    const f = fixture(); const wrong = JSON.stringify({...payload, snippet: "different"});
    f.replies.worker_capture_capital_project_delivery_v1 = {...delivery, payloadFingerprint: sha(wrong)};
    f.replies.worker_prepare_capital_public_payload_v1 = {...allocation, canonicalPayload: wrong, payloadFingerprint: sha(wrong), byteLength: Buffer.byteLength(wrong)};
    f.replies.worker_read_capital_public_payload_v1 = {...scope, payloadFingerprint: sha(wrong), byteLength: Buffer.byteLength(wrong)};
    f.download.mockResolvedValue({data: new Blob([wrong]), error: null});
    await expect((await f.open()).deliver(request)).rejects.toThrow("delivery payload mismatch");
  });
  it("replays a committed allocation through fresh reads without overwrite", async () => {
    const f = fixture(); f.replies.worker_capture_capital_project_delivery_v1 = {...delivery, replayed: true};
    f.replies.worker_prepare_capital_public_payload_v1 = {...receipt, replayed: true};
    const result = await (await f.open()).deliver(request);
    expect(result.state).toBe("retained"); expect(f.upload).not.toHaveBeenCalled(); expect(f.download).toHaveBeenCalledTimes(2);
    expect(f.rpc.mock.calls[2]?.[1].p_request_id).toBe(request.requestId);
  });
  it.each([{deliveryKey: "x".repeat(161)}, {requestId: "not-a-uuid"}, {origin: {sourceVersionId: id(11)}}, {payload: {...payload, accessBasis: "public"}}])("rejects invalid input %j before recording delivery", async invalid => {
    const f = fixture(); const adapter = await f.open();
    await expect(adapter.deliver({...request, ...invalid} as typeof request)).rejects.toThrow(); expect(f.rpc).toHaveBeenCalledTimes(1); expect(f.from).not.toHaveBeenCalled();
  });
  it("rejects metadata attempting to claim complete without retention", async () => {
    const f = fixture(); f.replies.worker_capture_capital_project_delivery_v1 = {...delivery, state: "complete"};
    await expect((await f.open()).deliver(request)).rejects.toThrow(); expect(f.from).not.toHaveBeenCalled();
  });
});
function jobArgs() {return {p_job_id: job.jobId, p_capability_token: job.capabilityToken};}
