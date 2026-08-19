import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {documentLayerSchema, indexLayer, type DocumentLayer, type DocumentProfile} from "@offroad/document-intelligence";
import type {ModelGateway} from "@offroad/model-gateway";

import {renderEvidence, selectLines} from "./evidence";
import {buildExtractionPrompt, targetFields} from "./prompt";
import {extractDocument} from "./extract";

/** A two-page statement: prose on one page, a table on the other. */
const layer: DocumentLayer = documentLayerSchema.parse({
  documentId: "doc-1",
  documentVersion: 1,
  kind: "pdf",
  parserVersion: "test",
  scaleDeclarations: [],
  stats: {},
  pages: [
    {
      n: 1,
      scanned: false,
      blocks: [{id: "p1.b1", kind: "heading", text: "Demonstrações financeiras auditadas de 2025"}],
      tables: [],
    },
    {
      n: 2,
      scanned: false,
      blocks: [{id: "p2.b1", kind: "note", text: "Valores em reais"}],
      tables: [
        {
          id: "p2.t1",
          header: ["Conta", "2025"],
          rows: [
            {
              id: "p2.t1.r1",
              cells: [
                {id: "p2.t1.r1.c1", text: "Receita líquida"},
                {id: "p2.t1.r1.c2", text: "1.234.567,89"},
              ],
            },
          ],
        },
      ],
    },
  ],
});

const profile: DocumentProfile = {
  documentId: "doc-1",
  kind: "audited_financial_statements",
  informationClass: "audited",
  evidenceRank: 1,
  entityName: "Rede Horizonte Alimentos S.A.",
  language: "pt",
  quality: {alerts: []},
  confidence: 1,
};

function gatewayReturning(outputs: unknown[]): ModelGateway {
  let call = 0;
  return {
    async complete<TSchema extends z.ZodType>(request: {schema: TSchema}): Promise<never | {output: z.infer<TSchema>} & Record<string, unknown>> {
      // Past the scripted responses the stub answers "nothing here", so a test that cares
      // about one failing chunk is not measuring the stub running out of script.
      const raw = call < outputs.length ? outputs[call++] : {candidates: [], absent_fields: [], document_alerts: []};
      if (raw instanceof Error) throw raw;
      // The real gateway validates the provider's answer against the request schema before
      // returning it; a stub that skips this hands the pipeline data it could never receive.
      const output = request.schema.parse(raw);
      return {
        output,
        provider: "anthropic",
        model: "claude-sonnet-5",
        effort: "medium",
        usage: {inputTokens: 100, outputTokens: 50},
        costUsd: 0.01,
        latencyMs: 10,
        stopReason: "stop",
        usedFallback: false,
        fromCassette: false,
        attempts: [],
      } as never;
    },
    spent: () => ({costUsd: 0, calls: 0}),
  } as unknown as ModelGateway;
}

describe("evidence rendering", () => {
  it("shows the citable lines and hides the ones that only repeat them", () => {
    const lines = selectLines(indexLayer(layer));
    const ids = lines.map((line) => line.anchorId);

    expect(ids).toContain("p1.b1");
    expect(ids).toContain("p2.t1.r1");
    // Containers repeat their children's text; the table aggregate repeats its rows; cells are
    // derivable from the row. Printing them would spend the budget saying the same thing again.
    expect(ids).not.toContain("p1");
    expect(ids).not.toContain("document");
    expect(ids).not.toContain("p2.t1");
    expect(ids).not.toContain("p2.t1.r1.c1");
  });

  it("puts the anchor id at the start of every line, because that is what gets cited", () => {
    const [chunk] = renderEvidence(indexLayer(layer));
    expect(chunk?.text).toContain("[p2.t1.r1] Receita líquida | 1.234.567,89");
    expect(chunk?.text).toContain("--- page 1 ---");
  });

  it("splits into chunks instead of truncating, so no page is silently dropped", () => {
    const chunks = renderEvidence(indexLayer(layer), {maxChars: 60});
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 200)).toBe(true);
    const cited = chunks.flatMap((chunk) => chunk.anchorIds);
    expect(cited).toContain("p1.b1");
    expect(cited).toContain("p2.t1.r1");
    expect(chunks.every((chunk) => chunk.total === chunks.length)).toBe(true);
  });

  it("marks a truncated line rather than shortening it quietly", () => {
    const long: DocumentLayer = documentLayerSchema.parse({
      ...layer,
      pages: [{n: 1, scanned: false, blocks: [{id: "p1.b1", kind: "text", text: "x".repeat(500)}], tables: []}],
    });
    const [chunk] = renderEvidence(indexLayer(long), {maxLineChars: 50});
    expect(chunk?.text).toContain("…[linha truncada]");
  });
});

