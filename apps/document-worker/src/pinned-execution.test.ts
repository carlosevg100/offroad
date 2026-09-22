import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {executionContractFingerprint, executionInputFingerprint, deriveExecutionProfile} from "@offroad/agent-contracts";
import {assertCurrentExecutionAuthority, assertExecutionOperation, bindPinnedExecution, bindProfiledExecution, executionBudgetState, type CurrentExecutionAuthority} from "./pinned-execution";
function fixture() {
  const {contract, snapshot} = JSON.parse(readFileSync(new URL("../../../packages/agent-contracts/test-fixtures/execution-contract.json", import.meta.url), "utf8"));
  contract.inputs.fingerprint = executionInputFingerprint(snapshot);
  const claim = {leaseId: "20000000-0000-4000-8000-000000000002", jobId: "20000000-0000-4000-8000-000000000001", executionId: contract.executionId, organizationId: contract.organizationId, workId: contract.workId, principalId: contract.principalId, processingRunId: contract.processingRunId, contractFingerprint: executionContractFingerprint(contract)};
  const current: CurrentExecutionAuthority = {...claim, allowed: true, leaseId: "20000000-0000-4000-8000-000000000002", leaseExpiresAt: "2026-09-21T18:10:00Z"};
  return {contract, snapshot, claim, availableMethod: contract.method, current};
}
const now = new Date("2026-09-21T18:05:00Z");
describe("worker pinned execution boundary", () => {
  it("binds an exact snapshot and available historical executor", () => {
    const input = fixture(), bound = bindPinnedExecution(input);
    expect(bound.snapshot).toEqual(input.snapshot); expect(() => assertCurrentExecutionAuthority(bound, input.current, now)).not.toThrow();
  });
  it.each(["organizationId", "workId", "principalId", "processingRunId", "executionId"] as const)("rejects a claim for another %s", key => {
    const input = fixture(); input.claim[key] = "30000000-0000-4000-8000-000000000001";
    expect(() => bindPinnedExecution(input)).toThrow("execution_claim_scope_mismatch");
  });
  it("refuses substituted snapshot bytes and an unavailable executor without a latest-version fallback", () => {
    const input = fixture();
    expect(() => bindPinnedExecution({...input, snapshot: {}})).toThrow("execution_snapshot_mismatch");
    expect(() => bindPinnedExecution({...input, availableMethod: {...input.availableMethod, methodVersion: "2"}})).toThrow("execution_method_unavailable");
  });
  it("refuses missing, malformed, revoked or expired live authority", () => {
    const input = fixture(), bound = bindPinnedExecution(input);
    for (const current of [null, {...input.current, allowed: "true"}, {...input.current, allowed: false}, {...input.current, leaseExpiresAt: now.toISOString()}]) {
      expect(() => assertCurrentExecutionAuthority(bound, current, now)).toThrow("execution_authority_denied");
    }
  });
  it("refuses replaying another job or a modified contract receipt", () => {
    const input = fixture(), bound = bindPinnedExecution(input);
    for (const change of [{jobId: input.current.leaseId}, {leaseId: input.claim.jobId}, {contractFingerprint: "b".repeat(64)}]) {
      expect(() => assertCurrentExecutionAuthority(bound, {...input.current, ...change}, now)).toThrow("execution_authority_scope_mismatch");
    }
  });
  it("denies undeclared tool, version and effect", () => {
    const bound = bindPinnedExecution(fixture());
    expect(() => assertExecutionOperation(bound.contract, {toolId: "calculate", toolVersion: "1", effect: "compile_artifact"})).not.toThrow();
    for (const operation of [{toolId: "send", toolVersion: "1", effect: "compile_artifact" as const}, {toolId: "calculate", toolVersion: "2", effect: "compile_artifact" as const}, {toolId: "calculate", toolVersion: "1", effect: "propose_state" as const}]) {
      expect(() => assertExecutionOperation(bound.contract, operation)).toThrow("execution_operation_denied");
    }
  });
  it("accounts for the next reservation before starting work and makes exhaustion partial", () => {
    const {contract} = bindPinnedExecution(fixture()), none = {costMicrousd: 0, modelCalls: 0};
    expect(executionBudgetState(contract, none, {costMicrousd: 250000, modelCalls: 1}, now, 0)).toBe("available");
    expect(executionBudgetState(contract, {costMicrousd: 1, modelCalls: 0}, {costMicrousd: 250000, modelCalls: 1}, now, 0)).toBe("partial_budget_exhausted");
    expect(executionBudgetState(contract, none, {costMicrousd: 0, modelCalls: 2}, now, 0)).toBe("partial_budget_exhausted");
    expect(executionBudgetState(contract, none, none, new Date(contract.budget.expiresAt), 0)).toBe("partial_budget_exhausted");
  });
  it("refuses invalid usage or clocks instead of silently resetting the budget", () => {
    const {contract} = bindPinnedExecution(fixture()), none = {costMicrousd: 0, modelCalls: 0};
    expect(() => executionBudgetState(contract, {...none, costMicrousd: NaN}, none, now, 0)).toThrow("execution_usage_invalid");
    expect(() => executionBudgetState(contract, none, {...none, modelCalls: -1}, now, 0)).toThrow("execution_usage_invalid");
    expect(() => executionBudgetState(contract, none, none, new Date(NaN), 0)).toThrow("execution_clock_invalid");
  });
  it("enforces cumulative duration at the exact limit independently of the wall deadline", () => {
    const {contract} = bindPinnedExecution(fixture()), none = {costMicrousd: 0, modelCalls: 0};
    expect(executionBudgetState(contract, none, none, now, contract.budget.maxDurationMs - 1)).toBe("available");
    expect(executionBudgetState(contract, none, none, now, contract.budget.maxDurationMs)).toBe("partial_budget_exhausted");
    for (const duration of [NaN, -1, 0.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => executionBudgetState(contract, none, none, now, duration)).toThrow("execution_duration_invalid");
    }
  });
  it("binds the published profile while independently requiring an installed matching executor", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../packages/credit-playbook/knowledge/reviews/runs/capital-structure-decision-2026-09-21-v4-publication/manifest.json", import.meta.url), "utf8"));
    const profile = deriveExecutionProfile(manifest, {id: "prepare-capital-structure-decision-2026.09.21-v4", manifestHash: "2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478"});
    const input = fixture();
    input.contract.method = profile.method; input.contract.tools = []; input.contract.allowedEffects = ["read_only"];
    Object.assign(input.contract.budget, profile.limits);
    input.claim.contractFingerprint = executionContractFingerprint(input.contract);
    // Presence of the published profile cannot make a different local executor available.
    expect(() => bindProfiledExecution({...input, profile})).toThrow("execution_method_unavailable");
    expect(bindProfiledExecution({...input, profile, availableMethod: profile.method}).contract.method).toEqual(profile.method);
    input.contract.budget.maxCostMicrousd = 1;
    input.claim.contractFingerprint = executionContractFingerprint(input.contract);
    expect(() => bindProfiledExecution({...input, profile, availableMethod: profile.method})).toThrow("execution_profile_budget_exceeded");
  });
});
