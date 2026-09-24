import {describe, expect, it} from "vitest";
import {documentLayerSchema} from "@offroad/document-intelligence";
import type {ModelGateway} from "@offroad/model-gateway";

import {
  classificationMeasurementContentHashes,
  classificationMeasurementResultSchema,
  classificationMeasurementRoutes,
  classificationMeasurementSnapshotSchema,
  readClassificationMeasurementResult,
  runClassificationMeasurement,
  type ClassificationMeasurementResult,
  type ClassificationMeasurementSnapshot,
} from "./measurement";

const layer = (documentId: string) => documentLayerSchema.parse({
  documentId,
  documentVersion: 1,
  kind: "pdf",
  pages: [{n: 1, scanned: false, blocks: [{id: "p1.b1", kind: "heading", text: `Documento sintético ${documentId}`}], tables: []}],
  scaleDeclarations: [{scale: 1000, where: "p1.b1", text: "em milhares de reais"}],
});
const parsed = (documentId: string) => ({
  layer: layer(documentId),
  parserVersions: {pdf: "synthetic-pdf-1"},
  conversion: null,
  warnings: [{code: "no_text", message: "Synthetic warning", where: "p2"}],
  detected: {kind: "pdf", mime: "application/pdf", extension: "pdf", mismatch: false},
});
const snapshotInput = () => JSON.parse(JSON.stringify({
  schemaVersion: "classification-measurement-snapshot.v1",
  caseId: "caso-sintetico",
  caseVersion: "2026.09.24-v1",
  classifierVersion: "2026.08.20-e1-v1",
  model: {primary: {provider: "openai", model: "gpt-5.6-terra", effort: "low"}, fallback: {provider: "anthropic", model: "claude-sonnet-5", effort: "low"},
    maxOutputTokens: 4_000, timeoutMs: 60_000},
  documents: [
    {name: "01_Carta.pdf", sha256: "c".repeat(64), parsed: parsed("01_Carta.pdf")},
    {name: "02_DF.pdf", sha256: "a".repeat(64), parsed: parsed("02_DF.pdf")},
  ],
})) as Record<string, unknown>;
const snapshot = (): ClassificationMeasurementSnapshot => classificationMeasurementSnapshotSchema.parse(snapshotInput());

/** A gateway double that validates the answer like the real gateway and records every prompt. */
function answering(answers: Array<Record<string, unknown> | Error>) {
  const prompts: string[] = [];
  const gateway = {
    async complete(request: {input: Array<{text: string}>; schema: {parse: (value: unknown) => unknown}}) {
      prompts.push(request.input.map((part) => part.text).join("\n"));
      const answer = answers[prompts.length - 1] ?? {};
      if (answer instanceof Error) throw answer;
      return {
        output: request.schema.parse({documentKind: "capital_request_letter", informationClass: "management", language: "pt", summary: "Resumo sintético.",
          confidence: 0.91, reasoning: "Prova sintética.", ...answer}),
        provider: "openai", model: "gpt-5.6-terra", effort: "low", usage: {inputTokens: 900, outputTokens: 80, cachedInputTokens: 0}, costUsd: 0.0021,
        latencyMs: 5, stopReason: "end", usedFallback: false, fromCassette: false, attempts: [],
      };
    },
    spent: () => ({costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0}),
  } as unknown as ModelGateway;
  return {gateway, prompts};
}
const ticking = () => { let now = Date.parse("2026-09-24T12:00:00Z"); return () => new Date(now += 500); };

