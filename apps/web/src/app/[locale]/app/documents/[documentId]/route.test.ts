import {beforeEach, describe, expect, it, vi} from "vitest";
import {GET} from "./route";

const mocks = vi.hoisted(() => ({claims: vi.fn(), rpc: vi.fn(), download: vi.fn()}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({
  auth: {getClaims: mocks.claims}, rpc: mocks.rpc,
  storage: {from: () => ({download: mocks.download})},
})}));
const documentId = "10000000-0000-4000-8000-000000000001";
const metadata = {id: documentId, bucket_id: "opportunity-documents", object_path: "tenant/scope/version.pdf", original_name: "version.pdf"};
const request = () => GET(new Request("https://offroad.test/document"), {params: Promise.resolve({locale: "pt-BR", documentId})});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.claims.mockResolvedValue({data: {claims: {sub: "authorized-user"}}, error: null});
  mocks.rpc.mockResolvedValue({data: metadata, error: null});
  mocks.download.mockResolvedValue({data: new Blob(["immutable bytes"]), error: null});
});
describe("immutable source version download", () => {
  it("returns exact bytes only after both authorization checks, without caching", async () => {
    const result = await request();
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("immutable bytes");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("content-security-policy")).toBe("sandbox");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "authorize_source_version_download_v1", {p_version_id: documentId});
  });
  it("does not fetch bytes when the source policy denies access", async () => {
    mocks.rpc.mockResolvedValue({data: null, error: {code: "42501"}});
    const result = await request();
    expect(result.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(await result.text()).toBe("");
  });
  it("discards bytes when access is revoked during the storage request", async () => {
    mocks.rpc.mockResolvedValueOnce({data: metadata, error: null}).mockResolvedValueOnce({data: null, error: {code: "42501"}});
    const result = await request();
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(404);
    expect(await result.text()).toBe("");
  });
  it("denies anonymous sessions before resolving a version", async () => {
    mocks.claims.mockResolvedValue({data: null, error: {message: "unauthenticated"}});
    expect((await request()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("does not release a buffer when the second authorization response is malformed", async () => {
    mocks.rpc.mockResolvedValueOnce({data: metadata, error: null}).mockResolvedValueOnce({data: {}, error: null});
    const result = await request();
    expect(result.status).toBe(404);
    expect(await result.text()).toBe("");
  });
});
