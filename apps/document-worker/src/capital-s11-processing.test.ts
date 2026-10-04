/** Unit ports are synthetic; these tests make no SQL/production authority claim. */
import {randomUUID, createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {capitalPlanningMapSchema} from "@offroad/domain-contracts";
import {legacyGatewayFingerprint, conservativeMicroUsd, ordinalGatewayFingerprint, attemptOutcomeTuple, gatewayAttemptOutcomeSchema, retentionMatrixVersion, type AdapterRequest} from "@offroad/model-gateway";
import {prepareCapitalS11Recipe, capitalS11DispatchPins, type CapitalS11Component} from "./capital-s11-recipe";
import {createCapitalS11Processing, capitalS11FinalOutputFingerprint, capitalS11RendererVersion, type CapitalS11ProcessingPorts, type CapitalS11RetainedOutput} from "./capital-s11-processing";
type Shape = {const?: unknown; enum?: unknown[]; anyOf?: Shape[]; type?: string; required?: string[]; properties?: Record<string, Shape>; items?: Shape; minItems?: number; format?: string; pattern?: string; minLength?: number; minimum?: number};
function synthetic(shape: Shape): unknown {
  if (shape.const !== undefined) return shape.const;
  if (shape.enum) return shape.enum[0];
  if (shape.anyOf) return synthetic(shape.anyOf.find(x => x.type !== "null") ?? shape.anyOf[0]!);
  if (shape.type === "object") return Object.fromEntries((shape.required ?? []).map(key => [key, synthetic(shape.properties![key]!)]));
  if (shape.type === "array") return Array.from({length: shape.minItems ?? 0}, () => synthetic(shape.items!));
  if (shape.type === "string") return shape.format === "uri" ? "https://example.test/synthetic" : shape.pattern ? "alt_fixture" : "x".repeat(Math.max(1, shape.minLength ?? 1));
  if (shape.type === "integer" || shape.type === "number") return shape.minimum ?? 0;
  if (shape.type === "boolean") return true;
  if (shape.type === "null") return null;
  throw new Error("unsupported synthetic schema");
}
function component(slot: CapitalS11Component["slot"], body: unknown): CapitalS11Component {return {slot, id: randomUUID(), version: 1, body, bodyFingerprint: legacyGatewayFingerprint(body)};}
function harness(options: {serverCeiling?:number; invalidPrimary?:boolean; denyAll?:boolean; serverBudgetDenied?:boolean; failAll?:boolean; unavailableBody?:boolean; denyPrimary?: boolean; failPrimary?: boolean; outcomeFail?: boolean; wrongDispatch?: boolean; replayDispatch?: boolean; wrongBinding?: boolean; wrongBytes?: boolean; revokeAfterSend?: boolean; recovery?: boolean; recipeUnresolved?: boolean} = {}) {
  const jobId = randomUUID(), taskRunId = randomUUID(), recipeId = randomUUID(), operationId = randomUUID(), rootAttemptReceiptId = randomUUID();
  const source = component("source", {topic: "identity", provider: "official", title: "Synthetic", url: "https://example.test/source", snippet: "R$ 650 milhões", publishedAt: null, retrievedAt: "2026-10-02T00:00:00Z", contentHash: "c".repeat(64)});
  const preparation = {basis: {jobId, organizationId: randomUUID(), workId: randomUUID(), planId: randomUUID(), planFingerprint: "a".repeat(64), locale: "pt-BR" as const, asOfDate: "2026-10-02"},
    components: [component("company", {name: "Synthetic company", website: null}), component("brief", {capitalIntent:"Compare public financing alternatives"}), component("institution", null),
      component("research", {status:"succeeded",jurisdiction:"BR",jurisdictionNeedsConfirmation:false,strategyFingerprint:"d".repeat(64),sourceIds:[source.id]}), source, component("revision", null), component("dependency", {artifactFingerprint: "b".repeat(64)})]};
  const pure = prepareCapitalS11Recipe(preparation).recipe;
  const receipt = {schemaVersion: "capital-s11-recipe-receipt.v1", state: options.recipeUnresolved ? "unresolved" : "ready", recipeId,producerTaskRunId:taskRunId,producerTaskId:"M04",finalTaskId:"S11", ...preparation.basis,
    rendererVersion: capitalS11RendererVersion, recipeFingerprint: "d".repeat(64), reconstructionFingerprint: pure.reconstructionFingerprint,
    contextRetainedPayloadId: randomUUID(), operationalBudget:{schemaVersion:"capital-s11-operational-budget.v1",researchReservationVersion:"public-research-reservation.s11.v1",researchReservationMicroUsd:300000,maxExposureMicroUsd:3000000,maxDispatches:2}, components: pure.components, expiresAt: "2026-10-03T00:00:00Z"};
  const raw=synthetic(z.toJSONSchema(capitalPlanningMapSchema) as Shape) as Record<string,unknown>; raw.evidenceCoverage={...(raw.evidenceCoverage as object),status:"insufficient"};raw.directionalRecommendation={...(raw.directionalRecommendation as object),status:"not_ready",alternativeId:null};raw.informationRequests=[synthetic((z.toJSONSchema(capitalPlanningMapSchema) as Shape).properties!.informationRequests!.items!)];const output=capitalPlanningMapSchema.parse(raw);
  const bytes = Buffer.from(JSON.stringify(output));
  let retained: CapitalS11RetainedOutput | null = null;
  const retain = (invocationId: string, inputReceiptId: string): CapitalS11RetainedOutput => {const allocationId=randomUUID();return ({binding: {recipeId, invocationId, inputReceiptId, outputFingerprint: legacyGatewayFingerprint(output)},
    scope: {schemaVersion: "capital-retained-body.v1", retentionState: "retained", allocationId, retainedPayloadId: randomUUID(), bodyBasisId: randomUUID(), bucket: "capital-input-capture", path: `${preparation.basis.organizationId}/${allocationId}/payload.json`, payloadFingerprint: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length,
      storageObjectId: randomUUID(), storageVersion: "synthetic-version", retainedAt: "2026-10-02T00:00:00Z", uploadExpiresAt: "2026-10-02T00:10:00Z", expiresAt: receipt.expiresAt, purgeAt: "2026-10-02T23:00:00Z", replayed: false}});};
  if (options.recovery) retained = retain(randomUUID(), randomUUID());
  const records = new Map<string, {attempt: Parameters<CapitalS11ProcessingPorts["authorize"]>[0]["attempt"]; decisionId: string; inputReceiptId?: string}>();
  const order: string[] = [], sends: AdapterRequest[] = [];let serverExposure=0;
  const ports: CapitalS11ProcessingPorts = {
    loadRecipe: vi.fn(async () => ({receipt, preparation})),
    revalidateRecipe: vi.fn(async () => {if (options.revokeAfterSend && sends.length) throw new Error("synthetic revocation"); return receipt;}),
    recoverAccepted: vi.fn(async () => retained),
    authorize: vi.fn(async ({attempt}) => {
      const id = randomUUID(), decisionId = randomUUID(); records.set(id, {attempt, decisionId}); order.push(`authorize:${attempt.usedProviderFallback}`);
      const allowed = !options.denyAll && (!options.denyPrimary || attempt.usedProviderFallback);
      return {schemaVersion: "capital-body-processing-decision.v2", allowed, policyVersion: retentionMatrixVersion, assuranceId: null, assuranceIds: allowed ? [randomUUID(), randomUUID(), randomUUID()] : [],
        decisionId, classification: "confidential", reasons: allowed ? [] : ["processing_resource_ineligible:inference"], attemptReceiptId: id, invocationId: attempt.invocationId, requestFingerprint: attempt.requestFingerprint, eligibilityFingerprint: "e".repeat(64), replayed: false, operationId, rootAttemptReceiptId};
    }),
    dispatch: vi.fn(async id => {
      if(options.serverBudgetDenied)throw new Error("capital_s11_budget_denied");
      const record = records.get(id)!;const serverBound=record.attempt.usedProviderFallback?405265:387665;if(options.serverCeiling!==undefined&&serverExposure+serverBound>options.serverCeiling)throw new Error("capital_s11_budget_denied");serverExposure+=serverBound;
      const model = record.attempt.usedProviderFallback ? "gpt-5.6-terra" : "claude-sonnet-5";
      const reconstructed = prepareCapitalS11Recipe(preparation), request = {...reconstructed.prepared.request, outputMode: "structured" as const, timeoutMs: 240000};
      const {prepareGatewayInput, buildEffectiveAdapterRequest} = await import("@offroad/model-gateway");
      const effective = buildEffectiveAdapterRequest(prepareGatewayInput(request), {provider: record.attempt.usedProviderFallback?"openai":"anthropic", model, effort: "medium"}, {maxOutputTokens: 8000, timeoutMs: 240000});
      record.inputReceiptId = randomUUID(); order.push(`dispatch:${record.attempt.usedProviderFallback}`);
      return {schemaVersion: "capital-body-input-dispatch.v3", receiptId: record.inputReceiptId, invocationId: options.wrongDispatch ? randomUUID() : record.attempt.invocationId, requestFingerprint: record.attempt.requestFingerprint, operationId,
        attemptReceiptId: id, rootAttemptReceiptId, dispatchClaimId: randomUUID(), rendererPolicyFingerprint: capitalS11DispatchPins({...reconstructed,prepared:prepareGatewayInput(request)},{provider:record.attempt.usedProviderFallback?"openai":"anthropic",model,effort:"medium"}).policyFingerprint, reservationMicroUsd: conservativeMicroUsd(record.attempt.reservationUsd), serverReservationMicroUsd: Math.max(serverBound,conservativeMicroUsd(record.attempt.reservationUsd)), dispatchAllowed: !options.replayDispatch, replayed: Boolean(options.replayDispatch)};
    }),
    outcome: vi.fn(async (id, outcome) => {order.push(`outcome:${outcome.outcome}`); if (options.outcomeFail) throw new Error("synthetic write failure"); const record = records.get(id)!;
      return {schemaVersion: "capital-body-attempt-outcome-receipt.v1", receiptId: randomUUID(), operationId, attemptReceiptId: id, inputReceiptId: record.inputReceiptId, rootAttemptReceiptId, invocationId: outcome.invocationId,
        requestFingerprint: outcome.requestFingerprint, fingerprintVersion: outcome.fingerprintVersion, outcomeFingerprint: outcome.outcomeFingerprint, outcome: outcome.outcome, failureCode: outcome.failureCode, replayed: false};}),
    retainAccepted: vi.fn(async ({accepted}) => {order.push("retain"); if(options.unavailableBody)throw new Error("synthetic physical unavailable"); retained = retain(options.wrongBinding ? randomUUID() : accepted.invocationId, accepted.inputAttestationReceiptId!); return retained;}),
    recordExecutionFailure:vi.fn(async({recipeId:failureRecipeId,reason})=>({schemaVersion:"capital-s11-execution-failure-receipt.v1",recipeId:failureRecipeId,taskRunId,reason,outcomeIds:[],replayed:false})),
    readAccepted: vi.fn(async value => ({scope: value.scope, bytes: options.wrongBytes ? Buffer.from("wrong") : bytes})),
  };
  const complete=async(request:AdapterRequest)=>{sends.push(request);order.push(`send:${request.model}`);if(options.failAll||(options.failPrimary&&request.model==="claude-sonnet-5"))throw new Error("synthetic provider failure");return {output,rawText:JSON.stringify(output),model:request.model,usage:{inputTokens:1,outputTokens:1,cachedInputTokens:0},stopReason:"end" as const};};
  const connection={accountRef:"synthetic",projectRef:"synthetic",credentialBinding:"synthetic",region:"global"};
  const config={jobId,ports,connections:{openai:connection,anthropic:connection},now:()=>Date.parse("2026-10-02T12:00:00Z"),adapters:{openai:{provider:"openai" as const,complete},anthropic:{provider:"anthropic" as const,complete}}};
  return {run: () => createCapitalS11Processing(config).run(taskRunId), config, taskRunId, ports, order, sends};
}
describe("closed S11 processing with synthetic unit ports", () => {
  it("persists outcome and accepted physical body before returning", async () => {
    const h = harness(), result = await h.run(); expect(result.recovered).toBe(false); expect(h.sends).toHaveLength(1);
    expect(h.order).toEqual(["authorize:false", "dispatch:false", "send:claude-sonnet-5", "outcome:accepted", "retain"]);
    expect(h.sends[0]).toMatchObject({maxOutputTokens: 8000, timeoutMs: 240000, effort: "medium", outputMode: "structured", cacheKey: "capital-planning-map:31ca5d156de399e5b8c3db53c50bd67003d05709711894cda6fb36c7f2265516"});
  });
  it("allows denied primary to fall back with no primary send", async () => {
    const h = harness({denyPrimary: true}); await h.run(); expect(h.sends.map(x => x.model)).toEqual(["gpt-5.6-terra"]);
  });
  it("awaits failure outcome before fallback dispatch", async () => {
    const h = harness({failPrimary: true}); await h.run(); expect(h.order.indexOf("outcome:provider_error")).toBeLessThan(h.order.indexOf("authorize:true")); expect(h.sends).toHaveLength(2);
  });
  it("stops after outcome persistence failure without fallback", async () => {
    const h = harness({failPrimary: true, outcomeFail: true}); await expect(h.run()).rejects.toThrow("capital_s11_processing_denied"); expect(h.sends).toHaveLength(1); expect(h.ports.retainAccepted).not.toHaveBeenCalled();
  });
  it.each(["wrongDispatch", "replayDispatch", "recipeUnresolved"] as const)("denies %s before any send", async mode => {
    const h = harness({[mode]: true}); await expect(h.run()).rejects.toThrow(); expect(h.sends).toHaveLength(0);
  });
  it.each(["wrongBinding", "wrongBytes", "revokeAfterSend"] as const)("does not return an accepted result after %s", async mode => {
    const h = harness({[mode]: true}); await expect(h.run()).rejects.toThrow(); expect(h.sends).toHaveLength(1);
  });
  it("recovers retained output without dispatch or model", async () => {
    const h = harness({recovery: true}), result = await h.run(); expect(result.recovered).toBe(true); expect(h.sends).toHaveLength(0); expect(h.ports.authorize).not.toHaveBeenCalled();
  });
  it("permits only one run per factory", async () => {
    const h = harness(), factory = createCapitalS11Processing(h.config); await factory.run(h.taskRunId); await expect(factory.run(h.taskRunId)).rejects.toThrow(); expect(h.sends).toHaveLength(1);
  });
  it("denies a runtime budget smaller than one dispatch",async()=>{const h=harness();await expect(createCapitalS11Processing({...h.config,budget:{maxCostUsd:0.000001,maxCalls:2}}).run(h.taskRunId)).rejects.toThrow();expect(h.sends).toHaveLength(0);});
});
