import {execFileSync} from "node:child_process";
import {mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import type {Material} from "@offroad/case-materials";

import {crc32, materialDocumentXml, materialToDocx, zipStored} from "./index";

const material: Material = {
  kind: "term_sheet",
  title: {pt: "Term Sheet indicativo", en: "Indicative Term Sheet"},
  dependsOn: [],
  blocks: [
    {type: "heading", text: {pt: "Termos", en: "Terms"}},
    {type: "paragraph", text: {pt: "Valor de R$ 42.300.000 <condicionado>.", en: "Amount of R$ 42,300,000 <conditional>."}, supportIds: ["transaction.requested_amount"]},
    {type: "kv", caption: {pt: "Definições", en: "Definitions"}, rows: [{label: {pt: "Dívida líquida", en: "Net debt"}, value: {pt: "Dívida bruta menos caixa", en: "Gross debt less cash"}, note: {pt: "IFRS", en: "IFRS"}}]},
    {type: "table", caption: {pt: "Cronograma", en: "Schedule"}, head: [{pt: "Ano", en: "Year"}, {pt: "Valor", en: "Amount"}], rows: [["2027", "10.000.000"], ["2028", "12.000.000"]]},
    {type: "disclaimer", text: {pt: "Indicativo.", en: "Indicative."}},
  ],
};

describe("materialToDocx", () => {
  it("writes the blocks in order, escapes the XML, and keeps the support ids", () => {
    const xml = materialDocumentXml({material, lang: "pt", meta: {issuedOn: "2026-08-21", companyName: "Aurora"}});
    expect(xml).toContain("Term Sheet indicativo");
    expect(xml).toContain("&lt;condicionado&gt;");
    expect(xml).toContain("[transaction.requested_amount]");
    expect(xml.indexOf("Termos")).toBeLessThan(xml.indexOf("Definições"));
    expect(xml.indexOf("Definições")).toBeLessThan(xml.indexOf("Cronograma"));
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml).toContain("Aurora · Emitido em 2026-08-21");
  });

  it("is deterministic and is a valid zip with the seven parts", () => {
    const a = materialToDocx({material, lang: "en", meta: {issuedOn: "2026-08-21"}});
    const b = materialToDocx({material, lang: "en", meta: {issuedOn: "2026-08-21"}});
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(a[0]).toBe(0x50);
    expect(a[1]).toBe(0x4b);
    const dir = mkdtempSync(join(tmpdir(), "docx-"));
    const file = join(dir, "material.docx");
    writeFileSync(file, a);
    const listing = execFileSync("unzip", ["-l", file]).toString();
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/footer1.xml", "docProps/core.xml", "word/_rels/document.xml.rels"]) expect(listing).toContain(part);
    expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
  });

  it("computes CRC-32 as the zip standard does", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
    expect(zipStored([]).length).toBe(22);
  });
});
