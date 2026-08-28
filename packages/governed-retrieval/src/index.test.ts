import {describe, expect, it} from "vitest";

import type {DocumentLayer} from "@offroad/document-intelligence";
import {resolveMandate, type DealRequest, type Mandate} from "@offroad/fund-mandate";

import {
  buildCaseChunks,
  mandateIdsPassingHardFilters,
  retrieveGoverned,
  sha256,
  validateGroundedStatements,
  type GovernedChunk,
} from "./index";

const orgA = "org-a";
const orgB = "org-b";
const sessionA = "session-a";
const opportunityA = "opportunity-a";

function request(overrides: Record<string, unknown> = {}) {
  return {
    query: "receita dívida capacidade pagamento",
    organizationId: orgA,
    intakeSessionId: sessionA,
    opportunityId: opportunityA,
    playbookVersion: "playbook-v2",
    allowedFundIds: [],
    limit: 12,
    minScore: 0.01,
    ...overrides,
  } as never;
}

function chunk(source: GovernedChunk["source"], id: string, content: string, overrides: Record<string, unknown> = {}): GovernedChunk {
  const common = {
    id,
    source,
    content,
    contentHash: sha256(content),
    citation: {key: id, label: id, anchor: {id}},
    locale: "pt-BR",
    tags: [],
    ...overrides,
  };
  if (source === "case") return {
    ...common,
    source,
    organizationId: orgA,
    intakeSessionId: sessionA,
    opportunityId: opportunityA,
    sourceDocumentId: "doc-a",
    documentVersion: 1,
    ...overrides,
  } as GovernedChunk;
  if (source === "house_playbook") return {
    ...common,
    source,
    playbookVersion: "playbook-v2",
    governanceStatus: "approved",
    ...overrides,
  } as GovernedChunk;
  if (source === "mandate_note") return {
    ...common,
    source,
    fundId: "fund-a",
    observedAt: "2026-08-20",
    ...overrides,
  } as GovernedChunk;
  return {
    ...common,
    source,
    precedentId: "precedent-a",
    authorization: "granted",
    anonymization: "approved",
    governance: "approved",
    authorizedPurposes: ["structure_calibration"],
    ...overrides,
  } as GovernedChunk;
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

  it("uses the governed 12,000-character ceiling for large operational tapes", () => {
    const layer: DocumentLayer = {
      documentId: "doc-a",
      documentVersion: 1,
      kind: "spreadsheet",
      sheets: [{
        name: "CARTEIRA",
        hidden: false,
        cells: Array.from({length: 1_000}, (_, index) => ({
          ref: `A${index + 1}`,
          v: `titulo-${index + 1}-${"recebivel".repeat(14)}`,
          t: "s" as const,
        })),
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

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((entry) => entry.content.length <= 12_000)).toBe(true);
    expect(chunks.some((entry) => entry.content.length > 6_000)).toBe(true);
    expect(chunks.every((entry) => entry.citation.anchor.id === "sCARTEIRA")).toBe(true);
  });
});

describe("governed retrieval", () => {
  it("retrieves exact-scope case evidence", () => {
    const result = retrieveGoverned(request(), [chunk("case", "case-a", "A receita suporta a capacidade de pagamento da dívida.")]);
    expect(result.abstained).toBe(false);
    expect(result.retrieved.map((entry) => entry.chunk.id)).toEqual(["case-a"]);
  });

  it("never crosses organizations", () => {
    const foreign = chunk("case", "foreign", "Receita e dívida", {organizationId: orgB});
    const result = retrieveGoverned(request(), [foreign]);
    expect(result).toMatchObject({abstained: true, excluded: {scope: 1}});
  });

  it("never crosses opportunities in the same organization", () => {
    const foreign = chunk("case", "foreign-opportunity", "Receita e dívida", {intakeSessionId: "session-b", opportunityId: "opportunity-b"});
    const result = retrieveGoverned(request(), [foreign]);
    expect(result).toMatchObject({abstained: true, excluded: {scope: 1}});
  });

  it("requires every supplied scope dimension instead of accepting a session-only match", () => {
    const foreign = chunk("case", "foreign-opportunity-same-session", "Receita e dívida", {
      intakeSessionId: sessionA,
      opportunityId: "opportunity-b",
    });
    const result = retrieveGoverned(request(), [foreign]);
    expect(result).toMatchObject({abstained: true, excluded: {scope: 1}});
  });

  it("rejects content that no longer matches its governed hash", () => {
    const altered = {
      ...chunk("case", "altered", "Receita e dívida"),
      content: "Conteúdo substituído depois da indexação",
    } as GovernedChunk;
    const result = retrieveGoverned(request({query: "conteúdo substituído"}), [altered]);
    expect(result).toMatchObject({abstained: true, excluded: {governance: 1}});
  });

  it("requires an explicit case scope", () => {
    const result = retrieveGoverned(request({intakeSessionId: undefined, opportunityId: undefined}), [chunk("house_playbook", "pb", "capacidade dívida")]);
    expect(result).toMatchObject({abstained: true, abstentionReason: "scope_not_established"});
  });

  it("uses only the requested approved playbook version", () => {
    const current = chunk("house_playbook", "current", "capacidade de pagamento da dívida");
    const old = chunk("house_playbook", "old", "capacidade de pagamento da dívida", {playbookVersion: "playbook-v1"});
    const result = retrieveGoverned(request(), [old, current]);
    expect(result.retrieved.map((entry) => entry.chunk.id)).toEqual(["current"]);
    expect(result.excluded.version).toBe(1);
  });

  it("will not retrieve an unapproved playbook chunk", () => {
    const raw = {...chunk("house_playbook", "draft", "receita dívida"), governanceStatus: "draft"} as unknown as GovernedChunk;
    const result = retrieveGoverned(request(), [raw]);
    expect(result).toMatchObject({abstained: true, excluded: {governance: 1}});
  });

  it("retrieves notes only after a structured mandate pass", () => {
    const note = chunk("mandate_note", "note", "Prefere dívida com receita recorrente.");
    expect(retrieveGoverned(request(), [note]).retrieved).toEqual([]);
    expect(retrieveGoverned(request({allowedFundIds: ["fund-a"], query: "receita recorrente"}), [note]).retrieved).toHaveLength(1);
  });

  it("uses embeddings only on eligible open mandate notes", () => {
    const note = chunk("mandate_note", "semantic-note", "Conversa recente com o gestor.", {embedding: [1, 0]});
    const result = retrieveGoverned(request({
      query: "termo sem interseção lexical",
      allowedFundIds: ["fund-a"],
      queryEmbedding: [1, 0],
      minScore: 0.4,
    }), [note]);
    expect(result.retrieved[0]?.score).toBeGreaterThan(0.6);
  });

  it("rejects a vector attached to case evidence instead of silently accepting schema drift", () => {
    const raw = {...chunk("case", "case-vector", "receita dívida"), embedding: [1, 0]} as GovernedChunk;
    const parsed = retrieveGoverned(request(), [raw]);
    expect(parsed).toMatchObject({abstained: true, excluded: {governance: 1}});
  });

  it("requires all three precedent gates and the exact purpose", () => {
    const precedent = chunk("precedent", "precedent", "estrutura de dívida e capacidade de pagamento");
    expect(retrieveGoverned(request(), [precedent]).retrieved).toEqual([]);
    expect(retrieveGoverned(request({precedentPurpose: "structure_calibration"}), [precedent]).retrieved).toHaveLength(1);
  });

  it("rejects a precedent whose governance fields were weakened", () => {
    const raw = {...chunk("precedent", "bad", "receita dívida"), anonymization: "pending"} as unknown as GovernedChunk;
    const result = retrieveGoverned(request({precedentPurpose: "structure_calibration"}), [raw]);
    expect(result).toMatchObject({abstained: true, excluded: {governance: 1}});
  });

  it("abstains when nothing relevant is governed", () => {
    const result = retrieveGoverned(request(), [chunk("case", "irrelevant", "apólice de seguro predial")]);
    expect(result).toMatchObject({abstained: true, abstentionReason: "no_governed_evidence"});
  });

  it("returns stable ordering and a content-free request fingerprint", () => {
    const first = chunk("case", "a", "receita dívida capacidade pagamento");
    const second = chunk("case", "b", "receita dívida");
    const result = retrieveGoverned(request(), [second, first]);
    expect(result.retrieved.map((entry) => entry.chunk.id)).toEqual(["a", "b"]);
    expect(result.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.requestFingerprint).not.toContain("receita");
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
    const result = retrieveGoverned(request(), [chunk("case", "fact-1", "receita dívida capacidade pagamento")]);
    expect(validateGroundedStatements([{text: "A dívida é suportada.", citationKeys: ["fact-1"]}], result).status).toBe("grounded");
  });

  it("abstains on an uncited statement", () => {
    const result = retrieveGoverned(request(), [chunk("case", "fact-1", "receita dívida capacidade pagamento")]);
    expect(validateGroundedStatements([{text: "A dívida é suportada.", citationKeys: []}], result)).toEqual({status: "abstained", reason: "uncited_statement"});
  });

  it("abstains when a citation was not in the retrieved set", () => {
    const result = retrieveGoverned(request(), [chunk("case", "fact-1", "receita dívida capacidade pagamento")]);
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
