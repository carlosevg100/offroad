import {beforeEach, describe, expect, it, vi} from "vitest";
import {syntheticDocumentWorkProduct} from "@offroad/testing-fixtures/document-work-product";
import {documentWorkProductSchema} from "@offroad/domain-contracts";
import {GET} from "./route";
const mocks = vi.hoisted(() => ({workspace: vi.fn(), read: vi.fn(), labels: vi.fn(), docx: vi.fn(), pdf: vi.fn(), rpc: vi.fn(), download: vi.fn()}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/advisor/document-work-product-reader", () => ({loadDocumentWorkProduct: mocks.read}));
vi.mock("@/lib/advisor/document-work-product-labels", () => ({documentWorkProductLabels: mocks.labels}));
vi.mock("@/lib/advisor/document-work-product-material", () => ({documentWorkProductToDocx: mocks.docx, documentWorkProductToPdf: mocks.pdf}));
const projectId = "10000000-0000-4000-8000-000000000001";
const product = documentWorkProductSchema.parse(syntheticDocumentWorkProduct);
const labels = {meetingTitle: "Preserved locale"};
const supabase = {rpc: mocks.rpc, storage: {from: () => ({download: mocks.download})}};
const clientTemplate = {
  template_id: "30000000-0000-4000-8000-000000000001", template_key: "synthetic-client", template_version: "2026.09.11-v1",
  origin: "client_supplied", fingerprint: "c".repeat(64), scope: "organization",
  definition: {
    template_key: "synthetic-client", template_version: "2026.09.11-v1", origin: "client_supplied",
    colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "6B7780", warning: "A66C1F", danger: "A23B3B"},
    fonts: {display: "Founders Grotesk", body: "Founders Grotesk", pdf_display: "Helvetica", pdf_body: "Helvetica"},
    logo: null, confidentiality_label: "CONFIDENCIAL",
  },
};
const templateContext = (effective: unknown) => ({
  project_id: projectId, organization_id: "20000000-0000-4000-8000-000000000001", can_manage: false,
  effective, organization: effective, project: null, pdf_fonts: ["Helvetica", "Times New Roman", "Courier New"],
});
const params = {locale: "en-US", projectId, fingerprint: product.fingerprint, format: "docx"};
const request = (overrides = {}) => GET(new Request("https://offroad.test/material"), {params: Promise.resolve({...params, ...overrides})});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({supabase, organization: {id: "authenticated-organization"}});
  mocks.read.mockResolvedValue({product, publishedAt: "2026-09-08T12:05:00Z"});
  mocks.labels.mockResolvedValue(labels);
  mocks.docx.mockReturnValue(new Uint8Array([80, 75, 3, 4]));
  mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  mocks.rpc.mockResolvedValue({data: templateContext(null), error: null});
});
describe("document work product download route", () => {
  it("downloads exact authorized persisted version using content locale and publication date", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.workspace).toHaveBeenCalledWith("en-US");
    expect(mocks.read).toHaveBeenCalledWith(supabase, "authenticated-organization", projectId);
    expect(mocks.labels).toHaveBeenCalledWith("pt-BR");
    expect(mocks.docx).toHaveBeenCalledWith({product, labels, issuedOn: "2026-09-08", template: expect.objectContaining({id: "offroad-house", origin: "offroad_house"})});
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(await response.arrayBuffer()).toEqual(new Uint8Array([80, 75, 3, 4]).buffer);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-work-product-fingerprint")).toBe(product.fingerprint);
    expect(response.headers.get("content-type")).toContain("wordprocessingml.document");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("content-disposition")).toContain(".docx");
  });
  it("produces the final PDF from the same approved reading, with no second content path", async () => {
    const response = await request({format: "pdf"});
    expect(response.status).toBe(200);
    expect(mocks.pdf).toHaveBeenCalledWith({product, labels, issuedOn: "2026-09-08", template: expect.objectContaining({origin: "offroad_house"})});
    expect(mocks.docx).not.toHaveBeenCalled();
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(".pdf");
    expect(response.headers.get("x-work-product-fingerprint")).toBe(product.fingerprint);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });
  it("renders with the visual identity selected for the project and binds its fingerprint", async () => {
    mocks.rpc.mockResolvedValue({data: templateContext(clientTemplate), error: null});
    expect((await request()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("read_presentation_template_v1", {p_project_id: projectId});
    expect(mocks.docx).toHaveBeenCalledWith(expect.objectContaining({template: expect.objectContaining({
      id: "synthetic-client", version: "2026.09.11-v1", origin: "client_supplied", fingerprint: "c".repeat(64),
      fonts: {display: "Founders Grotesk", body: "Founders Grotesk"}, pdfFonts: {display: "Helvetica", body: "Helvetica"},
    })}));
  });
  it("falls back to the Offroad identity when the stored record is not renderable", async () => {
    const broken = {...clientTemplate, definition: {...clientTemplate.definition, fonts: {display: "X", body: "X", pdf_display: "Founders Grotesk", pdf_body: "X"}}};
    mocks.rpc.mockResolvedValue({data: templateContext(broken), error: null});
    expect((await request()).status).toBe(200);
    expect(mocks.docx).toHaveBeenCalledWith(expect.objectContaining({template: expect.objectContaining({origin: "offroad_house"})}));
  });
  it.each(["xlsx", "pptx", "html"])("refuses %s, which the format policy never declares for a documentary reading", async format => {
    const response = await request({format});
    expect(response.status).toBe(404);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.docx).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it.each([{locale: "fr-FR"}, {projectId: "bad-id"}, {fingerprint: "wrong"}])("rejects malformed path before loading data %o", async overrides => {
    expect((await request(overrides)).status).toBe(404);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.docx).not.toHaveBeenCalled();
  });
  it("returns 404 for a different valid fingerprint without generating or translating content", async () => {
    expect((await request({fingerprint: "9".repeat(64)})).status).toBe(404);
    expect(mocks.labels).not.toHaveBeenCalled();
    expect(mocks.docx).not.toHaveBeenCalled();
  });
  it("returns 404 when the reader denies stale, cross-project or absent work", async () => {
    mocks.read.mockResolvedValue(null);
    for (const format of ["docx", "pdf"]) expect((await request({format})).status).toBe(404);
    expect(mocks.docx).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("does not load private content when workspace authorization fails", async () => {
    mocks.workspace.mockRejectedValue(new Error("unauthorized"));
    await expect(request()).rejects.toThrow("unauthorized");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.docx).not.toHaveBeenCalled();
  });
});
