import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {evaluationGatewayRequestSchema} from "@offroad/agent-contracts";
import {
 createModelGateway,
 defaultTaskPolicies,
 ModelGatewayError,
 retentionMatrixVersion,
 type AdapterRequest,
 type AdapterResponse,
 type GatewayAttempt,
 type Provider,
 type ProviderAdapter,
} from "@offroad/model-gateway";
import {createEvaluationBudgetScope} from "./evaluation-budget-partition";

const schema = z.object({answer: z.string().min(1)}).strict();
const request = (extra: Record<string, unknown> = {}) => ({task: "preliminary_understanding" as const, system: "Synthetic system.", schema, schemaName: "synthetic_answer_v1",
 input: [{type: "text" as const, text: "Synthetic request text."}], maxOutputTokens: 1000, ...extra});
const ok = (answer: string, request: AdapterRequest): AdapterResponse => ({output: {answer}, rawText: JSON.stringify({answer}),
 usage: {inputTokens: 500, outputTokens: 50, cachedInputTokens: 0}, model: request.model, stopReason: "end"});
/** A spy adapter answering from the script it is given. */
function spy(provider: Provider, script: (request: AdapterRequest, call: number) => AdapterResponse | Promise<AdapterResponse>) {
 const requests: AdapterRequest[] = [];
 const adapter: ProviderAdapter = {provider, complete: vi.fn(async (adapterRequest: AdapterRequest) => { requests.push(adapterRequest); return script(adapterRequest, requests.length); })};
 return {adapter, requests};
}
/** A plain gateway standing in for the governed one: its hook sees every attempt and its reservation. */
function governed(adapters: Partial<Record<Provider, ProviderAdapter>>, decide: (attempt: GatewayAttempt) => boolean | Promise<boolean> = () => true) {
 const attempts: GatewayAttempt[] = [];
 const gateway = createModelGateway({adapters, budgetReservation: "conservative_text_v1", processingEligibility: async ({attempt}) => {
  attempts.push(attempt);
  return {allowed: await decide(attempt), policyVersion: retentionMatrixVersion, assuranceId: null, reasons: []};
 }});
 return {gateway, attempts};
}

