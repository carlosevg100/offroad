import {pinExecutionInput, pinExecutionContract, executionMethodSchema, type ExecutionContract, type ExecutionEffect, type ExecutionMethod, type Frozen} from "@offroad/agent-contracts";
import {z} from "zod";
import {fingerprintJson} from "@offroad/case-understanding";

const claimSchema = z.object({
  jobId: z.uuid(), leaseId: z.uuid(), executionId: z.uuid(), organizationId: z.uuid(), workId: z.uuid(),
  principalId: z.uuid(), processingRunId: z.uuid(), contractFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ExecutionClaimIdentity = z.infer<typeof claimSchema>;
const authoritySchema = claimSchema.extend({allowed: z.boolean(), leaseExpiresAt: z.iso.datetime({offset: true})}).strict();
export type CurrentExecutionAuthority = {
  allowed: boolean; jobId: string; executionId: string; organizationId: string; workId: string;
  principalId: string; processingRunId: string; contractFingerprint: string;
  /** Current SQL authority, not the historical revision kept in the manifest. */
  leaseId: string; leaseExpiresAt: string;
};
export type ExecutionOperation = {toolId: string; toolVersion: string; effect: ExecutionEffect};
export type ExecutionUsage = {costMicrousd: number; modelCalls: number};

/** Bind only after the capability-scoped loader has supplied the claim and immutable snapshot.
 * New queue consumers will use this boundary; it does not open an existing legacy path. */
export function bindPinnedExecution(input: {claim: ExecutionClaimIdentity; contract: unknown; snapshot: unknown; availableMethod: ExecutionMethod}) {
  const parsedClaim = claimSchema.parse(input.claim);
  const contract = pinExecutionContract(input.contract, input.claim.contractFingerprint);
  for (const key of ["executionId", "organizationId", "workId", "principalId", "processingRunId"] as const) {
    if (contract[key] !== input.claim[key]) throw new Error("execution_claim_scope_mismatch");
  }
  const snapshot = pinExecutionInput(input.snapshot, contract.inputs.fingerprint);
  if (fingerprintJson(executionMethodSchema.parse(input.availableMethod)) !== fingerprintJson(contract.method)) throw new Error("execution_method_unavailable");
  const claim = Object.freeze(parsedClaim);
  return Object.freeze({contract, claim, snapshot});
}
export type BoundExecution = ReturnType<typeof bindPinnedExecution>;

/** Must be called with a fresh capability-scoped database response at each boundary. The SQL
 * commit still owns the atomic revocation/lease check; a TypeScript receipt cannot replace it. */
export function assertCurrentExecutionAuthority(bound: BoundExecution, value: unknown, now: Date): void {
  const parsed = authoritySchema.safeParse(value);
  if (!parsed.success) throw new Error("execution_authority_denied");
  const current = parsed.data;
  if (!current.allowed || !current.leaseId || !Number.isFinite(now.getTime()) || !Number.isFinite(Date.parse(current.leaseExpiresAt))
    || Date.parse(current.leaseExpiresAt) <= now.getTime()) throw new Error("execution_authority_denied");
  for (const key of ["jobId", "leaseId", "executionId", "organizationId", "workId", "principalId", "processingRunId", "contractFingerprint"] as const) {
    if (current[key] !== bound.claim[key]) throw new Error("execution_authority_scope_mismatch");
  }
}
export function assertExecutionOperation(contract: Frozen<ExecutionContract>, operation: ExecutionOperation): void {
  const tool = contract.tools.find(item => item.id === operation.toolId && item.version === operation.toolVersion);
  if (!tool || tool.effect !== operation.effect || !contract.allowedEffects.includes(operation.effect)) throw new Error("execution_operation_denied");
}
export function executionBudgetState(contract: Frozen<ExecutionContract>, usage: ExecutionUsage, reservation: ExecutionUsage, now: Date): "available" | "partial_budget_exhausted" {
  const usageSchema = z.object({costMicrousd: z.number().int().nonnegative().safe(), modelCalls: z.number().int().nonnegative().safe()}).strict();
  if (!usageSchema.safeParse(usage).success || !usageSchema.safeParse(reservation).success) throw new Error("execution_usage_invalid");
  if (!Number.isFinite(now.getTime())) throw new Error("execution_clock_invalid");
  return now.getTime() >= Date.parse(contract.budget.expiresAt)
    || usage.costMicrousd > contract.budget.maxCostMicrousd - reservation.costMicrousd
    || usage.modelCalls > contract.budget.maxModelCalls - reservation.modelCalls
    ? "partial_budget_exhausted" : "available";
}
