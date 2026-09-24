import {describe, expect, it} from "vitest";
import {z} from "zod";

import {documentLayerSchema, type DocumentLayer, type DocumentProfile} from "@offroad/document-intelligence";
import {ModelGatewayError, type ModelGateway} from "@offroad/model-gateway";

import {extractDocument} from "./extract";
import {
  extractionMeasurementContentHashes,
  extractionMeasurementPasses,
  extractionMeasurementResultSchema,
  extractionMeasurementRoutes,
  extractionMeasurementSnapshotSchema,
  readExtractionMeasurementResult,
  runExtractionMeasurement,
  type ExtractionMeasurementResult,
  type ExtractionMeasurementSnapshot,
} from "./measurement";

/** A two-page statement: prose on one page, a table on the other. */
const statement: DocumentLayer = documentLayerSchema.parse({
  documentId: "02_DF.pdf",
  documentVersion: 1,
  kind: "pdf",
  pages: [
    {n: 1, scanned: false, blocks: [{id: "p1.b1", kind: "heading", text: "Demonstrações financeiras auditadas de 2025"}], tables: []},
    {n: 2, scanned: false, blocks: [{id: "p2.b1", kind: "note", text: "Valores em reais"}], tables: [
      {id: "p2.t1", header: ["Conta", "2025"], rows: [{id: "p2.t1.r1", cells: [{id: "p2.t1.r1.c1", text: "Receita líquida"}, {id: "p2.t1.r1.c2", text: "1.234.567,89"}]}]},
    ]},
  ],
});
const statementProfile: DocumentProfile = {documentId: "02_DF.pdf", kind: "audited_financial_statements", informationClass: "audited", evidenceRank: 1,
  entityName: "Empresa Sintética S.A.", language: "pt", quality: {alerts: []}, confidence: 1};

/** A debt schedule wide enough to earn a table pass beside its evidence window. */
const schedule: DocumentLayer = documentLayerSchema.parse({
  documentId: "04_Divida.pdf",
  documentVersion: 1,
  kind: "pdf",
  pages: [{n: 1, scanned: false, blocks: [], tables: [{id: "p1.t1", header: ["Credor", "Saldo"], rows: Array.from({length: 12}, (_, row) => ({
    id: `p1.t1.r${row + 1}`,
    cells: [{id: `p1.t1.r${row + 1}.c1`, text: `Banco sintético número ${row + 1}`}, {id: `p1.t1.r${row + 1}.c2`, text: `${(row + 1) * 1_000_000}`}],
  }))}]}],
});
const scheduleProfile: DocumentProfile = {documentId: "04_Divida.pdf", kind: "debt_schedule", informationClass: "management", evidenceRank: 5,
  entityName: "Empresa Sintética S.A.", language: "pt", quality: {alerts: []}, confidence: 1};

const snapshotInput = () => JSON.parse(JSON.stringify({
  schemaVersion: "extraction-measurement-snapshot.v1",
  caseId: "caso-sintetico",
  caseVersion: "2026.09.24-v1",
  extractor: {version: "2026.08.19-e3-v1", promptVersion: "abcdef012345"},
  model: {primary: {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}, fallback: {provider: "openai", model: "gpt-5.6-terra", effort: "medium"},
    maxOutputTokens: 8_000, timeoutMs: 240_000},
  documents: [
    {name: "02_DF.pdf", sha256: "a".repeat(64), profile: statementProfile, layer: statement},
    {name: "04_Divida.pdf", sha256: "b".repeat(64), profile: scheduleProfile, layer: schedule},
  ],
})) as Record<string, unknown>;
const snapshot = (): ExtractionMeasurementSnapshot => extractionMeasurementSnapshotSchema.parse(snapshotInput());

const revenue = {field_path: "historical_financials.2025.revenue", value_raw: "1.234.567,89", value_type: "number", scale: 1, information_class: "audited",
  anchor: {kind: "table_cell", id: "p2.t1.r1.c2", page: 2}, quote: "1.234.567,89", confidence: 0.9};