describe("evaluation budget partitions", () => {
 it("sends each route as its own pinned request and records one content-free entry per request", async () => {
  const anthropic = spy("anthropic", () => { throw new Error("synthetic provider failure"); });
  const openai = spy("openai", (adapterRequest) => ok("from the fallback", adapterRequest));
  const g = governed({anthropic: anthropic.adapter, openai: openai.adapter});
  const part = createEvaluationBudgetScope(g.gateway, {}).partition("gold", {maxCostUsd: 5, maxCalls: 10});
  const result = await part.gateway.complete(request());
  expect(result.output).toEqual({answer: "from the fallback"});
  expect([result.provider, result.usedProviderFallback, result.attempts.map((attempt) => [attempt.provider, attempt.outcome, attempt.usedProviderFallback ?? false])])
   .toEqual(["openai", true, [["anthropic", "error", false], ["openai", "ok", true]]]);
  // Each attempt was its own request to the governed gateway, so each one met its eligibility hook first.
  expect(g.attempts.map((attempt) => [attempt.usedProviderFallback, attempt.retryOrdinal])).toEqual([[false, 0], [false, 0]]);
  expect(part.gateway.spent()).toMatchObject({calls: 2, unknownCostCalls: 1});
  expect(part.requests).toHaveLength(1);
  const entry = evaluationGatewayRequestSchema.parse(part.requests[0]);
  expect([entry.partition, entry.outcome, entry.providerCallRange, entry.answer?.provider, entry.spent.calls]).toEqual(["gold", "ok", {start: 0, end: 2}, "openai", 2]);
 });

 it("keeps the failure of the primary when no call is left for the fallback, as the gateway does", async () => {
  const anthropic = spy("anthropic", () => { throw new Error("synthetic provider failure"); });
  const openai = spy("openai", (adapterRequest) => ok("never", adapterRequest));
  const part = createEvaluationBudgetScope(governed({anthropic: anthropic.adapter, openai: openai.adapter}).gateway, {}).partition("gold", {maxCostUsd: 5, maxCalls: 1});
  const failure = await part.gateway.complete(request()).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ModelGatewayError);
  expect((failure as ModelGatewayError).code).toBe("all_attempts_failed");
  expect(openai.requests).toHaveLength(0);
  expect(part.requests.map((entry) => [entry.outcome, entry.attempts.length, entry.spent.calls])).toEqual([["all_attempts_failed", 1, 1]]);
  // The next request has no call left at all: refused before anything is reserved.
  const refused = await part.gateway.complete(request()).catch((error: unknown) => error);
  expect((refused as ModelGatewayError).code).toBe("budget_exceeded");
  expect((refused as ModelGatewayError).message).toBe("call budget exhausted (1/1)");
  expect(part.requests.at(-1)).toMatchObject({outcome: "budget_exceeded", attempts: [], providerCallRange: {start: 1, end: 1}});
 });

 it("refuses an attempt whose reservation would pass the partition's dollars, before its hook and its provider", async () => {
  const anthropic = spy("anthropic", (adapterRequest) => ok("never", adapterRequest));
  const g = governed({anthropic: anthropic.adapter});
  const part = createEvaluationBudgetScope(g.gateway, {}).partition("controls", {maxCostUsd: 0.0001, maxCalls: 8});
  const refused = await part.gateway.complete(request()).catch((error: unknown) => error);
  expect((refused as ModelGatewayError).code).toBe("budget_exceeded");
  expect((refused as ModelGatewayError).message).toMatch(/^cost budget would be exceeded \(0\.0000 \+ \d+\.\d{4} > 0\.0001\)$/);
  expect([g.attempts.length, anthropic.requests.length]).toEqual([0, 0]);
 });

 it("measures the reservation with the gateway's own code, equal to what the governed hook is charged", async () => {
  const anthropic = spy("anthropic", (adapterRequest) => ok("measured", adapterRequest));
  const g = governed({anthropic: anthropic.adapter});
  await createEvaluationBudgetScope(g.gateway, {}).partition("gold", {maxCostUsd: 5, maxCalls: 8}).gateway.complete(request({allowFallback: false}));
  // A cap exactly at the charged reservation lets the same attempt through; one microdollar less refuses it before its hook.
  const reservation = g.attempts[0]!.reservationUsd;
  const exact = createEvaluationBudgetScope(g.gateway, {}).partition("exact", {maxCostUsd: reservation, maxCalls: 8});
  await expect(exact.gateway.complete(request({allowFallback: false}))).resolves.toMatchObject({output: {answer: "measured"}});
  const under = createEvaluationBudgetScope(g.gateway, {}).partition("under", {maxCostUsd: reservation - 1e-6, maxCalls: 8});
  await expect(under.gateway.complete(request({allowFallback: false}))).rejects.toMatchObject({code: "budget_exceeded"});
  expect(g.attempts.map((attempt) => attempt.reservationUsd)).toEqual([reservation, reservation]);
 });

 it("refuses the fallback on dollars after a failed primary, with budget_exceeded", async () => {
  // What each route is charged, read from a hook that refuses everything.
  const charged = governed({}, () => false);
  for (const model of [{provider: "anthropic" as const, model: "claude-sonnet-5", effort: "medium" as const}, {provider: "openai" as const, model: "gpt-5.6-terra", effort: "medium" as const}]) {
   await charged.gateway.complete(request({model, allowFallback: false})).catch(() => undefined);
  }
  const [primary, fallback] = charged.attempts.map((attempt) => attempt.reservationUsd) as [number, number];
  const anthropic = spy("anthropic", () => { throw new Error("synthetic provider failure"); });
  const openai = spy("openai", (adapterRequest) => ok("never", adapterRequest));
  // The primary's unknown cost keeps its whole reservation charged, so the fallback no longer fits.
  const part = createEvaluationBudgetScope(governed({anthropic: anthropic.adapter, openai: openai.adapter}).gateway, {})
   .partition("gold", {maxCostUsd: primary + fallback / 2, maxCalls: 8});
  const failure = await part.gateway.complete(request()).catch((error: unknown) => error);
  expect((failure as ModelGatewayError).code).toBe("budget_exceeded");
  expect([anthropic.requests.length, openai.requests.length]).toEqual([1, 0]);
  expect(part.requests.map((entry) => [entry.outcome, entry.spent.calls, entry.spent.unknownCostCalls])).toEqual([["budget_exceeded", 1, 1]]);
 });

 it("halts the whole evaluation on a transport failure and refuses every later request at once", async () => {
  const anthropic = spy("anthropic", (adapterRequest) => ok("never", adapterRequest));
  const stop = new Error("evaluation_stopped:transport_denied");
  const g = governed({anthropic: anthropic.adapter}, () => { throw stop; });
  const scope = createEvaluationBudgetScope(g.gateway, {});
  const gold = scope.partition("gold", {maxCostUsd: 5, maxCalls: 8});
  const controls = scope.partition("controls", {maxCostUsd: 5, maxCalls: 8});
  await expect(gold.gateway.complete(request())).rejects.toBe(stop);
  await expect(controls.gateway.complete(request())).rejects.toBe(stop);
  expect(() => scope.throwIfHalted()).toThrow(stop);
  expect([g.attempts.length, anthropic.requests.length, gold.requests.length, controls.requests.length]).toEqual([1, 0, 0, 0]);
 });

 it("halts when a route cannot be reached: a policy refusal is not a model answer", async () => {
  const anthropic = spy("anthropic", (adapterRequest) => ok("never", adapterRequest));
  const openai = spy("openai", (adapterRequest) => ok("from the fallback", adapterRequest));
  const g = governed({anthropic: anthropic.adapter, openai: openai.adapter}, (attempt) => attempt.retryOrdinal < 0);
  const scope = createEvaluationBudgetScope(g.gateway, {});
  const part = scope.partition("gold", {maxCostUsd: 5, maxCalls: 8});
  await expect(part.gateway.complete(request())).rejects.toMatchObject({code: "data_policy_violation"});
  expect(() => scope.throwIfHalted()).toThrow();
  expect([anthropic.requests.length, openai.requests.length]).toEqual([0, 0]);
 });

 it("keeps a prompted repair inside its send and splits spend between partitions", async () => {
  const anthropic = spy("anthropic", (adapterRequest, call) => call === 1
   ? {output: {wrong: true}, rawText: "{\"wrong\":true}", usage: {inputTokens: 400, outputTokens: 20, cachedInputTokens: 0}, model: adapterRequest.model, stopReason: "end"}
   : ok("repaired", adapterRequest));
  const g = governed({anthropic: anthropic.adapter});
  const scope = createEvaluationBudgetScope(g.gateway, {agent_operation_brief: defaultTaskPolicies.agent_operation_brief});
  const first = scope.partition("first", {maxCostUsd: 5, maxCalls: 8});
  const second = scope.partition("second", {maxCostUsd: 5, maxCalls: 8});
  const result = await first.gateway.complete(request({task: "agent_operation_brief", outputMode: "prompted_json", allowFallback: false}));
  expect([result.output, result.isSameModelRepair]).toEqual([{answer: "repaired"}, true]);
  expect(first.requests[0]!.attempts.map((attempt) => [attempt.outcome, attempt.isSameModelRepair])).toEqual([["invalid_output", false], ["ok", true]]);
  await second.gateway.complete(request({allowFallback: false}));
  const total = g.gateway.spent();
  expect([first.gateway.spent().calls, second.gateway.spent().calls, total.calls]).toEqual([2, 1, 3]);
  expect(first.gateway.spent().costUsd + second.gateway.spent().costUsd).toBeCloseTo(total.costUsd, 9);
 });

 it("refuses overlapping requests, since spend is measured around each one", async () => {
  let release: () => void = () => undefined;
  const anthropic = spy("anthropic", (adapterRequest) => new Promise<AdapterResponse>((resolve) => { release = () => resolve(ok("late", adapterRequest)); }));
  const scope = createEvaluationBudgetScope(governed({anthropic: anthropic.adapter}).gateway, {});
  const part = scope.partition("gold", {maxCostUsd: 5, maxCalls: 8});
  const pending = part.gateway.complete(request({allowFallback: false}));
  await vi.waitFor(() => expect(anthropic.requests).toHaveLength(1));
  await expect(part.gateway.complete(request({allowFallback: false}))).rejects.toThrow("evaluation_partition_overlap");
  release();
  await pending;
  expect(() => scope.throwIfHalted()).toThrow("evaluation_partition_overlap");
 });
});
