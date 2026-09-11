import {createHash} from "node:crypto";
import JSZip from "jszip";
import {PDFDocument} from "pdf-lib";
import {describe, expect, it} from "vitest";
import type {Material} from "@offroad/case-materials";
import {materialToDocx} from "./docx";
import {materialToPdf} from "./pdf";
import {materialToPptx} from "./presentation";
import {
  institutionalTemplateFromDefinition,
  isPdfRenderableFont,
  offroadHouseTemplateDefinition,
  pdfRenderableFonts,
  presentationTemplateFromStored,
  presentationTemplateIssues,
  presentationTemplateManifest,
  presentationTemplateToStored,
  suggestedPdfFont,
  type PresentationTemplateDefinition,
} from "./presentation-template";

const local = (pt: string, en = pt) => ({pt, en});
const material: Material = {
  kind: "credit_memo", title: local("Material sintético", "Synthetic material"), dependsOn: [],
  blocks: [
    {type: "heading", text: local("Resumo", "Summary")},
    {type: "paragraph", text: local("Amostra fictícia para avaliar o template.", "Fictional sample used to evaluate the template.")},
    {type: "table", caption: local("Cenários", "Scenarios"), head: [local("Cenário", "Scenario"), local("2027")], rows: [["Base", "100,00"]]},
  ],
};
const client: PresentationTemplateDefinition = {
  templateKey: "synthetic-client", templateVersion: "2026.09.11-v1", origin: "client_supplied",
  colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "6B7780", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Founders Grotesk", body: "Founders Grotesk", pdfDisplay: "Helvetica", pdfBody: "Helvetica"},
  confidentialityLabel: "CONFIDENCIAL · CLIENTE",
};
const fingerprint = createHash("sha256").update("synthetic-definition").digest("hex");
const templateOf = (definition: PresentationTemplateDefinition) => ({...institutionalTemplateFromDefinition(definition), fingerprint});

