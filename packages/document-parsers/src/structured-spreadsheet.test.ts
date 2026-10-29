import JSZip from "jszip";
import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";

import {detectType, parseDocument} from "./index";

const base = {documentId: "55555555-5555-4555-8555-555555555555", documentVersion: 1};
const encode = (value: string) => new TextEncoder().encode(value);
function workbook(bookType: XLSX.BookType) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Conta", "Valor"], ["Receita", 1250.5], ["Custo", -425]]), "DRE");
  return new Uint8Array(XLSX.write(book, {type: "buffer", bookType}));
}

describe("native spreadsheet formats reach their implemented reader", () => {
  it.each(["xlsx", "xls", "xlsb", "ods", "fods", "dbf"] as const)("reads real %s bytes and keeps numeric cell anchors", async (format) => {
    const result = await parseDocument({...base, fileName: `synthetic.${format}`, bytes: workbook(format)});
    const cells = result.layer.sheets?.[0]?.cells;
    expect(cells?.find((cell) => cell.ref === "B2")?.v).toBe(1250.5);
    expect(cells?.find((cell) => cell.ref === "B3")?.v).toBe(-425);
  });

  it.each(["xlsb", "fods", "dbf"] as const)("recognizes %s from bytes despite a false name and MIME", async (format) => {
    const result = await detectType({...base, fileName: "disguised.pdf", mimeType: "application/pdf", bytes: workbook(format)});
    expect(result.extension).toBe(format);
    expect(result.mismatch).toBe(true);
  });

  it("does not identify a file by an .xlsb extension alone", async () => {
    const zip = new JSZip();
    zip.file("some-document.txt", "synthetic");
    const result = await detectType({...base, fileName: "fake.xlsb", bytes: await zip.generateAsync({type: "uint8array"})});
    expect(result.mime).toBe("application/zip");
  });

  it("does not identify generic XML or forged namespace declarations as FODS", async () => {
    for (const source of ['<?xml version="1.0"?><data><value>10</value></data>',
      '<?xml version="1.0"?><office:document xmlns:office="https://invalid.example" office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet/></office:body></office:document>']) {
      const result = await detectType({...base, fileName: "fake.fods", bytes: encode(source)});
      expect(result.mime).not.toBe("application/vnd.oasis.opendocument.spreadsheet");
    }
  });

  it("does not expand a DTD to establish FODS identity", async () => {
    const bytes = encode('<?xml version="1.0"?><!DOCTYPE office:document [<!ENTITY x "abc">]><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet>&x;</office:spreadsheet></office:body></office:document>');
    expect((await detectType({...base, fileName: "entity.fods", bytes})).mime).not.toBe("application/vnd.oasis.opendocument.spreadsheet");
  });

  it.each(["truncated", "length", "terminator"])("refuses DBF identity when its %s structure is broken", async (fault) => {
    let bytes = workbook("dbf");
    if (fault === "truncated") bytes = bytes.subarray(0, bytes.length - 20);
    if (fault === "length") bytes[10] = bytes[10]! + 1;
    if (fault === "terminator") bytes[96] = 0;
    const result = await detectType({...base, fileName: "broken.dbf", bytes});
    expect(result.mime).not.toBe("application/x-dbf");
  });
});
