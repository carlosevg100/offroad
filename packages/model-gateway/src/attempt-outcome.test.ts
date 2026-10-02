import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {createModelGateway} from "./gateway";
import {conservativeMicroUsd, attemptOutcomeTuple, gatewayAttemptOutcomeSchema, type GatewayAttemptOutcome, type GatewayAttemptOutcomeReceipt} from "./attempt-outcome";
import {ordinalGatewayStableText, ordinalGatewayFingerprint} from "./input-serialization";
import type {AdapterRequest, AdapterResponse} from "./types";
const shared = JSON.parse(readFileSync(new URL("../../../scripts/ci/fixtures/capital-body-outcome-protocol.json", import.meta.url), "utf8")) as {moneyVectors: {decimal: string; expectedMicroUsd: number | string}[]; outcomes: {name: string; dto: GatewayAttemptOutcome; canonicalTuple: string; expectedFingerprint: string}[]};
const vectors = {micros: shared.moneyVectors.map(row => ({usd: Number(row.decimal), expected: Number(row.expectedMicroUsd)})),
  outcomes: shared.outcomes.map(row => ({outcome: row.name, tuple: attemptOutcomeTuple(row.dto), text: row.canonicalTuple, sha256: row.expectedFingerprint}))};
const request = () => ({task: "preliminary_understanding" as const, system: "Synthetic review", input: [{type: "text" as const, text: "synthetic"}], schema: z.object({ok: z.boolean()}), schemaName: "synthetic", maxOutputTokens: 100});
const response = (model: string, output: unknown = {ok: true}): AdapterResponse => ({model, output, rawText: "PRIVATE_RAW_CANARY", usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, stopReason: "end"});
const receipt = (o: GatewayAttemptOutcome): GatewayAttemptOutcomeReceipt => ({schemaVersion: "gateway-attempt-outcome-receipt.v1", receiptId: randomUUID(), invocationId: o.invocationId, requestFingerprint: o.requestFingerprint, fingerprintVersion: o.fingerprintVersion, outcomeFingerprint: o.outcomeFingerprint, outcome: o.outcome, failureCode: o.failureCode});
describe("awaited attempt outcomes", () => {
  it("rejects an ASCII task absent from the pinned task registry", () => {
    expect(gatewayAttemptOutcomeSchema.safeParse({...shared.outcomes[0]!.dto, task: "unknown_task"}).success).toBe(false);
  });
  it.each(vectors.micros)("normalizes decimal ceil $usd to $expected micros identically to SQL vectors", ({usd, expected}) => expect(conservativeMicroUsd(usd)).toBe(expected));
  it.each([NaN, Infinity, -Infinity, -0, -0.000001, 1e20])("rejects unsupported money %s", value => expect(() => conservativeMicroUsd(value)).toThrow("gateway_attempt_outcome_invalid"));
  it.each(vectors.outcomes)("shares exact 31-slot text and fingerprint for $outcome", vector => {
    expect(vector.tuple).toHaveLength(31); expect(ordinalGatewayStableText(vector.tuple)).toBe(vector.text); expect(ordinalGatewayFingerprint(vector.tuple)).toBe(vector.sha256);
  });
  it("awaits terminal evidence before fallback dispatch and emits no private output", async () => {
    let release!: () => void; const pending = new Promise<void>(r => {release = r;}); const outcomes: GatewayAttemptOutcome[] = [];
    const fallback = vi.fn(async (r: AdapterRequest) => response(r.model));
    const gateway = createModelGateway({recordAttemptOutcome: async o => {outcomes.push(o); if (outcomes.length === 1) await pending; return receipt(o);},
      adapters: {anthropic: {provider: "anthropic", complete: async r => response(r.model, {private_key_canary: "PRIVATE_VALUE"})}, openai: {provider: "openai", complete: fallback}}});
    const completion = gateway.complete(request()); await vi.waitFor(() => expect(outcomes).toHaveLength(1)); expect(fallback).not.toHaveBeenCalled();
    expect(JSON.stringify(outcomes)).not.toContain("PRIVATE"); expect(JSON.stringify(outcomes)).not.toContain("private_key"); release(); await completion;
    expect(outcomes.map(o => o.outcome)).toEqual(["invalid_output", "accepted"]); expect(Object.isFrozen(outcomes[0])).toBe(true);
  });
  it.each(["throw", "wrongReceipt", "timeout"])("outcome persistence %s terminates without fallback", async kind => {
    const fallback = vi.fn(async (r: AdapterRequest) => response(r.model));
    const gateway = createModelGateway({recordAttemptOutcome: async o => {
      if (kind === "throw") throw new Error("PRIVATE_CALLBACK_ERROR"); if (kind === "timeout") return new Promise<GatewayAttemptOutcomeReceipt>(() => {});
      return {...receipt(o), invocationId: randomUUID()};
    }, adapters: {anthropic: {provider: "anthropic", complete: async () => {throw new Error("PRIVATE_PROVIDER_ERROR");}}, openai: {provider: "openai", complete: fallback}}});
    await expect(gateway.complete({...request(), timeoutMs: 20})).rejects.toMatchObject({code: "attempt_outcome_denied", message: "attempt outcome could not be recorded"}); expect(fallback).not.toHaveBeenCalled(); expect(gateway.spent().unknownCostCalls).toBe(1); expect(gateway.spent().budgetExposureUsd).toBeGreaterThan(0);
  });
  it("binds transformed/defaulted parsed output and awaits success before returning", async () => {
    let release!: () => void; const pending = new Promise<void>(r => {release=r;}); let outcome!: GatewayAttemptOutcome;
    const gateway = createModelGateway({recordAttemptOutcome: async o => {outcome=o; await pending; return receipt(o);}, adapters: {anthropic: {provider: "anthropic", complete: async r => response(r.model, {value: 2})}}});
    let transforms = 0;
    let returned = false; const done = gateway.complete({...request(), schema: z.object({value: z.number().overwrite(n => {transforms++; return n+1;}),label: z.string().default("known")})}).then(r => {returned=true; return r;});
    await vi.waitFor(() => expect(outcome).toBeDefined()); expect(returned).toBe(false); release(); const result=await done;
    expect(result.output).toEqual({value:3,label:"known"}); expect(transforms).toBe(1); expect(outcome.outputFingerprint).toBe(result.acceptedInvocation?.outputFingerprint); expect(attemptOutcomeTuple(outcome)).toHaveLength(31);
  });
  it("closes real repair and fallback independently and does not reset a two-call budget", async () => {
    const outcomes: GatewayAttemptOutcome[]=[]; const fallback=vi.fn(async (r:AdapterRequest)=>response(r.model));
    const gateway=createModelGateway({budget:{maxCalls:2,maxCostUsd:1},recordAttemptOutcome:async o=>{outcomes.push(o);return receipt(o);},adapters:{anthropic:{provider:"anthropic",complete:async r=>response(r.model,{})},openai:{provider:"openai",complete:fallback}}});
    await expect(gateway.complete({...request(),outputMode:"prompted_json"})).rejects.toMatchObject({code:"all_attempts_failed"}); expect(outcomes).toHaveLength(2);expect(outcomes[1]?.isSameModelRepair).toBe(true);expect(outcomes[1]?.previousInvocationId).toBe(outcomes[0]?.invocationId);expect(fallback).not.toHaveBeenCalled();expect(gateway.spent().calls).toBe(2);
  });
  it("does not redispatch when telemetry throws after accepted outcome was persisted", async () => {
    const outcomes: GatewayAttemptOutcome[]=[]; const primary=vi.fn(async(r:AdapterRequest)=>response(r.model));const fallback=vi.fn(async(r:AdapterRequest)=>response(r.model));
    const gateway=createModelGateway({recordAttemptOutcome:async o=>{outcomes.push(o);return receipt(o);},onCall(){throw new Error("synthetic telemetry failed");},adapters:{anthropic:{provider:"anthropic",complete:primary},openai:{provider:"openai",complete:fallback}}});
    await expect(gateway.complete(request())).rejects.toThrow("synthetic telemetry failed");expect(outcomes.map(o=>o.outcome)).toEqual(["accepted"]);expect(primary).toHaveBeenCalledTimes(1);expect(fallback).not.toHaveBeenCalled();expect(gateway.spent().calls).toBe(1);
  });
  it("ignores late hook completion after its deadline without a second send or budget reset", async () => {
    let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});let closed!:GatewayAttemptOutcome;
    const primary=vi.fn(async(r:AdapterRequest)=>response(r.model));const fallback=vi.fn(async(r:AdapterRequest)=>response(r.model));
    const gateway=createModelGateway({recordAttemptOutcome:async o=>{closed=o;await pending;return receipt(o);},adapters:{anthropic:{provider:"anthropic",complete:primary},openai:{provider:"openai",complete:fallback}}});
    await expect(gateway.complete({...request(),timeoutMs:20})).rejects.toMatchObject({code:"attempt_outcome_denied"});const before=gateway.spent();release();await Promise.resolve();await Promise.resolve();
    expect(closed.outcome).toBe("accepted");expect(primary).toHaveBeenCalledTimes(1);expect(fallback).not.toHaveBeenCalled();expect(gateway.spent()).toEqual(before);
  });
});
