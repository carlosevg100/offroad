import {beforeEach, describe, expect, it, vi} from "vitest";

const {rpc} = vi.hoisted(() => ({rpc: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: vi.fn(async () => ({supabase: {rpc}}))}));
import {workUpdateActionError} from "@/lib/advisor/advisor-action-error";
import {adoptWorkUpdate, declineWorkUpdate} from "./work-update-actions";

const decline = {locale: "pt-BR", commandId: "10000000-0000-4000-8000-000000000001", updateId: "10000000-0000-4000-8000-000000000002",
  expectedRevision: 3, reason: "not_needed", candidateId: null};

describe("the decisions on a work's updates name a decline that races with the worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps work_update_job_busy to its own error, and keeps every other refusal as it was", () => {
    expect(workUpdateActionError({code: "55000", message: "work_update_job_busy"})).toBe("busy");
    // The same SQLSTATE without that name is still the generic processing refusal.
    expect(workUpdateActionError({code: "55000", message: "work_update_not_open"})).toBe("processing");
    expect(workUpdateActionError({code: "40001", message: "work_update_changed"})).toBe("stale");
    expect(workUpdateActionError({code: "42501", message: "work_continuation_access_denied"})).toBe("denied");
    expect(workUpdateActionError(null)).toBe("save");
  });

  it("returns busy when the database refuses the decline because a calculation of the update is finishing", async () => {
    rpc.mockResolvedValue({data: null, error: {code: "55000", message: "work_update_job_busy"}});
    expect(await declineWorkUpdate(decline)).toEqual({ok: false, error: "busy"});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("decline_work_update_v1", {p_command_id: decline.commandId, p_update_id: decline.updateId,
      p_expected_revision: 3, p_reason: "not_needed"});
  });

  it("keeps the processing, stale and success outcomes of the decline and of the adoption", async () => {
    rpc.mockResolvedValueOnce({data: null, error: {code: "55000", message: "work_update_not_ready"}});
    expect(await declineWorkUpdate(decline)).toEqual({ok: false, error: "processing"});
    rpc.mockResolvedValueOnce({data: null, error: {code: "40001", message: "work_update_changed"}});
    expect(await adoptWorkUpdate({locale: "pt-BR", commandId: decline.commandId, updateId: decline.updateId, expectedRevision: 3})).toEqual({ok: false, error: "stale"});
    rpc.mockResolvedValueOnce({data: {status: "declined"}, error: null});
    expect(await declineWorkUpdate(decline)).toEqual({ok: true});
    expect(await declineWorkUpdate({...decline, reason: "bored"})).toEqual({ok: false, error: "invalid"});
  });
});
