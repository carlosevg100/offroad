import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {loadReceivablesScope} from "./scope";
function client(data: unknown, error: unknown = null) {return {rpc: vi.fn().mockResolvedValue({data, error})} as unknown as SupabaseClient<Database>;}
describe("scope context read boundary", () => {
  it("passes only the authenticated session to the scoped RPC", async () => {
    const db = client({state: "unconfirmed", sourceManifest: null, candidates: [], scope: null});
    expect((await loadReceivablesScope(db, "synthetic-session")).state).toBe("unconfirmed");
    expect(db.rpc).toHaveBeenCalledWith("read_receivables_evidence_scope_v2", {p_session_id: "synthetic-session"});
  });
  it.each([null, {state: "current", sourceManifest: null, candidates: [], scope: null}, {state: "current", sourceManifest: {fingerprint: "invalid"}}])("never promotes malformed current data", async (data) => {
    expect(await loadReceivablesScope(client(data), "synthetic-session")).toEqual({state: "unavailable", sourceManifest: null, candidates: [], scope: null});
  });
  it("fails closed on a read error", async () => {
    expect((await loadReceivablesScope(client({}, {message: "denied"}), "synthetic-session")).state).toBe("unavailable");
  });
});
