import {describe, expect, it} from "vitest";

import type {DocumentLayer} from "@offroad/document-intelligence";
import {resolveMandate, type DealRequest, type Mandate} from "@offroad/fund-mandate";

import {
  buildCaseChunks,
  mandateIdsPassingHardFilters,
  sha256,
  validateGroundedStatements,
  type RetrievalResult,
} from "./index";

const orgA = "org-a";
const sessionA = "session-a";
const opportunityA = "opportunity-a";
function citedResult(): RetrievalResult {
  return {requestFingerprint: "fixture", retrieved: [], citations: [{key: "fact-1", label: "Synthetic citation", anchor: {}}], abstained: false,
    excluded: {scope: 0, version: 0, mandate: 0, governance: 0, relevance: 0}};
}

describe("case chunks", () => {
  it("turns every document container into bounded, anchored chunks", () => {
    const layer: DocumentLayer = {
      documentId: "doc-a",
      documentVersion: 1,
      kind: "pdf",
      pages: [{n: 1, scanned: false, blocks: [{id: "p1.b1", kind: "text", text: "Receita líquida de R$ 185 milhões e dívida de R$ 60 milhões."}], tables: []}],
      scaleDeclarations: [],
      stats: {pageCount: 1},
    };
    const chunks = buildCaseChunks({
      organizationId: orgA,
      intakeSessionId: sessionA,
      opportunityId: opportunityA,
      sourceDocumentId: "doc-a",
      documentVersion: 1,
      sourceLabel: "Demonstrações financeiras",
      layer,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      organizationId: orgA,
      opportunityId: opportunityA,
      citation: {anchor: {kind: "page", id: "p1", page: 1}},
    });
  });

  it("splits large containers without inventing an anchor", () => {
    const layer: DocumentLayer = {
      documentId: "doc-a",
      documentVersion: 1,
      kind: "docx",
      sections: [{id: "sec1", heading: "Plano", paragraphs: [{id: "sec1.p1", kind: "text", text: "expansão ".repeat(200)}], tables: []}],
      scaleDeclarations: [],
      stats: {},
    };
    const chunks = buildCaseChunks({organizationId: orgA, intakeSessionId: sessionA, sourceDocumentId: "doc-a", documentVersion: 1, sourceLabel: "Plano", layer, maxCharacters: 200});
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((entry) => entry.content.length <= 200)).toBe(true);
    expect(chunks.every((entry) => entry.citation.anchor.id === "sec1")).toBe(true);
  });

  it("indexes a large operational tape as a bounded schema digest", () => {
    const layer: DocumentLayer = {
      documentId: "doc-a",
      documentVersion: 1,
      kind: "csv",
      sheets: [{
        name: "CARTEIRA",
        hidden: false,
        cells: [
          {ref: "A1", v: "titulo", t: "s" as const},
          {ref: "B1", v: "sacado", t: "s" as const},
          {ref: "C1", v: "valor", t: "s" as const},
          ...Array.from({length: 5_100}, (_, index) => ({
            ref: `A${index + 2}`,
            v: `titulo-confidencial-${index + 1}`,
            t: "s" as const,
          })),
        ],
        tables: [],
      }],
      scaleDeclarations: [],
      stats: {sheetCount: 1},
    };

    const chunks = buildCaseChunks({
      organizationId: orgA,
      intakeSessionId: sessionA,
      sourceDocumentId: "doc-a",
      documentVersion: 1,
      sourceLabel: "Carteira de recebíveis",
      layer,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("Base operacional: Carteira de recebíveis");
    expect(chunks[0]?.content).toContain("A: titulo | B: sacado | C: valor");
    expect(chunks[0]?.content).not.toContain("titulo-confidencial-5100");
    expect(chunks[0]).toMatchObject({
      citation: {anchor: {id: "sCARTEIRA", representation: "schema_digest"}},
      tags: expect.arrayContaining(["operational_tape", "schema_digest", "full_evidence_preserved"]),
    });
  });
});

describe("hard filters and grounded output", () => {
  it("allows notes only for mandates that fit every structured criterion", () => {
    const deal: DealRequest = {
      amount: "40000000",
      termMonths: 48,
      sector: "Varejo",
      geography: "SP",
      instruments: ["ccb"],
      collateral: ["recebiveis"],
      leverage: "2.0",
      dscr: "1.5",
    };
    const fitting = resolveMandate(mandate("fits", "10000000", "80000000"), {asOf: "2026-08-24"});
    const excluded = resolveMandate(mandate("excluded", "1000000", "5000000"), {asOf: "2026-08-24"});
    expect(mandateIdsPassingHardFilters([fitting, excluded], deal)).toEqual(["fits"]);
  });

  it("accepts statements only when every one cites retrieved evidence", () => {
    const result = citedResult();
    expect(validateGroundedStatements([{text: "A dívida é suportada.", citationKeys: ["fact-1"]}], result).status).toBe("grounded");
  });

  it("abstains on an uncited statement", () => {
    const result = citedResult();
    expect(validateGroundedStatements([{text: "A dívida é suportada.", citationKeys: []}], result)).toEqual({status: "abstained", reason: "uncited_statement"});
  });

  it("abstains when a citation was not in the retrieved set", () => {
    const result = citedResult();
    expect(validateGroundedStatements([{text: "A dívida é suportada.", citationKeys: ["invented"]}], result)).toEqual({status: "abstained", reason: "citation_outside_retrieval"});
  });
});

function mandate(id: string, min: string, max: string): Mandate {
  const at = "2026-08-20";
  const sourced = <T>(value: T) => [{value, provenance: "declared" as const, observedAt: at}];
  return {
    fundId: id,
    fundName: id,
    ticket: sourced({min, max}),
    termMonths: sourced({min: 24, max: 72}),
    sectors: sourced(["Varejo"]),
    instruments: sourced(["ccb"]),
    collateral: sourced(["recebiveis"]),
    geographies: sourced(["SP"]),
    leverageCeiling: sourced("3.0"),
    minimumDscr: sourced("1.2"),
    active: sourced(true),
  };
}

it("normalizes long document whitespace without losing internal text or anchors", () => {
  const whitespace = "\t".repeat(100_000);
  const content = `First document paragraph.${whitespace}\nSecond${"\t".repeat(5_000)}paragraph.\u0000`;
  const chunks = buildCaseChunks({
    organizationId: orgA, intakeSessionId: sessionA, sourceDocumentId: "doc-a",
    documentVersion: 1, sourceLabel: "Whitespace document",
    layer: {
      documentId: "doc-a", documentVersion: 1, kind: "pdf",
      pages: [{n: 1, scanned: false, blocks: [{id: "p1.b1", kind: "text", text: content}], tables: []}],
      scaleDeclarations: [], stats: {pageCount: 1},
    },
  });
  expect(chunks).toHaveLength(1);
  expect(chunks[0]?.content).toBe(`First document paragraph.\nSecond${"\t".repeat(5_000)}paragraph.`);
  expect(chunks[0]?.citation.anchor).toMatchObject({id: "p1", page: 1});
});
