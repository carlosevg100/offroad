import {afterEach, describe, expect, it, vi} from "vitest";
import {materialDocumentXml} from "@offroad/case-export";
import {GET} from "./route";

const mocks = vi.hoisted(() => ({workspace: vi.fn(), load: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/deal-state/materials", async (original) => ({
  ...await original<typeof import("@/lib/deal-state/materials")>(), loadGovernedMaterialPackage: mocks.load,
}));
const material = {kind: "term_sheet" as const, title: {pt: "Termos sintéticos para teste", en: "Synthetic test terms"}, dependsOn: [],
  blocks: [{type: "paragraph" as const, text: {pt: "Material sintético. Consentimento prévio é necessário.", en: "Synthetic material. Prior consent is required."}}]};
const governed = {issuedOn: "2026-09-07", artifactFingerprint: "a".repeat(64), plannedArtifacts: ["indicative_term_sheet"], materials: [material], financialModel: null};
const request = () => GET(new Request("https://offroad.test/material"), {params: Promise.resolve({locale: "pt-BR", sessionId: "10000000-0000-4000-8000-000000000001", kind: "term_sheet"})});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("governed material DOCX download", () => {
  it("returns identical bytes on Monday and Friday for the same persisted material", async () => {
    mocks.workspace.mockResolvedValue({supabase: {}, organization: {id: "org", name: "Empresa sintética"}});
    mocks.load.mockResolvedValue(governed);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
    const monday = await request();
    vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
    const friday = await request();
    expect(monday.status).toBe(200);
    expect(friday.status).toBe(200);
    expect(Buffer.from(await monday.arrayBuffer()).equals(Buffer.from(await friday.arrayBuffer()))).toBe(true);
    expect(materialDocumentXml({material, lang: "pt", meta: {issuedOn: governed.issuedOn}})).toContain("Emitido em 2026-09-07");
    expect(friday.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.load).toHaveBeenCalledWith({}, "org", "10000000-0000-4000-8000-000000000001");
  });
  it("still refuses a material outside the approved production plan", async () => {
    mocks.workspace.mockResolvedValue({supabase: {}, organization: {id: "org"}});
    mocks.load.mockResolvedValue({...governed, plannedArtifacts: []});
    expect((await request()).status).toBe(409);
  });
});
