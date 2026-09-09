import {execFileSync} from "node:child_process";
import {mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {materialDocumentXml} from "@offroad/case-export";
import type {DocumentWorkProduct} from "@offroad/domain-contracts";
import messages from "../../../messages/pt-BR.json";
import {documentWorkProductMaterial, documentWorkProductToDocx} from "./document-work-product-material";

import {syntheticDocumentWorkProduct} from "@offroad/testing-fixtures/document-work-product";
import {documentWorkProductSchema} from "@offroad/domain-contracts";
const documentWorkProductFixture = documentWorkProductSchema.parse(syntheticDocumentWorkProduct);

const labels = messages.App.documentWorkProduct;


describe("document work product material", () => {
  it("preserves every observation, exact quote, hypothesis, question, gap and scope in editable Word", () => {
    const material = documentWorkProductMaterial(documentWorkProductFixture, labels);
    const xml = materialDocumentXml({material, lang: "pt", meta: {issuedOn: "2026-09-08"}});
    for (const section of documentWorkProductFixture.sections) expect(xml).toContain(section.title);
    for (const text of [documentWorkProductFixture.sections[0].observations[0].text, documentWorkProductFixture.sections[0].observations[0].citations[0].quote, documentWorkProductFixture.hypotheses[0].text, documentWorkProductFixture.hypotheses[0].question, documentWorkProductFixture.gaps[0].text, documentWorkProductFixture.gaps[0].question, documentWorkProductFixture.sources[0].anchor, documentWorkProductFixture.coverage.limitations[0], labels.scopeBody, labels.preliminary]) expect(xml).toContain(text);
    expect(xml).toContain(documentWorkProductFixture.sources[0].documentName);
    expect(xml).toContain(documentWorkProductFixture.sources[0].hash);
    expect(xml).not.toContain("source-1");
    expect(material.dependsOn).toEqual([documentWorkProductFixture.fingerprint]);
    expect(xml).not.toContain("provider");
    expect(documentWorkProductToDocx({product: documentWorkProductFixture, labels, issuedOn: "2026-09-08"}).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
  });
  it("keeps insufficient evidence explicit in the exported material", () => {
    const material = documentWorkProductMaterial({...documentWorkProductFixture, status: "insufficient_evidence"}, labels);
    const xml = materialDocumentXml({material, lang: "pt", meta: {issuedOn: "2026-09-08"}});
    expect(xml).toContain(labels.insufficientEvidence);
  });
  it("groups passages by exact document identity without losing references or repeating hashes", () => {
    const source = documentWorkProductFixture.sources[0];
    const product = documentWorkProductSchema.parse({...documentWorkProductFixture, sources: [source,
      {...source, id: "source-2", anchor: "Página 4", text: "Uma segunda passagem."},
      {...source, id: "source-3", documentId: "outro-contrato", hash: "e".repeat(64), text: "Outro documento com o mesmo nome."},
    ]});
    const material = documentWorkProductMaterial(product, labels);
    const tables = material.blocks.filter(block => block.type === "table");
    const sourceTables = tables.filter(block => block.caption.pt.includes(source.documentName));
    expect(sourceTables).toHaveLength(2);
    expect(sourceTables[0].rows).toEqual([["[1] Página 3", source.text], ["[2] Página 4", "Uma segunda passagem."]]);
    expect(sourceTables[1].rows).toEqual([["[3] Página 3", "Outro documento com o mesmo nome."]]);
    const xml = materialDocumentXml({material, lang: "pt", meta: {issuedOn: "2026-09-09"}});
    expect(xml.split(source.hash)).toHaveLength(2);
    expect(xml).toContain("[1]");
    expect(xml).toContain("Uma segunda passagem.");
    expect(xml).toContain("Outro documento com o mesmo nome.");
  });
  it("is deterministic for the persisted result and rejects invented assessment states", () => {
    const input = {product: documentWorkProductFixture, labels, issuedOn: "2026-09-08"};
    expect(documentWorkProductToDocx(input)).toEqual(documentWorkProductToDocx(input));
    expect(() => documentWorkProductMaterial({...documentWorkProductFixture, assessmentStatus: "approved"} as unknown as DocumentWorkProduct, labels)).toThrow();
    expect(() => documentWorkProductToDocx({...input, issuedOn: "today"})).toThrow();
  });
});


it("uses the source-table numbering in the actual downloadable Word",()=>{
  const first=documentWorkProductFixture.sources[0];
  const product=documentWorkProductSchema.parse({...documentWorkProductFixture,sources:[{...first,id:"unquoted-first",anchor:"Page 1"},first]});
  const file=join(mkdtempSync(join(tmpdir(),"offroad-word-references-")),"meeting.docx");
  writeFileSync(file,documentWorkProductToDocx({product,labels,issuedOn:"2026-09-09"}));
  const xml=execFileSync("unzip",["-p",file,"word/document.xml"]).toString();
  expect(xml).toContain('w:anchor="offroad_ref_2"');
  expect(xml).toContain('w:name="offroad_ref_2"');
  expect(xml).toContain(`[2] ${first.anchor}`);
  expect(xml).not.toContain("Referências da análise");
  expect(xml.match(/<w:bookmarkStart /g)).toHaveLength(2);
});
