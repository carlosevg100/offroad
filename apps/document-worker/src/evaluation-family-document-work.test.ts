import {createHash, randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {
 advisorResponseLiveResultSchema,
 advisorResponseLiveSnapshotSchema,
 documentWorkContinuationResultSchema,
 documentWorkContinuationSnapshotSchema,
 documentWorkProductLiveContentHashes,
 documentWorkProductLiveResultSchema,
 documentWorkProductLiveSnapshotSchema,
 evaluationTaskPolicy,
 executionCanonicalText,
 executiveSynthesisLiveResultSchema,
 executiveSynthesisLiveSnapshotSchema,
 type GovernedEvaluationContract,
} from "@offroad/agent-contracts";
import {fingerprintJson} from "@offroad/case-understanding";
import {defaultTaskPolicies, type AdapterRequest, type AdapterResponse, type Provider, type ProviderAdapter} from "@offroad/model-gateway";
import {documentWorkProductLiveCases} from "@offroad/testing-fixtures/document-work-product-live";
import {documentWorkSourceReviewCases} from "@offroad/testing-fixtures/document-work-source-review";
import {evaluationFamilies} from "./evaluation-families";
import {documentWorkEvaluationFamilies} from "./evaluation-family-document-work";
import {documentWorkSyntheticAnswer} from "./evaluation-family-document-work.test-support";
import type {EvaluationOperation, EvaluationQueue, EvaluationQueueClaim, EvaluationReservation} from "./evaluation-queue";
import {governedEvaluationToolVersion} from "./governed-evaluation-gateway";
import {prepare, processGovernedEvaluation} from "./process-governed-evaluation";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const ids = {job: "40000000-0000-4000-8000-0000000000d1", lease: "40000000-0000-4000-8000-0000000000d2", execution: "40000000-0000-4000-8000-0000000000d3",
 organization: "40000000-0000-4000-9000-0000000000d1"};
const connection = {accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-binding", region: "global"};
const connections = {anthropic: connection, openai: connection};

const documentarySnapshot = () => documentWorkProductLiveSnapshotSchema.parse({
 schemaVersion: "document-work-product-live-snapshot.v1",
 policy: evaluationTaskPolicy(defaultTaskPolicies.preliminary_understanding),
 goldCases: documentWorkProductLiveCases,
 sourceReviewControls: documentWorkSourceReviewCases,
});
const continuationSnapshot = () => documentWorkContinuationSnapshotSchema.parse({
 schemaVersion: "document-work-product-continuation-snapshot.v1",
 policy: evaluationTaskPolicy({...defaultTaskPolicies.preliminary_understanding, fallback: undefined as never}),
 plan: {sourceRunId: "34467680287", sourceReceiptSha256: "0".repeat(64), caseId: "source-review-diligence-request-versus-commitment", remainingCalls: 1,
  maxCostUsd: 0.42, priorCalls: 25, priorCostUsd: 0.25},
 control: documentWorkSourceReviewCases.find((sample) => sample.id === "source-review-diligence-request-versus-commitment"),
});
const advisorSnapshot = () => advisorResponseLiveSnapshotSchema.parse({
 schemaVersion: "advisor-response-live-snapshot.v1",
 policy: evaluationTaskPolicy(defaultTaskPolicies.agent_operation_brief),
 routes: {anthropic: {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}, openai: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}},
 input: JSON.stringify({locale: "pt-BR", latestUserMessage: "Pedido sintético de reunião.", executionRoute: {action: "clarify", reasonCode: "missing_mission_context", analysisScope: null}}),
});
/** A small synthetic case: the identity and the request, both verified, and one sector fact. */
const candidate = (fieldPath: string, normalizedValue: string, valueType: "text" | "number", sourceDocument: string) => ({fieldPath, normalizedValue, valueType, sourceDocument,
 informationClass: "company_document", evidenceRank: 4, confidence: 0.995, anchorVerified: true, entityName: "Companhia Sintética S.A.", entityScope: "standalone",
 currency: "BRL", unit: "currency", scale: "1", anchor: {document: sourceDocument, generatedField: fieldPath}});
const synthesisSnapshot = () => executiveSynthesisLiveSnapshotSchema.parse({
 schemaVersion: "executive-synthesis-live-snapshot.v1",
 fixtureFingerprint: "f".repeat(64),
 policies: {case_brief: evaluationTaskPolicy(defaultTaskPolicies.case_brief), audit_evidence: evaluationTaskPolicy(defaultTaskPolicies.audit_evidence)},
 reviewers: {anthropic: {provider: "anthropic", model: "claude-opus-5", effort: "high"}, openai: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}},
 case: {archetypeId: "growth_expansion", referenceDate: "2026-08-24",
  candidates: [candidate("company.legal_name", "Companhia Sintética S.A.", "text", "company-profile.md"), candidate("company.sector", "Varejo", "text", "company-profile.md"),
   candidate("transaction.requested_amount", "40000000", "number", "capital-request.md")],
  documents: [{id: "doc-company", kind: "company_registration"}, {id: "doc-request", kind: "capital_request_letter"}]},
});

