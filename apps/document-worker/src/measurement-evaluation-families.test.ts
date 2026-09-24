import {createHash, randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {
 executionCanonicalText,
 readStructuredOutputProbeResult,
 structuredOutputProbeSnapshotSchema,
 type GovernedEvaluationContract,
} from "@offroad/agent-contracts";
import {classificationMeasurementSnapshotSchema, documentClassificationVersion, readClassificationMeasurementResult} from "@offroad/document-classification";
import {
 documentExtractionVersion,
 extractionMeasurementPasses,
 extractionMeasurementSnapshotSchema,
 extractionPromptVersion,
 readExtractionMeasurementResult,
} from "@offroad/document-extraction";
import {documentLayerSchema} from "@offroad/document-intelligence";
import type {AdapterRequest, AdapterResponse, Provider, ProviderAdapter} from "@offroad/model-gateway";
import {evaluationFamilies} from "./evaluation-families";
import {measurementEvaluationFamilies} from "./measurement-evaluation-families";
import type {EvaluationOperation, EvaluationQueue, EvaluationQueueClaim, EvaluationReservation} from "./evaluation-queue";
import {governedEvaluationToolVersion} from "./governed-evaluation-gateway";
import {processGovernedEvaluation, type GovernedEvaluationDependencies} from "./process-governed-evaluation";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const ids = {job: "50000000-0000-4000-8000-000000000001", lease: "50000000-0000-4000-8000-000000000002", execution: "50000000-0000-4000-8000-000000000003",
 organization: "50000000-0000-4000-9000-000000000001"};
const connection = {accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-binding", region: "global"};
const tool = (provider: string, model: string) => ({id: `provider:${provider}:${model}`, version: governedEvaluationToolVersion, effect: "read_only" as const});
const marker = (reason: string) => `{"reason":"${reason}","status":"partial"}`;

/** A claim of one evaluation of the given script and snapshot, and a queue that answers like the database. */
function fixture(scriptId: string, snapshot: unknown, audience: {caseId: string; caseVersion: string}, tools: GovernedEvaluationContract["tools"], sources: string[]) {
 const snapshotText = executionCanonicalText(snapshot);
 const contract: GovernedEvaluationContract = {schemaVersion: "governed-evaluation-contract.v1", executionId: ids.execution, organizationId: ids.organization,
  requestId: ids.execution, processingRunId: ids.execution, purpose: "evaluation", audience: {kind: "evaluation_panel", ...audience, scriptId}, tools,
  budget: {maxCostMicrousd: 50_000_000, maxModelCalls: 100, maxDurationMs: 600_000, expiresAt: new Date(Date.now() + 3_600_000).toISOString()},
  inputs: {fingerprint: sha(snapshotText), sources: sources.map((contentHash) => ({contentHash}))}, requestedAt: new Date(Date.now() - 1000).toISOString()};
 const contractText = executionCanonicalText(contract);
 const claim: EvaluationQueueClaim = {claimed: true, jobId: ids.job, leaseId: ids.lease, capability: "x".repeat(64), attempt: 1, executionId: ids.execution,
  contractText, contractFingerprint: sha(contractText), snapshotText, elapsedDurationMs: 0, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), budgetExpired: false};
 const queue = {
  claim: vi.fn(async () => claim),
  renew: vi.fn(async () => ({allowed: true as const, jobId: ids.job, leaseId: ids.lease, executionId: ids.execution, organizationId: ids.organization,
   processingRunId: ids.execution, contractFingerprint: claim.contractFingerprint, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
   elapsedDurationMs: 0, remainingDurationMs: 600_000})),
  reserve: vi.fn(async (_claim: EvaluationQueueClaim, operation: EvaluationOperation): Promise<EvaluationReservation> =>
   ({allowed: true, operationId: operation.operationId, decisionId: randomUUID(), state: "reserved", replayed: false, mayExecute: true})),
  settle: vi.fn(async (_claim: EvaluationQueueClaim, _operationId: string, settlement: {outcome: "settled" | "uncertain"}) => ({state: settlement.outcome, replayed: false})),
  commit: vi.fn(async () => ({replayed: false})),
 } satisfies EvaluationQueue;
 const committed = () => {
  const [, inputHash, text, outcome, reason] = queue.commit.mock.calls[0] as unknown as [unknown, string, string, string, string];
  return {inputHash, text, outcome, reason, published: JSON.parse(text) as unknown};
 };
 return {claim, contract, queue, committed};
}

/** A spy adapter: records every request it would transmit and answers from the script it is given. */
function spy(provider: Provider, script: (request: AdapterRequest, call: number) => AdapterResponse | Promise<AdapterResponse>) {
 const requests: AdapterRequest[] = [];
 const complete = vi.fn(async (request: AdapterRequest) => { requests.push(request); return script(request, requests.length); });
 const adapter: ProviderAdapter = {provider, complete};
 return {adapter, complete, requests};
}
const reply = (output: unknown, model: string): AdapterResponse => ({output, rawText: JSON.stringify(output), usage: {inputTokens: 900, outputTokens: 60, cachedInputTokens: 0}, model, stopReason: "end"});
const deps = (adapters: GovernedEvaluationDependencies["adapters"]): GovernedEvaluationDependencies =>
 ({adapters, connections: {anthropic: connection, openai: connection}, heartbeatMs: 60_000});

const statement = documentLayerSchema.parse({documentId: "02_DF.pdf", documentVersion: 1, kind: "pdf", pages: [
 {n: 1, scanned: false, blocks: [{id: "p1.b1", kind: "heading", text: "Demonstrações financeiras auditadas de 2025"}], tables: []},
 {n: 2, scanned: false, blocks: [{id: "p2.b1", kind: "note", text: "Valores em reais"}], tables: [
  {id: "p2.t1", header: ["Conta", "2025"], rows: [{id: "p2.t1.r1", cells: [{id: "p2.t1.r1.c1", text: "Receita líquida"}, {id: "p2.t1.r1.c2", text: "1.234.567,89"}]}]}]},
]});
const letter = documentLayerSchema.parse({documentId: "01_Carta.docx", documentVersion: 1, kind: "docx", sections: [
 {id: "sec1", heading: "Pedido", paragraphs: [{id: "sec1.p1", kind: "text", text: "A companhia sintética pede R$ 10 milhões para capital de giro."}], tables: []}]});
const profile = (documentId: string, kind: string, informationClass: string, evidenceRank: number) =>
 ({documentId, kind, informationClass, evidenceRank, entityName: "Empresa Sintética S.A.", language: "pt", quality: {alerts: []}, confidence: 1});

const extractionSnapshot = (promptVersion = extractionPromptVersion()) => extractionMeasurementSnapshotSchema.parse(JSON.parse(JSON.stringify({
 schemaVersion: "extraction-measurement-snapshot.v1", caseId: "caso-sintetico", caseVersion: "2026.09.24-v1",
 extractor: {version: documentExtractionVersion, promptVersion},
 model: {primary: {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}, fallback: {provider: "openai", model: "gpt-5.6-terra", effort: "medium"},
  maxOutputTokens: 8_000, timeoutMs: 240_000},
 documents: [
  {name: "01_Carta.docx", sha256: "c".repeat(64), profile: profile("01_Carta.docx", "capital_request_letter", "company_document", 6), layer: letter},
  {name: "02_DF.pdf", sha256: "a".repeat(64), profile: profile("02_DF.pdf", "audited_financial_statements", "audited", 1), layer: statement},
 ],
})));
const extractionTools = [tool("anthropic", "claude-sonnet-5"), tool("openai", "gpt-5.6-terra")];
const revenue = {field_path: "historical_financials.2025.revenue", value_raw: "1.234.567,89", value_type: "number", scale: 1, information_class: "audited",
 anchor: {kind: "table_cell", id: "p2.t1.r1.c2", page: 2}, quote: "1.234.567,89", confidence: 0.9};

describe("measurement families in the registry", () => {
 it("registers each family under its script's file name", () => {
  expect(Object.keys(measurementEvaluationFamilies).sort()).toEqual(["measure-classification", "measure-extraction", "probe-structured-output"]);
  for (const [scriptId, family] of Object.entries(measurementEvaluationFamilies)) expect(evaluationFamilies[scriptId]).toBe(family);
  expect(Object.isFrozen(evaluationFamilies)).toBe(true);
 });
});

describe("extraction measurement through the governed consumer", () => {
 it("reserves every pass, one at a time, and publishes the extraction the script reads back", async () => {
  const snapshot = extractionSnapshot();
  const f = fixture("measure-extraction", snapshot, {caseId: "caso-sintetico", caseVersion: "2026.09.24-v1"}, extractionTools, ["a".repeat(64), "c".repeat(64)]);
  let inFlight = 0, peak = 0;
  const anthropic = spy("anthropic", async (request) => {
   inFlight += 1; peak = Math.max(peak, inFlight);
   await new Promise((resolve) => setTimeout(resolve, 2));
   inFlight -= 1;
   const cites = request.input.some((part) => part.type === "text" && part.text.includes("[p2.t1.r1]"));
   return reply({candidates: cites ? [revenue] : [], absent_fields: [], document_alerts: []}, "claude-sonnet-5");
  });
  const openai = spy("openai", () => reply({candidates: [], absent_fields: [], document_alerts: []}, "gpt-5.6-terra"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: openai.adapter})))
   .toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  const plan = await extractionMeasurementPasses(snapshot);
  const passes = plan.reduce((total, count) => total + count, 0);
  expect(peak).toBe(1);
  expect(anthropic.complete).toHaveBeenCalledTimes(passes);
  expect(openai.complete).not.toHaveBeenCalled();
  expect(f.queue.reserve).toHaveBeenCalledTimes(passes);
  expect(f.queue.reserve.mock.calls.every(([, operation]) => operation.route.model === "claude-sonnet-5" && operation.reservedCalls === 1
   && operation.resources.join(",") === "inference,prompt_cache,schema_cache")).toBe(true);
  expect(f.queue.settle.mock.calls.map(([, , settlement]) => settlement.outcome)).toEqual(Array.from({length: passes}, () => "settled"));
  const {outcome, reason, published, inputHash} = f.committed();
  expect([outcome, reason, inputHash]).toEqual(["succeeded", "evaluated", f.contract.inputs.fingerprint]);
  const result = readExtractionMeasurementResult(published, snapshot, plan);
  expect(result.documents.map((document) => document.name)).toEqual(["01_Carta.docx", "02_DF.pdf"]);
  expect(result.documents[1]!.extraction.candidates.map((candidate) => [candidate.field_path, candidate.normalized_value, candidate.anchor_verified]))
   .toEqual([["historical_financials.2025.revenue", "1234567.89", true]]);
 });

 it("stops at the first denied reservation: nothing sent, no later pass reserved, partial transport_denied", async () => {
  const snapshot = extractionSnapshot();
  const f = fixture("measure-extraction", snapshot, {caseId: "caso-sintetico", caseVersion: "2026.09.24-v1"}, extractionTools, ["a".repeat(64), "c".repeat(64)]);
  f.queue.reserve.mockResolvedValue({allowed: false, decisionId: randomUUID(), reasons: ["processing_resource_ineligible:inference"], mayExecute: false});
  const anthropic = spy("anthropic", () => reply({candidates: []}, "never")), openai = spy("openai", () => reply({candidates: []}, "never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: openai.adapter})))
   .toEqual({status: "partial", reason: "transport_denied", replayed: false});
  expect(f.queue.reserve).toHaveBeenCalledOnce();
  expect(anthropic.complete).not.toHaveBeenCalled();
  expect(openai.complete).not.toHaveBeenCalled();
  expect(f.committed().text).toBe(marker("transport_denied"));
 });

 it("stops when the budget refuses a later pass, instead of publishing an extraction with holes", async () => {
  const snapshot = extractionSnapshot();
  const f = fixture("measure-extraction", snapshot, {caseId: "caso-sintetico", caseVersion: "2026.09.24-v1"}, extractionTools, ["a".repeat(64), "c".repeat(64)]);
  const allowed = f.queue.reserve.getMockImplementation()!;
  f.queue.reserve.mockImplementationOnce(allowed).mockResolvedValue({allowed: false, state: "partial_budget_exhausted", mayExecute: false});
  const anthropic = spy("anthropic", () => reply({candidates: [], absent_fields: [], document_alerts: []}, "claude-sonnet-5"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: spy("openai", () => reply({}, "x")).adapter})))
   .toEqual({status: "partial", reason: "budget_exhausted", replayed: false});
  expect(anthropic.complete).toHaveBeenCalledOnce();
  expect(f.queue.reserve).toHaveBeenCalledTimes(2);
 });

 it("refuses a snapshot built for another prompt before anything is reserved", async () => {
  const snapshot = extractionSnapshot("000000000000");
  const f = fixture("measure-extraction", snapshot, {caseId: "caso-sintetico", caseVersion: "2026.09.24-v1"}, extractionTools, ["a".repeat(64), "c".repeat(64)]);
  const anthropic = spy("anthropic", () => reply({}, "never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "evaluation_failed", replayed: false});
  expect(f.queue.reserve).not.toHaveBeenCalled();
 });
});

const classificationSnapshot = () => classificationMeasurementSnapshotSchema.parse(JSON.parse(JSON.stringify({
 schemaVersion: "classification-measurement-snapshot.v1", caseId: "caso-sintetico", caseVersion: "2026.09.24-v1", classifierVersion: documentClassificationVersion,
 model: {primary: {provider: "openai", model: "gpt-5.6-terra", effort: "low"}, fallback: {provider: "anthropic", model: "claude-sonnet-5", effort: "low"}, maxOutputTokens: 4_000, timeoutMs: 60_000},
 documents: [
  {name: "01_Carta.docx", sha256: "c".repeat(64), parsed: {layer: letter, parserVersions: {docx: "synthetic"}, conversion: null, warnings: [],
   detected: {kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", mismatch: false}}},
  {name: "02_DF.pdf", sha256: "a".repeat(64), parsed: {layer: statement, parserVersions: {pdf: "synthetic"}, conversion: null, warnings: [],
   detected: {kind: "pdf", mime: "application/pdf", extension: "pdf", mismatch: false}}},
 ],
})));
const profileAnswer = (documentKind: string, informationClass: string) => ({documentKind, informationClass, language: "pt", summary: "Resumo sintético.", confidence: 0.88, reasoning: "Prova sintética."});

describe("classification measurement through the governed consumer", () => {
 it("classifies each document on the primary route and publishes the record's columns", async () => {
  const snapshot = classificationSnapshot();
  const f = fixture("measure-classification", snapshot, {caseId: "caso-sintetico", caseVersion: "2026.09.24-v1"},
   [tool("openai", "gpt-5.6-terra"), tool("anthropic", "claude-sonnet-5")], ["a".repeat(64), "c".repeat(64)]);
  const openai = spy("openai", (_request, call) => reply(call === 1 ? profileAnswer("capital_request_letter", "company_document") : profileAnswer("audited_financial_statements", "audited"), "gpt-5.6-terra"));
  const anthropic = spy("anthropic", () => reply({}, "never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: openai.adapter})))
   .toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  expect(anthropic.complete).not.toHaveBeenCalled();
  expect(f.queue.reserve.mock.calls.map(([, operation]) => operation.route.model)).toEqual(["gpt-5.6-terra", "gpt-5.6-terra"]);
  const result = readClassificationMeasurementResult(f.committed().published, snapshot);
  expect(result.documents.map((document) => [document.document, document.actualKind, document.actualClass, document.calls]))
   .toEqual([["01_Carta.docx", "capital_request_letter", "company_document", 1], ["02_DF.pdf", "audited_financial_statements", "audited", 1]]);
 });

 it("ends partial transport_denied at a denied reservation, with nothing sent", async () => {
  const snapshot = classificationSnapshot();
  const f = fixture("measure-classification", snapshot, {caseId: "caso-sintetico", caseVersion: "2026.09.24-v1"},
   [tool("openai", "gpt-5.6-terra"), tool("anthropic", "claude-sonnet-5")], ["a".repeat(64), "c".repeat(64)]);
  f.queue.reserve.mockResolvedValue({allowed: false, decisionId: randomUUID(), reasons: ["processing_resource_ineligible:inference"], mayExecute: false});
  const openai = spy("openai", () => reply({}, "never")), anthropic = spy("anthropic", () => reply({}, "never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: openai.adapter})))
   .toEqual({status: "partial", reason: "transport_denied", replayed: false});
  expect(f.queue.reserve).toHaveBeenCalledOnce();
  expect(openai.complete).not.toHaveBeenCalled();
  expect(anthropic.complete).not.toHaveBeenCalled();
 });
});

const probeSnapshot = () => structuredOutputProbeSnapshotSchema.parse({
 schemaVersion: "structured-output-probe-snapshot.v1", caseId: "structured-output-probe", caseVersion: "2026.09.24-v1",
 route: {provider: "anthropic", model: "claude-sonnet-5"}, system: "You classify one sentence into the requested JSON. Return the requested JSON only.",
 input: [{type: "text", text: "{\"latestUserMessage\":\"Frase sintética.\"}"}], maxOutputTokens: 1_500, timeoutMs: 60_000,
 variants: [{effort: "low", thinking: "off", shape: "flat"}, {effort: "medium", thinking: "adaptive", shape: "flat"}],
});

describe("structured output probe through the governed consumer", () => {
 it("sends each shape once on its route and effort, with no fallback, and publishes the verdicts", async () => {
  const snapshot = probeSnapshot();
  const f = fixture("probe-structured-output", snapshot, {caseId: "structured-output-probe", caseVersion: "2026.09.24-v1"}, [tool("anthropic", "claude-sonnet-5")], []);
  const anthropic = spy("anthropic", (_request, call) => reply(call === 1 ? {intent: "refinanciamento", confidence: 0.9, company: null} : {wrong: true}, "claude-sonnet-5"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  expect(anthropic.requests.map((request) => [request.effort, request.thinking ?? "adaptive", request.schemaName, request.maxOutputTokens, request.timeoutMs]))
   .toEqual([["low", "off", "probe_flat", 1_500, 60_000], ["medium", "adaptive", "probe_flat", 1_500, 60_000]]);
  const result = readStructuredOutputProbeResult(f.committed().published, snapshot);
  expect(result.variants.map((variant) => [variant.label, variant.verdict])).toEqual([
   ["effort=low thinking=off schema=flat", "accepted"], ["effort=medium thinking=adaptive schema=flat", "failed"]]);
  expect(result.variants[1]).toMatchObject({code: "all_attempts_failed", attempts: [{outcome: "invalid_output"}]});
 });

 it("cannot publish a provider's rejection: the failed send is settled uncertain and the evaluation ends partial", async () => {
  const snapshot = probeSnapshot();
  const f = fixture("probe-structured-output", snapshot, {caseId: "structured-output-probe", caseVersion: "2026.09.24-v1"}, [tool("anthropic", "claude-sonnet-5")], []);
  const anthropic = spy("anthropic", (_request, call) => {
   if (call === 1) throw Object.assign(new Error("400 invalid_request_error: synthetic rejection"), {status: 400});
   return reply({intent: "x", confidence: 1, company: null}, "claude-sonnet-5");
  });
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "operation_uncertain", replayed: false});
  expect(f.queue.settle.mock.calls.map(([, , settlement]) => settlement.outcome)).toEqual(["uncertain", "settled"]);
  expect(f.committed().text).toBe(marker("operation_uncertain"));
 });
});
