import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({rpc: vi.fn(), session: vi.fn(), workspace: vi.fn(), revalidate: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({revalidatePath: mocks.revalidate}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
import {confirmReceivablesScope} from "@/app/[locale]/app/projects/[projectId]/actions";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {locale: "pt-BR", projectId: id(1), sessionId: id(2), manifestFingerprint: "a".repeat(64), primaryTape: {documentId: id(3), sheet: "Tape", headerRow: 1}, complementDocumentIds: [], reportingDate: "2026-08-31", commandId: id(4)};
beforeEach(() => {
  vi.clearAllMocks();
  const query = {select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.session};
  mocks.workspace.mockResolvedValue({organization: {id: id(5)}, supabase: {from: () => query, rpc: mocks.rpc}});
  mocks.session.mockResolvedValue({data: {id: id(2)}});
});
describe("scope confirmation action", () => {
  it("rejects invalid dates before reading workspace", async () => {
    expect(await confirmReceivablesScope({...input, reportingDate: "not-a-date"})).toEqual({ok: false, code: "invalid"});
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("cannot confirm a session outside the workspace project", async () => {
    mocks.session.mockResolvedValue({data: null});
    expect(await confirmReceivablesScope(input)).toEqual({ok: false, code: "denied"});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["receivables_scope_stale", "40001", "stale"], ["receivables_scope_processing_unavailable", "55000", "processing"], ["receivables_scope_access_denied", "42501", "denied"]])("reports %s without claiming saved", async (message, code, expected) => {
    mocks.rpc.mockResolvedValue({data: null, error: {message, code}});
    expect(await confirmReceivablesScope(input)).toEqual({ok: false, code: expected});
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_receivables_evidence_scope_v1", expect.objectContaining({p_session_id: input.sessionId, p_expected_manifest_fingerprint: input.manifestFingerprint, p_command_id: input.commandId}));
  });
  it("does not treat an empty RPC response as confirmation", async () => {
    mocks.rpc.mockResolvedValue({data: null, error: null});
    expect(await confirmReceivablesScope(input)).toEqual({ok: false, code: "save"});
  });
});
