import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("server-only", () => ({}));
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {readWorkArtifactHeads} from "./artifact-import-heads";
const workId = "10000000-0000-4000-8000-000000000001", id = "10000000-0000-4000-8000-000000000002", headRevisionId = "10000000-0000-4000-8000-000000000003";
const rpc = vi.fn(), from = vi.fn();const client = {rpc, from} as unknown as SupabaseClient<Database>;
beforeEach(() => {vi.clearAllMocks();rpc.mockResolvedValue({data: {workId, artifacts: [{id, headRevisionId}]}, error: null});});
describe("work artifact identity listing", () => {
 it("uses the bounded authorized RPC instead of reopening closed artifact tables", async () => {expect(await readWorkArtifactHeads(client, workId)).toEqual([{id, headRevisionId}]);expect(rpc).toHaveBeenCalledWith("list_work_artifact_heads_v1", {p_work_id: workId});expect(from).not.toHaveBeenCalled();});
 it("denies access after revocation without a table fallback", async () => {rpc.mockResolvedValue({data: null, error: {code: "42501"}});expect(await readWorkArtifactHeads(client, workId)).toBeNull();expect(from).not.toHaveBeenCalled();});
 it.each([{workId: id, artifacts: [{id, headRevisionId}]}, {workId, artifacts: [{id, headRevisionId, manifest: {}}]}, {workId, artifacts: [{id, headRevisionId: null}]}])("rejects identity drift or content returned through metadata listing", async data => {rpc.mockResolvedValue({data,error:null});expect(await readWorkArtifactHeads(client,workId)).toBeNull();});
});
