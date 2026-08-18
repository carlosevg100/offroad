import {describe, expect, it} from "vitest";
import {
  computeExtractorKey,
  dedupeCandidates,
  documentLayerSchema,
  extractorOutputSchema,
  indexLayer,
  normalizeText,
  parseBoolean,
  parseDate,
  parseList,
  parseNumber,
  verifyCandidate,
  verifyCandidates,
  type DocumentLayer,
  type RawExtractionCandidate,
  type VerificationContext,
} from "./index";

const layer: DocumentLayer = documentLayerSchema.parse({
  documentId: "doc-df-2025",
  documentVersion: 1,
  kind: "pdf",
  scaleDeclarations: [{scale: 1000, where: "p11.b1", text: "(Em milhares de reais)"}],
  pages: [
    {
      n: 11,
      blocks: [
        {id: "p11.b1", kind: "heading", text: "Demonstrações do resultado — Rede Horizonte Ltda. (Em milhares de reais)"},
        {id: "p11.b2", kind: "text", text: "Exercícios findos em 31 de dezembro de 2025 e 2024"},
      ],
      tables: [],
    },
    {
      n: 12,
      blocks: [{id: "p12.b1", kind: "text", text: "Nota 14 — Empréstimos e financiamentos: saldo de R$ 54,2 milhões em 31/12/2025."}],
      tables: [
        {
          id: "p12.t1",
          header: ["Conta", "2025", "2024"],
          rows: [
            {id: "p12.t1.r1", cells: [{id: "p12.t1.r1.c1", text: "Receita líquida"}, {id: "p12.t1.r1.c2", text: "185.400"}, {id: "p12.t1.r1.c3", text: "172.900"}]},
            {id: "p12.t1.r2", cells: [{id: "p12.t1.r2.c1", text: "EBITDA"}, {id: "p12.t1.r2.c2", text: "28.900"}, {id: "p12.t1.r2.c3", text: "25.100"}]},
            {id: "p12.t1.r3", cells: [{id: "p12.t1.r3.c1", text: "Resultado financeiro"}, {id: "p12.t1.r3.c2", text: "(4.320)"}, {id: "p12.t1.r3.c3", text: "(3.980)"}]},
          ],
        },
      ],
    },
    {n: 40, blocks: [], tables: [], scanned: true},
  ],
  sheets: [
    {
      name: "ERP",
      cells: [
        {ref: "A1", v: "Receita líquida 7M26", t: "s"},
        {ref: "B1", v: 118250000, t: "n", fmt: "#,##0"},
        {ref: "B2", v: "sim", t: "s"},
      ],
    },
  ],
});

const context: VerificationContext = {
  index: indexLayer(layer),
  layer,
  profile: {documentId: "doc-df-2025", entityName: "Rede Horizonte Ltda.", periodStart: "2024-01-01", periodEnd: "2025-12-31", scale: 1000},
  documentVersion: 1,
};

const revenue: RawExtractionCandidate = {
  field_path: "historical_financials.2025.revenue",
  value_raw: "185.400",
  value_type: "number",
  scale: 1000,
  currency: "BRL",
  period: {start: "2025-01-01", end: "2025-12-31", kind: "year"},
  entity: {name: "Rede Horizonte Ltda.", scope: "consolidated"},
  information_class: "audited",
  anchor: {kind: "table_cell", id: "p12.t1.r1.c2", page: 12},
  quote: "185.400",
  confidence: 0.96,
};