const tool = (provider: string, model: string) => ({id: `provider:${provider}:${model}`, version: governedEvaluationToolVersion, effect: "read_only" as const});
const everyRoute = [tool("anthropic", "claude-sonnet-5"), tool("anthropic", "claude-opus-5"), tool("openai", "gpt-5.6-terra"), tool("openai", "gpt-5.6-sol")];

/** One claim of the family's script, with a fake queue whose reservations the test decides. */
function fixture(scriptId: string, snapshot: unknown, options: {deny?: boolean; maxModelCalls?: number} = {}) {
 const prepared = prepare({audience: {caseId: "x", caseVersion: "x", scriptId}, inputs: {sources: []}, tools: everyRoute} as unknown as GovernedEvaluationContract,
  snapshot, evaluationFamilies);
 const family = documentWorkEvaluationFamilies[scriptId]!.prepare(snapshot);
 expect(prepared).toBeNull(); // a contract that names another case or other sources is refused, whatever the snapshot
 const snapshotText = executionCanonicalText(snapshot);
 const contract: GovernedEvaluationContract = {schemaVersion: "governed-evaluation-contract.v1", executionId: ids.execution, organizationId: ids.organization,
  requestId: ids.execution, processingRunId: ids.execution, purpose: "evaluation", audience: {kind: "evaluation_panel", ...family.audience, scriptId},
  tools: everyRoute, budget: {maxCostMicrousd: 50_000_000, maxModelCalls: options.maxModelCalls ?? 40, maxDurationMs: 3_600_000, expiresAt: new Date(Date.now() + 3_600_000).toISOString()},
  inputs: {fingerprint: sha(snapshotText), sources: family.contentHashes.map((contentHash) => ({contentHash}))}, requestedAt: new Date(Date.now() - 1000).toISOString()};
 const contractText = executionCanonicalText(contract);
 const claim: EvaluationQueueClaim = {claimed: true, jobId: ids.job, leaseId: ids.lease, capability: "x".repeat(64), attempt: 1, executionId: ids.execution,
  contractText, contractFingerprint: sha(contractText), snapshotText, elapsedDurationMs: 0, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), budgetExpired: false};
 const queue = {
  claim: vi.fn(async () => claim),
  renew: vi.fn(async () => ({allowed: true as const, jobId: ids.job, leaseId: ids.lease, executionId: ids.execution, organizationId: ids.organization,
   processingRunId: ids.execution, contractFingerprint: claim.contractFingerprint, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
   elapsedDurationMs: 0, remainingDurationMs: 3_600_000})),
  reserve: vi.fn(async (_claim: EvaluationQueueClaim, operation: EvaluationOperation): Promise<EvaluationReservation> => options.deny
   ? {allowed: false, decisionId: randomUUID(), reasons: ["processing_resource_ineligible:inference"], mayExecute: false}
   : {allowed: true, operationId: operation.operationId, decisionId: randomUUID(), state: "reserved", replayed: false, mayExecute: true}),
  settle: vi.fn(async (_claim: EvaluationQueueClaim, _operationId: string, settlement: {outcome: "settled" | "uncertain"}) => ({state: settlement.outcome, replayed: false})),
  commit: vi.fn(async () => ({replayed: false})),
 } satisfies EvaluationQueue;
 return {claim, contract, queue, family};
}

/** Spy adapters that answer every request synthetically and record what they would transmit. */
function synthetic(controls: Parameters<typeof documentWorkSyntheticAnswer>[1] = []) {
 const requests: Array<{provider: Provider; request: AdapterRequest}> = [];
 const adapter = (provider: Provider): ProviderAdapter => ({provider, complete: vi.fn(async (request: AdapterRequest): Promise<AdapterResponse> => {
  requests.push({provider, request});
  return documentWorkSyntheticAnswer(request, controls);
 })});
 return {adapters: {anthropic: adapter("anthropic"), openai: adapter("openai")}, requests};
}

