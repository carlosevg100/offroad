import {randomUUID} from "node:crypto";
import {describe, expect, it} from "vitest";
import {z} from "zod";
import {createModelGateway, type GatewayAttempt, type GatewayInputAttestation} from "./gateway";
import {gatewayCallLogSchema} from "./lineage";
import {retentionMatrixVersion, type ProcessingEligibilityDecision} from "./retention-matrix";
import type {AdapterResponse, GatewayCallLog} from "./types";

const schema = z.object({ok: z.boolean()});
const request = {task: "preliminary_understanding" as const, system: "Private bounded review",
  input: [{type: "text" as const, text: "private@example.com"}], schema, schemaName: "bounded", maxOutputTokens: 100};
const response: AdapterResponse = {output: {ok: true}, rawText: '{"ok":true}', usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0},
  model: "claude-sonnet-5", stopReason: "end"};
const decision = (allowed: boolean, decisionId?: string): ProcessingEligibilityDecision => ({allowed, policyVersion: retentionMatrixVersion,
  assuranceId: null, reasons: allowed ? [] : ["processing_assurance_missing"], ...(decisionId ? {decisionId} : {})});

describe("attempt authority context", () => {
  it("pins denied-primary and allowed-fallback identities with the exact effective fingerprints", async () => {
    const attempts: GatewayAttempt[] = [], logs: GatewayCallLog[] = [], receipts: GatewayInputAttestation[] = [];
    const ids = [randomUUID(), randomUUID()]; let primarySends = 0, fallbackSends = 0;
    const gateway = createModelGateway({processingEligibility: async ({attempt}) => {
      attempts.push(attempt); return decision(attempt.usedProviderFallback, ids[attempts.length - 1]);
    }, attestInput: async a => {receipts.push(a); return {invocationId: a.invocationId, requestFingerprint: a.requestFingerprint, receiptId: randomUUID()};},
    onCall: l => logs.push(l), adapters: {
      anthropic: {provider: "anthropic", complete: async () => {primarySends++; return response;}},
      openai: {provider: "openai", complete: async () => {fallbackSends++; return response;}},
    }});
    const result = await gateway.complete(request);
    expect([primarySends, fallbackSends]).toEqual([0, 1]); expect(receipts).toHaveLength(1);
    expect(attempts[0]?.previousInvocationId).toBeUndefined();
    expect(attempts[1]?.previousInvocationId).toBe(attempts[0]?.invocationId);
    for (const [i, a] of attempts.entries()) {
      expect(a).toMatchObject({adapterInputVersion: "gateway-adapter-input.v1", task: request.task, schemaName: request.schemaName});
      expect(a.requestFingerprint).toBe(logs[i]?.adapterRequestFingerprint);
      expect(a.inputFingerprint).toBe(logs[i]?.inputFingerprint); expect(a.promptFingerprint).toBe(logs[i]?.promptFingerprint);
      expect(result.attempts[i]).toMatchObject({invocationId: a.invocationId, processingDecisionId: ids[i]});
      expect(gatewayCallLogSchema.parse(logs[i]).processingDecisionId).toBe(ids[i]);
    }
    expect(logs[1]?.previousInvocationId).toBe(attempts[0]?.invocationId);
    expect(receipts[0]).toMatchObject({invocationId: attempts[1]?.invocationId, requestFingerprint: attempts[1]?.requestFingerprint});
    expect(result.acceptedInvocation?.invocationId).toBe(attempts[1]?.invocationId);
    expect(JSON.stringify(attempts)).not.toMatch(/private@example|Private bounded|properties/);
  });

  it("does not let an authority mutate the pinned attempt across an await", async () => {
    let captured!: GatewayAttempt; let immutable = false;
    const gateway = createModelGateway({processingEligibility: async ({attempt}) => {
      captured = attempt; immutable = Object.isFrozen(attempt);
      expect(Reflect.set(attempt, "requestFingerprint", "0".repeat(64))).toBe(false);
      await Promise.resolve(); return decision(true);
    }, adapters: {anthropic: {provider: "anthropic", complete: async () => response}}});
    const result = await gateway.complete({...request, allowFallback: false});
    expect(immutable).toBe(true); expect(result.acceptedInvocation?.adapterRequestFingerprint).toBe(captured.requestFingerprint);
    expect(result.attempts[0]?.processingDecisionId).toBeUndefined();
  });

  it("fixes a distinct repair request and carries its immediate predecessor", async () => {
    const attempts: GatewayAttempt[] = []; let sends = 0;
    const gateway = createModelGateway({processingEligibility: async ({attempt}) => {attempts.push(attempt); return decision(true, randomUUID());},
      adapters: {anthropic: {provider: "anthropic", complete: async () => (++sends === 1 ? {...response, output: {ok: "invalid"}} : response)}}});
    await gateway.complete({...request, outputMode: "prompted_json", allowFallback: false});
    expect(attempts).toHaveLength(2); expect(attempts[1]?.isSameModelRepair).toBe(true);
    expect(attempts[1]?.previousInvocationId).toBe(attempts[0]?.invocationId);
    expect(attempts[1]?.requestFingerprint).not.toBe(attempts[0]?.requestFingerprint);
    expect(attempts[1]?.promptFingerprint).not.toBe(attempts[0]?.promptFingerprint);
    expect(attempts[1]?.inputFingerprint).toBe(attempts[0]?.inputFingerprint);
  });

  it("denies a malformed persisted decision identity without send or fallback", async () => {
    let sends = 0;
    const complete = async () => {sends++; return response;};
    const gateway = createModelGateway({processingEligibility: async () => decision(true, "not-an-authority-id"),
      adapters: {anthropic: {provider: "anthropic", complete}, openai: {provider: "openai", complete}}});
    await expect(gateway.complete(request)).rejects.toMatchObject({code: "data_policy_violation"}); expect(sends).toBe(0);
    expect(gateway.spent().budgetExposureUsd).toBe(0);
  });
});
