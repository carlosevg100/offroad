import {createHash, randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {
 BASELINE_SYSTEM_PROMPT,
 baselineGeneralistSnapshotSchema,
 baselineSnapshotContentHashes,
 executionCanonicalText,
 renderInformationBase,
 renderTurnMessage,
 type BaselineGeneralistSnapshot,
 type GovernedEvaluationContract,
} from "@offroad/agent-contracts";
import {estimateCostUsd, type AdapterRequest, type AdapterResponse, type Provider, type ProviderAdapter} from "@offroad/model-gateway";
import {EvaluationTransportError, type EvaluationOperation, type EvaluationQueue, type EvaluationQueueClaim, type EvaluationReservation} from "./evaluation-queue";
import type {EvaluationFamily} from "./evaluation-families";
import {governedEvaluationToolVersion, microusdCeil} from "./governed-evaluation-gateway";
import {processGovernedEvaluation, type GovernedEvaluationDependencies} from "./process-governed-evaluation";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const ids = {job: "40000000-0000-4000-8000-000000000001", lease: "40000000-0000-4000-8000-000000000002", execution: "40000000-0000-4000-8000-000000000003",
 organization: "40000000-0000-4000-9000-000000000001"};
const connections = {
 anthropic: {accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-binding", region: "global"},
 openai: {accountRef: "synthetic-account", projectRef: "synthetic-project", credentialBinding: "synthetic-binding", region: "global"},
};
const tool = (provider: string, model: string) => ({id: `provider:${provider}:${model}`, version: governedEvaluationToolVersion, effect: "read_only" as const});

/** Synthetic baseline: two turns, one document, primary on Anthropic and fallback on OpenAI. */
function baselineSnapshot(): BaselineGeneralistSnapshot {
 return baselineGeneralistSnapshotSchema.parse({
  schemaVersion: "gold-baseline-snapshot.v1",
  informationBase: {caseId: "gc01-synthetic", caseVersion: "1.0", language: "pt-BR", asOfDate: "2026-09-04",
   turns: [{id: "gc01-t01", text: "Pedido sintético do primeiro turno."}, {id: "gc01-t02", text: "Pedido sintético do segundo turno."}],
   documents: [{id: "doc-a", title: "Documento sintético", fileName: "a.pdf", sha256: "a".repeat(64), pages: 1, text: "texto sintético"}],
   sources: []},
  model: {primary: {provider: "anthropic", model: "claude-opus-5", effort: "high"}, fallback: {provider: "openai", model: "gpt-5.6-sol", effort: "high"}, maxOutputTokens: 2000},
  caveats: ["Caveat sintético."],
 });
}

function fixture(options: {snapshot?: unknown; scriptId?: string; tools?: GovernedEvaluationContract["tools"]; sources?: string[]; budgetExpired?: boolean} = {}) {
 const snapshot = options.snapshot ?? baselineSnapshot();
 const snapshotText = executionCanonicalText(snapshot);
 const sources = options.sources ?? baselineSnapshotContentHashes(snapshot as BaselineGeneralistSnapshot);
 const contract: GovernedEvaluationContract = {schemaVersion: "governed-evaluation-contract.v1", executionId: ids.execution, organizationId: ids.organization,
  requestId: ids.execution, processingRunId: ids.execution, purpose: "evaluation",
  audience: {kind: "evaluation_panel", caseId: "gc01-synthetic", caseVersion: "1.0", scriptId: options.scriptId ?? "run-gold-baseline"},
  tools: options.tools ?? [tool("anthropic", "claude-opus-5"), tool("openai", "gpt-5.6-sol")],
  budget: {maxCostMicrousd: 50_000_000, maxModelCalls: 10, maxDurationMs: 600_000, expiresAt: new Date(Date.now() + 3_600_000).toISOString()},
  inputs: {fingerprint: sha(snapshotText), sources: sources.map((contentHash) => ({contentHash}))}, requestedAt: new Date(Date.now() - 1000).toISOString()};
 const contractText = executionCanonicalText(contract);
 const claim: EvaluationQueueClaim = {claimed: true, jobId: ids.job, leaseId: ids.lease, capability: "x".repeat(64), attempt: 1, executionId: ids.execution,
  contractText, contractFingerprint: sha(contractText), snapshotText, elapsedDurationMs: 0, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  budgetExpired: options.budgetExpired ?? false};
 let remainingDurationMs = 600_000;
 const queue = {
  claim: vi.fn(async () => claim),
  renew: vi.fn(async () => ({allowed: true as const, jobId: ids.job, leaseId: ids.lease, executionId: ids.execution, organizationId: ids.organization,
   processingRunId: ids.execution, contractFingerprint: claim.contractFingerprint, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
   elapsedDurationMs: 0, remainingDurationMs})),
  reserve: vi.fn(async (_claim: EvaluationQueueClaim, operation: EvaluationOperation): Promise<EvaluationReservation> =>
   ({allowed: true, operationId: operation.operationId, decisionId: randomUUID(), state: "reserved", replayed: false, mayExecute: true})),
  settle: vi.fn(async (_claim: EvaluationQueueClaim, _operationId: string, settlement: {outcome: "settled" | "uncertain"}) => ({state: settlement.outcome, replayed: false})),
  commit: vi.fn(async () => ({replayed: false})),
 } satisfies EvaluationQueue;
 return {claim, contract, snapshot, queue, setRemaining: (value: number) => { remainingDurationMs = value; }};
}

const answer = (deliverable: string, extra: Partial<AdapterResponse> = {}): AdapterResponse => ({output: {deliverable}, rawText: JSON.stringify({deliverable}),
 usage: {inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0}, model: "claude-opus-5", stopReason: "end", ...extra});
/** A spy adapter: records every request it would transmit and answers from the script it is given. */
function spy(provider: Provider, script: (request: AdapterRequest, call: number) => AdapterResponse | Promise<AdapterResponse>) {
 const requests: AdapterRequest[] = [];
 const complete = vi.fn(async (request: AdapterRequest) => { requests.push(request); return script(request, requests.length); });
 const adapter: ProviderAdapter = {provider, complete};
 return {adapter, complete, requests};
}
const deps = (adapters: GovernedEvaluationDependencies["adapters"], extra: Partial<GovernedEvaluationDependencies> = {}): GovernedEvaluationDependencies =>
 ({adapters, connections, heartbeatMs: 60_000, ...extra});
const marker = (reason: string) => `{"reason":"${reason}","status":"partial"}`;

describe("governed evaluation consumer", () => {
 it("settles every attempt and commits success with the run's bytes", async () => {
  const f = fixture();
  const anthropic = spy("anthropic", (_request, call) => answer(`Entrega sintética ${call}`));
  const openai = spy("openai", () => answer("never"));
  const result = await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: openai.adapter}));
  expect(result).toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  expect(openai.complete).not.toHaveBeenCalled();
  // The adapter saw the baseline exactly: the system prompt, the whole base and each earlier deliverable.
  const base = renderInformationBase((f.snapshot as BaselineGeneralistSnapshot).informationBase);
  expect(anthropic.requests.map((request) => request.system)).toEqual([BASELINE_SYSTEM_PROMPT, BASELINE_SYSTEM_PROMPT]);
  expect(anthropic.requests[1]!.input.map((part) => part.type === "text" ? part.text : "")).toEqual([base,
   renderTurnMessage({id: "gc01-t01", text: "Pedido sintético do primeiro turno."}, 0), "## Resposta ao turno 1 (sua entrega anterior)\n\nEntrega sintética 1",
   renderTurnMessage({id: "gc01-t02", text: "Pedido sintético do segundo turno."}, 1)]);
  // One reservation per send, on the declared route and resources, and one settlement each from the measured usage.
  expect(f.queue.reserve).toHaveBeenCalledTimes(2);
  const operations = f.queue.reserve.mock.calls.map(([, operation]) => operation);
  expect(new Set(operations.map((operation) => operation.operationId)).size).toBe(2);
  expect(operations[0]).toMatchObject({reservedCalls: 1, resources: ["inference", "prompt_cache", "schema_cache"], route: {provider: "anthropic", model: "claude-opus-5",
   ...connections.anthropic, endpoint: "https://api.anthropic.com/v1/messages", toolVersion: governedEvaluationToolVersion}});
  const cost = microusdCeil(estimateCostUsd("claude-opus-5", {inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0}));
  expect(f.queue.settle.mock.calls.map(([, operationId, settlement]) => [operationId, settlement])).toEqual(operations.map((operation) =>
   [operation.operationId, {outcome: "settled", spentMicrousd: cost, spentCalls: 1}]));
  for (const operation of operations) expect(operation.reservedMicrousd).toBeGreaterThanOrEqual(cost);
  const [, inputHash, text, outcome, reason] = f.queue.commit.mock.calls[0] as unknown as [unknown, string, string, string, string];
  expect([inputHash, outcome, reason]).toEqual([f.contract.inputs.fingerprint, "succeeded", "evaluated"]);
  const published = JSON.parse(text) as {schemaVersion: string; outputs: Array<{deliverable: string}>; record: {turns: unknown[]; caseId: string}};
  expect(executionCanonicalText(published)).toBe(text);
  expect(published.schemaVersion).toBe("gold-baseline-result.v1");
  expect(published.outputs.map((output) => output.deliverable)).toEqual(["Entrega sintética 1", "Entrega sintética 2"]);
  expect(published.record.turns).toHaveLength(2);
 });

 it("sends nothing when the reservation is denied and commits partial transport_denied", async () => {
  const f = fixture();
  f.queue.reserve.mockResolvedValue({allowed: false, decisionId: randomUUID(), reasons: ["processing_resource_ineligible:inference"], mayExecute: false});
  const anthropic = spy("anthropic", () => answer("never")), openai = spy("openai", () => answer("never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: openai.adapter})))
   .toEqual({status: "partial", reason: "transport_denied", replayed: false});
  expect(anthropic.complete).not.toHaveBeenCalled();
  expect(openai.complete).not.toHaveBeenCalled();
  // A denial already decides the outcome: the fallback is not even reserved.
  expect(f.queue.reserve).toHaveBeenCalledOnce();
  expect(f.queue.settle).not.toHaveBeenCalled();
  expect(f.queue.commit).toHaveBeenCalledWith(f.claim, f.contract.inputs.fingerprint, marker("transport_denied"), "partial", "transport_denied");
 });

 it("sends nothing when the budget refuses the reservation and commits partial budget_exhausted", async () => {
  const f = fixture();
  f.queue.reserve.mockResolvedValue({allowed: false, state: "partial_budget_exhausted", mayExecute: false});
  const anthropic = spy("anthropic", () => answer("never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "budget_exhausted", replayed: false});
  expect(anthropic.complete).not.toHaveBeenCalled();
  expect(f.queue.commit).toHaveBeenCalledWith(f.claim, f.contract.inputs.fingerprint, marker("budget_exhausted"), "partial", "budget_exhausted");
 });

 it("reserves the first send, the same-model repair and the provider fallback as separate operations", async () => {
  const snapshot = {schemaVersion: "synthetic-family.v1"};
  const family: EvaluationFamily = {id: "synthetic_prompted", prepare(value) {
   z.object({schemaVersion: z.literal("synthetic-family.v1")}).strict().parse(value);
   return {family: "synthetic_prompted", contentHashes: [], audience: {caseId: "gc01-synthetic", caseVersion: "1.0"},
    routes: [{provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}, {provider: "openai", model: "gpt-5.6-terra", effort: "medium"}],
    policies: {preliminary_understanding: {primary: {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"},
     fallback: {provider: "openai", model: "gpt-5.6-terra", effort: "medium"}, maxOutputTokens: 1000, timeoutMs: 60_000}},
    async run(gateway) {
     const result = await gateway.complete({task: "preliminary_understanding", outputMode: "prompted_json", system: "Synthetic instructions",
      input: [{type: "text", text: "Synthetic input"}], schema: z.object({ok: z.boolean()}), schemaName: "synthetic"});
     return {ok: result.output.ok, provider: result.provider};
    }};
  }};
  const f = fixture({snapshot, scriptId: "synthetic-script", sources: [], tools: [tool("anthropic", "claude-sonnet-5"), tool("openai", "gpt-5.6-terra")]});
  const invalid = {output: {wrong: true}, rawText: "{}", usage: {inputTokens: 100, outputTokens: 20, cachedInputTokens: 0}, model: "claude-sonnet-5", stopReason: "end" as const};
  const anthropic = spy("anthropic", () => invalid);
  const openai = spy("openai", () => ({...invalid, output: {ok: true}, model: "gpt-5.6-terra"}));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal,
   deps({anthropic: anthropic.adapter, openai: openai.adapter}, {families: {"synthetic-script": family}})))
   .toEqual({status: "succeeded", reason: "evaluated", replayed: false});
  expect(anthropic.complete).toHaveBeenCalledTimes(2);
  expect(anthropic.requests[1]!.system).toContain("Synthetic instructions\n\n");
  expect(openai.complete).toHaveBeenCalledOnce();
  const operations = f.queue.reserve.mock.calls.map(([, operation]) => operation);
  expect(operations.map((operation) => operation.route.model)).toEqual(["claude-sonnet-5", "claude-sonnet-5", "gpt-5.6-terra"]);
  expect(new Set(operations.map((operation) => operation.operationId)).size).toBe(3);
  // The repair carries the guidance, so its own reservation covers a longer request than the first send.
  expect(operations[1]!.reservedMicrousd).toBeGreaterThan(operations[0]!.reservedMicrousd);
  expect(f.queue.settle.mock.calls.map(([, operationId, settlement]) => [operationId, settlement])).toEqual([
   [operations[0]!.operationId, {outcome: "settled", spentMicrousd: microusdCeil(estimateCostUsd("claude-sonnet-5", invalid.usage)), spentCalls: 1}],
   [operations[1]!.operationId, {outcome: "settled", spentMicrousd: microusdCeil(estimateCostUsd("claude-sonnet-5", invalid.usage)), spentCalls: 1}],
   [operations[2]!.operationId, {outcome: "settled", spentMicrousd: microusdCeil(estimateCostUsd("gpt-5.6-terra", invalid.usage)), spentCalls: 1}],
  ]);
  expect(f.queue.commit).toHaveBeenCalledWith(f.claim, f.contract.inputs.fingerprint, '{"ok":true,"provider":"openai"}', "succeeded", "evaluated");
 });

 it("settles an attempt with unknown usage as uncertain and commits partial operation_uncertain", async () => {
  const f = fixture();
  const anthropic = spy("anthropic", (_request, call) => answer(`Entrega ${call}`, call === 1 ? {usageKnown: false} : {}));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "operation_uncertain", replayed: false});
  expect(f.queue.settle.mock.calls.map(([, , settlement]) => settlement.outcome)).toEqual(["uncertain", "settled"]);
  expect(f.queue.commit).toHaveBeenCalledWith(f.claim, f.contract.inputs.fingerprint, marker("operation_uncertain"), "partial", "operation_uncertain");
 });

 it("settles a failed provider call as uncertain even when the fallback answers", async () => {
  const f = fixture();
  const anthropic = spy("anthropic", () => { throw new Error("synthetic network failure"); });
  const openai = spy("openai", (_request, call) => answer(`Entrega ${call}`, {model: "gpt-5.6-sol"}));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter, openai: openai.adapter})))
   .toEqual({status: "partial", reason: "operation_uncertain", replayed: false});
  expect(f.queue.reserve.mock.calls.map(([, operation]) => operation.route.provider)).toEqual(["anthropic", "openai", "anthropic", "openai"]);
  expect(f.queue.settle.mock.calls.map(([, , settlement]) => settlement.outcome)).toEqual(["uncertain", "settled", "uncertain", "settled"]);
 });

 it("refuses altered bytes before any reservation or send", async () => {
  for (const alter of [(c: EvaluationQueueClaim) => ({...c, snapshotText: c.snapshotText.replace("Caveat", "Cavear")}),
   (c: EvaluationQueueClaim) => ({...c, contractFingerprint: "0".repeat(64)}),
   (c: EvaluationQueueClaim) => ({...c, executionId: "40000000-0000-4000-8000-0000000000ff"})]) {
   const f = fixture(), anthropic = spy("anthropic", () => answer("never"));
   await expect(processGovernedEvaluation(alter(f.claim), f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter}))).rejects.toThrow();
   expect(f.queue.renew).not.toHaveBeenCalled();
   expect(f.queue.reserve).not.toHaveBeenCalled();
   expect(f.queue.commit).not.toHaveBeenCalled();
   expect(anthropic.complete).not.toHaveBeenCalled();
  }
 });

 it.each<[string, Parameters<typeof fixture>[0]]>([
  ["an unknown family", {scriptId: "unregistered-script"}],
  ["a route the contract does not declare", {tools: [tool("anthropic", "claude-opus-5")]}],
  ["a route declared at another version", {tools: [{...tool("anthropic", "claude-opus-5"), version: "older-gateway"}, tool("openai", "gpt-5.6-sol")]}],
  ["sources that differ from the snapshot", {sources: ["f".repeat(64)]}],
  ["a snapshot of another family", {snapshot: {schemaVersion: "synthetic-family.v1"}, sources: []}],
 ])("commits partial evaluation_failed without sending anything for %s", async (_label, options) => {
  const f = fixture(options);
  const anthropic = spy("anthropic", () => answer("never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "evaluation_failed", replayed: false});
  expect(f.queue.reserve).not.toHaveBeenCalled();
  expect(anthropic.complete).not.toHaveBeenCalled();
  expect(f.queue.commit).toHaveBeenCalledWith(f.claim, f.contract.inputs.fingerprint, marker("evaluation_failed"), "partial", "evaluation_failed");
 });

 it("commits partial budget_exhausted without sending when the claim reports the budget spent", async () => {
  const f = fixture({budgetExpired: true});
  const anthropic = spy("anthropic", () => answer("never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "budget_exhausted", replayed: false});
  expect(f.queue.reserve).not.toHaveBeenCalled();
  expect(anthropic.complete).not.toHaveBeenCalled();
 });

 it("stops at a paused transport and publishes the reason the database derives", async () => {
  const f = fixture();
  f.queue.reserve.mockRejectedValue(new EvaluationTransportError("evaluation_transport_paused"));
  const anthropic = spy("anthropic", () => answer("never"));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "evaluation_failed", replayed: false});
  expect(f.queue.reserve).toHaveBeenCalledOnce();
  expect(anthropic.complete).not.toHaveBeenCalled();
 });

 it("follows the database when it knows more than this lease, in its precedence order", async () => {
  const f = fixture();
  f.queue.commit.mockRejectedValueOnce(new EvaluationTransportError("evaluation_partial_result_required"));
  const anthropic = spy("anthropic", (_request, call) => answer(`Entrega ${call}`));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "operation_uncertain", replayed: false});
  expect(f.queue.commit.mock.calls.map((call) => (call as unknown as string[])[4])).toEqual(["evaluated", "operation_uncertain"]);
  const other = fixture();
  other.queue.commit.mockRejectedValueOnce(new EvaluationTransportError("evaluation_lease_denied"));
  await expect(processGovernedEvaluation(other.claim, other.queue, new AbortController().signal, deps({anthropic: spy("anthropic", () => answer("x")).adapter})))
   .rejects.toMatchObject({code: "evaluation_lease_denied"});
  expect(other.queue.commit).toHaveBeenCalledOnce();
 });

 it("stops without a commit when the heartbeat loses authority mid-send", async () => {
  const f = fixture();
  f.queue.renew.mockImplementationOnce(f.queue.renew.getMockImplementation()!).mockRejectedValue(new EvaluationTransportError("evaluation_authority_denied"));
  const anthropic = spy("anthropic", async () => { await delay(300); return answer("late"); });
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter}, {heartbeatMs: 20})))
   .toEqual({status: "aborted"});
  expect(anthropic.complete).toHaveBeenCalledOnce();
  expect(f.queue.commit).not.toHaveBeenCalled();
  await delay(400);
  expect(f.queue.reserve).toHaveBeenCalledOnce();
 });

 it("abandons a send that outlives the duration budget and publishes budget_exhausted once the database agrees", async () => {
  const f = fixture();
  f.setRemaining(80);
  let settledRemaining = false;
  const anthropic = spy("anthropic", async () => { await delay(400); return answer("late"); });
  f.queue.settle.mockImplementation(async (_claim, _operationId, settlement) => { f.setRemaining(0); settledRemaining = true; return {state: settlement.outcome, replayed: false}; });
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "budget_exhausted", replayed: false});
  expect(settledRemaining).toBe(true);
  expect(f.queue.settle.mock.calls.map(([, , settlement]) => settlement.outcome)).toEqual(["uncertain"]);
  await delay(500);
  expect(f.queue.reserve).toHaveBeenCalledOnce();
 });

 it("keeps the evaluation open on shutdown before anything is reserved, and lands it when a send is in flight", async () => {
  const early = fixture(), stopped = new AbortController();
  stopped.abort();
  expect(await processGovernedEvaluation(early.claim, early.queue, stopped.signal, deps({anthropic: spy("anthropic", () => answer("never")).adapter})))
   .toEqual({status: "aborted"});
  expect(early.queue.commit).not.toHaveBeenCalled();
  const late = fixture(), shutdown = new AbortController();
  const anthropic = spy("anthropic", async () => { shutdown.abort(); await delay(200); return answer("late"); });
  expect(await processGovernedEvaluation(late.claim, late.queue, shutdown.signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "operation_uncertain", replayed: false});
  expect(late.queue.settle.mock.calls.map(([, , settlement]) => settlement.outcome)).toEqual(["uncertain"]);
 });

 it("records a measured cost above its reservation as uncertain instead of understating it", async () => {
  const f = fixture();
  const anthropic = spy("anthropic", () => answer("Entrega", {usage: {inputTokens: 50_000_000, outputTokens: 300, cachedInputTokens: 0}}));
  expect(await processGovernedEvaluation(f.claim, f.queue, new AbortController().signal, deps({anthropic: anthropic.adapter})))
   .toEqual({status: "partial", reason: "operation_uncertain", replayed: false});
  expect(f.queue.settle.mock.calls[0]![2]).toEqual({outcome: "uncertain"});
 });

 it("rounds dollars up to whole microdollars without floating-point overshoot", () => {
  expect(microusdCeil(0.001234)).toBe(1234);
  expect(microusdCeil(0.0000001)).toBe(1);
  expect(microusdCeil(0)).toBe(0);
  expect(() => microusdCeil(-1)).toThrow();
  expect(() => microusdCeil(Number.NaN)).toThrow();
 });
});