async function evaluate(scriptId: string, snapshot: unknown, options: {deny?: boolean; controls?: Parameters<typeof documentWorkSyntheticAnswer>[1]} = {}) {
 const f = fixture(scriptId, snapshot, options);
 const providers = synthetic(options.controls);
 const result = await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, {adapters: providers.adapters, connections, heartbeatMs: 60_000});
 const [, , text, outcome, reason] = f.queue.commit.mock.calls[0] as unknown as [unknown, string, string, string, string];
 return {result, text, outcome, reason, queue: f.queue, requests: providers.requests, family: f.family};
}

describe("document work product families through the governed consumer", () => {
 it("registers the four scripts beside the baseline, each under its own file name", () => {
  expect(Object.keys(evaluationFamilies).sort()).toEqual(["continue-document-work-product-live", "run-advisor-response-live", "run-document-work-product-live",
   "run-executive-synthesis-live", "run-gold-baseline"]);
  for (const [scriptId, family] of Object.entries(documentWorkEvaluationFamilies)) expect(evaluationFamilies[scriptId]).toBe(family);
 });

 it("runs the documentary executor and its controls with every attempt reserved, and publishes the record the script wrote", async () => {
  const snapshot = documentarySnapshot();
  const run = await evaluate("run-document-work-product-live", snapshot, {controls: snapshot.sourceReviewControls});
  expect(run.result).toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  const record = documentWorkProductLiveResultSchema.parse(JSON.parse(run.text));
  expect(executionCanonicalText(record)).toBe(run.text);
  expect(record.passed).toBe(true);
  expect(record.runs.map((entry) => [entry.caseId, entry.repeat])).toEqual(snapshot.goldCases.flatMap((sample) => [[sample.id, 1], [sample.id, 2]]));
  expect(record.sourceReviewControls.map((entry) => [entry.caseId, entry.passed])).toEqual(snapshot.sourceReviewControls.map((sample) => [sample.id, true]));
  // Two provider calls per gold run and one per control, each reserved and settled once, all on the primary route.
  expect([record.spent.calls, record.sourceReviewControlSpend.calls, record.budget.sourceReviewControls.maxCalls]).toEqual([12, 8, 14]);
  expect(run.queue.reserve).toHaveBeenCalledTimes(20);
  expect(run.queue.settle).toHaveBeenCalledTimes(20);
  expect(new Set(run.requests.map(({provider, request}) => `${provider}:${request.model}`))).toEqual(new Set(["anthropic:claude-sonnet-5"]));
  expect(record.gatewayRequests.map((request) => [request.schemaName, request.outcome, request.spent.calls])).toEqual(
   snapshot.goldCases.flatMap(() => [1, 2].flatMap(() => [["document_work_selection_v1", "ok", 1], ["document_work_source_review_revision_v3", "ok", 1]])));
  expect(record.runs.map((entry) => entry.providerCallRange)).toEqual(Array.from({length: 6}, (_, index) => ({start: index * 2, end: index * 2 + 2})));
  expect(record.runs.every((entry) => entry.responses.map((response) => response.providerCallIndex).join() === `${entry.providerCallRange.start},${entry.providerCallRange.start + 1}`)).toBe(true);
  // The snapshot carries the authored fixtures byte for byte: their fingerprints survive the transport.
  expect([record.fixtureFingerprint, record.sourceReviewFixtureFingerprint]).toEqual([fingerprintJson(documentWorkProductLiveCases), fingerprintJson(documentWorkSourceReviewCases)]);
  expect(record.policy).toEqual(snapshot.policy);
  // The record carries no provenance of the requesting run: the script adds its own.
  expect(record).not.toHaveProperty("gitSha");
  expect(documentWorkProductLiveContentHashes(snapshot)).toEqual(run.family.contentHashes);
 });

 it("keeps the continuation to its one call and its dollars", async () => {
  const snapshot = continuationSnapshot();
  const run = await evaluate("continue-document-work-product-live", snapshot, {controls: [snapshot.control]});
  expect(run.result).toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  const record = documentWorkContinuationResultSchema.parse(JSON.parse(run.text));
  expect([record.passed, record.spent.calls, record.combinedCalls, record.failure]).toEqual([true, 1, 26, null]);
  expect(run.family.routes).toEqual([snapshot.policy.primary]);
  expect(run.queue.reserve).toHaveBeenCalledTimes(1);
 });

 it("probes the advisor contract on both routes and both shapes, never falling back", async () => {
  const run = await evaluate("run-advisor-response-live", advisorSnapshot());
  expect(run.result).toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  const record = advisorResponseLiveResultSchema.parse(JSON.parse(run.text));
  expect(record.passed).toBe(true);
  expect(record.results.map((result) => [result.provider, result.shape, result.passed, result.start, result.end])).toEqual([
   ["anthropic", "prior_structured", true, 0, 1], ["anthropic", "current_prompted", true, 1, 2], ["openai", "prior_structured", true, 2, 3], ["openai", "current_prompted", true, 3, 4]]);
  expect(run.requests.map(({provider, request}) => [provider, request.model, request.outputMode ?? "structured", request.maxOutputTokens])).toEqual([
   ["anthropic", "claude-sonnet-5", "structured", 2000], ["anthropic", "claude-sonnet-5", "prompted_json", 6000],
   ["openai", "gpt-5.6-sol", "structured", 2000], ["openai", "gpt-5.6-sol", "prompted_json", 6000]]);
  // The prompted shape needs no schema cache; the structured shape does.
  expect(run.queue.reserve.mock.calls.map(([, operation]) => operation.resources.includes("schema_cache"))).toEqual([true, false, true, false]);
 });

 it("writes and audits the executive synthesis in both locales with the reviewer on the other provider", async () => {
  const run = await evaluate("run-executive-synthesis-live", synthesisSnapshot());
  expect(run.result).toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  const record = executiveSynthesisLiveResultSchema.parse(JSON.parse(run.text));
  expect(record.passed).toBe(true);
  expect(record.results.map((result) => [result.locale, result.passed, result.summaryClaimIds, result.start, result.end]))
   .toEqual([["pt", true, ["identity-company", "request-amount"], 0, 3], ["en", true, ["identity-company", "request-amount"], 3, 6]]);
  expect(run.requests.map(({provider, request}) => `${provider}:${request.model}:${request.schemaName}`)).toEqual(["pt", "en"].flatMap(() => [
   "anthropic:claude-opus-5:case_brief", "openai:gpt-5.6-sol:semantic_claim_audit_revision_v2", "openai:gpt-5.6-sol:semantic_claim_audit_v2"]));
 });

 it.each([
  ["run-document-work-product-live", documentarySnapshot],
  ["continue-document-work-product-live", continuationSnapshot],
  ["run-advisor-response-live", advisorSnapshot],
  ["run-executive-synthesis-live", synthesisSnapshot],
 ] as const)("ends %s partial with transport_denied when the first reservation is denied, with nothing sent", async (scriptId, snapshot) => {
  const run = await evaluate(scriptId, snapshot(), {deny: true});
  expect(run.result).toEqual({status: "partial", reason: "transport_denied", replayed: false});
  expect([run.outcome, run.reason, run.text]).toEqual(["partial", "transport_denied", '{"reason":"transport_denied","status":"partial"}']);
  expect(run.requests).toEqual([]);
  expect(run.queue.reserve).toHaveBeenCalledTimes(1);
 });

 it("refuses a snapshot a family cannot read before anything is reserved", () => {
  const families = documentWorkEvaluationFamilies;
  expect(() => families["run-document-work-product-live"]!.prepare({...documentarySnapshot(), extra: true})).toThrow();
  expect(() => families["run-executive-synthesis-live"]!.prepare({...synthesisSnapshot(), case: {...synthesisSnapshot().case, archetypeId: "unknown_archetype"}})).toThrow();
  expect(() => families["run-executive-synthesis-live"]!.prepare({...synthesisSnapshot(), case: {...synthesisSnapshot().case, documents: [{id: "d", kind: "not_a_kind"}]}})).toThrow();
  expect(() => families["continue-document-work-product-live"]!.prepare({...continuationSnapshot(), control: documentWorkSourceReviewCases[0]})).toThrow();
  expect(() => families["continue-document-work-product-live"]!.prepare({...continuationSnapshot(), policy: evaluationTaskPolicy(defaultTaskPolicies.preliminary_understanding)})).toThrow();
  expect(() => families["run-advisor-response-live"]!.prepare({...advisorSnapshot(), routes: {anthropic: advisorSnapshot().routes.openai, openai: advisorSnapshot().routes.openai}})).toThrow();
 });
});
