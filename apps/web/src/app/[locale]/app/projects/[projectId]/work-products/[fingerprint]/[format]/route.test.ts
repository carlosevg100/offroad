import {beforeEach, describe, expect, it, vi} from "vitest";
import {offroadHousePresentationStructure} from "@offroad/case-export/presentation-structure";
import {syntheticDocumentWorkProduct} from "@offroad/testing-fixtures/document-work-product";
import {documentWorkProductSchema} from "@offroad/domain-contracts";

const mocks = vi.hoisted(() => ({readable: vi.fn(), workspace: vi.fn(), read: vi.fn(), labels: vi.fn(), rpc: vi.fn(), download: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/resource-download", () => ({resourceStillReadable: mocks.readable}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/advisor/document-work-product-reader", () => ({loadDocumentWorkProduct: mocks.read}));
vi.mock("@/lib/advisor/document-work-product-labels", () => ({documentWorkProductLabels: mocks.labels}));
vi.mock("@/lib/artifacts/render-artifact-revision", async (original) => {
  const actual = await original<typeof import("@/lib/artifacts/render-artifact-revision")>();
  return {renderArtifactRevision: vi.fn(actual.renderArtifactRevision)};
});

import messages from "../../../../../../../../../messages/pt-BR.json";
import {artifactReadFixture, artifactRpc, type ReadFixtureInput} from "@/lib/artifacts/artifact-read.test-support";
import {legacyGET} from "@/lib/artifacts/legacy-routes/work-products.test-support";
import {renderArtifactRevision} from "@/lib/artifacts/render-artifact-revision";
import {GET} from "./route";

const render = vi.mocked(renderArtifactRevision);
const projectId = "10000000-0000-4000-8000-000000000001";
const sessionId = "10000000-0000-4000-8000-000000000002";
const manifestId = "10000000-0000-4000-8000-000000000003";
const revisionId = "10000000-0000-4000-8000-000000000004";
const product = documentWorkProductSchema.parse(syntheticDocumentWorkProduct);
const labels = messages.App.documentWorkProduct;
const supabase = {rpc: mocks.rpc, storage: {from: () => ({download: mocks.download})}};
const versionId = "50000000-0000-4000-8000-000000000001";
const clientTemplate = {
  template_id: "30000000-0000-4000-8000-000000000001", template_key: "synthetic-client", template_version: "2026.09.11-v1",
  origin: "client_supplied", fingerprint: "c".repeat(64), scope: "organization",
  definition: {
    template_key: "synthetic-client", template_version: "2026.09.11-v1", origin: "client_supplied",
    colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "6B7780", warning: "A66C1F", danger: "A23B3B"},
    fonts: {display: "Founders Grotesk", body: "Founders Grotesk", pdf_display: "Helvetica", pdf_body: "Helvetica"},
    logo: null, confidentiality_label: "CONFIDENCIAL",
  },
  // The exact stored version the reader returns since stage 19, increment 5.
  structure: offroadHousePresentationStructure, version_id: versionId, version_no: 1, version_created_at: "2026-09-27T13:00:00Z",
  versions: [{version_id: versionId, version_no: 1, created_at: "2026-09-27T13:00:00Z", author_name: null, is_current: true}],
};
const templateContext = (effective: unknown) => ({
  project_id: projectId, organization_id: "20000000-0000-4000-8000-000000000001", can_manage: false,
  effective, organization: effective, project: null, pdf_fonts: ["Helvetica", "Times New Roman", "Courier New"],
});
/** The projection of the case manifest the reading was published with: kind work_product, subject case-snapshot:<session>. */
const readingRevision = (overrides: Partial<ReadFixtureInput> = {}) => artifactReadFixture({
  workId: projectId, kind: "work_product", subject: `case-snapshot:${sessionId}`, revisionId,
  legacy: {table: "case_artifact_manifests", id: manifestId, fingerprint: "f".repeat(64)}, ...overrides,
});
let reads: ReturnType<typeof artifactReadFixture>[];
let template: unknown;
let pinnedVersion: {data: unknown; error: unknown};
const params = {locale: "en-US", projectId, fingerprint: product.fingerprint, format: "docx"};
const request = (overrides = {}, query = "") => GET(new Request(`https://offroad.test/material${query}`), {params: Promise.resolve({...params, ...overrides})});
beforeEach(() => {
  vi.clearAllMocks();
  reads = [readingRevision()];
  template = templateContext(null);
  pinnedVersion = {data: null, error: {code: "P0002", message: "presentation_template_version_not_found"}};
  mocks.readable.mockResolvedValue(true);
  mocks.workspace.mockResolvedValue({supabase, organization: {id: "authenticated-organization"}});
  mocks.read.mockResolvedValue({product, publishedAt: "2026-09-08T12:05:00Z", manifestId, sessionId});
  mocks.labels.mockResolvedValue(labels);
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => artifactRpc(reads, async (other) => (
    other === "read_presentation_template_v1" ? {data: template, error: null}
      : other === "read_presentation_template_version_v1" ? pinnedVersion : {data: null, error: {code: "42883", message: "not in this test"}}
  ))(name, args));
});
describe("document work product download route", () => {
  it.each(["docx", "pdf"])("withholds %s when source rights are revoked after rendering but project access remains", async (format) => {
    mocks.readable.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      expect(render).toHaveBeenCalled();
      reads = [readingRevision({restriction: {kind: "source_rights", linkIds: [], unresolvedRevisionIds: []}})];
      return true;
    });
    const response = await request({format});
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("x-artifact-revision")).toBeNull();
    expect(response.headers.get("x-work-product-fingerprint")).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("read_artifact_revision_v1", {p_revision_id: revisionId});
  });
  it.each(["docx", "pdf"])("withholds %s when external approval is revoked after rendering", async (format) => {
    reads = [readingRevision({audience: "external", release: "released"})];
    mocks.readable.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      reads = [readingRevision({audience: "external", release: "blocked"})];
      return true;
    });
    const response = await request({format});
    expect(response.status).toBe(409);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("x-artifact-release")).toBeNull();
  });

  it("withholds a rendered file when access was revoked during rendering", async () => {
    mocks.readable.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const response = await request({format:"pdf"});
    expect(render).toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("downloads exact authorized persisted version using content locale and publication date", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.workspace).toHaveBeenCalledWith("en-US");
    expect(mocks.read).toHaveBeenCalledWith(supabase, "authenticated-organization", projectId);
    expect(mocks.labels).toHaveBeenCalledWith("pt-BR");
    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      revision: {issuedOn: "2026-09-08", template: expect.objectContaining({id: "offroad-house", origin: "offroad_house"})}, format: "docx", lang: "pt",
      policy: expect.objectContaining({types: ["documentary_reading"]}),
    }));
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-work-product-fingerprint")).toBe(product.fingerprint);
    expect(response.headers.get("x-artifact-revision")).toBe(revisionId);
    expect(response.headers.get("x-artifact-legacy")).toBe("unpinned");
    expect(response.headers.get("content-type")).toContain("wordprocessingml.document");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("content-disposition")).toContain(".docx");
    expect(mocks.rpc).toHaveBeenCalledWith("read_artifact_head_v1", {p_work_id: projectId, p_kind: "work_product", p_subject: `case-snapshot:${sessionId}`});
  });
  it("produces the final PDF from the same approved reading, with no second content path", async () => {
    const response = await request({format: "pdf"});
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({format: "pdf", revision: {issuedOn: "2026-09-08", template: expect.objectContaining({origin: "offroad_house"})}}));
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(".pdf");
    expect(response.headers.get("x-work-product-fingerprint")).toBe(product.fingerprint);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });
  it("renders with the visual identity selected for the project and binds its fingerprint", async () => {
    template = templateContext(clientTemplate);
    expect((await request()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("read_presentation_template_v1", {p_project_id: projectId});
    expect(render).toHaveBeenCalledWith(expect.objectContaining({revision: expect.objectContaining({template: expect.objectContaining({
      id: "synthetic-client", version: "2026.09.11-v1", origin: "client_supplied", fingerprint: "c".repeat(64),
      fonts: {display: "Founders Grotesk", body: "Founders Grotesk"}, pdfFonts: {display: "Helvetica", body: "Helvetica"},
      // The exact stored version travels with the identity, so the file names it.
      versionId, structure: offroadHousePresentationStructure,
    })})}));
  });
  it("falls back to the Offroad identity when the stored record is not renderable", async () => {
    template = templateContext({...clientTemplate, definition: {...clientTemplate.definition, fonts: {display: "X", body: "X", pdf_display: "Founders Grotesk", pdf_body: "X"}}});
    expect((await request()).status).toBe(200);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({revision: expect.objectContaining({template: expect.objectContaining({origin: "offroad_house"})})}));
  });
  it("renders with the exact template version the revision pins, and refuses one it cannot reproduce", async () => {
    reads = [readingRevision({legacy: undefined, traces: [`document-work-product:${product.fingerprint}`],
      sources: [{sourceVersionId: "10000000-0000-4000-8000-000000000006", rightsVersionId: null}],
      template: {templateVersionId: versionId, fingerprint: "c".repeat(64)}})];
    // The project now uses another identity: the pinned version is read by its id, not the current one.
    template = templateContext({...clientTemplate, fingerprint: "9".repeat(64), version_id: "50000000-0000-4000-8000-000000000002"});
    const version = {version_id: versionId, template_id: clientTemplate.template_id, scope: "organization", version_no: 1,
      definition: clientTemplate.definition, structure: offroadHousePresentationStructure, fingerprint: "c".repeat(64), created_at: "2026-09-27T13:00:00Z"};
    pinnedVersion = {data: version, error: null};
    const pinned = await request();
    expect(pinned.status).toBe(200);
    expect(pinned.headers.get("x-artifact-legacy")).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("read_presentation_template_version_v1", {p_version_id: versionId});
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({revision: expect.objectContaining({template: expect.objectContaining({
      origin: "client_supplied", versionId, fingerprint: "c".repeat(64)})})}));
    pinnedVersion = {data: {...version, fingerprint: "9".repeat(64)}, error: null};
    const changed = await request();
    expect(changed.status).toBe(409);
    expect(await changed.text()).toContain("visual identity recorded with this version");
    pinnedVersion = {data: null, error: {code: "P0002", message: "presentation_template_version_not_found"}};
    expect((await request()).status).toBe(409);
  });
  it.each(["xlsx", "pptx", "html"])("refuses %s, which the format policy never declares for a documentary reading", async format => {
    const response = await request({format});
    expect(response.status).toBe(404);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
  it.each([{locale: "fr-FR"}, {projectId: "bad-id"}, {fingerprint: "wrong"}])("rejects malformed path before loading data %o", async overrides => {
    expect((await request(overrides)).status).toBe(404);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
  it("returns 404 for a different valid fingerprint without generating or translating content", async () => {
    expect((await request({fingerprint: "9".repeat(64)})).status).toBe(404);
    expect(mocks.labels).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
  it("returns 404 when the reader denies stale, cross-project or absent work", async () => {
    mocks.read.mockResolvedValue(null);
    for (const format of ["docx", "pdf"]) expect((await request({format})).status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });
  it("does not load private content when workspace authorization fails", async () => {
    mocks.workspace.mockRejectedValue(new Error("unauthorized"));
    await expect(request()).rejects.toThrow("unauthorized");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
  it("serves only the revision of this reading: another manifest, subject or blocked release is refused", async () => {
    reads = [readingRevision({legacy: {table: "case_artifact_manifests", id: "10000000-0000-4000-8000-000000000099", fingerprint: "f".repeat(64)}})];
    expect((await request()).status).toBe(404);
    const older = readingRevision({revisionId: "10000000-0000-4000-8000-000000000005", isHead: false,
      legacy: {table: "case_artifact_manifests", id: "10000000-0000-4000-8000-000000000098", fingerprint: "e".repeat(64)}});
    reads = [readingRevision(), older];
    expect((await request({}, `?revision=${revisionId}`)).status).toBe(200);
    expect((await request({}, `?revision=${older.revision.id}`)).status).toBe(409);
    expect((await request({}, "?revision=10000000-0000-4000-8000-000000000777")).status).toBe(404);
    reads = [readingRevision({audience: "external", release: "blocked"})];
    expect((await request()).status).toBe(409);
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("old and new resolution decide equal", () => {
  const legacyRequest = (overrides = {}) => legacyGET(new Request("https://offroad.test/material"), {params: Promise.resolve({...params, ...overrides})});
  it.each(["docx", "pdf"])("serve the same %s bytes for the current reading, on any day", async format => {
    vi.useFakeTimers({toFake: ["Date"]});
    try {
      vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
      const before = await legacyRequest({format});
      vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
      const after = await request({format});
      expect(after.status).toBe(200);
      expect(before.status).toBe(200);
      expect(Buffer.from(await after.arrayBuffer()).equals(Buffer.from(await before.arrayBuffer()))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("refuse the same cases with the same status", async () => {
    const cases: Array<[Record<string, string>, () => void]> = [
      [{format: "xlsx"}, () => {}],
      [{fingerprint: "9".repeat(64)}, () => {}],
      [{}, () => {mocks.read.mockResolvedValue(null);}],
      [{}, () => {mocks.readable.mockResolvedValue(false);}],
    ];
    for (const [overrides, arrange] of cases) {
      arrange();
      expect((await request(overrides)).status).toBe((await legacyRequest(overrides)).status);
    }
  });
});