describe("classification measurement snapshot", () => {
  it("reads the documents, routes and content hashes the family declares", () => {
    const s = snapshot();
    expect(classificationMeasurementContentHashes(s)).toEqual(["a".repeat(64), "c".repeat(64)]);
    expect(classificationMeasurementRoutes(s).map((route) => `${route.provider}:${route.model}`)).toEqual(["openai:gpt-5.6-terra", "anthropic:claude-sonnet-5"]);
  });

  it.each<[string, (value: Record<string, unknown>) => void]>([
    ["an unknown field", (value) => { value.extra = true; }],
    ["an unknown field inside a parse", (value) => { (value.documents as Array<{parsed: Record<string, unknown>}>)[0]!.parsed.extra = 1; }],
    ["a layer that leaves a default to be filled in", (value) => { delete (value.documents as Array<{parsed: {layer: Record<string, unknown>}}>)[0]!.parsed.layer.stats; }],
    ["the parse of another document", (value) => { (value.documents as Array<{parsed: {layer: Record<string, unknown>}}>)[0]!.parsed.layer.documentId = "02_DF.pdf"; }],
    ["a detected kind the layer does not have", (value) => { (value.documents as Array<{parsed: {detected: Record<string, unknown>}}>)[0]!.parsed.detected.kind = "docx"; }],
    ["a warning code the parser never emits", (value) => { (value.documents as Array<{parsed: {warnings: Array<Record<string, unknown>>}}>)[0]!.parsed.warnings[0]!.code = "invented"; }],
    ["a document named twice", (value) => { (value.documents as unknown[])[1] = (value.documents as unknown[])[0]; }],
    ["no document", (value) => { value.documents = []; }],
  ])("refuses %s", (_label, change) => {
    const value = snapshotInput();
    change(value);
    expect(classificationMeasurementSnapshotSchema.safeParse(value).success).toBe(false);
  });
});

describe("classification measurement run", () => {
  it("classifies every document with the product's classifier and publishes the record's columns", async () => {
    const s = snapshot();
    const {gateway, prompts} = answering([{}, {documentKind: "audited_financial_statements", informationClass: "audited", periodEnd: "2025-12-31", confidence: 0.64}]);
    const result = await runClassificationMeasurement(s, gateway, ticking());
    expect(classificationMeasurementResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    // The class follows the kind through the ontology, as the classifier decides it, not the model's own reading.
    expect(result.documents).toEqual([
      {document: "01_Carta.pdf", actualKind: "capital_request_letter", actualClass: "company_document", actualPeriodEnd: null, confidence: 0.91, costUsd: 0.0021, calls: 1, ms: 500},
      {document: "02_DF.pdf", actualKind: "audited_financial_statements", actualClass: "audited", actualPeriodEnd: "2025-12-31", confidence: 0.64, costUsd: 0.0021, calls: 1, ms: 500},
    ]);
    // The classifier read the parse the script produced: the file name, the detected type and the parser's scale declarations.
    expect(prompts[0]).toContain("File name: 01_Carta.pdf");
    expect(prompts[0]).toContain("Detected type: application/pdf");
    expect(prompts[0]).toContain("1000x at p1.b1 (\"em milhares de reais\")");
  });

  it("ends the run when a classification fails, as the script ended before", async () => {
    const failure = new Error("all model attempts failed");
    await expect(runClassificationMeasurement(snapshot(), answering([{}, failure]).gateway, ticking())).rejects.toBe(failure);
  });
});

describe("classification measurement result, read back", () => {
  const run = async (s: ClassificationMeasurementSnapshot) => JSON.parse(JSON.stringify(await runClassificationMeasurement(s, answering([]).gateway, ticking()))) as ClassificationMeasurementResult;

  it("reads the classification of exactly these inputs", async () => {
    const s = snapshot();
    const result = await run(s);
    expect(readClassificationMeasurementResult(result, s)).toEqual(result);
  });

  it.each<[string, (result: ClassificationMeasurementResult) => void]>([
    ["another classifier", (result) => { result.classifierVersion = "2026.01.01-e1-v0"; }],
    ["documents out of order", (result) => { result.documents.reverse(); }],
    ["a missing document", (result) => { result.documents.pop(); }],
    ["a kind outside the ontology", (result) => { (result.documents[0] as Record<string, unknown>).actualKind = "invented_kind"; }],
    ["a class the kind does not carry", (result) => { result.documents[0]!.actualClass = "audited"; }],
    ["an unknown field", (result) => { (result.documents[0] as Record<string, unknown>).expectedKind = "capital_request_letter"; }],
  ])("refuses %s", async (_label, change) => {
    const s = snapshot();
    const result = await run(s);
    change(result);
    expect(() => readClassificationMeasurementResult(result, s)).toThrow();
  });
});