describe("text helpers", () => {
  it("normalizes text for containment checks", () => {
    expect(normalizeText("  Receita   Líquida — 185.400 ")).toBe('receita liquida - 185.400');
  });

  it("parses Brazilian and international numbers, negatives, words and percents", () => {
    expect(parseNumber("185.400")?.value.toFixed()).toBe("185400");
    expect(parseNumber("185.400,50")?.value.toFixed()).toBe("185400.5");
    expect(parseNumber("1,234.5", "en-US")?.value.toFixed()).toBe("1234.5");
    expect(parseNumber("1.234", "en-US")?.value.toFixed()).toBe("1.234");
    expect(parseNumber("1,234")?.value.toFixed()).toBe("1.234");
    expect(parseNumber("(4.320)")?.value.toFixed()).toBe("-4320");
    expect(parseNumber("-1.234,00")?.value.toFixed()).toBe("-1234");
    expect(parseNumber("R$ 54 milhões")).toMatchObject({detectedScale: 1_000_000, negative: false});
    expect(parseNumber("R$ 54 milhões")?.value.toFixed()).toBe("54");
    expect(parseNumber("R$ 2,5 bi")?.detectedScale).toBe(1_000_000_000);
    expect(parseNumber("12,5%")).toMatchObject({isPercent: true});
    expect(parseNumber("12,5%")?.value.toFixed()).toBe("12.5");
    expect(parseNumber("3,2x")?.value.toFixed()).toBe("3.2");
    expect(parseNumber("sem número")).toBeNull();
  });

  it("parses dates, booleans and lists", () => {
    expect(parseDate("31/12/2025")).toBe("2025-12-31");
    expect(parseDate("2025-12-31")).toBe("2025-12-31");
    expect(parseDate("dez/25")).toBe("2025-12-31");
    expect(parseDate("07/2026")).toBe("2026-07-31");
    expect(parseDate("31 de dezembro de 2025")).toBe("2025-12-31");
    expect(parseDate("31/02/2025")).toBeNull();
    expect(parseBoolean("Sim")).toBe(true);
    expect(parseBoolean("não")).toBe(false);
    expect(parseBoolean("talvez")).toBeNull();
    expect(parseList("Recebíveis; Estoques; Imóvel da loja 3")).toEqual(["Recebíveis", "Estoques", "Imóvel da loja 3"]);
  });
});

describe("layer index", () => {
  it("indexes pages, blocks, tables, rows, cells, sheets and the whole document with the right precision", () => {
    const index = indexLayer(layer);
    expect(index.byId.get("p12.t1.r1.c2")).toMatchObject({precision: "cell", text: "185.400", page: 12});
    expect(index.byId.get("p12.t1.r1")).toMatchObject({precision: "row", text: "Receita líquida | 185.400 | 172.900"});
    expect(index.byId.get("p12.t1")?.precision).toBe("block");
    expect(index.byId.get("p12")?.precision).toBe("page");
    expect(index.byId.get("p40")).toMatchObject({precision: "page", text: ""});
    expect(index.byId.get("sERP!B1")).toMatchObject({precision: "cell", text: "118250000", sheet: "ERP"});
    expect(index.byId.get("sERP")?.precision).toBe("page");
    expect(index.byId.get("document")?.precision).toBe("document");
    expect(index.byId.get("document")?.text).toContain("Nota 14");
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      indexLayer(documentLayerSchema.parse({documentId: "d", documentVersion: 1, kind: "pdf", pages: [{n: 1, blocks: [{id: "p1.b1", kind: "text", text: "a"}, {id: "p1.b1", kind: "text", text: "b"}]}]})),
    ).toThrow(/duplicate layer id/);
  });
});

