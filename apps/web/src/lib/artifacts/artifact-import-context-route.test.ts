import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({workspace: vi.fn(), heads: vi.fn(), rpc: vi.fn(), from: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/artifacts/artifact-import-heads", () => ({readWorkArtifactHeads: mocks.heads}));
vi.mock("@/lib/artifacts/artifact-import", async importOriginal => ({...await importOriginal<typeof import("./artifact-import")>(), artifactImportRpc: () => mocks.rpc}));
vi.mock("@/lib/artifacts/authorized-artifact-reader", () => ({readArtifactRevision: vi.fn()}));
import {GET} from "@/app/[locale]/app/artifacts/[artifactId]/imports/route";
const artifactId = "10000000-0000-4000-8000-000000000001", workId = "10000000-0000-4000-8000-000000000002";
const context = {params: Promise.resolve({locale: "pt-BR",artifactId})};
beforeEach(() => {vi.clearAllMocks();mocks.workspace.mockResolvedValue({supabase: {rpc: mocks.rpc,from: mocks.from},userId: workId});});
describe("Office import context uses current authorized identities", () => {
 it("reports an invalid candidate contract instead of erasing its contribution", async () => {mocks.heads.mockResolvedValue([{id:artifactId,headRevisionId:artifactId}]);mocks.rpc.mockImplementation(async (name:string) => ({error:null,data:name==="list_work_artifact_imports_v1"?{workId,candidates:[{candidateId:workId,status:"candidate"}]}:name==="list_artifact_export_receipts_v1"?{artifactId,receipts:[]}:null}));const response=await GET(new Request(`https://offroad.test/import?workId=${workId}`),context);expect(response.status).toBe(502);expect(response.headers.get("cache-control")).toContain("no-store");});
 it("requires an explicit work without querying closed tables",async () => {const response = await GET(new Request("https://offroad.test/import"), context);expect(response.status).toBe(404);expect(mocks.workspace).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();});
 it.each([null, [], [{id: workId,headRevisionId: artifactId}]])("denies revoked or differently scoped artifact metadata before any receipts or methods",async heads => {mocks.heads.mockResolvedValue(heads);const response = await GET(new Request(`https://offroad.test/import?workId=${workId}`),context);expect(response.status).toBe(404);expect(mocks.heads).toHaveBeenCalledWith({rpc:mocks.rpc,from:mocks.from},workId);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toContain("no-store");});
});
