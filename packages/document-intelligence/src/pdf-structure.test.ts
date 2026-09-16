import {readFileSync} from "node:fs";
import {PDFDocument, PDFName, PDFString} from "pdf-lib";
import {describe, expect, it} from "vitest";
import {inspectPdfStructure} from "./pdf-structure";

const budget = 8 * 1024 * 1024;
const rawPdf = (dictionary: string) => new TextEncoder().encode(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${dictionary} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`);

describe("bounded PDF structural inspection", () => {
  it("does not treat encoded image bytes in the real synthetic memorial as JavaScript", async () => {
    const bytes = new Uint8Array(readFileSync("../testing-fixtures/assets/rede-horizonte/07_Memorial_Descritivo_Expansao_3_Lojas.pdf"));
    expect(Buffer.from(bytes).toString("latin1")).toMatch(/\/JS\b/);
    expect(await inspectPdfStructure(bytes, budget)).toEqual({limited: false, malformed: false, encrypted: false, script: false, embedded: false});
  });
  it("detects escaped JavaScript names and additional actions in actual dictionaries", async () => {
    for (const dictionary of ["/J#53 (app.alert) ", "/AA << /O << /S /JavaScript /JS (x) >> >>", "/OpenAction 2 0 R"]) {
      expect(await inspectPdfStructure(rawPdf(dictionary), budget)).toMatchObject({malformed: false, script: true});
    }
  });
  it("detects JavaScript inside compressed PDF object streams", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const action = pdf.context.register(pdf.context.obj({S: "JavaScript", JS: PDFString.of("app.alert('x')")}));
    pdf.catalog.set(PDFName.of("OpenAction"), action);
    const bytes = await pdf.save({useObjectStreams: true});
    expect(await inspectPdfStructure(bytes, budget)).toMatchObject({malformed: false, script: true});
  });
  it("preserves encryption and embedded-object rejection without scanning literal strings", async () => {
    expect(await inspectPdfStructure(rawPdf("/Encrypt 2 0 R"), budget)).toMatchObject({encrypted: true});
    expect(await inspectPdfStructure(rawPdf("/Names << /EmbeddedFiles << /Names [(file) << /Type /Filespec >>] >> >>"), budget)).toMatchObject({embedded: true});
    expect(await inspectPdfStructure(rawPdf("/Title (/JavaScript /JS /Encrypt /EmbeddedFile)"), budget)).toMatchObject({encrypted: false, script: false, embedded: false});
  });
  it("stops object-stream inflation at the inspection budget before parsing its objects", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    pdf.context.register(pdf.context.flateStream(new Uint8Array(32_000).fill(32), {Type: "ObjStm", N: 1, First: 4}));
    expect(await inspectPdfStructure(await pdf.save({useObjectStreams: false}), 128)).toMatchObject({limited: true});
  });
  it("fails closed on excessive nesting and malformed containers", async () => {
    expect(await inspectPdfStructure(rawPdf(`/Nested ${"[".repeat(80)}1${"]".repeat(80)}`), budget)).toMatchObject({limited: true});
    expect(await inspectPdfStructure(new TextEncoder().encode("%PDF-1.7\ninvalid\n%%EOF"), budget)).toMatchObject({malformed: true});
  });
});
