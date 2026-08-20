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

/**
 * A gateway double that records what it was asked and answers a fixed profile.
 *
 * It validates the answer against the schema the classifier hands it, because the real gateway
 * does and because a double that skipped it would prove nothing about the contract: the defect
 * that took every classification down (a key omitted rather than nulled) sat under a green suite
 * until the double started parsing.
 */
function gatewayDouble(answer: Record<string, unknown>, capture?: {prompt?: string}) {
  return {
    async complete(request: {input: Array<{text: string}>; schema: {parse: (value: unknown) => unknown}}) {
      if (capture) capture.prompt = request.input.map((part) => part.text).join("\n");
      return {
        output: request.schema.parse({
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
        }),
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

/** A gateway double that answers with keys *omitted* rather than nulled, as the models do. */
function omittingGatewayDouble(omit: readonly string[]) {
  return {
    async complete(request: {schema: {parse: (value: unknown) => unknown}}) {
      const full: Record<string, unknown> = {
        documentKind: "audited_financial_statements",
        title: "Demonstracoes",
        entityName: "Rede Horizonte S.A.",
        entityScope: "consolidated",
        periodStart: "2023-01-01",
        periodEnd: "2025-12-31",
        fiscalYear: 2025,
        currency: "BRL",
        informationClass: "audited",
        language: "pt",
        declaredScale: 1000,
        summary: "x",
        confidence: 0.9,
        reasoning: "y",
      };
      for (const key of omit) delete full[key];
      return {
        output: request.schema.parse(full),
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

describe("a field the model leaves out is a document that did not say, not a failed run", () => {
  it("classifies a document whose answer omits the period, the scope and the fiscal year", async () => {
    // The failure this replaces was total rather than partial. `nullable()` requires the key to
    // be present carrying null; both providers express "the document does not say" by leaving it
    // out, the fallback did the same, and the whole classification came back
    // `all_attempts_failed` for a document whose only sin was having no fiscal year.
    const classify = createClassifier(
      omittingGatewayDouble(["periodStart", "periodEnd", "fiscalYear", "entityScope"]),
    );

    const {profile} = await classify({parsed: layerWith(), fileName: "dfs.pdf"});

    expect(profile.document_kind).toBe("audited_financial_statements");
    expect(profile).not.toHaveProperty("period_start");
    expect(profile).not.toHaveProperty("period_end");
    expect(profile).not.toHaveProperty("fiscal_year");
    // And what the model did answer still arrives.
    expect(profile.entity_name).toBe("Rede Horizonte S.A.");
    expect(profile.currency).toBe("BRL");
  });

  it("survives an answer that omits every optional field at once", async () => {
    const classify = createClassifier(
      omittingGatewayDouble([
        "title", "entityName", "entityScope", "periodStart", "periodEnd",
        "fiscalYear", "currency", "declaredScale",
      ]),
    );

    const {profile} = await classify({parsed: layerWith(), fileName: "bare.pdf"});

    expect(profile.document_kind).toBe("audited_financial_statements");
    expect(profile.evidence_rank).toBe(evidenceRankFor("audited"));
    expect(profile).not.toHaveProperty("scale");
    expect(profile).not.toHaveProperty("entity_name");
  });

  it("never writes an undefined onto the profile when a numeric field is omitted", async () => {
    // The strict `!== null` these two carried would have assigned `undefined` the moment the key
    // was absent, putting a key on the profile whose value is nothing.
    const classify = createClassifier(omittingGatewayDouble(["fiscalYear", "declaredScale"]));
    const {profile} = await classify({parsed: layerWith(), fileName: "x.pdf"});

    expect(Object.keys(profile)).not.toContain("fiscal_year");
    expect(Object.keys(profile)).not.toContain("scale");
  });
});
