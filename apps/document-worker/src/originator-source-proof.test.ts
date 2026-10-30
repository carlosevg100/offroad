import {createHash} from "node:crypto";
import {beforeAll, describe, expect, it} from "vitest";
import type {OriginatorCreditReviewFacts} from "@offroad/financial-model";
import {proveOriginatorCaseSources, type OriginatorAuthorizedLayer} from "./originator-source-proof";
import {financialModelFixture} from "./lote2-premises.test-support";
let originatorCreditReviewFixture: () => OriginatorCreditReviewFacts;
beforeAll(async () => {const s = await financialModelFixture<{originatorCreditReviewFixture: () => OriginatorCreditReviewFacts}>("originator-credit-review.test-support.ts"); originatorCreditReviewFixture = s.originatorCreditReviewFixture;}, 120000);

function fixture() {
  const f = originatorCreditReviewFixture();
  const facts = {caseId: "44444444-4444-4444-8444-444444444441", entityId: "44444444-4444-4444-8444-444444444442", perimeter: f.perimeter, currency: f.currency, openingDate: "2024-01-01", readingDate: f.analysisDate, definitionVersionId: "44444444-4444-4444-8444-444444444443", kind: "credit", facts: f, sectionOrigins: {}};
  const documents: OriginatorAuthorizedLayer[] = f.sources.map(s => {
    const layerJson = JSON.stringify({documentId: s.documentId, documentVersion: 1, kind: "pdf", scaleDeclarations: [], stats: {}, pages: [{n: 1, blocks: [{id: "p1.b1", kind: "text", text: s.quote}], tables: [], scanned: false}]});
    return {documentId: s.documentId, sourceVersionId: s.sourceVersionId, documentSha256: s.sha256, layerJson, layerSha256: createHash("sha256").update(layerJson).digest("hex")};
  });
  return {facts, documents};
}
describe("originator source integrity before premise proposal", () => {
  it("accepts the exact cited passages from the authorized immutable versions", () => {const f = fixture(); expect(proveOriginatorCaseSources(f.facts, f.documents)).toEqual({ok: true, issues: []});});
  it("refuses a source pointer absent from the authorized set", () => {const f = fixture(); f.documents.shift(); expect(proveOriginatorCaseSources(f.facts, f.documents).issues[0]?.code).toBe("source_version_not_in_authorized_layers");});
  it("refuses a different immutable version even when its text is identical", () => {const f = fixture(); f.documents[0]!.sourceVersionId = "55555555-5555-4555-8555-555555555555"; expect(proveOriginatorCaseSources(f.facts, f.documents).ok).toBe(false);});
  it("refuses a changed native document hash", () => {const f = fixture(); f.facts.facts.sources[0]!.sha256 = "a".repeat(64); expect(proveOriginatorCaseSources(f.facts, f.documents).issues[0]?.code).toBe("source_document_hash_mismatch");});
  it("refuses a quoted value absent from the actual layer", () => {const f = fixture(); f.facts.facts.sources[0]!.quote += " invented passage"; expect(proveOriginatorCaseSources(f.facts, f.documents).issues[0]?.code).toBe("source_quote_not_in_authorized_layer");});
  it("refuses the right quote attached to the wrong page", () => {const f = fixture(); f.facts.facts.sources[0]!.anchor = "page:2"; expect(proveOriginatorCaseSources(f.facts, f.documents).issues[0]?.code).toBe("source_anchor_missing_or_ambiguous");});
  it("does not treat an input document as a public query performed by the platform", () => {const f = fixture(); f.facts.facts.sources[0]!.origin = "authorized_public_query"; expect(proveOriginatorCaseSources(f.facts, f.documents).issues[0]?.code).toBe("public_query_execution_receipt_missing");});
  it("refuses a tampered stored layer before reading its text", () => {const f = fixture(); f.documents[0]!.layerJson += " "; expect(() => proveOriginatorCaseSources(f.facts, f.documents)).toThrow("layer_hash_mismatch");});
  it("refuses a layer whose embedded document identity differs", () => {const f = fixture(); const layer = JSON.parse(f.documents[0]!.layerJson); layer.documentId = "55555555-5555-4555-8555-555555555555"; f.documents[0]!.layerJson = JSON.stringify(layer); f.documents[0]!.layerSha256 = createHash("sha256").update(f.documents[0]!.layerJson).digest("hex"); expect(() => proveOriginatorCaseSources(f.facts, f.documents)).toThrow("layer_document_mismatch");});
});
