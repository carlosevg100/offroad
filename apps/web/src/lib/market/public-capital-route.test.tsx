import {beforeEach, describe, expect, it, vi} from "vitest";
const workspace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: workspace}));
import Page from "@/app/[locale]/app/market/page";

describe("public market workspace route", () => {
  beforeEach(() => { workspace.mockReset(); });
  it("requires the existing workspace authorization boundary before rendering", async () => {
    workspace.mockRejectedValue(new Error("authentication_required"));
    await expect(Page({params: Promise.resolve({locale: "pt-BR"})})).rejects.toThrow("authentication_required");
    expect(workspace).toHaveBeenCalledWith("pt-BR");
  });
  it("renders only the public research snapshot without querying private providers", async () => {
    const from = vi.fn();
    workspace.mockResolvedValue({supabase: {from}});
    const result = await Page({params: Promise.resolve({locale: "en-US"})});
    expect(result.props.catalog.status).toBe("research_not_verified_mandates");
    expect(from).not.toHaveBeenCalled();
  });
});
