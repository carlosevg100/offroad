/** Unit ports are synthetic; these tests make no SQL/production authority claim. */
import {randomUUID, createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {originationSeniorReadoutSchema, originationSeniorReadoutArtifactSchema} from "@offroad/domain-contracts";
import {legacyGatewayFingerprint, conservativeMicroUsd, ordinalGatewayFingerprint, attemptOutcomeTuple, gatewayAttemptOutcomeSchema, retentionMatrixVersion, type AdapterRequest} from "@offroad/model-gateway";
import {prepareCapitalPublicTaskRecipe, type CapitalPublicRecipeComponent} from "./capital-public-task-recipe";
import {createCapitalM07Processing, capitalM07FinalOutputFingerprint, capitalM07DispatchPolicyFingerprint, capitalM07RendererVersion, type CapitalM07ProcessingPorts, type CapitalM07RetainedOutput} from "./capital-m07-processing";
const system = readFileSync(new URL("./origination-thesis.ts", import.meta.url), "utf8").match(/const ORIGINATION_THESIS_SYSTEM = `([\s\S]*?)`;/)![1]!;
type Shape = {const?: unknown; enum?: unknown[]; anyOf?: Shape[]; type?: string; required?: string[]; properties?: Record<string, Shape>; items?: Shape; minItems?: number; format?: string; pattern?: string; minLength?: number; minimum?: number};
function synthetic(shape: Shape): unknown {
  if (shape.const !== undefined) return shape.const;
  if (shape.enum) return shape.enum[0];
  if (shape.anyOf) return synthetic(shape.anyOf.find(x => x.type !== "null") ?? shape.anyOf[0]!);
  if (shape.type === "object") return Object.fromEntries((shape.required ?? []).map(key => [key, synthetic(shape.properties![key]!)]));
  if (shape.type === "array") return Array.from({length: shape.minItems ?? 0}, () => synthetic(shape.items!));
  if (shape.type === "string") return shape.format === "uri" ? "https://example.test/synthetic" : shape.pattern ? "assumption_1" : "x".repeat(Math.max(1, shape.minLength ?? 1));
  if (shape.type === "integer" || shape.type === "number") return shape.minimum ?? 0;
  if (shape.type === "boolean") return true;
  if (shape.type === "null") return null;
  throw new Error("unsupported synthetic schema");
}
function component(slot: CapitalPublicRecipeComponent["slot"], body: unknown): CapitalPublicRecipeComponent {return {slot, id: randomUUID(), version: 1, body, bodyFingerprint: legacyGatewayFingerprint(body)};}
function harness(options: {serverCeiling?:number; invalidPrimary?:boolean; denyAll?:boolean; serverBudgetDenied?:boolean; failAll?:boolean; unavailableBody?:boolean; denyPrimary?: boolean; failPrimary?: boolean; outcomeFail?: boolean; wrongDispatch?: boolean; replayDispatch?: boolean; wrongBinding?: boolean; wrongBytes?: boolean; revokeAfterSend?: boolean; recovery?: boolean; recipeUnresolved?: boolean} = {}) {
  const jobId = randomUUID(), taskRunId = randomUUID(), recipeId = randomUUID(), operationId = randomUUID(), rootAttemptReceiptId = randomUUID();
  const source = component("source", {topic: "identity", provider: "official", title: "Synthetic", url: "https://example.test/source", snippet: "R$ 650 milhões", publishedAt: null, retrievedAt: "2026-10-02T00:00:00Z", contentHash: "c".repeat(64)});
  const preparation = {system, basis: {jobId, organizationId: randomUUID(), workId: randomUUID(), planId: randomUUID(), planFingerprint: "a".repeat(64), locale: "pt-BR" as const, asOfDate: "2026-10-02"},
    components: [component("company", {name: "Synthetic company", website: null}), component("brief", {meetingContext: "Discuss capital alternatives"}), component("institution", null),
      component("research", {status: "succeeded", sourceIds: [source.id]}), source, component("revision", null), component("quality_retry", null), component("dependency", {artifactFingerprint: "b".repeat(64)})]};
  const pure = prepareCapitalPublicTaskRecipe(preparation).recipe;
  const receipt = {schemaVersion: "capital-m07-recipe-receipt.v1", state: options.recipeUnresolved ? "unresolved" : "ready", recipeId, taskRunId, ...preparation.basis,
    rendererVersion: capitalM07RendererVersion, recipeFingerprint: "d".repeat(64), reconstructionFingerprint: pure.reconstructionFingerprint,
    contextRetainedPayloadId: randomUUID(), operationalBudget:{schemaVersion:"capital-m07-operational-budget.v1",researchReservationVersion:"public-research-reservation.m07.v1",researchReservationMicroUsd:300000,maxExposureMicroUsd:3000000,maxDispatches:2}, components: pure.components, expiresAt: "2026-10-03T00:00:00Z"};
  const output = originationSeniorReadoutSchema.parse(synthetic(z.toJSONSchema(originationSeniorReadoutSchema) as Shape));
  const bytes = Buffer.from(JSON.stringify(output));
  let retained: CapitalM07RetainedOutput | null = null;
  const retain = (invocationId: string, inputReceiptId: string): CapitalM07RetainedOutput => {const allocationId=randomUUID();return ({binding: {recipeId, invocationId, inputReceiptId, outputFingerprint: legacyGatewayFingerprint(output)},
    scope: {schemaVersion: "capital-retained-body.v1", retentionState: "retained", allocationId, retainedPayloadId: randomUUID(), bodyBasisId: randomUUID(), bucket: "capital-input-capture", path: `${preparation.basis.organizationId}/${allocationId}/payload.json`, payloadFingerprint: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length,
      storageObjectId: randomUUID(), storageVersion: "synthetic-version", retainedAt: "2026-10-02T00:00:00Z", uploadExpiresAt: "2026-10-02T00:10:00Z", expiresAt: receipt.expiresAt, purgeAt: "2026-10-02T23:00:00Z", replayed: false}});};
  if (options.recovery) retained = retain(randomUUID(), randomUUID());
  const records = new Map<string, {attempt: Parameters<CapitalM07ProcessingPorts["authorize"]>[0]["attempt"]; decisionId: string; inputReceiptId?: string}>();
  const order: string[] = [], sends: AdapterRequest[] = [];let serverExposure=0;
  const ports: CapitalM07ProcessingPorts = {
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
      if(options.serverBudgetDenied)throw new Error("capital_m07_budget_denied");
      const record = records.get(id)!;const serverBound=record.attempt.usedProviderFallback?627963:1150325;if(options.serverCeiling!==undefined&&serverExposure+serverBound>options.serverCeiling)throw new Error("capital_m07_budget_denied");serverExposure+=serverBound;
      const model = record.attempt.usedProviderFallback ? "gpt-5.6-terra" : "gpt-5.6-sol";
      const reconstructed = prepareCapitalPublicTaskRecipe(preparation), request = {...reconstructed.prepared.request, outputMode: "structured" as const, timeoutMs: 360000};
      const {prepareGatewayInput, buildEffectiveAdapterRequest} = await import("@offroad/model-gateway");
      const effective = buildEffectiveAdapterRequest(prepareGatewayInput(request), {provider: "openai", model, effort: "high"}, {maxOutputTokens: 24000, timeoutMs: 360000});
      record.inputReceiptId = randomUUID(); order.push(`dispatch:${record.attempt.usedProviderFallback}`);
      return {schemaVersion: "capital-body-input-dispatch.v3", receiptId: record.inputReceiptId, invocationId: options.wrongDispatch ? randomUUID() : record.attempt.invocationId, requestFingerprint: record.attempt.requestFingerprint, operationId,
        attemptReceiptId: id, rootAttemptReceiptId, dispatchClaimId: randomUUID(), rendererPolicyFingerprint: capitalM07DispatchPolicyFingerprint(effective.adapterRequest), reservationMicroUsd: conservativeMicroUsd(record.attempt.reservationUsd), serverReservationMicroUsd: Math.max(serverBound,conservativeMicroUsd(record.attempt.reservationUsd)), dispatchAllowed: !options.replayDispatch, replayed: Boolean(options.replayDispatch)};
    }),
    outcome: vi.fn(async (id, outcome) => {order.push(`outcome:${outcome.outcome}`); if (options.outcomeFail) throw new Error("synthetic write failure"); const record = records.get(id)!;
      return {schemaVersion: "capital-body-attempt-outcome-receipt.v1", receiptId: randomUUID(), operationId, attemptReceiptId: id, inputReceiptId: record.inputReceiptId, rootAttemptReceiptId, invocationId: outcome.invocationId,
        requestFingerprint: outcome.requestFingerprint, fingerprintVersion: outcome.fingerprintVersion, outcomeFingerprint: outcome.outcomeFingerprint, outcome: outcome.outcome, failureCode: outcome.failureCode, replayed: false};}),
    retainAccepted: vi.fn(async ({accepted}) => {order.push("retain"); if(options.unavailableBody)throw new Error("synthetic physical unavailable"); retained = retain(options.wrongBinding ? randomUUID() : accepted.invocationId, accepted.inputAttestationReceiptId!); return retained;}),
    recordExecutionFailure:vi.fn(async({recipeId:failureRecipeId,reason})=>({schemaVersion:"capital-m07-execution-failure-receipt.v1",recipeId:failureRecipeId,taskRunId,reason,outcomeIds:[],replayed:false})),
    readAccepted: vi.fn(async value => ({scope: value.scope, bytes: options.wrongBytes ? Buffer.from("wrong") : bytes})),
  };
  const config = {jobId, ports, connections: {openai: {accountRef: "synthetic", projectRef: "synthetic", credentialBinding: "synthetic", region: "global"}}, now: () => Date.parse("2026-10-02T12:00:00Z"), adapters: {openai: {provider: "openai" as const, async complete(request: AdapterRequest) {
    sends.push(request); order.push(`send:${request.model}`); if(options.failAll)throw new Error("synthetic provider failure"); if (options.failPrimary && request.model === "gpt-5.6-sol") throw new Error("synthetic provider failure");
    return {output:options.invalidPrimary&&request.model==="gpt-5.6-sol"?{}:output, rawText: JSON.stringify(output), model: request.model, usage: {inputTokens: 1, outputTokens: 1, cachedInputTokens: 0}, stopReason: "end" as const};
  }}}};
  return {run: () => createCapitalM07Processing(config).run(taskRunId), config, taskRunId, ports, order, sends};
}
describe("closed M07 processing with synthetic unit ports", () => {
  it("persists outcome and accepted physical body before returning", async () => {
    const h = harness(), result = await h.run(); expect(result.recovered).toBe(false); expect(h.sends).toHaveLength(1);
    expect(h.order).toEqual(["authorize:false", "dispatch:false", "send:gpt-5.6-sol", "outcome:accepted", "retain"]);
    expect(h.sends[0]).toMatchObject({maxOutputTokens: 24000, timeoutMs: 360000, effort: "high", outputMode: "structured", cacheKey: "origination-senior-readout-v6"});
  });
  it("allows denied primary to fall back with no primary send", async () => {
    const h = harness({denyPrimary: true}); await h.run(); expect(h.sends.map(x => x.model)).toEqual(["gpt-5.6-terra"]);
  });
  it("awaits failure outcome before fallback dispatch", async () => {
    const h = harness({failPrimary: true}); await h.run(); expect(h.order.indexOf("outcome:provider_error")).toBeLessThan(h.order.indexOf("authorize:true")); expect(h.sends).toHaveLength(2);
  });
  it("stops after outcome persistence failure without fallback", async () => {
    const h = harness({failPrimary: true, outcomeFail: true}); await expect(h.run()).rejects.toThrow("capital_m07_processing_denied"); expect(h.sends).toHaveLength(1); expect(h.ports.retainAccepted).not.toHaveBeenCalled();
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
    const h = harness(), factory = createCapitalM07Processing(h.config); await factory.run(h.taskRunId); await expect(factory.run(h.taskRunId)).rejects.toThrow(); expect(h.sends).toHaveLength(1);
  });
  it("pins final renderer identity separately from physical and parsed hashes", () => {
    const final = originationSeniorReadoutArtifactSchema.parse({...synthetic(z.toJSONSchema(originationSeniorReadoutSchema) as Shape) as object,
      schemaVersion: "origination-senior-readout.v3", asOfDate: "2026-10-02", company: {name: "Synthetic company", website: null}, sources: [],
      researchStatus: "abstained", scopeBoundary: "Synthetic unit financial reading only", provenance: {provider: "openai", model: "gpt-5.6-sol", executorVersion: "2026.09.03-v6"}});
    const result = capitalM07FinalOutputFingerprint("a".repeat(64), "b".repeat(64), final);
    expect(result).toBe("efb7d12c56ee8306038fc8d68492f76776d7696d4d58fdcedbb94225b2033479");
    expect(result).not.toBe(createHash("sha256").update(JSON.stringify(final)).digest("hex"));
    expect(result).not.toBe(capitalM07FinalOutputFingerprint("a".repeat(64), "c".repeat(64), final));
    expect(() => capitalM07FinalOutputFingerprint("a".repeat(64), "b".repeat(64), {...final, rawCanary: "secret"})).toThrow();
  });

  it("denies a runtime budget smaller than one dispatch before the adapter sends",async()=>{
    const h=harness();await expect(createCapitalM07Processing({...h.config,budget:{maxCostUsd:0.000001,maxCalls:2}}).run(h.taskRunId)).rejects.toThrow();expect(h.sends).toHaveLength(0);
  });
  it("denies zero runtime budget and zero calls before authority lookup",()=>{
    const h=harness();expect(()=>createCapitalM07Processing({...h.config,budget:{maxCostUsd:0,maxCalls:2}})).toThrow();expect(()=>createCapitalM07Processing({...h.config,budget:{maxCostUsd:3,maxCalls:0}})).toThrow();expect(h.ports.loadRecipe).not.toHaveBeenCalled();
  });
  it("preserves a one-call runtime limit when the primary fails",async()=>{
    const h=harness({failPrimary:true});await expect(createCapitalM07Processing({...h.config,budget:{maxCostUsd:3,maxCalls:1}}).run(h.taskRunId)).rejects.toThrow();expect(h.sends).toHaveLength(1);expect(h.sends[0]!.model).toBe("gpt-5.6-sol");
  });
  it.each([
    [{denyAll:true},"processing_denied",0],
    [{serverBudgetDenied:true},"budget_denied",0],
    [{failAll:true},"model_attempts_exhausted",2],
    [{unavailableBody:true},"accepted_body_unavailable",1],
  ] as const)("records a proven native terminal reason %s",async(options,reason,calls)=>{
    const h=harness(options);await expect(h.run()).rejects.toMatchObject({code:"capital_m07_execution_failed_terminal",reason});
    expect(h.ports.recordExecutionFailure).toHaveBeenCalledWith(expect.objectContaining({reason}));expect(h.sends).toHaveLength(calls);
  });
  it("does not forge a terminal diagnosis when outcome persistence failed",async()=>{
    const h=harness({failPrimary:true,outcomeFail:true});await expect(h.run()).rejects.toThrow("capital_m07_processing_denied");expect(h.ports.recordExecutionFailure).not.toHaveBeenCalled();
  });
  it("does not turn a rejected terminal write into success or a fresh dispatch",async()=>{
    const h=harness({denyAll:true});vi.mocked(h.ports.recordExecutionFailure).mockRejectedValue(new Error("synthetic revocation"));await expect(h.run()).rejects.toThrow("capital_m07_processing_denied");expect(h.sends).toHaveLength(0);
  });
  it.each(["invalidPrimary","failPrimary"] as const)("conserves the Sol server reservation after %s; no Terra dispatch under 1.25 USD",async(mode)=>{
    const h=harness({[mode]:true,serverCeiling:1250000});await expect(h.run()).rejects.toMatchObject({code:"capital_m07_execution_failed_terminal",reason:"budget_denied"});expect(h.sends.map(request=>request.model)).toEqual(["gpt-5.6-sol"]);
    expect(h.ports.outcome).toHaveBeenCalledOnce();
  });
  it("fits Terra under 1.25 USD only when Sol was denied before dispatch",async()=>{
    const h=harness({denyPrimary:true,serverCeiling:1250000});await h.run();expect(h.sends.map(request=>request.model)).toEqual(["gpt-5.6-terra"]);expect(h.ports.recordExecutionFailure).not.toHaveBeenCalled();
  });
  it("shares the SQL policy gold for both fixed routes", async () => {
    const primary = harness(); await primary.run();
    expect(capitalM07DispatchPolicyFingerprint(primary.sends[0]!)).toBe("3d2e9cdaa043858092ecfa98c819658831106bcd966ac6c6a6b018ce3408cef4");
    const fallback = harness({denyPrimary: true}); await fallback.run();
    expect(capitalM07DispatchPolicyFingerprint(fallback.sends[0]!)).toBe("83ab83479eef661195ef43fbd6390ac77f962897cc8f374aaf6f71b1c31b859b");
  });
  it("shares all five SQL outcome scalar gold vectors", () => {
    const gold = JSON.parse(readFileSync(new URL("../../../scripts/ci/fixtures/capital-body-outcome-protocol.json", import.meta.url), "utf8")) as {outcomes: Array<{dto: Record<string, unknown>}>};
    const expected = ["c1efbbdbcefb7cf4dd202d0ab2e458f3cc20cfc4743cd505691fd6af71858d80", "267cfe8b4f422c1554121717ccc018b2e8a14b859d3b6bc67ac1457fe8078005", "fd6b08dc51466f80d645c2a3e0640a7354cf813c24e46327346959dac2f9bcd6", "70c79b99b5d417191ed933c4592f6e9886eaf5bcf7a6f7ee12a2385d558c3ba8", "8a663e8d57efc64430d28ad32047fc2e83fe634ac11d0f7279b43f310b5dbe3e"];
    for (const [index, vector] of gold.outcomes.entries()) {
      const dto = gatewayAttemptOutcomeSchema.parse({...vector.dto, task: "origination_thesis", provider: "openai", configuredModel: "gpt-5.6-sol", reportedModel: vector.dto.reportedModel === null ? null : "gpt-5.6-sol"});
      expect(ordinalGatewayFingerprint(attemptOutcomeTuple(dto))).toBe(expected[index]);
    }
  });

});
