import {createHash, randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {
 INTENT_CLASSIFIER_SYSTEM,
 SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
 executionCanonicalText,
 intentClassifierOutputSchema,
 intentRouterGoldCallLogSchema,
 intentRouterGoldResultSchema,
 intentRouterGoldSnapshotSchema,
 type GovernedEvaluationContract,
 type IntentRouterGoldSnapshot,
} from "@offroad/agent-contracts";
import {estimateCostUsd, type AdapterRequest, type AdapterResponse, type GatewayCallLog, type Provider, type ProviderAdapter} from "@offroad/model-gateway";
import {evaluationFamilies} from "./evaluation-families";
import type {EvaluationOperation, EvaluationQueue, EvaluationQueueClaim, EvaluationReservation} from "./evaluation-queue";
import {governedEvaluationToolVersion, microusdCeil} from "./governed-evaluation-gateway";
import {intentRouterGoldFamily} from "./intent-router-gold-family";
import {processGovernedEvaluation} from "./process-governed-evaluation";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const ids = {job: "41000000-0000-4000-8000-000000000001", lease: "41000000-0000-4000-8000-000000000002", execution: "41000000-0000-4000-8000-000000000003",
 organization: "41000000-0000-4000-9000-000000000001"};
const connection = {accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-binding", region: "global"};
const tool = (provider: string, model: string) => ({id: `provider:${provider}:${model}`, version: governedEvaluationToolVersion, effect: "read_only" as const});
const sonnet = {provider: "anthropic" as const, model: "claude-sonnet-5", effort: "low" as const};
const terra = {provider: "openai" as const, model: "gpt-5.6-terra", effort: "low" as const};

/** Synthetic turns authored for this test; the canonical gold never enters the worker's tests. */
const messages = {
 preflight: "Preciso preparar uma reunião com a Camil sobre refinanciamento.",
 other: "Organize a reunião com a Camil sobre refinanciamento amanhã.",
};
const inputs = (message: string) => ({
 classifierInput: {locale: "pt-BR" as const, latestUserMessage: message, recentConversation: [], entryJob: null, documentCount: 0},
 objectInput: {locale: "pt-BR" as const, latestUserMessage: message, recentConversation: [], activeWorkContext: null},
});
function snapshot(): IntentRouterGoldSnapshot {
 return intentRouterGoldSnapshotSchema.parse({
  schemaVersion: "intent-router-gold-snapshot.v1",
  audience: {caseId: "intent-router-gold", caseVersion: `manifest-${"b".repeat(16)}`},
  model: {route_intent: {primary: sonnet, fallback: terra, maxOutputTokens: 4000}, extract_semantic_objects: {primary: sonnet, fallback: terra, maxOutputTokens: 3000}},
  preflight: {caseId: "gc01", turnId: "gc01-t01", ...inputs(messages.preflight)},
  observations: [
   {caseId: "gc01", turnId: "gc01-t01", repeat: 1, ...inputs(messages.preflight)},
   {caseId: "gc05", turnId: "gc05-t01", repeat: 1, ...inputs(messages.other)},
  ],
 });
}

function fixture(options: {tools?: GovernedEvaluationContract["tools"]; caseVersion?: string} = {}) {
 const value = snapshot();
 const snapshotText = executionCanonicalText(value);
 const contract: GovernedEvaluationContract = {schemaVersion: "governed-evaluation-contract.v1", executionId: ids.execution, organizationId: ids.organization,
  requestId: ids.execution, processingRunId: ids.execution, purpose: "evaluation",
  audience: {kind: "evaluation_panel", caseId: "intent-router-gold", caseVersion: options.caseVersion ?? value.audience.caseVersion, scriptId: "run-intent-router-gold"},
  tools: options.tools ?? [tool("anthropic", "claude-sonnet-5"), tool("openai", "gpt-5.6-terra")],
  budget: {maxCostMicrousd: 3_000_000, maxModelCalls: 40, maxDurationMs: 2_400_000, expiresAt: new Date(Date.now() + 3_600_000).toISOString()},
  inputs: {fingerprint: sha(snapshotText), sources: []}, requestedAt: new Date(Date.now() - 1000).toISOString()};
 const contractText = executionCanonicalText(contract);
 const claim: EvaluationQueueClaim = {claimed: true, jobId: ids.job, leaseId: ids.lease, capability: "x".repeat(64), attempt: 1, executionId: ids.execution,
  contractText, contractFingerprint: sha(contractText), snapshotText, elapsedDurationMs: 0, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), budgetExpired: false};
 // The order the database sees: every reservation is settled before the next one is asked for.
 const journal: string[] = [];
 const queue = {
  claim: vi.fn(async () => claim),
  renew: vi.fn(async () => ({allowed: true as const, jobId: ids.job, leaseId: ids.lease, executionId: ids.execution, organizationId: ids.organization,
   processingRunId: ids.execution, contractFingerprint: claim.contractFingerprint, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
   elapsedDurationMs: 0, remainingDurationMs: 2_400_000})),
  reserve: vi.fn(async (_claim: EvaluationQueueClaim, operation: EvaluationOperation): Promise<EvaluationReservation> => {
   journal.push(`reserve:${operation.operationId}`);
   return {allowed: true, operationId: operation.operationId, decisionId: randomUUID(), state: "reserved", replayed: false, mayExecute: true};
  }),
  settle: vi.fn(async (_claim: EvaluationQueueClaim, operationId: string, settlement: {outcome: "settled" | "uncertain"}) => {
   journal.push(`settle:${operationId}`);
   return {state: settlement.outcome, replayed: false};
  }),
  commit: vi.fn(async () => ({replayed: false})),
 } satisfies EvaluationQueue;
 return {claim, contract, snapshot: value, queue, journal};
}

const routed = intentClassifierOutputSchema.parse({
 routingCore: {
  action: {value: ["prepare_meeting"], state: "inferred", confidence: 0.9},
  object: {value: [{id: "object-1", ordinal: 1, kind: "company", slots: [{key: "entity", value: "Camil"}]}], state: "explicit"},
  decisionType: {value: "none", state: "not_applicable"}, audienceType: {value: "self", state: "explicit"},
  depth: {value: "preliminary", state: "inferred", confidence: 0.9}, continuity: {value: "new", state: "inferred", confidence: 0.9},
  workResponsibility: {value: ["producer"], state: "inferred", confidence: 0.9},
 },
 inferableContext: {
  jurisdiction: {value: ["BR"], state: "inferred", confidence: 0.9}, asOfDate: {value: null, state: "unknown"},
  currency: {value: null, state: "unknown"}, deadline: {value: null, state: "unknown"}, sponsorInstruction: {value: null, state: "unknown"},
  constraints: {value: [], state: "unknown"}, urgency: {value: null, state: "unknown"}, availableInputs: {value: [], state: "unknown"},
 },
 primaryWorks: [{work: "understand", confidence: 0.9}], composition: "prepare_meeting", firstQuestion: null, abstain: false, abstainReason: null,
});
/** The attributable extraction of the two heads every synthetic message names. */
function extraction(message: string) {
 const span = (text: string) => ({source: "latest_user_message", messageIndex: null, start: message.indexOf(text), end: message.indexOf(text) + text.length, text});
 return {objects: [
  {candidateId: "candidate-1", kind: "company", head: {key: "entity", span: span("Camil")}, modifiers: []},
  {candidateId: "candidate-2", kind: "operation", head: {key: "subject", span: span("refinanciamento")}, modifiers: []},
 ], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: []};
}
const noObjects = {objects: [], activeContextReferences: [], unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: []};
const usage = {inputTokens: 900, outputTokens: 140, cachedInputTokens: 0};
/** A provider that reads the request as a model would: the task from the schema, the turn from the input. */
function provider(name: Provider, override?: (request: AdapterRequest, message: string) => unknown) {
 const requests: AdapterRequest[] = [];
 const complete = vi.fn(async (request: AdapterRequest): Promise<AdapterResponse> => {
  requests.push(request);
  const message = (JSON.parse(request.input[0]!.type === "text" ? request.input[0]!.text : "{}") as {latestUserMessage: string}).latestUserMessage;
  const output = override?.(request, message) ?? (request.schemaName === "shadow_routing_output" ? routed : extraction(message));
  return {output, rawText: JSON.stringify(output), usage, model: request.model, stopReason: "end"};
 });
 const adapter: ProviderAdapter = {provider: name, complete};
 return {adapter, complete, requests};
}

describe("intent router gold family", () => {
 it("is the family of run-intent-router-gold", () => {
  expect(evaluationFamilies["run-intent-router-gold"]).toBe(intentRouterGoldFamily);
 });

 it("runs the preflight and every observation one reserved attempt at a time and publishes the whole ledger", async () => {
  const f = fixture();
  const anthropic = provider("anthropic"), openai = provider("openai");
  const observed: GatewayCallLog[] = [];
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal,
   {adapters: {anthropic: anthropic.adapter, openai: openai.adapter}, connections: {anthropic: connection, openai: connection}, heartbeatMs: 60_000, onCall: (log) => observed.push(log)}))
   .toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  // Preflight on both routes of both tasks, then router and extractor on each observation, on the primary.
  expect(anthropic.requests.map((request) => request.system)).toEqual([INTENT_CLASSIFIER_SYSTEM, SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
   INTENT_CLASSIFIER_SYSTEM, SEMANTIC_OBJECT_EXTRACTOR_SYSTEM, INTENT_CLASSIFIER_SYSTEM, SEMANTIC_OBJECT_EXTRACTOR_SYSTEM]);
  expect(openai.requests.map((request) => request.schemaName)).toEqual(["shadow_routing_output", "semantic_object_extractor_output"]);
  expect(anthropic.requests[2]!.input).toEqual([{type: "text", text: JSON.stringify(f.snapshot.observations[0]!.classifierInput)}]);
  // Every attempt is its own operation, reserved on its route with the resources a prompted request uses, and settled before the next.
  const operations = f.queue.reserve.mock.calls.map(([, operation]) => operation);
  expect(operations).toHaveLength(8);
  expect(new Set(operations.map((operation) => operation.operationId)).size).toBe(8);
  for (const operation of operations) {
   expect(operation).toMatchObject({reservedCalls: 1, resources: ["inference", "prompt_cache"], route: {...connection, toolVersion: governedEvaluationToolVersion}});
  }
  expect(operations.map((operation) => operation.route.provider)).toEqual(["anthropic", "openai", "anthropic", "openai", "anthropic", "anthropic", "anthropic", "anthropic"]);
  expect(f.journal).toEqual(operations.flatMap((operation) => [`reserve:${operation.operationId}`, `settle:${operation.operationId}`]));
  expect(f.queue.settle.mock.calls.map(([, , settlement]) => settlement)).toEqual(operations.map((operation) => ({outcome: "settled",
   spentMicrousd: microusdCeil(estimateCostUsd(operation.route.model, usage)), spentCalls: 1})));

  const [, inputHash, text, outcome, reason] = f.queue.commit.mock.calls[0] as unknown as [unknown, string, string, string, string];
  expect([inputHash, outcome, reason]).toEqual([f.contract.inputs.fingerprint, "succeeded", "evaluated"]);
  const published = JSON.parse(text) as unknown;
  expect(executionCanonicalText(published)).toBe(text);
  // The script reads the committed bytes back with the family schema; the worker publishes exactly that shape.
  const result = intentRouterGoldResultSchema.parse(published);
  expect(result).toEqual(published);
  if (result.outcome !== "observed") throw new Error("expected observations");
  expect(result.providerPreflight.every((row) => row.passed)).toBe(true);
  expect(result.observations.map(({turnId, error, objectCompilation}) => [turnId, error, objectCompilation?.status])).toEqual([["gc01-t01", null, "complete"], ["gc05-t01", null, "complete"]]);
  // The ledger is every call log the gateway reported, the ones the worker's own observer received, strictly readable.
  expect(result.calls).toEqual(JSON.parse(JSON.stringify(observed)));
  expect(result.calls.map((call) => intentRouterGoldCallLogSchema.parse(call))).toEqual(result.calls);
  expect(result.gatewaySpent).toMatchObject({calls: 8, unknownCostCalls: 0});
 });

 it("reserves the extractor's repair and its provider fallback as operations of their own", async () => {
  const f = fixture();
  const anthropic = provider("anthropic", (request, message) => request.schemaName === "semantic_object_extractor_output" && message === messages.other ? noObjects : undefined);
  const openai = provider("openai");
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal,
   {adapters: {anthropic: anthropic.adapter, openai: openai.adapter}, connections: {anthropic: connection, openai: connection}, heartbeatMs: 60_000}))
   .toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  const operations = f.queue.reserve.mock.calls.map(([, operation]) => operation.route.model);
  expect(operations.slice(6)).toEqual(["claude-sonnet-5", "claude-sonnet-5", "claude-sonnet-5", "gpt-5.6-terra"]);
  expect(anthropic.requests.at(-1)!.system).toContain(`${SEMANTIC_OBJECT_EXTRACTOR_SYSTEM}\n\nCONTRACT REPAIR`);
  const [, , text] = f.queue.commit.mock.calls[0] as unknown as [unknown, string, string];
  const result = intentRouterGoldResultSchema.parse(JSON.parse(text));
  if (result.outcome !== "observed") throw new Error("expected observations");
  expect(result.observations[1]).toMatchObject({error: null, objectProvider: "openai", objectModel: "gpt-5.6-terra", objectAttemptCount: 3, routeAttemptCount: 1});
  expect(result.calls.filter((call) => call.metadata?.surface === "intent_object_gold" && call.metadata.turnId === "gc05-t01")
   .map(({outcome, isSameModelRepair, usedProviderFallback}) => [outcome, isSameModelRepair, usedProviderFallback]))
   .toEqual([["invalid_output", false, false], ["invalid_output", true, false], ["ok", false, true]]);
 });

 it("sends nothing and commits partial transport_denied when the first reservation is denied", async () => {
  const f = fixture();
  f.queue.reserve.mockResolvedValue({allowed: false, decisionId: randomUUID(), reasons: ["processing_resource_ineligible:inference"], mayExecute: false});
  const anthropic = provider("anthropic"), openai = provider("openai");
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal,
   {adapters: {anthropic: anthropic.adapter, openai: openai.adapter}, connections: {anthropic: connection, openai: connection}, heartbeatMs: 60_000}))
   .toEqual({status: "partial", reason: "transport_denied", replayed: false});
  expect(f.queue.reserve).toHaveBeenCalledOnce();
  expect(anthropic.complete).not.toHaveBeenCalled();
  expect(openai.complete).not.toHaveBeenCalled();
  expect(f.queue.commit).toHaveBeenCalledWith(f.claim, f.contract.inputs.fingerprint, '{"reason":"transport_denied","status":"partial"}', "partial", "transport_denied");
 });

 it.each<[string, Parameters<typeof fixture>[0]]>([
  ["a fallback route the contract does not declare", {tools: [tool("anthropic", "claude-sonnet-5")]}],
  ["another version of the gold corpus", {caseVersion: `manifest-${"c".repeat(16)}`}],
 ])("commits partial evaluation_failed without reserving anything for %s", async (_label, options) => {
  const f = fixture(options);
  const anthropic = provider("anthropic");
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal,
   {adapters: {anthropic: anthropic.adapter}, connections: {anthropic: connection}, heartbeatMs: 60_000}))
   .toEqual({status: "partial", reason: "evaluation_failed", replayed: false});
  expect(f.queue.reserve).not.toHaveBeenCalled();
  expect(anthropic.complete).not.toHaveBeenCalled();
 });
});