describe("target fields", () => {
  it("asks a document only for what its kind can carry", () => {
    const fields = targetFields("audited_financial_statements");
    const groups = new Set(fields.map((field) => field.group));
    expect(groups).toContain("historical_financials");
    // Projections belong to a business plan, not to audited statements; asking for them here
    // invites the model to produce one.
    expect(groups).not.toContain("projections");
  });

  it("falls back to the whole catalogue for a kind with no typical groups", () => {
    expect(targetFields("other").length).toBeGreaterThan(50);
  });
});

describe("prompt", () => {
  it("carries the evidence, the field patterns and where the chunk sits", () => {
    const chunks = renderEvidence(indexLayer(layer));
    const prompt = buildExtractionPrompt({
      profile,
      fileName: "02_DF.pdf",
      fields: targetFields(profile.kind),
      evidence: chunks[0]!,
    });
    expect(prompt).toContain("02_DF.pdf");
    expect(prompt).toContain("audited_financial_statements");
    expect(prompt).toContain("historical_financials.{period}.revenue");
    expect(prompt).toContain("[p2.t1.r1]");
    expect(prompt).toContain("Este é o documento inteiro");
  });
});

describe("extraction", () => {
  const candidate = (over: Record<string, unknown> = {}) => ({
    field_path: "historical_financials.2025.revenue",
    value_raw: "1.234.567,89",
    value_type: "number",
    scale: 1,
    information_class: "audited",
    anchor: {kind: "table_cell", id: "p2.t1.r1.c2", page: 2},
    quote: "1.234.567,89",
    confidence: 0.9,
    ...over,
  });

  it("normalizes the value in code, from the raw string the document showed", async () => {
    const result = await extractDocument({
      layer,
      profile,
      fileName: "02_DF.pdf",
      gateway: gatewayReturning([{candidates: [candidate()], absent_fields: [], document_alerts: []}]),
      localeHint: "pt-BR",
    });

    expect(result.candidates).toHaveLength(1);
    const [first] = result.candidates;
    expect(first?.anchor_verified).toBe(true);
    expect(first?.normalized_value).toBe("1234567.89");
    expect(first?.verifier_flags).toEqual([]);
    expect(result.usage.calls).toBe(1);
  });

  it("refuses to confirm an anchor the document does not have", async () => {
    const result = await extractDocument({
      layer,
      profile,
      fileName: "02_DF.pdf",
      gateway: gatewayReturning([
        {candidates: [candidate({anchor: {kind: "table_cell", id: "p9.t1.r1.c2"}})], absent_fields: [], document_alerts: []},
      ]),
    });

    const [first] = result.candidates;
    expect(first?.anchor_verified).toBe(false);
    expect(first?.verifier_flags).toContain("anchor_missing");
  });

  it("refuses to confirm a value that is not in the quoted text", async () => {
    const result = await extractDocument({
      layer,
      profile,
      fileName: "02_DF.pdf",
      gateway: gatewayReturning([
        {candidates: [candidate({value_raw: "9.999.999,00", quote: "Receita líquida"})], absent_fields: [], document_alerts: []},
      ]),
    });

    const [first] = result.candidates;
    expect(first?.anchor_verified).toBe(false);
    expect(first?.verifier_flags.length).toBeGreaterThan(0);
  });

  it("keeps a field out of the absent list once something cited it", async () => {
    const result = await extractDocument({
      layer,
      profile,
      fileName: "02_DF.pdf",
      gateway: gatewayReturning([
        {
          candidates: [candidate()],
          absent_fields: ["historical_financials.2025.revenue", "historical_financials.2025.ebitda"],
          document_alerts: [],
        },
      ]),
    });

    expect(result.absentFields).toEqual(["historical_financials.2025.ebitda"]);
  });

  it("keeps the good candidates when one is malformed, and counts the loss", async () => {
    // The regression this exists for: all-or-nothing validation turned sixty good candidates
    // plus one malformed field into zero — which is how the audited statements, the highest-
    // ranked document in the data room, contributed nothing to the first real measurement.
    const result = await extractDocument({
      layer,
      profile,
      fileName: "02_DF.pdf",
      gateway: gatewayReturning([
        {
          candidates: [
            candidate(),
            {field_path: "historical_financials.2025.ebitda", value_raw: "", confidence: 2},
          ],
          absent_fields: [],
          document_alerts: [],
        },
      ]),
      localeHint: "pt-BR",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.field_path).toBe("historical_financials.2025.revenue");
    expect(result.malformed).toBe(1);
    expect(result.chunks.failed).toBe(0);
  });

  it("counts a failed chunk instead of passing a partial reading off as complete", async () => {
    const progress = vi.fn();
    const result = await extractDocument({
      layer,
      profile,
      fileName: "02_DF.pdf",
      render: {maxChars: 60},
      gateway: gatewayReturning([new Error("provider exploded"), {candidates: [candidate()], absent_fields: [], document_alerts: []}]),
      onProgress: progress,
    });

    expect(result.chunks.total).toBeGreaterThan(1);
    expect(result.chunks.failed).toBe(1);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({stage: "chunk_failed"}));
  });
});
