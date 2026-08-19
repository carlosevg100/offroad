import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";
import {indexLayer} from "@offroad/document-intelligence";
import {ParserError, detectCfbSubtype, detectType, parseDocument} from "./index";
import type {DocumentConverter, OcrEngine} from "./capabilities";

const base = {
  documentId: "55555555-5555-4555-8555-555555555555",
  documentVersion: 1,
};

/** Writes a real Office 97–2003 workbook, so the legacy path is tested on real BIFF bytes. */
function legacyWorkbook(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Conta", "Descrição", "Valor"],
    ["3.1.01", "Receita líquida", 185400.5],
    ["4.1.02", "Custo das mercadorias", -92100],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "DRE");
  const hidden = XLSX.utils.aoa_to_sheet([["Premissa", "Valor"], ["Inadimplência", 0.03]]);
  XLSX.utils.book_append_sheet(workbook, hidden, "INTERNO");
  return new Uint8Array(XLSX.write(workbook, {type: "buffer", bookType: "xls"}));
}

function legacyDocLike(stream: "WordDocument" | "PowerPoint Document"): Uint8Array {
  // A CFB container holding the stream that identifies a .doc or a .ppt.
  const container = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(container, stream, [0x01, 0x02, 0x03, 0x04]);
  return new Uint8Array(XLSX.CFB.write(container, {type: "buffer"}) as Buffer);
}

describe("legacy spreadsheets (.xls) are read, not refused", () => {
  it("reads values, sheet names and hidden tabs from a real BIFF workbook", async () => {
    const result = await parseDocument({...base, bytes: legacyWorkbook(), fileName: "balancete_2024.xls"});

    expect(result.detected.mime).toBe("application/vnd.ms-excel");
    expect(result.layer.kind).toBe("spreadsheet");

    const sheets = result.layer.sheets ?? [];
    expect(sheets.map((sheet) => sheet.name)).toEqual(["DRE", "INTERNO"]);

    const dre = sheets[0];
    expect(dre?.cells.find((cell) => cell.ref === "B2")?.v).toBe("Receita líquida");
    expect(dre?.cells.find((cell) => cell.ref === "C2")?.v).toBe(185400.5);
    expect(dre?.cells.find((cell) => cell.ref === "C3")?.v).toBe(-92100);

    // the anchors are the same shape as a modern workbook, so nothing downstream changes
    const index = indexLayer(result.layer);
    expect(index.byId.get("sDRE!C2")?.precision).toBe("cell");
    expect(index.byId.get("sDRE!C2")?.text).toBe("185400.5");
  });

  it("is deterministic despite SheetJS returning cells in insertion order", async () => {
    const bytes = legacyWorkbook();
    const first = await parseDocument({...base, bytes, fileName: "a.xls"});
    const second = await parseDocument({...base, bytes, fileName: "a.xls"});
    expect(JSON.stringify(first.layer)).toEqual(JSON.stringify(second.layer));
  });

  it("identifies the Office 97 container by its stream, not by the extension", async () => {
    const workbook = legacyWorkbook();
    expect(detectCfbSubtype(workbook)).toBe("xls");
    expect(detectCfbSubtype(legacyDocLike("WordDocument"))).toBe("doc");
    expect(detectCfbSubtype(legacyDocLike("PowerPoint Document"))).toBe("ppt");

    // a workbook renamed to .doc is still read as a workbook
    const renamed = await detectType({...base, bytes: workbook, fileName: "contrato.doc", mimeType: "application/msword"});
    expect(renamed.mime).toBe("application/vnd.ms-excel");
    expect(renamed.mismatch).toBe(true);
  });
});

describe("formats that need conversion", () => {
  const wordDoc = () => ({...base, bytes: legacyDocLike("WordDocument"), fileName: "carta.doc"});

  it("says what is missing when no converter is available", async () => {
    await expect(parseDocument(wordDoc())).rejects.toMatchObject({code: "unsupported_legacy_format"});
  });

  it("converts, parses the result and records the extra hop", async () => {
    const docx = await buildDocx("Rede Horizonte solicita R$ 35 milhões para tres lojas.");
    const converter: DocumentConverter = {
      name: "libreoffice",
      version: "25.2.0",
      supports: (mime) => mime === "application/msword",
      convert: async () => ({bytes: docx, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName: "carta.docx"}),
    };

    const result = await parseDocument(wordDoc(), {converter});

    expect(result.layer.kind).toBe("docx");
    expect(result.conversion).toEqual({
      from: "application/msword",
      to: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      by: "libreoffice",
      version: "25.2.0",
    });
    expect(result.parserVersions.libreoffice).toBe("25.2.0");
    // the conversion is visible to a reviewer, not silent
    expect(result.warnings.some((warning) => warning.message.includes("after conversion"))).toBe(true);
    expect(result.layer.sections?.[0]?.paragraphs[0]?.text).toContain("Rede Horizonte");
  });

  it("refuses a converter that returns nothing usable", async () => {
    const empty: DocumentConverter = {
      name: "broken",
      version: "0",
      supports: () => true,
      convert: async () => ({bytes: new Uint8Array(0), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName: "x.docx"}),
    };
    await expect(parseDocument(wordDoc(), {converter: empty})).rejects.toBeInstanceOf(ParserError);
  });
});

describe("images and scans", () => {
  // 1×1 PNG
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (character) => character.charCodeAt(0),
  );

  const engine = (blocks: {text: string; confidence: number}[]): OcrEngine => ({
    name: "tesseract",
    version: "5.5.0",
    languages: ["por", "eng"],
    recognizeImage: async () => ({blocks, confidence: 0.9}),
  });

  it("keeps an image honest when there is no OCR engine", async () => {
    const result = await parseDocument({...base, bytes: png, fileName: "balanco.png"});
    expect(result.layer.kind).toBe("image");
    expect(result.layer.pages?.[0]?.scanned).toBe(true);
    expect(result.layer.pages?.[0]?.blocks).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === "no_text")).toBe(true);
  });

  it("reads an image through OCR but keeps the page marked as a scan", async () => {
    const result = await parseDocument(
      {...base, bytes: png, fileName: "balanco.png"},
      {ocr: engine([{text: "Receita líquida 185.400", confidence: 0.91}])},
    );

    const page = result.layer.pages?.[0];
    expect(page?.blocks[0]?.text).toBe("Receita líquida 185.400");
    expect(page?.blocks[0]?.id).toBe("p1.b1");
    // still a scan: this is what keeps OCR values out of automatic acceptance
    expect(page?.scanned).toBe(true);
    expect(result.parserVersions.tesseract).toBe("5.5.0");
    indexLayer(result.layer);
  });

  it("drops text the engine is not confident about instead of quoting it", async () => {
    const result = await parseDocument(
      {...base, bytes: png, fileName: "borrado.png"},
      {ocr: engine([{text: "1B5.4OO", confidence: 0.2}, {text: "Receita", confidence: 0.95}])},
    );
    const texts = result.layer.pages?.[0]?.blocks.map((block) => block.text) ?? [];
    expect(texts).toEqual(["Receita"]);
    expect(result.warnings.some((warning) => warning.message.includes("confidence floor"))).toBe(true);
  });
});

/** Minimal but real .docx, used as the output of the fake converter. */
async function buildDocx(text: string): Promise<Uint8Array> {
  const {default: JSZip} = await import("jszip");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
       <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
       <Default Extension="xml" ContentType="application/xml"/>
       <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
     </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
       <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
     </Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
       <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
     </w:document>`,
  );
  return new Uint8Array(await zip.generateAsync({type: "uint8array", compression: "DEFLATE"}));
}
