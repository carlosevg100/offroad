import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./authorized-artifact-reader", () => ({readArtifactRevision: vi.fn()}));
import {serveRoundtripDownload} from "./roundtrip-download";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
const artifactId = "10000000-0000-4000-8000-000000000001", revisionId = "10000000-0000-4000-8000-000000000002", receiptId = "10000000-0000-4000-8000-000000000003";
const rpc = vi.fn();const input = {supabase: {rpc} as unknown as SupabaseClient<Database>, locale: "pt-BR", artifactId, revisionId, format: "pptx", variant: "teaser"};
beforeEach(() => {vi.clearAllMocks();rpc.mockResolvedValue({data: {artifactId, receipts: [{id: receiptId, revisionId, format: "pptx", variant: "teaser", locale: "pt-BR"}]}, error: null});});
describe("all five download families use receipted exports", () => {
 it("returns only the server selection when a delivery action asks for export context", async () => {const response = await serveRoundtripDownload(new Request("https://offroad.test/file?exportContext=1"), input);expect(await response.json()).toEqual({artifactId, revisionId, locale: "pt-BR", format: "pptx", variant: "teaser"});expect(rpc).not.toHaveBeenCalled();});
 it("redirects to the exact verified receipt without raw fallback", async () => {const response = await serveRoundtripDownload(new Request("https://offroad.test/file"), input);expect(response.status).toBe(303);expect(response.headers.get("location")).toBe(`/pt-BR/app/artifacts/${artifactId}/exports?receiptId=${receiptId}`);});
 it("preserves browser authority and workspace when Next uses an internal listener", async () => {const response = await serveRoundtripDownload(new Request("http://localhost:3000/file?workspace=10000000-0000-4000-8000-000000000004", {headers: {host: "127.0.0.1:3000"}}), input);expect(response.headers.get("location")).toBe(`/pt-BR/app/artifacts/${artifactId}/exports?receiptId=${receiptId}&workspace=10000000-0000-4000-8000-000000000004`);expect(response.headers.get("cache-control")).toContain("no-store");});
 it.each(["revisionId", "format", "variant", "locale"] as const)("never substitutes another %s receipt", async key => {rpc.mockResolvedValue({data: {artifactId, receipts: [{id: receiptId, revisionId, format: "pptx", variant: "teaser", locale: "pt-BR", [key]: key === "revisionId" ? artifactId : "other"}]}, error: null});const response = await serveRoundtripDownload(new Request("https://offroad.test/file"), input);expect(response.status).toBe(409);expect(await response.json()).toEqual({ok: false, error: "export_required"});});
 it("denies an inaccessible receipt list", async () => {rpc.mockResolvedValue({data: null, error: {code: "42501"}});expect((await serveRoundtripDownload(new Request("https://offroad.test/file"), input)).status).toBe(403);});
});
