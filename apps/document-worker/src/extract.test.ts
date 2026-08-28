import {describe, expect, it} from "vitest";
import type {VerifiedCandidate} from "@offroad/document-intelligence";

import {toCandidateRow, toLayerProfile} from "./extract";
import type {DocumentProfile} from "./pipeline";

const profile: DocumentProfile = {
  document_kind: "audited_financial_statements",
  information_class: "audited",
  evidence_rank: 1,
  confidence: 0.94,
  entity_name: "Rede Horizonte Alimentos S.A.",
  period_start: "2025-01-01",
  period_end: "2025-12-31",
  currency: "BRL",
  language: "pt",
  scale: 1000,
};

const candidate = (over: Partial<VerifiedCandidate> = {}): VerifiedCandidate =>
  ({
    field_path: "historical_financials.2025.revenue",
    value_raw: "185.400",
    value_type: "number",
    scale: 1000,
    information_class: "audited",
    anchor: {kind: "table_cell", id: "p12.t1.r1.c2", page: 12},
    quote: "Receita líquida | 185.400 | 172.900",
    confidence: 0.92,
    extractor_key: "a".repeat(64),
    source_document_id: "doc-1",
    document_version: 1,
    field_group: "historical_financials",
    materiality: "material",
    anchor_verified: true,
    anchor_precision: "cell",
    verifier_flags: [],
    normalized_value: "185400000",
    additional_anchors: [],
    ...over,
  }) as VerifiedCandidate;

describe("profile seam", () => {
  it("carries every field across the classifier/verifier shape boundary", () => {
    const layerProfile = toLayerProfile(profile, "doc-1");
    expect(layerProfile).toMatchObject({
      documentId: "doc-1",
      kind: "audited_financial_statements",
      informationClass: "audited",
      evidenceRank: 1,
      entityName: "Rede Horizonte Alimentos S.A.",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      currency: "BRL",
      scale: 1000,
      language: "pt",
    });
  });

  it("omits what the classifier did not establish rather than inventing it", () => {
    const bare = toLayerProfile({document_kind: "other", information_class: "company_document", evidence_rank: 7, confidence: 0.4}, "doc-2");
    expect(bare.entityName).toBeUndefined();
    expect(bare.periodEnd).toBeUndefined();
    expect(bare.scale).toBeUndefined();
  });
});

describe("candidate rows", () => {
  it("keeps the anchor and the quote together — the row is the evidence, not just the value", () => {
    const row = toCandidateRow(candidate(), {locale: "pt-BR", evidenceRank: 1});
    expect(row.source_anchor).toMatchObject({id: "p12.t1.r1.c2", kind: "table_cell", quote: "Receita líquida | 185.400 | 172.900"});
    expect(row.normalized_value).toBe(185400000);
    expect(row.raw_value).toBe("185.400");
    expect(row.value_scale).toBe(1000);
  });

  it("names the field the way the reviewer reads it, in their language", () => {
    expect(toCandidateRow(candidate(), {locale: "pt-BR", evidenceRank: 1}).label).toBe("Receita líquida");
    expect(toCandidateRow(candidate(), {locale: "en-US", evidenceRank: 1}).label).toBe("Net revenue");
  });

  it("proposes nothing as primary and accepts nothing — precedence is reconciliation's call", () => {
    const row = toCandidateRow(candidate(), {evidenceRank: 1});
    expect(row.is_primary).toBe(false);
    expect(row.extraction_method).toBe("llm_anchored");
  });

  it("records an unverified candidate with its flags instead of dropping it", () => {
    const row = toCandidateRow(candidate({anchor_verified: false, verifier_flags: ["anchor_missing"]}), {evidenceRank: 1});
    expect(row.anchor_verified).toBe(false);
    expect(row.verifier_flags).toEqual(["anchor_missing"]);
  });

  it("hands typed values to the database, not strings", () => {
    expect(toCandidateRow(candidate({value_type: "boolean", normalized_value: "true"}), {evidenceRank: 1}).normalized_value).toBe(true);
    expect(toCandidateRow(candidate({value_type: "list", normalized_value: '["Franca","Araraquara"]'}), {evidenceRank: 1}).normalized_value).toEqual(["Franca", "Araraquara"]);
    expect(toCandidateRow(candidate({value_type: "text", normalized_value: "SP"}), {evidenceRank: 1}).normalized_value).toBe("SP");
  });
});
