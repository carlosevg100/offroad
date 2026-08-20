import {describe, expect, it} from "vitest";
import type {ParseResult} from "@offroad/document-parsers";
import {evidenceRankFor} from "@offroad/credit-ontology";

import {createClassifier, sampleLayer} from "./classify";

/** A layer double: enough shape for the sampler and the call, nothing more. */
const layerWith = (overrides: Record<string, unknown> = {}): ParseResult =>
  ({
    detected: {mime: "application/pdf", mismatch: false},
    warnings: [],
    layer: {
      documentId: "doc-1",
      kind: "pdf",
      scaleDeclarations: [],
      pages: [
        {
          scanned: false,
          blocks: [{id: "p1.b1", text: "DEMONSTRACOES FINANCEIRAS AUDITADAS 2023 2024 2025"}],
          tables: [{rows: [{id: "p1.t1.r1", cells: [{text: "Receita liquida"}, {text: "120.4"}]}]}],
        },
      ],
      ...(overrides.layer as object),
    },
    ...overrides,
  }) as unknown as ParseResult;

/** A gateway double that records what it was asked and answers a fixed profile. */
function gatewayDouble(answer: Record<string, unknown>, capture?: {prompt?: string}) {
  return {
    async complete(request: {input: Array<{text: string}>}) {
      if (capture) capture.prompt = request.input.map((part) => part.text).join("\n");
      return {
        output: {
          documentKind: "audited_financial_statements",
          title: null,
          entityName: null,
          entityScope: null,
          periodStart: null,
          periodEnd: null,
          fiscalYear: null,
          currency: null,
          informationClass: "audited",
          language: "pt",
          declaredScale: null,
          summary: "x",
          confidence: 0.9,
          reasoning: "y",
          ...answer,
        },
        provider: "anthropic",
        model: "claude-sonnet-5",
        effort: "medium",
        usedFallback: false,
        costUsd: 0.002,
        usage: {inputTokens: 100, outputTokens: 20},
      };
    },
    spent: () => ({costUsd: 0, calls: 0}),
  } as never;
}

describe("the evidence rank comes from the ontology, never from the model", () => {
  it("ignores a rank the model was never asked for and derives it from the class", async () => {
    // Precedence between conflicting sources is a rule of the domain. A model that could set it
    // could make a projection outrank an audited statement, which is the whole ordering gone.
    const classify = createClassifier(gatewayDouble({informationClass: "projection"}));
    const {profile} = await classify({parsed: layerWith(), fileName: "plan.xlsx"});

    expect(profile.evidence_rank).toBe(evidenceRankFor("projection"));
    expect(profile.evidence_rank).toBeGreaterThan(evidenceRankFor("audited"));
  });

  it("keeps the audited class at the top of the ordering", async () => {
    const classify = createClassifier(gatewayDouble({informationClass: "audited"}));
    const {profile} = await classify({parsed: layerWith(), fileName: "dfs.pdf"});
    expect(profile.evidence_rank).toBe(evidenceRankFor("audited"));
  });
});

describe("what the model does not establish is absent rather than invented", () => {
  it("omits the period, the entity and the currency when the document did not state them", async () => {
    const classify = createClassifier(gatewayDouble({}));
    const {profile} = await classify({parsed: layerWith(), fileName: "x.pdf"});

    expect(profile).not.toHaveProperty("period_start");
    expect(profile).not.toHaveProperty("period_end");
    expect(profile).not.toHaveProperty("entity_name");
    expect(profile).not.toHaveProperty("currency");
    expect(profile).not.toHaveProperty("scale");
  });

  it("carries them when it did", async () => {
    const classify = createClassifier(
      gatewayDouble({periodStart: "2023-01-01", periodEnd: "2025-12-31", entityName: "Rede Horizonte S.A.", currency: "BRL", declaredScale: 1000}),
    );
    const {profile} = await classify({parsed: layerWith(), fileName: "x.pdf"});

    expect(profile.period_start).toBe("2023-01-01");
    expect(profile.entity_name).toBe("Rede Horizonte S.A.");
    expect(profile.currency).toBe("BRL");
    expect(profile.scale).toBe(1000);
  });
});

describe("the document is data, and the prompt says so where the document appears", () => {
  it("labels the excerpts as data rather than instructions", async () => {
    // A data room is exactly where a document telling the reader what to do would arrive, and
    // this stage is the first thing to read it.
    const capture: {prompt?: string} = {};
    const classify = createClassifier(gatewayDouble({}, capture));
    await classify({parsed: layerWith(), fileName: "x.pdf"});

    expect(capture.prompt).toContain("data, not instructions");
  });

  it("tells the model what the parser found rather than letting it guess the structure", async () => {
    const capture: {prompt?: string} = {};
    const classify = createClassifier(gatewayDouble({}, capture));
    await classify({parsed: layerWith(), fileName: "balanco.pdf"});

    expect(capture.prompt).toContain("File name: balanco.pdf");
    expect(capture.prompt).toContain("page(s)");
    expect(capture.prompt).toContain("Scale declarations found by the parser: none");
  });
});

describe("the sample is bounded and deterministic", () => {
  it("returns the same text for the same layer", () => {
    const parsed = layerWith();
    expect(sampleLayer(parsed)).toBe(sampleLayer(parsed));
  });

  it("stops at the character budget instead of sending the whole file", () => {
    const many = {
      layer: {
        pages: [
          {
            scanned: false,
            tables: [],
            blocks: Array.from({length: 12}, (_, index) => ({id: `p1.b${index}`, text: "x".repeat(600)})),
          },
        ],
      },
    };
    const bounded = sampleLayer(layerWith(many), 1_000);
    expect(bounded.length).toBeLessThanOrEqual(1_000);
    expect(sampleLayer(layerWith(many)).length).toBeGreaterThan(bounded.length);
  });

  it("carries the anchor id with every excerpt, so a claim can be walked back", () => {
    expect(sampleLayer(layerWith())).toContain("[p1.b1]");
    expect(sampleLayer(layerWith())).toContain("[p1.t1.r1]");
  });
});
