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
    expect(xml).toContain("transaction.requested_amount");
    expect(xml).toContain('w:anchor="offroad_ref_1"');
    expect(xml).toContain('w:name="offroad_ref_1"');
    expect(xml.indexOf("transaction.requested_amount")).toBeGreaterThan(xml.indexOf("Cronograma"));
    expect(xml.indexOf("Termos")).toBeLessThan(xml.indexOf("Definições"));
    expect(xml.indexOf("Definições")).toBeLessThan(xml.indexOf("Cronograma"));
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml).toContain("<w:cantSplit/>");
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
    const footer = execFileSync("unzip", ["-p", file, "word/footer1.xml"]).toString();
    expect(footer).toContain('w:instr="PAGE"');
    expect(footer).toContain('w:instr="NUMPAGES"');
    expect(execFileSync("unzip", ["-p", file, "word/styles.xml"]).toString()).toContain('w:lang w:val="en-US"');
  });

  it("deduplicates references and makes metrics and terms navigate to their exact evidence", () => {
    const referenced: Material = {...material, blocks: [...material.blocks,
      {type: "metrics", items: [{label: {pt: "Caixa", en: "Cash"}, value: "25", formatted: {pt: "R$ 25", en: "R$ 25"}, supportIds: ["cash", "cash"]}]},
      {type: "kv", rows: [{label: {pt: "Termo", en: "Term"}, value: {pt: "Condição", en: "Condition"}, supportIds: ["cash"]}]},
      {type: "callout", title: {pt: "Decisão", en: "Decision"}, items: [{label: {pt: "Base", en: "Basis"}, value: {pt: "Pendente", en: "Pending"}, supportIds: ["source:<exact>&reference"]}]},
    ]};
    const xml = materialDocumentXml({material: referenced, lang: "en", meta: {issuedOn: "2026-09-09"}});
    expect(xml.match(/<w:bookmarkStart /g)).toHaveLength(3);
    expect(xml.match(/w:anchor="offroad_ref_2"/g)).toHaveLength(2);
    expect(xml).toContain("source:&lt;exact&gt;&amp;reference");
    expect(xml).toContain("Analysis references");
    expect(xml).toContain("R$ 25");
  });

  it("computes CRC-32 as the zip standard does", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
    expect(zipStored([]).length).toBe(22);
  });
});


describe("source-table reference navigation",()=>{
  const referenced:Material={...material,blocks:[
    {type:"paragraph",text:{pt:"Primeira leitura.",en:"First reading."},supportIds:["3"]},
    {type:"paragraph",text:{pt:"Segunda leitura.",en:"Second reading."},supportIds:["1"]},
    {type:"table",caption:{pt:"Documento",en:"Document"},head:[{pt:"Fonte",en:"Source"}],rows:[["[1] Page 1"],["[3] Page 3"]]},
  ]};
  const targets=[{id:"1",number:1,blockIndex:2,rowIndex:0},{id:"3",number:3,blockIndex:2,rowIndex:1}];
  it("links directly to source rows without renumbering or producing a duplicate appendix",()=>{
    const xml=materialDocumentXml({material:referenced,lang:"en",meta:{issuedOn:"2026-09-09",referenceTargets:targets}});
    expect(xml).toContain('w:anchor="offroad_ref_3"');
    expect(xml).toContain('w:name="offroad_ref_3"');
    expect(xml.indexOf('w:anchor="offroad_ref_3"')).toBeLessThan(xml.indexOf("Second reading."));
    expect(xml).not.toContain("Analysis references");
    expect(xml.match(/<w:bookmarkStart /g)).toHaveLength(2);
    expect(xml).toContain("[3] Page 3");
  });
  it("rejects missing, ambiguous and non-table targets",()=>{
    for(const referenceTargets of [targets.slice(1),[...targets,targets[0]!],[{...targets[0]!,blockIndex:0},targets[1]!],[{...targets[0]!,rowIndex:99},targets[1]!]]){
      expect(()=>materialDocumentXml({material:referenced,lang:"en",meta:{issuedOn:"2026-09-09",referenceTargets}})).toThrow();
    }
  });
});
