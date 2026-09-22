import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {executionContractFingerprint, executionContractSchema, executionInputFingerprint, pinExecutionContract, pinExecutionInput} from "./execution-contract";
const fixture = () => JSON.parse(readFileSync(new URL("../test-fixtures/execution-contract.json", import.meta.url), "utf8"));
const candidate = () => {const {contract, snapshot} = fixture(); contract.inputs.fingerprint = executionInputFingerprint(snapshot); return contract;};

describe("pinned execution contract", () => {
  it("requires the immutable assumption version for every adopted decision", () => {
    const value = candidate();
    delete value.inputs.adoptions[0].assumptionVersionId;
    expect(executionContractSchema.safeParse(value).success).toBe(false);
  });
  it("detects a decision moved to a different immutable assumption version", () => {
    const value = candidate(), fingerprint = executionContractFingerprint(value);
    value.inputs.adoptions[0].assumptionVersionId = "30000000-0000-4000-8000-000000000002";
    expect(() => pinExecutionContract(value, fingerprint)).toThrow("execution_contract_fingerprint_mismatch");
  });
  it("pins a private work without manufacturing a company or intake", () => {
    const value = candidate(); const pin = pinExecutionContract(value, executionContractFingerprint(value));
    expect(pin.workId).toBe(value.workId); expect(pin).not.toHaveProperty("companyId"); expect(pin).not.toHaveProperty("intakeSessionId");
  });
  it("makes property ordering irrelevant without dropping array order", () => {
    expect(executionInputFingerprint({b: 1, a: [1, 2]})).toBe(executionInputFingerprint({a: [1, 2], b: 1}));
    expect(executionInputFingerprint([1, 2])).not.toBe(executionInputFingerprint([2, 1]));
  });
  it("copies and deeply freezes the contract and retained input payload", () => {
    const value = candidate(), {snapshot} = fixture(); const pin = pinExecutionContract(value, executionContractFingerprint(value));
    const input = pinExecutionInput(snapshot, pin.inputs.fingerprint);
    value.method.executor.version = "2"; snapshot.decision.purpose = "changed";
    expect(pin.method.executor.version).toBe("1"); expect(input).toEqual(fixture().snapshot);
    expect(Object.isFrozen(pin.method.executor)).toBe(true); expect(Object.isFrozen(input)).toBe(true);
  });
  it.each(["principalId", "workId", "requestId", "processingRunId"])("detects changed %s against the original pin", key => {
    const value = candidate(), fingerprint = executionContractFingerprint(value); value[key] = "20000000-0000-4000-8000-000000000001";
    expect(() => pinExecutionContract(value, fingerprint)).toThrow();
  });
  it.each(["sources", "adoptions", "hypotheses"])("pins %s independently", key => {
    const value = candidate(), fingerprint = executionContractFingerprint(value);
    if (key === "hypotheses") value.inputs.hypotheses.push({id: "20000000-0000-4000-8000-000000000001", assumptionVersionId: "20000000-0000-4000-8000-000000000002", fingerprint: "b".repeat(64)});
    else value.inputs[key] = [];
    expect(() => pinExecutionContract(value, fingerprint)).toThrow("execution_contract_fingerprint_mismatch");
  });
  it.each([undefined, NaN, Infinity, new Date(), {missing: undefined}])("rejects non-JSON input %s", input => expect(() => executionInputFingerprint(input)).toThrow());
  it.each(['{"__proto__":{"financialValue":123}}', '{"nested":{"__proto__":{"financialValue":123}}}', '[{"__proto__":{"financialValue":123}}]'])("rejects a silently lossy snapshot: %s", text => {
    const input = JSON.parse(text);
    expect(() => executionInputFingerprint(input)).toThrow("execution_snapshot_reserved_key");
    expect(() => pinExecutionInput(input, executionInputFingerprint({}))).toThrow("execution_snapshot_reserved_key");
  });
  it("refuses circular or excessive-depth inputs without retaining a partial snapshot", () => {
    const input: {child?: unknown} = {}; input.child = input;
    expect(() => executionInputFingerprint(input)).toThrow("execution_snapshot_depth_exceeded");
  });
  it("rejects cross-work audience, external effects and undeclared tool effects", () => {
    const value = candidate();
    expect(executionContractSchema.safeParse({...value, audience: {...value.audience, workId: value.principalId}}).success).toBe(false);
    expect(executionContractSchema.safeParse({...value, allowedEffects: ["external"]}).success).toBe(false);
    expect(executionContractSchema.safeParse({...value, allowedEffects: ["read_only"]}).success).toBe(false);
  });
  it("rejects duplicated identities and publication flags posing as authority", () => {
    const value = candidate();
    expect(executionContractSchema.safeParse({...value, tools: [...value.tools, ...value.tools]}).success).toBe(false);
    expect(executionContractSchema.safeParse({...value, published: true}).success).toBe(false);
    expect(executionContractSchema.safeParse({...value, inputs: {...value.inputs, sources: [...value.inputs.sources, ...value.inputs.sources]}}).success).toBe(false);
  });
  it("rejects expired-on-request budgets and unsafe or fractional accounting", () => {
    const value = candidate();
    for (const change of [{expiresAt: value.requestedAt}, {maxCostMicrousd: 0.5}, {maxCostMicrousd: Number.MAX_SAFE_INTEGER + 1}, {maxModelCalls: -1}]) {
      expect(executionContractSchema.safeParse({...value, budget: {...value.budget, ...change}}).success).toBe(false);
    }
  });
});
