import {createHash} from "node:crypto";

import {buildDecisionArtifactContract, buildRenderedMaterialManifest, type DecisionArtifactContractInput} from "@offroad/case-understanding";
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
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const workbookBytes = new TextEncoder().encode("decision workbook");
const workbookSha = digest(workbookBytes);
const deckBytes = new TextEncoder().encode("decision deck");
const deckSha = digest(deckBytes);
/** The address the upload grant command writes for a work, a hash and a format. */
const grantPath = (sha256: string, format: "xlsx" | "pptx") => `${organizationId}/${projectId}/materials/${sha256}.${format}`;
const contractInput: DecisionArtifactContractInput = {
  schemaVersion: "2026.09.07-v1", caseId: "case-1", snapshotFingerprint: "a".repeat(64), asOf: "2026-06-30", status: "draft",
  release: {state: "internal_only", recipientIds: []},
  sources: [{id: "src", title: "ITR", classification: "public", asOf: "2026-06-30", locator: "p. 1"}], assumptions: [], gaps: [],
  claims: [{id: "claim", label: "Caixa", value: 10, unit: "R$ milhões", evidenceState: "observed_public", object: {id: "cash", type: "financial_position", fingerprint: "b".repeat(64), path: "cash"}, sourceIds: ["src"], assumptionIds: [], gapIds: []}],
  views: [
    {surface: "conversation", artifactId: "chat", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{id: "chat", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
    {surface: "workbook", artifactId: "workbook", artifactKind: "xlsx", artifactFingerprint: workbookSha, blocks: [{id: "workbook", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
    {surface: "presentation", artifactId: "deck", artifactKind: "pptx", artifactFingerprint: deckSha, blocks: [{id: "deck", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
  ],
  identityRequirements: [{claimId: "claim", surfaces: ["conversation", "workbook", "presentation"]}],
};
const contract = buildDecisionArtifactContract(contractInput);
// A newer contract recorded by a run that renders no file (a premise change, for example) binds none.
const unboundContract = buildDecisionArtifactContract({...contractInput, views: contractInput.views.map((view) => view.surface === "conversation" ? view : {...view, artifactFingerprint: null})});
const materialManifest = (surface: "workbook" | "presentation") => {
  const workbook = surface === "workbook";
  const bytes = workbook ? workbookBytes : deckBytes;
  const sha256 = workbook ? workbookSha : deckSha;
  return buildRenderedMaterialManifest({
    schemaVersion: "2026.09.07-v1", id: workbook ? "workbook" : "deck", organizationId, projectId, caseId: contract.caseId,
    decisionContractFingerprint: contract.contractFingerprint, surface, format: workbook ? "xlsx" : "pptx", fileName: workbook ? "decision-workbook.xlsx" : "decision-deck.pptx",
    mimeType: workbook ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    byteLength: bytes.byteLength, contentSha256: sha256,
    renderer: {id: workbook ? "offroad-decision-workbook" : "offroad-institutional-presentation", version: "v1"},
    template: {id: workbook ? "offroad-decision-workbook" : "offroad-institutional-presentation", version: "v1", fingerprint: "c".repeat(64), origin: "offroad_house"},
    storage: {bucket: "case-artifacts", objectPath: grantPath(sha256, workbook ? "xlsx" : "pptx"), state: "stored", etag: "etag"},
    generatedAt: "2026-09-07T12:00:00.000Z", quality: {schemaValidated: true, numericIdentityPassed: true, formulaAuditPassed: true, visualInspection: "not_run", openIssues: [], releaseEligible: false},
    release: {state: "internal_only", recipientIds: []}, claimIds: ["claim"], sourceIds: ["src"], assumptionIds: [], gapIds: [],
  });
};
const workbookManifest = materialManifest("workbook");
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
const deckRow = row("33333333-3333-4333-8333-000000000006", "preview_presentation_material", "2026-09-06T10:20:00Z", {manifest: materialManifest("presentation")});
const unboundContractRow = row("33333333-3333-4333-8333-000000000007", "preview_decision_contract", "2026-09-06T12:00:00Z", {contract: unboundContract});
/** The projection of a receipt row (kind work_product, subject the artifact type), with no bytes pinned. */
const previewRevision = (subject: string, rowId: string, overrides: Partial<ReadFixtureInput> = {}) => artifactReadFixture({
  workId: projectId, kind: "work_product", subject, revisionId: `44444444-4444-4444-8444-${rowId.slice(-12)}`,
  legacy: {table: "capital_project_artifacts", id: rowId, fingerprint: createHash("sha256").update(rowId).digest("hex")}, ...overrides,
});
/** The revision the worker writes for a stored file: kind and subject of its surface, the grant's object pinned. */
const pinnedRevision = (surface: "workbook" | "presentation", overrides: Partial<ReadFixtureInput> = {}) => {
  const workbook = surface === "workbook";
  const format = workbook ? "xlsx" : "pptx";
  const sha256 = workbook ? workbookSha : deckSha;
  return artifactReadFixture({
    workId: projectId, kind: surface, subject: `integration-preview:${surface}`, format,
    revisionId: `55555555-5555-4555-8555-00000000000${workbook ? 1 : 2}`, artifactId: `66666666-6666-4666-8666-00000000000${workbook ? 1 : 2}`,
    stored: {sha256, byteLength: (workbook ? workbookBytes : deckBytes).byteLength, bucket: "case-artifacts", path: grantPath(sha256, format)},
    ...overrides,
  });
};
const pinnedWorkbook = pinnedRevision("workbook");
const pinnedDeck = pinnedRevision("presentation");
const receiptWorkbook = previewRevision("preview_workbook_material", workbookRow.id);
let rows: ReturnType<typeof row>[];
let reads: ReturnType<typeof artifactReadFixture>[];
let stored: Record<string, Uint8Array>;
let storageDown: boolean;
let pinnedHeadDown: boolean;
const downloads: string[] = [];
function client() {
  const readers = (name: string, args: Record<string, unknown>) => artifactRpc(reads)(name, args);
  return supabaseDouble({
    // The old route asked for non-superseded rows; the new one reads the whole history.
    tables: {capital_project_artifacts: (filters) => ({data: [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter(candidate => !filters.some(([method, args]) => method === "neq" && args[0] === "status" && candidate.status === args[1])), error: null})},
    // A pinned head that cannot be read answers a failure, never "no revision".
    rpc: async (name, args) => pinnedHeadDown && name === "read_artifact_head_v1" && String(args.p_subject).startsWith("integration-preview:")
      ? {data: null, error: {code: "57014", message: "canceling statement due to statement timeout"}}
      : readers(name, args),
    // What Storage answers: the object, "not found" (also for an object the person cannot read), or a failure.
    storage: {"case-artifacts": (path) => {
      downloads.push(path);
      if (storageDown) return {data: null, error: {message: "upstream timeout", statusCode: "503"}};
      return stored[path] ? {data: new Blob([new Uint8Array(stored[path]!)]), error: null} : {data: null, error: {message: "Object not found", statusCode: "404"}};
    }},
  }).client;
}
const request = (format = "docx", query = "") => GET(new Request(`https://offroad.test/preview?format=${format}${query}`), {params: Promise.resolve({locale: "pt-BR", projectId})});
const legacyRequest = (format = "docx") => legacyGET(new Request(`https://offroad.test/preview?format=${format}`), {params: Promise.resolve({locale: "pt-BR", projectId})});
const sha = (bytes: ArrayBuffer) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");
/** A preview written after the worker started pinning its files: both receipts, both revisions, both objects. */
function pinnedPreview() {
  rows = [synthesis, ledger, deckRow, workbookRow, contractRow];
  reads = [previewRevision("preview_material", synthesis.id), receiptWorkbook, previewRevision("preview_presentation_material", deckRow.id), pinnedWorkbook, pinnedDeck];
  stored = {[grantPath(workbookSha, "xlsx")]: workbookBytes, [grantPath(deckSha, "pptx")]: deckBytes};
}

beforeEach(() => {
  rows = [synthesis, ledger, workbookRow, contractRow];
  reads = [previewRevision("preview_material", synthesis.id), receiptWorkbook];
  stored = {[workbookManifest.storage.objectPath]: workbookBytes};
  storageDown = false;
  pinnedHeadDown = false;
  downloads.length = 0;
  mocks.readable.mockResolvedValue(true);
  mocks.workspace.mockImplementation(async () => ({supabase: client(), organization: {id: organizationId}}));
});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("integration preview material", () => {
  it.each(["docx", "xlsx", "pptx"])("withholds %s after generation or Storage when source rights alone are revoked", async (format) => {
    pinnedPreview();
    mocks.readable.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      if (format !== "docx") expect(downloads).toHaveLength(1);
      reads = reads.map((read) => ({...read, revision: {...read.revision, manifest: null}, blocks: [],
        restriction: {kind: "source_rights" as const, linkIds: [], unresolvedRevisionIds: []}}));
      return true;
    });
    const response = await request(format);
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("x-artifact-revision")).toBeNull();
    expect(response.headers.get("x-preview-artifact-fingerprint")).toBeNull();
    expect(response.headers.get("x-material-sha256")).toBeNull();
  });
  it.each(["xlsx", "pptx"])("withholds stored %s when approval is revoked and does not fall back to the receipt", async (format) => {
    pinnedPreview();
    const surface = format === "xlsx" ? "workbook" : "presentation";
    reads = [...reads.filter((read) => read.artifact.kind !== surface), pinnedRevision(surface, {audience: "external", release: "released"})];
    mocks.readable.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      expect(downloads).toHaveLength(1);
      reads = [...reads.filter((read) => read.artifact.kind !== surface), pinnedRevision(surface, {audience: "external", release: "blocked"})];
      return true;
    });
    const response = await request(format);
    expect(response.status).toBe(409);
    expect(downloads).toHaveLength(1);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("x-artifact-release")).toBeNull();
  });
  it("withholds the unpinned receipt path when its authority is revoked after Storage", async () => {
    mocks.readable.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      expect(downloads).toHaveLength(1);
      reads = [];
      return true;
    });
    const response = await request("xlsx");
    expect(response.status).toBe(409);
    expect(response.headers.get("x-material-sha256")).toBeNull();
    expect(response.headers.get("content-disposition")).toBeNull();
  });

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
  it("serves a preview without a pinned revision against its governed receipt and binding, unpinned, with both sets of headers", async () => {
    const response = await request("xlsx");
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(Buffer.from(workbookBytes))).toBe(true);
    expect(response.headers.get("x-material-sha256")).toBe(workbookSha);
    expect(response.headers.get("x-artifact-revision")).toBe(receiptWorkbook.revision.id);
    expect(response.headers.get("x-artifact-legacy")).toBe("unpinned");
    expect(response.headers.get("x-artifact-bytes")).toBe("unpinned");
    expect(response.headers.get("x-artifact-content-sha256")).toBeNull();
    stored = {[workbookManifest.storage.objectPath]: new TextEncoder().encode("tampered")};
    expect((await request("xlsx")).status).toBe(409);
    stored = {};
    const missing = await request("xlsx");
    expect(missing.status).toBe(409);
    expect(await missing.text()).toContain("não foi encontrado onde foi registrado");
    storageDown = true;
    expect((await request("xlsx")).status).toBe(502);
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

describe("the preview files resolve the revision that pins the stored object first", () => {
  it("serves the head of each file from its revision: the object verified, pinned headers and none of the receipt's", async () => {
    pinnedPreview();
    for (const [format, bytes, sha256, revision] of [["xlsx", workbookBytes, workbookSha, pinnedWorkbook], ["pptx", deckBytes, deckSha, pinnedDeck]] as const) {
      downloads.length = 0;
      const response = await request(format);
      expect(response.status, format).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(Buffer.from(bytes)), format).toBe(true);
      expect(response.headers.get("x-artifact-revision")).toBe(revision.revision.id);
      expect(response.headers.get("x-artifact-manifest-fingerprint")).toBe(revision.revision.manifestFingerprint);
      expect(response.headers.get("x-artifact-bytes")).toBe("pinned");
      expect(response.headers.get("x-artifact-content-sha256")).toBe(sha256);
      expect(response.headers.get("x-artifact-release")).toBe("internal");
      expect(response.headers.get("x-artifact-freshness")).toBe("current");
      expect(response.headers.get("x-artifact-legacy")).toBeNull();
      expect(response.headers.get("x-material-sha256")).toBeNull();
      expect(response.headers.get("content-disposition")).toContain(`-r1.${format}`);
      expect(downloads).toEqual([grantPath(sha256, format)]);
    }
    // The Word preview has no stored file and keeps the projection of its receipt row.
    const docx = await request();
    expect(docx.status).toBe(200);
    expect(docx.headers.get("x-artifact-revision")).toBe(reads[0]!.revision.id);
    expect(docx.headers.get("x-artifact-bytes")).toBe("unpinned");
  });
  it("accepts ?revision= for a pinned revision and still for its receipt's projection, and answers 404 for another file, kind or work", async () => {
    pinnedPreview();
    const exact = await request("xlsx", `&revision=${pinnedWorkbook.revision.id}`);
    expect(exact.status).toBe(200);
    expect(exact.headers.get("x-artifact-revision")).toBe(pinnedWorkbook.revision.id);
    expect(exact.headers.get("x-artifact-bytes")).toBe("pinned");
    const receipt = await request("xlsx", `&revision=${receiptWorkbook.revision.id}`);
    expect(receipt.status).toBe(200);
    expect(receipt.headers.get("x-artifact-bytes")).toBe("unpinned");
    expect(receipt.headers.get("x-artifact-legacy")).toBe("unpinned");
    expect(receipt.headers.get("x-material-sha256")).toBe(workbookSha);
    expect((await request("pptx", `&revision=${pinnedWorkbook.revision.id}`)).status).toBe(404);
    expect((await request("xlsx", `&revision=${pinnedDeck.revision.id}`)).status).toBe(404);
    expect((await request("docx", `&revision=${pinnedWorkbook.revision.id}`)).status).toBe(404);
    const otherWork = pinnedRevision("workbook", {workId: "77777777-7777-4777-8777-777777777777", revisionId: "55555555-5555-4555-8555-000000000003"});
    const otherKind = pinnedRevision("workbook", {kind: "work_product", revisionId: "55555555-5555-4555-8555-000000000004"});
    const otherSubject = pinnedRevision("workbook", {subject: "integration-preview:presentation", revisionId: "55555555-5555-4555-8555-000000000005"});
    reads = [...reads, otherWork, otherKind, otherSubject];
    downloads.length = 0;
    for (const revision of [otherWork, otherKind, otherSubject]) expect((await request("xlsx", `&revision=${revision.revision.id}`)).status).toBe(404);
    expect(downloads).toEqual([]);
  });
  it("serves a stored file only while the latest decision contract binds its bytes: an older revision was replaced, an unbound head is not ready", async () => {
    pinnedPreview();
    const earlierBytes = new TextEncoder().encode("earlier decision workbook");
    const earlierSha = digest(earlierBytes);
    const earlier = pinnedRevision("workbook", {revisionId: "55555555-5555-4555-8555-000000000006", isHead: false,
      stored: {sha256: earlierSha, byteLength: earlierBytes.byteLength, bucket: "case-artifacts", path: grantPath(earlierSha, "xlsx")}});
    reads = [...reads, earlier];
    stored = {...stored, [grantPath(earlierSha, "xlsx")]: earlierBytes};
    downloads.length = 0;
    const replaced = await request("xlsx", `&revision=${earlier.revision.id}`);
    expect(replaced.status).toBe(409);
    expect(await replaced.text()).toContain("não é mais a vigente");
    expect(downloads).toEqual([]);
    // A run that records a newer contract without files: the last files no longer match what it says.
    rows = [...rows, unboundContractRow];
    for (const [format, text] of [["xlsx", "A planilha ainda não está pronta."], ["pptx", "A apresentação ainda não está pronta."]] as const) {
      const notReady = await request(format);
      expect(notReady.status, format).toBe(409);
      expect(await notReady.text()).toBe(text);
      // The receipt route refused the same case.
      expect((await legacyRequest(format)).status, format).toBe(409);
    }
    expect(downloads).toEqual([]);
  });
  it("reads the pinned object only at the address of its upload grant and refuses a missing, rotated or different object with a reason", async () => {
    pinnedPreview();
    const rotatedPath = `${organizationId}/${projectId}/revocable-7d1f0c2e-5b7a-4c1e-9a55-1f7c2d3e4b5a/${workbookSha}.xlsx`;
    // The 1B rotation renamed objects without updating grants or manifests: the grant's address is empty.
    stored = {[rotatedPath]: workbookBytes};
    const rotated = await request("xlsx");
    expect(rotated.status).toBe(409);
    expect(await rotated.text()).toContain("não foi encontrado onde foi registrado");
    expect(downloads).toEqual([grantPath(workbookSha, "xlsx")]);
    // A manifest that names any other address is not the grant's object and is never downloaded.
    reads = [pinnedRevision("workbook", {stored: {sha256: workbookSha, byteLength: workbookBytes.byteLength, bucket: "case-artifacts", path: rotatedPath}})];
    downloads.length = 0;
    expect((await request("xlsx")).status).toBe(409);
    expect(downloads).toEqual([]);
    // Other bytes at the grant's address, with the same size or another one, are never served.
    reads = [pinnedWorkbook];
    for (const other of [new TextEncoder().encode("decision workbooK"), new TextEncoder().encode("tampered")]) {
      stored = {[grantPath(workbookSha, "xlsx")]: other};
      const mismatch = await request("xlsx");
      expect(mismatch.status).toBe(409);
      expect(await mismatch.text()).toContain("não confere com o registro");
    }
    // Only a storage failure is answered as one.
    stored = {[grantPath(workbookSha, "xlsx")]: workbookBytes};
    storageDown = true;
    expect((await request("xlsx")).status).toBe(502);
  });
  it("uses the same release evaluation as every download: an external version is served only once released", async () => {
    pinnedPreview();
    reads = [pinnedRevision("workbook", {audience: "external", release: "blocked"})];
    const blocked = await request("xlsx");
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain("ainda não foi aprovada");
    reads = [pinnedRevision("workbook", {audience: "external", release: "released"})];
    const released = await request("xlsx");
    expect(released.status).toBe(200);
    expect(released.headers.get("x-artifact-release")).toBe("released");
    expect(released.headers.get("x-artifact-content-sha256")).toBe(workbookSha);
    // A version with no stored bytes and no historical row has nothing this route can produce.
    reads = [previewRevision("preview_material", synthesis.id, {legacy: undefined, audience: "external", release: "released"})];
    expect((await request()).status).toBe(409);
  });
  it("never serves the receipt in place of a pinned head it cannot read; with no pinned revision the receipt path is today's", async () => {
    pinnedPreview();
    pinnedHeadDown = true;
    const unreadable = await request("xlsx");
    expect(unreadable.status).toBe(409);
    expect(await unreadable.text()).toBe("A planilha ainda não está pronta.");
    expect(downloads).toEqual([]);
    pinnedHeadDown = false;
    reads = reads.filter((read) => !read.artifact.subject.startsWith("integration-preview:"));
    const receipt = await request("xlsx");
    expect(receipt.status).toBe(200);
    expect(receipt.headers.get("x-artifact-revision")).toBe(receiptWorkbook.revision.id);
    expect(receipt.headers.get("x-artifact-bytes")).toBe("unpinned");
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
  it("serve the same stored workbook and refuse the same cases for a preview without a pinned revision", async () => {
    const before = await legacyRequest("xlsx");
    const after = await request("xlsx");
    expect(after.status).toBe(before.status);
    expect(sha(await after.arrayBuffer())).toBe(sha(await before.arrayBuffer()));
    expect(after.headers.get("x-material-manifest-fingerprint")).toBe(before.headers.get("x-material-manifest-fingerprint"));
    const cases: Array<() => void> = [
      () => {stored = {[workbookManifest.storage.objectPath]: new TextEncoder().encode("tampered")};},
      () => {storageDown = true;},
      () => {rows = [synthesis, ledger, workbookRow];},
      () => {rows = [ledger, workbookRow, contractRow]; reads = reads.filter(read => read.artifact.subject !== "preview_material");},
      () => {mocks.readable.mockResolvedValue(false);},
    ];
    for (const arrange of cases) {
      rows = [synthesis, ledger, workbookRow, contractRow];
      reads = [previewRevision("preview_material", synthesis.id), receiptWorkbook];
      stored = {[workbookManifest.storage.objectPath]: workbookBytes};
      storageDown = false;
      mocks.readable.mockResolvedValue(true);
      arrange();
      for (const format of ["xlsx", "docx", "pptx"]) expect((await request(format)).status, format).toBe((await legacyRequest(format)).status);
    }
  });
  it("serve a pinned preview from its revision: the same files and the same refusals, and only the headers change", async () => {
    pinnedPreview();
    for (const format of ["xlsx", "pptx"] as const) {
      const before = await legacyRequest(format);
      const after = await request(format);
      expect(before.status, format).toBe(200);
      expect(after.status, format).toBe(200);
      expect(sha(await after.arrayBuffer())).toBe(sha(await before.arrayBuffer()));
      // The deliberate change: the file is served from its revision, which pins the hash the receipt carried.
      expect(after.headers.get("x-artifact-bytes")).toBe("pinned");
      expect(after.headers.get("x-artifact-content-sha256")).toBe(before.headers.get("x-material-sha256"));
      expect(after.headers.get("x-material-manifest-fingerprint")).toBeNull();
    }
    const cases: Array<() => void> = [
      () => {stored = {[grantPath(workbookSha, "xlsx")]: new TextEncoder().encode("tampered"), [grantPath(deckSha, "pptx")]: new TextEncoder().encode("tampered")};},
      () => {storageDown = true;},
      () => {rows = rows.filter((candidate) => candidate !== contractRow);},
      () => {rows = [...rows, unboundContractRow];},
      () => {rows = rows.filter((candidate) => candidate !== synthesis); reads = reads.filter((read) => read.artifact.subject !== "preview_material");},
      () => {mocks.readable.mockResolvedValue(false);},
    ];
    for (const arrange of cases) {
      pinnedPreview();
      storageDown = false;
      mocks.readable.mockResolvedValue(true);
      arrange();
      for (const format of ["xlsx", "docx", "pptx"]) expect((await request(format)).status, format).toBe((await legacyRequest(format)).status);
    }
  });
  it("differ on purpose for a missing object: the old route answered as if storage failed, the new one says the file is missing", async () => {
    stored = {};
    expect((await legacyRequest("xlsx")).status).toBe(502);
    expect((await request("xlsx")).status).toBe(409);
    pinnedPreview();
    stored = {};
    for (const format of ["xlsx", "pptx"]) {
      expect((await legacyRequest(format)).status, format).toBe(502);
      expect((await request(format)).status, format).toBe(409);
    }
  });
});
