import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createRetentionWorker} from "./retention-worker";
const item = {claimed: true, blockedCount: 0, oldestPendingSeconds: 0, heldCount: 0, actionId: "a4220000-0000-4000-8000-000000000001", capability: "a".repeat(64), bucket: "case-artifacts", path: "tenant/work/exact.docx", leaseExpiresAt: "2026-10-06T12:01:00Z"};
function fixture() {
  const rpc = vi.fn(async (name: string): Promise<{data: unknown; error: unknown}> => ({data: name.includes("claim") ? item : name.includes("revalidate") ? true : name.includes("retry") ? {retryScheduled: true, blocked: false} : {completed: true, replayed: false}, error: null}));
  const remove = vi.fn().mockResolvedValue({data: [{name: item.path}], error: null});
  const info = vi.fn().mockResolvedValue({data: null, error: {status: 400, statusCode: "404", message: "Object not found"}});
  const log = vi.fn(); const from = vi.fn(() => ({remove, info}));
  return {rpc, remove, info, log, from, worker: createRetentionWorker({rpc, storage: {from}} as unknown as SupabaseClient, "private-worker-token", log, () => Date.parse("2026-10-06T12:00:00Z"))};
}
describe("retention worker byte erasure receipts", () => {
  it("removes only the leased path and acknowledges exact physical absence", async () => {
    const f = fixture(); expect(await f.worker.poll()).toBe(true);
    expect(f.from).toHaveBeenCalledWith("case-artifacts"); expect(f.remove).toHaveBeenCalledWith([item.path]);
    expect(f.rpc).toHaveBeenCalledWith("worker_ack_retention_action_v1", expect.objectContaining({p_action_id: item.actionId, p_capability: item.capability, p_storage_absence_confirmed: true}));
  });
  it.each([403, 500, 404])("never counts a bare HTTP %s as erasure", async status => {
    const f = fixture(); f.info.mockResolvedValue({data: null, error: {status, message: "denied"}});
    expect(await f.worker.poll()).toBe(false); expect(f.rpc.mock.calls.some(([n]) => n.includes("ack_retention"))).toBe(false);
  });
  it("does not delete a lease rejected by current authority", async () => {
    const f = fixture(); f.rpc.mockImplementation(async name => ({data: name.includes("claim") ? item : false, error: null}));
    expect(await f.worker.poll()).toBe(false); expect(f.remove).not.toHaveBeenCalled();
  });
  it("does not delete an expired lease", async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({data: {...item, leaseExpiresAt: "2026-10-06T11:59:59Z"}, error: null});
    expect(await f.worker.poll()).toBe(false); expect(f.remove).not.toHaveBeenCalled();
  });
  it("does not acknowledge a delete of a different object", async () => {
    const f = fixture(); f.remove.mockResolvedValue({data: [{name: "another.docx"}], error: null});
    expect(await f.worker.poll()).toBe(false); expect(f.info).not.toHaveBeenCalled();
  });
  it("does not report success after an ambiguous acknowledgement", async () => {
    const f = fixture(); f.rpc.mockImplementation(async name => ({data: name.includes("claim") ? item : name.includes("revalidate") ? true : null, error: name.includes("ack_retention") ? {message: "private financial payload never logged"} : null}));
    expect(await f.worker.poll()).toBe(false); expect(JSON.stringify(f.log.mock.calls)).not.toContain("financial payload");
  });
  it("reports held and blocked health without touching storage", async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({data: {claimed: false, blockedCount: 1, oldestPendingSeconds: 301, heldCount: 2}, error: null});
    expect(await f.worker.poll()).toBe(false); expect(f.from).not.toHaveBeenCalled(); expect(f.log).toHaveBeenCalledWith("retention.health", {blockedCount: 1, oldestPendingSeconds: 301, heldCount: 2});
  });
});
