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
  it("is deterministic for the persisted result and rejects invented assessment states", () => {
    const input = {product: documentWorkProductFixture, labels, issuedOn: "2026-09-08"};
    expect(documentWorkProductToDocx(input)).toEqual(documentWorkProductToDocx(input));
    expect(() => documentWorkProductMaterial({...documentWorkProductFixture, assessmentStatus: "approved"} as unknown as DocumentWorkProduct, labels)).toThrow();
    expect(() => documentWorkProductToDocx({...input, issuedOn: "today"})).toThrow();
  });
});
