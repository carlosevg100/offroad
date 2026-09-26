import {createHash} from "node:crypto";

import {buildDecisionArtifactContract, buildRenderedMaterialManifest} from "@offroad/case-understanding";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({workspace: vi.fn(), readable: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/resource-download", () => ({resourceStillReadable: mocks.readable}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/integration-preview", () => ({loadIntegrationPreviewStatus: async () => ({}), integrationPreviewCoversProject: () => true}));

import {artifactReadFixture, artifactRpc, type ReadFixtureInput} from "@/lib/artifacts/artifact-read.test-support";
import {legacyGET} from "@/lib/artifacts/legacy-routes/preview-material.test-support";
import {supabaseDouble} from "@/lib/artifacts/supabase-double.test-support";
import {GET} from "./route";

const organizationId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const workbookBytes = new TextEncoder().encode("decision workbook");
const workbookSha = createHash("sha256").update(workbookBytes).digest("hex");
const contract = buildDecisionArtifactContract({
  schemaVersion: "2026.09.07-v1", caseId: "case-1", snapshotFingerprint: "a".repeat(64), asOf: "2026-06-30", status: "draft",
  release: {state: "internal_only", recipientIds: []},
  sources: [{id: "src", title: "ITR", classification: "public", asOf: "2026-06-30", locator: "p. 1"}], assumptions: [], gaps: [],
  claims: [{id: "claim", label: "Caixa", value: 10, unit: "R$ milhões", evidenceState: "observed_public", object: {id: "cash", type: "financial_position", fingerprint: "b".repeat(64), path: "cash"}, sourceIds: ["src"], assumptionIds: [], gapIds: []}],
  views: [
    {surface: "conversation", artifactId: "chat", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{id: "chat", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
    {surface: "workbook", artifactId: "workbook", artifactKind: "xlsx", artifactFingerprint: workbookSha, blocks: [{id: "workbook", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
    {surface: "presentation", artifactId: "deck", artifactKind: "pptx", artifactFingerprint: null, blocks: [{id: "deck", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
  ],
  identityRequirements: [{claimId: "claim", surfaces: ["conversation", "workbook", "presentation"]}],
});
const workbookManifest = buildRenderedMaterialManifest({
  schemaVersion: "2026.09.07-v1", id: "workbook", organizationId, projectId, caseId: contract.caseId,
  decisionContractFingerprint: contract.contractFingerprint, surface: "workbook", format: "xlsx", fileName: "decision-workbook.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", byteLength: workbookBytes.byteLength, contentSha256: workbookSha,
  renderer: {id: "offroad-decision-workbook", version: "v1"}, template: {id: "offroad-decision-workbook", version: "v1", fingerprint: "c".repeat(64), origin: "offroad_house"},
  storage: {bucket: "case-artifacts", objectPath: `${organizationId}/${projectId}/materials/${workbookSha}.xlsx`, state: "stored", etag: "etag"},
  generatedAt: "2026-09-07T12:00:00.000Z", quality: {schemaValidated: true, numericIdentityPassed: true, formulaAuditPassed: true, visualInspection: "not_run", openIssues: [], releaseEligible: false},
  release: {state: "internal_only", recipientIds: []}, claimIds: ["claim"], sourceIds: ["src"], assumptionIds: [], gapIds: [],
});
const row = (id: string, type: string, createdAt: string, content: unknown, status = "draft", version = 1) => ({
  id, artifact_type: type, artifact_version: version, status, artifact_fingerprint: createHash("sha256").update(id).digest("hex"), content, created_at: createdAt,
});
const synthesis = row("33333333-3333-4333-8333-000000000001", "preview_material", "2026-09-06T10:00:00Z", {output: {
  sections: [{id: "s1", title: "Leitura sintética", paragraphs: [{text: "Caixa de 10 milhões em 30/06.", references: ["cash"]}]}],
  source: {kind: "deterministic", model: null}, numbers: {verified: 1, removed: []}, change_note: ["Versão sintética para teste."],
}}, "draft", 2);
const ledger = row("33333333-3333-4333-8333-000000000002", "preview_debt_ledger", "2026-09-06T09:00:00Z", {output: {ledger_rows: [{instrument: "CCB", balance: {value: "10"}}]}});
const newerLedger = row("33333333-3333-4333-8333-000000000003", "preview_debt_ledger", "2026-09-06T11:00:00Z", {output: {ledger_rows: [{instrument: "Debênture", balance: {value: "25"}}]}});
const workbookRow = row("33333333-3333-4333-8333-000000000004", "preview_workbook_material", "2026-09-06T10:30:00Z", {manifest: workbookManifest});
const contractRow = row("33333333-3333-4333-8333-000000000005", "preview_decision_contract", "2026-09-06T10:40:00Z", {contract});
const previewRevision = (subject: string, rowId: string, overrides: Partial<ReadFixtureInput> = {}) => artifactReadFixture({
  workId: projectId, kind: "work_product", subject, revisionId: `44444444-4444-4444-8444-${rowId.slice(-12)}`,
  legacy: {table: "capital_project_artifacts", id: rowId, fingerprint: createHash("sha256").update(rowId).digest("hex")}, ...overrides,
});
let rows: ReturnType<typeof row>[];
let reads: ReturnType<typeof artifactReadFixture>[];
let stored: Record<string, Uint8Array>;
function client() {
  return supabaseDouble({
    // The old route asked for non-superseded rows; the new one reads the whole history.
    tables: {capital_project_artifacts: (filters) => ({data: [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter(candidate => !filters.some(([method, args]) => method === "neq" && args[0] === "status" && candidate.status === args[1])), error: null})},
    rpc: artifactRpc(reads),
    storage: {"case-artifacts": (path) => stored[path] ? {data: new Blob([stored[path]!]), error: null} : {data: null, error: {message: "missing"}}},
  }).client;
}
const request = (format = "docx", query = "") => GET(new Request(`https://offroad.test/preview?format=${format}${query}`), {params: Promise.resolve({locale: "pt-BR", projectId})});
const legacyRequest = (format = "docx") => legacyGET(new Request(`https://offroad.test/preview?format=${format}`), {params: Promise.resolve({locale: "pt-BR", projectId})});
const sha = (bytes: ArrayBuffer) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");

beforeEach(() => {
  rows = [synthesis, ledger, workbookRow, contractRow];
  reads = [previewRevision("preview_material", synthesis.id), previewRevision("preview_workbook_material", workbookRow.id)];
  stored = {[workbookManifest.storage.objectPath]: workbookBytes};
  mocks.readable.mockResolvedValue(true);
  mocks.workspace.mockImplementation(async () => ({supabase: client(), organization: {id: organizationId}}));
});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("integration preview material", () => {
  it("issues the Word preview on the date of its version: the same revision is the same file on any day", async () => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    const monday = await request();
    vi.setSystemTime(new Date("2027-03-01T12:00:00Z"));
    const later = await request();
    expect(monday.status).toBe(200);
    const bytes = Buffer.from(await later.arrayBuffer());
    expect(sha(await monday.arrayBuffer())).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(bytes.toString("latin1")).toContain("Emitido em 2026-09-06");
    expect(later.headers.get("x-preview-artifact-version")).toBe("2");
    expect(later.headers.get("x-artifact-revision")).toBe(reads[0]!.revision.id);
    expect(later.headers.get("x-artifact-legacy")).toBe("unpinned");
    expect(later.headers.get("x-artifact-release")).toBe("internal");
  });
  it("composes the tables that existed when the version was created, never newer ones", async () => {
    const before = Buffer.from(await (await request()).arrayBuffer());
    rows = [synthesis, ledger, newerLedger, workbookRow, contractRow];
    const after = Buffer.from(await (await request()).arrayBuffer());
    expect(after.toString("latin1")).toContain("CCB");
    expect(after.toString("latin1")).not.toContain("Debênture");
    expect(after.equals(before)).toBe(true);
    // The old route composed the newest table of the day, so the same version changed with later rows.
    expect(Buffer.from(await (await legacyRequest()).arrayBuffer()).toString("latin1")).toContain("Deb");
  });
  it("serves the stored workbook only against its governed receipt and binding, with both sets of headers", async () => {
    const response = await request("xlsx");
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(Buffer.from(workbookBytes))).toBe(true);
    expect(response.headers.get("x-material-sha256")).toBe(workbookSha);
    expect(response.headers.get("x-artifact-revision")).toBe(reads[1]!.revision.id);
    expect(response.headers.get("x-artifact-legacy")).toBe("unpinned");
    stored = {[workbookManifest.storage.objectPath]: new TextEncoder().encode("tampered")};
    expect((await request("xlsx")).status).toBe(409);
    stored = {};
    expect((await request("xlsx")).status).toBe(502);
  });
  it("uses the same release evaluation as every download: an external version is served only once released", async () => {
    reads = [previewRevision("preview_workbook_material", workbookRow.id, {legacy: undefined, audience: "external", release: "blocked",
      stored: {sha256: workbookSha, byteLength: workbookBytes.byteLength, bucket: "case-artifacts", path: workbookManifest.storage.objectPath}, format: "xlsx"})];
    const blocked = await request("xlsx");
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain("ainda não foi aprovada");
    reads = [previewRevision("preview_workbook_material", workbookRow.id, {legacy: undefined, audience: "external", release: "released",
      stored: {sha256: workbookSha, byteLength: workbookBytes.byteLength, bucket: "case-artifacts", path: workbookManifest.storage.objectPath}, format: "xlsx"})];
    const released = await request("xlsx");
    expect(released.status).toBe(200);
    expect(released.headers.get("x-artifact-content-sha256")).toBe(workbookSha);
    expect(released.headers.get("x-material-sha256")).toBeNull();
    reads = [previewRevision("preview_workbook_material", workbookRow.id, {legacy: undefined, audience: "external", release: "released",
      stored: {sha256: "d".repeat(64), byteLength: workbookBytes.byteLength, bucket: "case-artifacts", path: workbookManifest.storage.objectPath}, format: "xlsx"})];
    expect((await request("xlsx")).status).toBe(409);
    // A version with no stored bytes and no historical row has nothing this route can produce.
    reads = [previewRevision("preview_material", synthesis.id, {legacy: undefined, audience: "external", release: "released"})];
    expect((await request()).status).toBe(409);
  });
  it("resolves ?revision= exactly and refuses a replaced version or a revision of another subject", async () => {
    const older = previewRevision("preview_material", "33333333-3333-4333-8333-000000000009", {isHead: false});
    reads = [...reads, older];
    expect((await request("docx", `&revision=${reads[0]!.revision.id}`)).status).toBe(200);
    expect((await request("docx", `&revision=${older.revision.id}`)).status).toBe(409);
    expect((await request("docx", `&revision=${reads[1]!.revision.id}`)).status).toBe(404);
    expect((await request("docx", "&revision=bad")).status).toBe(404);
  });
});

describe("old and new resolution decide equal for the preview", () => {
  it("serve the same Word bytes when the old route ran on the day the version was created", async () => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-06T15:00:00Z"));
    const before = await legacyRequest();
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
    const after = await request();
    // The old route printed the download day, so on any other day its bytes changed.
    const drifted = await legacyRequest();
    expect(sha(await after.arrayBuffer())).toBe(sha(await before.arrayBuffer()));
    expect(sha(await drifted.arrayBuffer())).not.toBe(sha(await (await request()).arrayBuffer()));
  });
  it("serve the same stored workbook and refuse the same cases", async () => {
    const before = await legacyRequest("xlsx");
    const after = await request("xlsx");
    expect(after.status).toBe(before.status);
    expect(sha(await after.arrayBuffer())).toBe(sha(await before.arrayBuffer()));
    expect(after.headers.get("x-material-manifest-fingerprint")).toBe(before.headers.get("x-material-manifest-fingerprint"));
    const cases: Array<() => void> = [
      () => {stored = {[workbookManifest.storage.objectPath]: new TextEncoder().encode("tampered")};},
      () => {stored = {};},
      () => {rows = [synthesis, ledger, workbookRow];},
      () => {rows = [ledger, workbookRow, contractRow]; reads = reads.filter(read => read.artifact.subject !== "preview_material");},
      () => {mocks.readable.mockResolvedValue(false);},
    ];
    for (const arrange of cases) {
      rows = [synthesis, ledger, workbookRow, contractRow];
      reads = [previewRevision("preview_material", synthesis.id), previewRevision("preview_workbook_material", workbookRow.id)];
      stored = {[workbookManifest.storage.objectPath]: workbookBytes};
      mocks.readable.mockResolvedValue(true);
      arrange();
      for (const format of ["xlsx", "docx", "pptx"]) expect((await request(format)).status, format).toBe((await legacyRequest(format)).status);
    }
  });
});
