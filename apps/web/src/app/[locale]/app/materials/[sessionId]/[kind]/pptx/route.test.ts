import {afterEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({workspace: vi.fn(), load: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/resource-download", () => ({resourceStillReadable: async () => true}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/deal-state/materials", async (original) => ({
  ...await original<typeof import("@/lib/deal-state/materials")>(), loadGovernedMaterialPackage: mocks.load,
}));

import {governedPackage, materialRevisionId, materialSessionId, materialSupabase} from "@/lib/artifacts/material-fixtures.test-support";
import {GET} from "./route";

const request = () => GET(new Request("https://offroad.test/material?exportContext=1"), {params: Promise.resolve({locale: "pt-BR", sessionId: materialSessionId, kind: "term_sheet"})});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("governed material PPTX download", () => {
  it("returns identical bytes on Monday and Friday for the same persisted revision", async () => {
    const {client} = materialSupabase();
    mocks.workspace.mockResolvedValue({supabase: client, organization: {id: "org", name: "Empresa sintética"}});
    mocks.load.mockResolvedValue(governedPackage);
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
    const monday = await request();
    vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
    const friday = await request();
    expect(monday.status).toBe(200);
    expect(friday.status).toBe(200);
    const selected = await friday.json();
    expect(await monday.json()).toEqual(selected);
    expect(selected).toMatchObject({revisionId: materialRevisionId, format: "pptx", variant: "term_sheet"});
    expect(friday.headers.get("cache-control")).toBe("private, no-store");
    
    
    expect(mocks.load).toHaveBeenCalledWith(client, "org", materialSessionId);
  });
  it("still refuses a material outside the approved production plan", async () => {
    mocks.workspace.mockResolvedValue({supabase: materialSupabase().client, organization: {id: "org"}});
    mocks.load.mockResolvedValue({...governedPackage, plannedArtifacts: []});
    expect((await request()).status).toBe(409);
  });
});
