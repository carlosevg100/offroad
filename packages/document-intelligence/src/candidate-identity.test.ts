import {describe, expect, it} from "vitest";
import {dedupeCandidates, documentLayerSchema, indexLayer, verifyCandidates, type RawExtractionCandidate, type VerificationContext} from "./index";

const layer = documentLayerSchema.parse({documentId: "synthetic-comparative-statement", documentVersion: 1, kind: "pdf", scaleDeclarations: [],
  pages: [{n: 1, blocks: [{id: "p1.b1", kind: "text", text: "Receita 100"}], tables: []}]});
const context: VerificationContext = {index: indexLayer(layer), layer, documentVersion: 1, profile: {documentId: layer.documentId}};
const fact: RawExtractionCandidate = {field_path: "historical_financials.2025.revenue", value_raw: "100", value_type: "number", scale: 1, currency: "BRL",
  period: {start: "2025-01-01", end: "2025-12-31", kind: "year"}, entity: {name: "Synthetic Company", scope: "standalone"}, information_class: "management",
  anchor: {kind: "block", id: "p1.b1", page: 1}, quote: "Receita 100", confidence: 0.9};

describe("candidate identity at the persistence boundary", () => {
  it.each([
    ["unknown period", {...fact, period: undefined}],
    ["different entity", {...fact, entity: {name: "Other Company", scope: "standalone"}}],
    ["different perimeter", {...fact, entity: {...fact.entity!, scope: "consolidated"}}],
    ["unknown entity", {...fact, entity: undefined}],
    ["different unit", {...fact, unit: "thousands"}],
    ["different currency", {...fact, currency: "USD"}],
    ["different information class", {...fact, information_class: "audited"}],
  ] as const)("preserves %s as a separate proposal with a separate database key", (_label, other) => {
    const out = verifyCandidates([fact, other], context).verified;
    expect(out).toHaveLength(2);
    // A multi-row upsert on this unique key must never address one row twice.
    expect(new Set(out.map(c => c.extractor_key)).size).toBe(2);
  });
  it("keeps a document/version boundary even when callers combine verified lists", () => {
    const a = verifyCandidates([fact], context).verified[0]!;
    const b = verifyCandidates([fact], {...context, documentVersion: 2}).verified[0]!;
    const c = verifyCandidates([fact], {...context, profile: {documentId: "another-synthetic-document"}}).verified[0]!;
    expect(dedupeCandidates([a, b, c])).toHaveLength(3);
  });
  it("still coalesces repeat readings of the same meaning and keeps the stronger evidence", () => {
    const out = verifyCandidates([fact, {...fact, confidence: 0.5}], context).verified;
    expect(out).toHaveLength(1); expect(out[0]!.confidence).toBe(0.9);
    expect(out[0]!.additional_anchors).toContainEqual(fact.anchor);
  });
  it("keeps keys stable across confidence changes and repeated extraction of the same fact", () => {
    const one = verifyCandidates([fact], context).verified[0]!;
    const two = verifyCandidates([{...fact, confidence: 0.5}], context).verified[0]!;
    expect(one.extractor_key).toBe(two.extractor_key);
  });
});