/** A gateway that validates each answer like the real one and records how many calls overlap. */
function scripted(answers: Array<unknown | Error>) {
  let call = 0, inFlight = 0;
  const seen = {calls: 0, peak: 0};
  const gateway = {
    async complete<TSchema extends z.ZodType>(request: {schema: TSchema}) {
      const answer = call < answers.length ? answers[call] : {candidates: [], absent_fields: [], document_alerts: []};
      call += 1;
      seen.calls += 1;
      inFlight += 1;
      seen.peak = Math.max(seen.peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      if (answer instanceof Error) throw answer;
      return {output: request.schema.parse(answer), provider: "anthropic", model: "claude-sonnet-5", effort: "medium",
        usage: {inputTokens: 100, outputTokens: 20, cachedInputTokens: 0}, costUsd: 0.01, latencyMs: 2, stopReason: "end", usedFallback: false, fromCassette: false, attempts: []};
    },
    spent: () => ({costUsd: 0, calls: 0, unknownCostCalls: 0, budgetExposureUsd: 0}),
  } as unknown as ModelGateway;
  return {gateway, seen};
}
const ticking = () => { let now = Date.parse("2026-09-24T12:00:00Z"); return () => new Date(now += 1_000); };

describe("extraction measurement snapshot", () => {
  it("reads the documents, routes and content hashes the family declares", () => {
    const s = snapshot();
    expect(extractionMeasurementContentHashes(s)).toEqual(["a".repeat(64), "b".repeat(64)]);
    expect(extractionMeasurementRoutes(s)).toEqual([{provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}, {provider: "openai", model: "gpt-5.6-terra", effort: "medium"}]);
  });

  it.each<[string, (value: Record<string, unknown>) => void]>([
    ["an unknown field", (value) => { value.extra = true; }],
    ["an unknown field inside a layer", (value) => { (value.documents as Array<{layer: Record<string, unknown>}>)[0]!.layer.parserVersion = "x"; }],
    ["a layer that leaves a default to be filled in", (value) => { delete ((value.documents as Array<{layer: {pages: Array<Record<string, unknown>>}}>)[0]!.layer.pages[0]!).tables; }],
    ["a profile of another document", (value) => { (value.documents as Array<{profile: Record<string, unknown>}>)[0]!.profile.documentId = "04_Divida.pdf"; }],
    ["a document named twice", (value) => { (value.documents as Array<Record<string, unknown>>)[1] = (value.documents as Array<Record<string, unknown>>)[0]!; }],
    ["a fallback that is the primary route", (value) => { (value.model as Record<string, unknown>).fallback = {provider: "anthropic", model: "claude-sonnet-5", effort: "high"}; }],
    ["a case label with surrounding space", (value) => { value.caseId = " caso-sintetico"; }],
    ["no document", (value) => { value.documents = []; }],
  ])("refuses %s", (_label, change) => {
    const value = snapshotInput();
    change(value);
    expect(extractionMeasurementSnapshotSchema.safeParse(value).success).toBe(false);
  });
});

describe("extraction measurement run", () => {
  it("counts the extractor's own passes without calling any model", async () => {
    const s = snapshot();
    const passes = await extractionMeasurementPasses(s);
    const {gateway} = scripted([]);
    const direct = await Promise.all(s.documents.map((document) => extractDocument({layer: document.layer, profile: document.profile, fileName: document.name, gateway})));
    expect(passes).toEqual(direct.map((result) => result.chunks.total));
    // The schedule earns a table pass beside its evidence window.
    expect(passes[1]).toBeGreaterThan(1);
  });

  it("extracts every document one pass at a time and publishes what the models answered", async () => {
    const s = snapshot();
    const {gateway, seen} = scripted([{candidates: [revenue], absent_fields: [], document_alerts: ["Alerta sintético"]}]);
    const result = await runExtractionMeasurement(s, gateway, ticking());
    expect(seen.peak).toBe(1);
    expect(seen.calls).toBe((await extractionMeasurementPasses(s)).reduce((total, passes) => total + passes, 0));
    expect(extractionMeasurementResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(result.extractor).toEqual(s.extractor);
    expect(result.documents.map((document) => document.name)).toEqual(["02_DF.pdf", "04_Divida.pdf"]);
    const [first] = result.documents;
    // The model's own answer and the counts travel; what the verifier makes of it is rebuilt where it is read.
    expect(Object.keys(first!.extraction).sort()).toEqual(["absentFields", "alerts", "chunks", "malformed", "raw", "usage"]);
    expect(first!.extraction.raw.map((candidate) => [candidate.field_path, candidate.value_raw])).toEqual([["historical_financials.2025.revenue", "1.234.567,89"]]);
    expect(first!.extraction.alerts).toEqual(["Alerta sintético"]);
    expect(first!.failures).toEqual([]);
    expect(first!.ms).toBeGreaterThan(0);
  });

  it("keeps a pass the model failed as a failed pass, as the script always reported it", async () => {
    const s = snapshot();
    const {gateway} = scripted([new ModelGatewayError("all model attempts failed for task \"extract_fields\"", "all_attempts_failed")]);
    const result = await runExtractionMeasurement(s, gateway, ticking());
    expect(result.documents[0]!.extraction.chunks).toEqual({total: 1, failed: 1});
    expect(result.documents[0]!.failures).toEqual([{pass: 1, of: 1, message: "all model attempts failed for task \"extract_fields\""}]);
    const reading = readExtractionMeasurementResult(JSON.parse(JSON.stringify(result)), s, await extractionMeasurementPasses(s));
    expect(reading.documents[0]!.failures).toEqual(result.documents[0]!.failures);
    expect(reading.documents[0]!.extraction.candidates).toEqual([]);
  });

  it("ends the run with a refusal of the transport, and no later pass reaches the gateway", async () => {
    const s = snapshot();
    const refusal = new Error("evaluation_stopped:transport_denied");
    const {gateway, seen} = scripted([refusal]);
    await expect(runExtractionMeasurement(s, gateway, ticking())).rejects.toBe(refusal);
    expect(seen.calls).toBe(1);
  });
});

describe("extraction measurement result, read back", () => {
  const run = async (s: ExtractionMeasurementSnapshot) => JSON.parse(JSON.stringify(await runExtractionMeasurement(s, scripted([{candidates: [revenue], absent_fields: [], document_alerts: []}]).gateway, ticking()))) as ExtractionMeasurementResult;

  it("reads the extraction of exactly these inputs and rebuilds its verified candidates as the extractor does", async () => {
    const s = snapshot();
    const result = await run(s);
    const reading = readExtractionMeasurementResult(result, s, await extractionMeasurementPasses(s));
    const direct = await extractDocument({layer: statement, profile: statementProfile, fileName: "02_DF.pdf", localeHint: "pt-BR",
      gateway: scripted([{candidates: [revenue], absent_fields: [], document_alerts: []}]).gateway});
    expect(JSON.parse(JSON.stringify(reading.documents[0]!.extraction))).toEqual(JSON.parse(JSON.stringify(direct)));
    expect(reading.documents[0]!.extraction.candidates.map((candidate) => [candidate.field_path, candidate.normalized_value, candidate.anchor_verified]))
      .toEqual([["historical_financials.2025.revenue", "1234567.89", true]]);
    expect(reading.documents.map((document) => [document.name, document.ms])).toEqual(result.documents.map((document) => [document.name, document.ms]));
  });

  it.each<[string, (result: ExtractionMeasurementResult) => void]>([
    ["another extractor", (result) => { result.extractor.promptVersion = "000000000000"; }],
    ["documents out of order", (result) => { result.documents.reverse(); }],
    ["a missing document", (result) => { result.documents.pop(); }],
    ["a raw candidate with a field the schema does not read", (result) => { (result.documents[0]!.extraction.raw[0] as Record<string, unknown>).normalized_value = "1234567.89"; }],
    ["a verified candidate sent beside the raw ones", (result) => { (result.documents[0]!.extraction as Record<string, unknown>).candidates = []; }],
    ["passes that do not add up", (result) => { result.documents[0]!.extraction.usage.calls += 1; }],
    ["a failure the counts do not show", (result) => { result.documents[0]!.failures.push({pass: 1, of: 1, message: "invented"}); }],
    ["an unknown field", (result) => { (result as unknown as Record<string, unknown>).extra = true; }],
  ])("refuses %s", async (_label, change) => {
    const s = snapshot();
    const result = await run(s);
    change(result);
    expect(() => readExtractionMeasurementResult(result, s)).toThrow();
  });

  it("refuses pass counts that differ from the plan of this snapshot", async () => {
    const s = snapshot();
    const result = await run(s);
    const plan = await extractionMeasurementPasses(s);
    expect(() => readExtractionMeasurementResult(result, s, [plan[0]! + 1, plan[1]!])).toThrow("extraction_result_mismatch: passes of 02_DF.pdf");
  });
});