describe("client presentation template", () => {
  it("keeps the Offroad identity as the default and declares an explicit PDF pair", () => {
    expect(offroadHouseTemplateDefinition.origin).toBe("offroad_house");
    expect(presentationTemplateIssues(offroadHouseTemplateDefinition)).toEqual([]);
    expect(isPdfRenderableFont(offroadHouseTemplateDefinition.fonts.pdfDisplay)).toBe(true);
    expect(isPdfRenderableFont(offroadHouseTemplateDefinition.fonts.pdfBody)).toBe(true);
  });

  it("suggests an alternative for a known family and asks for a decision on an unknown one", () => {
    expect(suggestedPdfFont("Arial")).toBe("Helvetica");
    expect(suggestedPdfFont("  georgia ")).toBe("Times New Roman");
    // An unknown family returns nothing, so the surface must ask instead of deciding silently.
    expect(suggestedPdfFont("Founders Grotesk")).toBeNull();
    expect(pdfRenderableFonts).toHaveLength(3);
  });

  it("refuses a definition the renderers cannot honour instead of accepting a plausible one", () => {
    expect(presentationTemplateIssues({...client, colors: {...client.colors, ink: "nothex"}})).toContainEqual({code: "invalid_color", detail: "ink"});
    expect(presentationTemplateIssues({...client, fonts: {...client.fonts, pdfBody: "Founders Grotesk" as never}}))
      .toContainEqual({code: "unsupported_font", detail: "Founders Grotesk"});
    expect(presentationTemplateIssues({...client, templateVersion: "v1"})).toContainEqual({code: "invalid_identity", detail: "v1"});
    expect(presentationTemplateIssues({...client, logo: {objectPath: "org/logo.png", sha256: "short", byteLength: 10, contentType: "image/png"}}))
      .toContainEqual({code: "invalid_logo", detail: "org/logo.png"});
  });

  it("round-trips the stored shape without losing the PDF decision or the logo reference", () => {
    const withLogo: PresentationTemplateDefinition = {...client, logo: {objectPath: "20000000-0000-4000-8000-000000000801/logo.png", sha256: "a".repeat(64), byteLength: 1024, contentType: "image/png"}};
    const stored = presentationTemplateToStored(withLogo);
    expect((stored.fonts as Record<string, string>).pdf_display).toBe("Helvetica");
    expect(presentationTemplateFromStored(stored)).toEqual(withLogo);
    expect(presentationTemplateFromStored({...stored, colors: {...withLogo.colors, ink: "nothex"}})).toBeNull();
  });

  it("renders the Word document with the client typography, palette and identity manifest", async () => {
    const bytes = materialToDocx({material, lang: "pt", meta: {issuedOn: "2026-09-11", template: templateOf(client)}});
    const archive = await JSZip.loadAsync(bytes);
    const styles = await archive.file("word/styles.xml")!.async("string");
    // The editable format keeps the client's real family; only the PDF uses the explicit choice.
    expect(styles).toContain('w:ascii="Founders Grotesk"');
    expect(styles).not.toContain("Calibri");
    expect(styles).toContain('w:val="1B2430"');
    const core = await archive.file("docProps/core.xml")!.async("string");
    expect(core).toContain("OffroadTemplateId=synthetic-client");
    expect(core).toContain(`OffroadTemplateFingerprint=${fingerprint}`);
    expect(core).toContain("OffroadTemplateOrigin=client_supplied");
    const document = await archive.file("word/document.xml")!.async("string");
    expect(document).toContain("CONFIDENCIAL · CLIENTE");
  });

  it("renders the PDF with the explicitly chosen family and binds the identity to the file", async () => {
    const bytes = await materialToPdf({material, lang: "en", meta: {issuedOn: "2026-09-11", template: templateOf(client)}});
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getKeywords()).toContain(`OffroadTemplateFingerprint=${fingerprint}`);
    expect(parsed.getKeywords()).toContain("OffroadTemplateFonts=Founders Grotesk / Founders Grotesk (PDF: Helvetica / Helvetica)");
    // A client identity never carries the Offroad wordmark on the page.
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).not.toContain("OFFROAD>");
    expect(Buffer.compare(bytes, await materialToPdf({material, lang: "en", meta: {issuedOn: "2026-09-11", template: templateOf(client)}}))).toBe(0);
  });

  it("renders the deck with the client palette and both fingerprints in the package properties", async () => {
    const archive = await JSZip.loadAsync(await materialToPptx({material, lang: "pt", meta: {issuedOn: "2026-09-11", template: templateOf(client)}}));
    const custom = await archive.file("docProps/custom.xml")!.async("string");
    expect(custom).toContain("OffroadMaterialFingerprint");
    expect(custom).toContain("OffroadTemplateFingerprint");
    expect(custom).toContain(fingerprint);
    const slide = await archive.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain("1F4E79");
    expect(slide).toContain("Founders Grotesk");
  });

  it("refuses a PDF family the renderer does not embed rather than drawing a different one", async () => {
    const broken = {...templateOf(client), pdfFonts: {display: "Founders Grotesk", body: "Helvetica"}} as never;
    await expect(materialToPdf({material, lang: "pt", meta: {issuedOn: "2026-09-11", template: broken}}))
      .rejects.toThrow("template names a PDF font this renderer does not embed");
  });

  it("keeps the Offroad house rendering byte-identical when no template is supplied", async () => {
    const house = templateOf(offroadHouseTemplateDefinition);
    const [withNothing, withHouse] = await Promise.all([
      materialToPdf({material, lang: "pt", meta: {issuedOn: "2026-09-11"}}),
      materialToPdf({material, lang: "pt", meta: {issuedOn: "2026-09-11", template: {...house, fingerprint: undefined}}}),
    ]);
    expect(Buffer.compare(withNothing, withHouse)).toBe(0);
    expect(presentationTemplateManifest(house, fingerprint).map(entry => entry.name)).toEqual([
      "OffroadTemplateId", "OffroadTemplateVersion", "OffroadTemplateOrigin", "OffroadTemplateFingerprint", "OffroadTemplateFonts", "OffroadTemplateLogo",
    ]);
  });
});
