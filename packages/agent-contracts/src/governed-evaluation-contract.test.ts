import {describe, expect, it} from "vitest";

import {executionCanonicalText} from "./execution-contract";
import {
  governedEvaluationContractSchema,
  governedEvaluationPartialResult,
  governedEvaluationToolId,
  type GovernedEvaluationContract,
} from "./governed-evaluation-contract";

const contract = (): GovernedEvaluationContract => ({
  schemaVersion: "governed-evaluation-contract.v1",
  executionId: "e5a10000-0000-4000-c000-000000000001",
  organizationId: "e5a10000-0000-4000-9000-000000000001",
  requestId: "e5a10000-0000-4000-c000-000000000001",
  processingRunId: "e5a10000-0000-4000-c000-000000000001",
  purpose: "evaluation",
  audience: {kind: "evaluation_panel", caseId: "gc01-analista-ib-camil", caseVersion: "1.0", scriptId: "run-gold-baseline"},
  tools: [{id: governedEvaluationToolId("anthropic", "claude-opus-5"), version: "2026.09.01-data-policy-v3", effect: "read_only"}],
  budget: {maxCostMicrousd: 5_000_000, maxModelCalls: 4, maxDurationMs: 600_000, expiresAt: "2026-09-24T12:00:00.000Z"},
  inputs: {fingerprint: "a".repeat(64), sources: [{contentHash: "b".repeat(64)}]},
  requestedAt: "2026-09-24T11:00:00.000Z",
});

describe("governed evaluation contract", () => {
  it("accepts the contract the database accepts", () => {
    expect(governedEvaluationContractSchema.parse(contract())).toEqual(contract());
    expect(governedEvaluationToolId("openai", "gpt-5.6-sol")).toBe("provider:openai:gpt-5.6-sol");
  });

  it.each<[string, (value: Record<string, unknown>) => void]>([
    ["an extra field", (value) => { value.workId = "e5a10000-0000-4000-9000-000000000002"; }],
    ["another purpose", (value) => { value.purpose = "case_analysis"; }],
    ["another audience", (value) => { (value.audience as Record<string, unknown>).kind = "work_participants"; }],
    ["an audience without its script", (value) => { delete (value.audience as Record<string, unknown>).scriptId; }],
    ["a blank case", (value) => { (value.audience as Record<string, unknown>).caseId = "   "; }],
    ["no tools", (value) => { value.tools = []; }],
    ["a tool that is not a provider route", (value) => { value.tools = [{id: "external_search", version: "1", effect: "read_only"}]; }],
    ["a tool with a write effect", (value) => { value.tools = [{id: "provider:openai:gpt-5.6-sol", version: "1", effect: "propose_state"}]; }],
    ["a tool declared twice", (value) => { value.tools = [...(value.tools as unknown[]), ...(value.tools as unknown[])]; }],
    ["fractional microdollars", (value) => { (value.budget as Record<string, unknown>).maxCostMicrousd = 1.5; }],
    ["zero model calls", (value) => { (value.budget as Record<string, unknown>).maxModelCalls = 0; }],
    ["less than one second", (value) => { (value.budget as Record<string, unknown>).maxDurationMs = 999; }],
    ["a budget that expires before the request", (value) => { (value.budget as Record<string, unknown>).expiresAt = "2026-09-24T10:00:00.000Z"; }],
    ["an uppercase identity", (value) => { value.executionId = "E5A10000-0000-4000-C000-000000000001"; }],
    ["a source given as a URL", (value) => { value.inputs = {fingerprint: "a".repeat(64), sources: [{contentHash: "https://example.invalid/source.pdf"}]}; }],
    ["a source carrying text", (value) => { value.inputs = {fingerprint: "a".repeat(64), sources: [{contentHash: "b".repeat(64), text: "Synthetic"}]}; }],
    ["a source declared twice", (value) => { value.inputs = {fingerprint: "a".repeat(64), sources: [{contentHash: "b".repeat(64)}, {contentHash: "b".repeat(64)}]}; }],
  ])("refuses %s", (_label, change) => {
    const value = structuredClone(contract()) as unknown as Record<string, unknown>;
    change(value);
    expect(governedEvaluationContractSchema.safeParse(value).success).toBe(false);
  });

  it("publishes only the reason of a partial evaluation, in canonical form", () => {
    expect(executionCanonicalText(governedEvaluationPartialResult("transport_denied"))).toBe('{"reason":"transport_denied","status":"partial"}');
  });
});