describe("verifier", () => {
  it("verifies a well-anchored material value and normalizes it with the declared scale", () => {
    const outcome = verifyCandidate(revenue, context);
    expect(outcome.kind).toBe("verified");
    if (outcome.kind !== "verified") return;
    expect(outcome.value.anchor_verified).toBe(true);
    expect(outcome.value.anchor_precision).toBe("cell");
    expect(outcome.value.verifier_flags).toEqual([]);
    expect(outcome.value.normalized_value).toBe("185400000");
    expect(outcome.value.materiality).toBe("material");
    expect(outcome.value.field_group).toBe("historical_financials");
    expect(outcome.value.extractor_key).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.value.extractor_key).toBe(
      computeExtractorKey({fieldPath: revenue.field_path, sourceDocumentId: "doc-df-2025", documentVersion: 1, anchorId: "p12.t1.r1.c2", valueRaw: "185.400"}),
    );
  });

  it("flags a quote that is not in the anchor (invented trace)", () => {
    const outcome = verifyCandidate({...revenue, quote: "Receita líquida 190.000"}, context);
    if (outcome.kind !== "verified") throw new Error("expected verified shape");
    expect(outcome.value.anchor_verified).toBe(false);
    expect(outcome.value.verifier_flags).toContain("quote_not_in_anchor");
  });

  it("flags a value that was re-formatted or altered against the anchor digits", () => {
    const outcome = verifyCandidate({...revenue, anchor: {kind: "table_row", id: "p12.t1.r1", page: 12}, quote: "Receita líquida | 185.400 | 172.900", value_raw: "185.401"}, context);
    if (outcome.kind !== "verified") throw new Error("expected verified shape");
    expect(outcome.value.anchor_verified).toBe(false);
    expect(outcome.value.verifier_flags).toEqual(expect.arrayContaining(["value_not_in_quote", "digits_not_in_anchor"]));
    expect(outcome.value.anchor_precision).toBe("row");
  });

  it("flags a missing anchor", () => {
    const outcome = verifyCandidate({...revenue, anchor: {kind: "table_cell", id: "p99.t9.r9.c9"}}, context);
    if (outcome.kind !== "verified") throw new Error("expected verified shape");
    expect(outcome.value.anchor_verified).toBe(false);
    expect(outcome.value.verifier_flags).toContain("anchor_missing");
  });

  it("keeps page-only anchors on scanned pages unverified (degraded mode)", () => {
    const outcome = verifyCandidate({...revenue, anchor: {kind: "page", id: "p40", page: 40}, quote: "Receita líquida 185.400"}, context);
    if (outcome.kind !== "verified") throw new Error("expected verified shape");
    expect(outcome.value.anchor_precision).toBe("page");
    expect(outcome.value.anchor_verified).toBe(false);
    expect(outcome.value.verifier_flags).toContain("quote_not_in_anchor");
  });

  it("uses word multipliers when the model did not set a scale, and flags conflicts", () => {
    const debt: RawExtractionCandidate = {
      field_path: "historical_financials.2025.gross_debt",
      value_raw: "R$ 54,2 milhões",
      value_type: "number",
      scale: 1,
      information_class: "audited",
      anchor: {kind: "block", id: "p12.b1", page: 12},
      quote: "saldo de R$ 54,2 milhões em 31/12/2025",
      confidence: 0.9,
    };
    const ok = verifyCandidate(debt, context);
    if (ok.kind !== "verified") throw new Error("expected verified shape");
    expect(ok.value.normalized_value).toBe("54200000");
    expect(ok.value.scale).toBe(1_000_000);
    expect(ok.value.anchor_verified).toBe(true);
    expect(ok.value.verifier_flags).not.toContain("scale_unverified");

    const conflicting = verifyCandidate({...debt, scale: 1000}, context);
    if (conflicting.kind !== "verified") throw new Error("expected verified shape");
    expect(conflicting.value.verifier_flags).toContain("scale_conflict");
  });

  it("flags an undeclared scale and a profile scale conflict", () => {
    const undeclared = verifyCandidate({...revenue, scale: 1_000_000}, {...context, layer: {scaleDeclarations: []}, profile: {...context.profile, scale: undefined}});
    if (undeclared.kind !== "verified") throw new Error("expected verified shape");
    expect(undeclared.value.verifier_flags).toContain("scale_unverified");
    expect(undeclared.value.anchor_verified).toBe(true); // scale doubts do not invent values; they route to review via confidence/policy

    const conflict = verifyCandidate({...revenue, scale: 1_000_000}, context);
    if (conflict.kind !== "verified") throw new Error("expected verified shape");
    expect(conflict.value.verifier_flags).toContain("scale_conflict");
  });

  it("does not scale percentages and ratios", () => {
    const margin: RawExtractionCandidate = {
      field_path: "customers.top_customers.1.share_pct",
      value_raw: "12,5%",
      value_type: "number",
      scale: 1000,
      information_class: "management",
      anchor: {kind: "block", id: "p12.b1", page: 12},
      quote: "12,5%",
      confidence: 0.9,
    };
    const outcome = verifyCandidate({...margin, quote: "saldo de R$ 54,2 milhões"}, context);
    if (outcome.kind !== "verified") throw new Error("expected verified shape");
    expect(outcome.value.normalized_value).toBe("12.5");
    expect(outcome.value.scale).toBe(1);
  });

  it("flags period and entity inconsistencies without rejecting", () => {
    const outcome = verifyCandidate({...revenue, period: {start: "2026-01-01", end: "2026-12-31", kind: "year"}, entity: {name: "Outra Empresa S.A.", scope: "standalone"}}, context);
    if (outcome.kind !== "verified") throw new Error("expected verified shape");
    expect(outcome.value.verifier_flags).toEqual(expect.arrayContaining(["period_outside_document", "entity_mismatch"]));
    expect(outcome.value.anchor_verified).toBe(true);
  });

  it("rejects unknown fields and reports them", () => {
    const report = verifyCandidates([{...revenue, field_path: "company.made_up_field"}], context);
    expect(report.verified).toEqual([]);
    expect(report.rejected).toEqual([{candidate: expect.objectContaining({field_path: "company.made_up_field"}), reason: "field_unknown"}]);
  });

  it("verifies spreadsheet cells, booleans and value-type mismatches", () => {
    const cell: RawExtractionCandidate = {
      field_path: "interim_financials.2026_07.revenue_7m",
      value_raw: "118250000",
      value_type: "number",
      scale: 1,
      information_class: "accounting",
      anchor: {kind: "sheet_cell", id: "sERP!B1", sheet: "ERP"},
      quote: "118250000",
      confidence: 0.98,
    };
    const outcome = verifyCandidate(cell, context);
    if (outcome.kind !== "verified") throw new Error("expected verified shape");
    expect(outcome.value.anchor_verified).toBe(true);
    expect(outcome.value.anchor_precision).toBe("cell");
    expect(outcome.value.normalized_value).toBe("118250000");

    const flag = verifyCandidate({...cell, field_path: "interim_financials.erp_reconciled", value_raw: "sim", value_type: "text", anchor: {kind: "sheet_cell", id: "sERP!B2"}, quote: "sim"}, context);
    if (flag.kind !== "verified") throw new Error("expected verified shape");
    expect(flag.value.normalized_value).toBe("true");
    expect(flag.value.verifier_flags).toContain("value_type_mismatch");
  });

  it("dedupes identical facts and keeps the extra anchors", () => {
    const first = verifyCandidate(revenue, context);
    const second = verifyCandidate({...revenue, anchor: {kind: "table_row", id: "p12.t1.r1", page: 12}, quote: "Receita líquida | 185.400", confidence: 0.8}, context);
    if (first.kind !== "verified" || second.kind !== "verified") throw new Error("expected verified shape");
    const deduped = dedupeCandidates([second.value, first.value]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.anchor.id).toBe("p12.t1.r1.c2");
    expect(deduped[0]?.additional_anchors.map((a) => a.id)).toEqual(["p12.t1.r1"]);
  });

  it("parses extractor output through the schema (defaults applied)", () => {
    const parsed = extractorOutputSchema.parse({candidates: [revenue]});
    expect(parsed.absent_fields).toEqual([]);
    expect(parsed.document_alerts).toEqual([]);
    expect(parsed.candidates[0]?.scale).toBe(1000);
  });
});
