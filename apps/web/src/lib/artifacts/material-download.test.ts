import {createHash} from "node:crypto";

import {caseExportVersion} from "@offroad/case-export";
import {materialHtmlRendererVersion} from "@offroad/case-render";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({workspace: vi.fn(), load: vi.fn(), caseState: vi.fn(), readable: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/resource-download", () => ({resourceStillReadable: mocks.readable}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: mocks.workspace}));
vi.mock("@/lib/intake/case-pipeline", () => ({resolveCaseState: mocks.caseState}));
vi.mock("@/lib/deal-state/materials", async (original) => ({
  ...await original<typeof import("@/lib/deal-state/materials")>(), loadGovernedMaterialPackage: mocks.load,
}));

import {GET as docxGET} from "@/app/[locale]/app/materials/[sessionId]/[kind]/docx/route";
import {GET as pdfGET} from "@/app/[locale]/app/materials/[sessionId]/[kind]/pdf/route";
import {GET as pptxGET} from "@/app/[locale]/app/materials/[sessionId]/[kind]/pptx/route";
import {GET as htmlGET} from "@/app/[locale]/app/materials/[sessionId]/[kind]/route";
import {legacyGET as legacyDocxGET} from "./legacy-routes/materials-docx.test-support";
import {legacyGET as legacyHtmlGET} from "./legacy-routes/materials-html.test-support";
import {legacyGET as legacyPdfGET} from "./legacy-routes/materials-pdf.test-support";
import {legacyGET as legacyPptxGET} from "./legacy-routes/materials-pptx.test-support";
import {
  governedPackage,
  legacyMaterialRead,
  materialFingerprint,
  materialProjectId,
  materialRevisionId,
  materialRowId,
  materialSessionId,
  materialSupabase,
} from "./material-fixtures.test-support";

type Handler = (request: Request, context: {params: Promise<{locale: string; sessionId: string; kind: string}>}) => Promise<Response>;
const routes: Record<"docx" | "pdf" | "pptx" | "html", {now: Handler; before: Handler}> = {
  docx: {now: docxGET, before: legacyDocxGET},
  pdf: {now: pdfGET, before: legacyPdfGET},
  pptx: {now: pptxGET, before: legacyPptxGET},
  html: {now: htmlGET, before: legacyHtmlGET},
};
const call = (handler: Handler, query = "", kind = "term_sheet", locale = "pt-BR") =>
  handler(new Request(`https://offroad.test/material${query}`), {params: Promise.resolve({locale, sessionId: materialSessionId, kind})});
const sha = (bytes: ArrayBuffer) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");
const organization = {id: "org", name: "Empresa sintética"};
let supabase: ReturnType<typeof materialSupabase>;

beforeEach(() => {
  supabase = materialSupabase();
  mocks.workspace.mockImplementation(async () => ({supabase: supabase.client, organization}));
  mocks.readable.mockResolvedValue(true);
  mocks.load.mockResolvedValue(governedPackage);
  // The old page read the case state of the day for its appendix; the new one never does.
  mocks.caseState.mockResolvedValue({reconciliation: {facts: [], calculations: []}});
});
afterEach(() => {vi.useRealTimers(); vi.resetAllMocks();});

describe("old and new resolution decide equal for the governed materials", () => {
  it.each(["docx", "pdf", "pptx"] as const)("serve the same %s bytes for the governed package, on any day", async format => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    const before = await call(routes[format].before);
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const after = await call(routes[format].now);
    expect(before.status).toBe(200);
    expect(after.status).toBe(200);
    expect(sha(await after.arrayBuffer())).toBe(sha(await before.arrayBuffer()));
    expect(after.headers.get("content-disposition")).toBe(before.headers.get("content-disposition"));
  });
  it.each(["docx", "pdf", "pptx", "html"] as const)("refuse the same cases with the same status (%s)", async format => {
    const cases: Array<[string, () => void]> = [
      ["no governed package", () => mocks.load.mockResolvedValue(null)],
      ["a material outside the plan", () => mocks.load.mockResolvedValue({...governedPackage, plannedArtifacts: []})],
      ["access revoked", () => mocks.readable.mockResolvedValue(false)],
    ];
    for (const [label, arrange] of cases) {
      mocks.load.mockResolvedValue(governedPackage);
      mocks.readable.mockResolvedValue(true);
      arrange();
      const before = await call(routes[format].before);
      const after = await call(routes[format].now);
      expect(after.status, label).toBe(before.status);
    }
    expect((await call(routes[format].now, "", "unknown_kind")).status).toBe((await call(routes[format].before, "", "unknown_kind")).status);
  });
  it("serve the same printable page, except the appendix that now comes from the revision and not from the case state of the day", async () => {
    mocks.caseState.mockResolvedValue({reconciliation: {facts: [], calculations: []}});
    const before = await (await call(routes.html.before)).text();
    const after = await (await call(routes.html.now)).text();
    expect(mocks.caseState).toHaveBeenCalledTimes(1);
    const body = (html: string) => html.slice(html.indexOf("<body>"), html.indexOf('<section class="sources">'));
    // The persisted text is the same; the new page adds one honest sentence before the appendix.
    expect(body(after)).toContain(body(before).slice(0, body(before).lastIndexOf("</p>")));
    expect(after).toContain("As referências numeradas vêm do texto desta versão.");
    expect(after).toContain("historical_financials.revenue · 2025-12-31");
    expect(after).not.toContain("DRE_2025.pdf");
  });
  it("documents the one change in what is served: a material for an external audience is not served until it is released", async () => {
    // The old route served a pending_confirmation package to anyone who could read the session.
    expect((await call(routes.docx.before)).status).toBe(200);
    supabase = materialSupabase([legacyMaterialRead({legacy: undefined, audience: "external", release: "blocked", rendered: {
      sha256: "b".repeat(64), byteLength: 10, renderer: "case-export.material-docx", rendererVersion: caseExportVersion,
      deterministicInputs: {materialFingerprint, materialKind: "term_sheet", locale: "pt"}}})]);
    const refused = await call(routes.docx.now);
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain("ainda não foi aprovada");
  });
});

describe("the materials routes serve one exact revision", () => {
  it("sets the artifact headers and keeps the bytes stable across two requests", async () => {
    for (const format of ["docx", "pdf", "pptx"] as const) {
      const first = await call(routes[format].now);
      const second = await call(routes[format].now);
      expect(first.headers.get("x-artifact-revision")).toBe(materialRevisionId);
      expect(first.headers.get("x-artifact-manifest-fingerprint")).toMatch(/^[a-f0-9]{64}$/);
      expect(first.headers.get("x-artifact-release")).toBe("internal");
      expect(first.headers.get("x-artifact-freshness")).toBe("current");
      expect(first.headers.get("x-artifact-legacy")).toBe("unpinned");
      expect(sha(await first.arrayBuffer())).toBe(sha(await second.arrayBuffer()));
    }
    expect(supabase.reads.find(read => read.table === "document_intake_sessions")?.filters).toContainEqual(["eq", ["organization_id", "org"]]);
  });
  it("resolves ?revision= exactly and refuses a revision of another subject, another work or a replaced version", async () => {
    const older = legacyMaterialRead({revisionId: "60000000-0000-4000-8000-000000000002", isHead: false, legacy: {table: "deal_state_objects", id: "50000000-0000-4000-8000-000000000002", fingerprint: "c".repeat(64)}});
    const otherSubject = legacyMaterialRead({revisionId: "60000000-0000-4000-8000-000000000003", isHead: false, subject: "materials:10000000-0000-4000-8000-000000000099"});
    const otherWork = legacyMaterialRead({revisionId: "60000000-0000-4000-8000-000000000004", isHead: false, workId: "40000000-0000-4000-8000-000000000099"});
    const otherKind = legacyMaterialRead({revisionId: "60000000-0000-4000-8000-000000000005", isHead: false, kind: "work_product",
      legacy: {table: "capital_project_artifacts", id: "50000000-0000-4000-8000-000000000005", fingerprint: "d".repeat(64)}});
    supabase = materialSupabase([legacyMaterialRead(), older, otherSubject, otherWork, otherKind]);
    expect((await call(routes.docx.now, `?revision=${materialRevisionId}`)).status).toBe(200);
    const replaced = await call(routes.docx.now, `?revision=${older.revision.id}`);
    expect(replaced.status).toBe(409);
    expect(await replaced.text()).toContain("não é mais a vigente");
    for (const revision of [otherSubject, otherWork, otherKind]) expect((await call(routes.pdf.now, `?revision=${revision.revision.id}`)).status).toBe(404);
    expect((await call(routes.pptx.now, "?revision=60000000-0000-4000-8000-000000000999")).status).toBe(404);
    expect((await call(routes.html.now, "?revision=nope")).status).toBe(404);
    expect((await call(routes.html.now, `?revision=${materialRevisionId}&revision=${materialRevisionId}`)).status).toBe(404);
  });
  it("answers the old text when the case has no current revision yet", async () => {
    supabase = materialSupabase([]);
    const response = await call(routes.docx.now);
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("O pacote aprovado ainda não está disponível.");
  });
  it("serves a released revision that pins its bytes only when the render matches them", async () => {
    const docx = Buffer.from(await (await call(routes.docx.now)).arrayBuffer());
    const pinned = (sha256: string, byteLength: number) => legacyMaterialRead({legacy: undefined, audience: "external", release: "released", format: "docx",
      rendered: {sha256, byteLength, renderer: "case-export.material-docx", rendererVersion: caseExportVersion,
        deterministicInputs: {materialFingerprint, materialKind: "term_sheet", locale: "pt", issuedOn: governedPackage.issuedOn}}});
    supabase = materialSupabase([pinned(createHash("sha256").update(docx).digest("hex"), docx.byteLength)]);
    const verified = await call(routes.docx.now);
    expect(verified.status).toBe(200);
    expect(verified.headers.get("x-artifact-content-sha256")).toBe(createHash("sha256").update(docx).digest("hex"));
    expect(verified.headers.get("x-artifact-release")).toBe("released");
    expect(verified.headers.get("x-artifact-legacy")).toBeNull();
    // Another rendering of the same revision is served without any hash claim.
    const pdf = await call(routes.pdf.now);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("x-artifact-bytes")).toBe("unpinned");
    supabase = materialSupabase([pinned("e".repeat(64), docx.byteLength)]);
    const mismatch = await call(routes.docx.now);
    expect(mismatch.status).toBe(409);
    expect(await mismatch.text()).toContain("não é igual ao registrado");
    // A pinned material whose package row is no longer the governed one is not rendered in its name.
    supabase = materialSupabase([legacyMaterialRead({legacy: undefined, audience: "internal", format: "docx",
      rendered: {sha256: "e".repeat(64), byteLength: 9, renderer: "case-export.material-docx", rendererVersion: caseExportVersion,
        deterministicInputs: {materialFingerprint: "f".repeat(64), materialKind: "term_sheet", locale: "pt"}}})]);
    expect((await call(routes.docx.now)).status).toBe(409);
  });
  it("verifies a pinned printable page without the print dialog, which is an option of the request and not of the version", async () => {
    const page = await (await call(routes.html.now)).arrayBuffer();
    supabase = materialSupabase([legacyMaterialRead({legacy: undefined, format: "html", rendered: {sha256: sha(page), byteLength: page.byteLength,
      renderer: "case-render.material-html", rendererVersion: materialHtmlRendererVersion,
      deterministicInputs: {materialFingerprint, materialKind: "term_sheet", locale: "pt", issuedOn: governedPackage.issuedOn}}})]);
    const printable = await call(routes.html.now, "?print=1");
    expect(printable.status).toBe(200);
    expect(printable.headers.get("x-artifact-content-sha256")).toBe(sha(page));
    expect(await printable.text()).toContain("window.print()");
    const plain = await call(routes.html.now);
    expect(sha(await plain.arrayBuffer())).toBe(sha(page));
  });
  it("refuses a revision whose sources the reader may not use, and one a renderer of this build cannot produce", async () => {
    supabase = materialSupabase([legacyMaterialRead({restriction: {kind: "source_rights", linkIds: ["9f000000-0000-4000-8000-000000000001"], unresolvedRevisionIds: []}})]);
    const restricted = await call(routes.html.now);
    expect(restricted.status).toBe(409);
    expect(await restricted.text()).toContain("fontes desta versão não está disponível");
    supabase = materialSupabase([legacyMaterialRead({legacy: undefined, rendered: {sha256: "e".repeat(64), byteLength: 9, renderer: "case-export.material-docx",
      rendererVersion: "2020.01.01-v0", deterministicInputs: {materialFingerprint, materialKind: "term_sheet", locale: "pt"}}})]);
    expect(await (await call(routes.docx.now)).text()).toContain("formato que esta página não produz");
  });
  it("builds the printable appendix from the revision's linked sources, never from the case state", async () => {
    const versionId = "80000000-0000-4000-8000-000000000001";
    supabase = materialSupabase([legacyMaterialRead({legacy: undefined, sources: [{sourceVersionId: versionId, rightsVersionId: null}],
      rendered: {sha256: "e".repeat(64), byteLength: 9, renderer: "case-export.material-docx", rendererVersion: caseExportVersion,
        deterministicInputs: {materialFingerprint, materialKind: "term_sheet", locale: "pt"}}})], {
      tables: {source_versions: {data: [{id: versionId, original_name: "Balanco_2025.pdf", version_no: 2}], error: null}},
    });
    const html = await (await call(routes.html.now)).text();
    expect(html).toContain("Documentos vinculados a esta versão");
    expect(html).toContain("Balanco_2025.pdf · v2");
    expect(html).not.toContain("As referências numeradas vêm do texto desta versão.");
    expect(mocks.caseState).not.toHaveBeenCalled();
    expect(supabase.reads.find(read => read.table === "source_versions")?.filters).toContainEqual(["in", ["id", [versionId]]]);
  });
  it("prints the same page for the same revision on any day", async () => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    const monday = await (await call(routes.html.now)).text();
    vi.setSystemTime(new Date("2027-02-01T12:00:00Z"));
    const later = await (await call(routes.html.now)).text();
    expect(later).toBe(monday);
    expect(later).toContain("Emitido em 2026-09-07");
    expect(mocks.load).toHaveBeenCalledWith(supabase.client, "org", materialSessionId);
    expect(governedPackage.artifactId).toBe(materialRowId);
    expect(materialProjectId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
