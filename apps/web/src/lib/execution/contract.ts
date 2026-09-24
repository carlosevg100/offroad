import {createHash} from "node:crypto";
import {z} from "zod";
import {executionCanonicalText, executionContractSchema, executionEffectSchema, executionMethodSchema, type ExecutionContract} from "@offroad/agent-contracts";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({id: z.uuid(), assumptionVersionId: z.uuid(), fingerprint: hash}).strict();
/** The company block of the v2 basis, computed by the server from persisted rows only: the entity
 * most pins are about, whether it is registered for this work and whether research was recorded. */
export const executionBasisCompanySchema = z.object({
  entityId: z.uuid().nullable(),
  registration: z.enum(["registered", "missing"]),
  research: z.enum(["recorded", "abstained", "missing"]),
  researchAsOf: z.string().nullable(),
}).strict();
export type ExecutionBasisCompany = z.infer<typeof executionBasisCompanySchema>;
/** What the server assembles from persisted rows for one work, one basis version and one method. */
export const executionContractBasisSchema = z.object({
  schemaVersion: z.literal("execution-contract-basis.v2"),
  organizationId: z.uuid(), workId: z.uuid(), principalId: z.uuid(),
  authorityRevision: z.string().regex(/^[1-9][0-9]*$/), policyFingerprint: hash,
  purpose: z.string().trim().min(1).max(8000), contextKey: z.string().min(1).max(160), versionId: z.uuid(),
  envelope: z.object({canonical: z.string().min(2), fingerprint: hash}).strict(),
  adoptions: z.array(reference).max(10000), hypotheses: z.array(reference).max(10000),
  sources: z.array(z.object({resourceId: z.uuid(), sourceVersionId: z.uuid(), contentHash: hash, rightsRevision: z.string().regex(/^[0-9]+$/)}).strict()).max(10000),
  unverifiedSources: z.array(z.object({sourceVersionId: z.uuid(), reason: z.enum(["rights_missing", "bytes_unverified", "binding_missing"])}).strict()),
  profile: z.object({
    id: z.uuid(), platformReleaseId: z.string().min(1).max(200), method: executionMethodSchema,
    tools: z.array(z.object({id: z.string().min(1).max(200), version: z.string().min(1).max(200), effect: executionEffectSchema}).strict()).max(1000),
    allowedEffects: z.array(executionEffectSchema).min(1).max(3),
    limits: z.object({maxCostMicrousd: z.number().int().nonnegative(), maxModelCalls: z.number().int().nonnegative(), maxDurationMs: z.number().int().positive()}).strict(),
    fingerprint: hash,
  }).strict(),
  company: executionBasisCompanySchema,
}).strict();
export type ExecutionContractBasis = z.infer<typeof executionContractBasisSchema>;
export type ExecutionRequestIds = {executionId: string; requestId: string; processingRunId: string; snapshotId: string};

/** The server refuses a budget that has already expired or one that expires after the request; one hour covers a queued job. */
export const executionBudgetWindowMs = 60 * 60 * 1000;
export const snapshotFingerprint = (snapshotText: string) => createHash("sha256").update(snapshotText, "utf8").digest("hex");

/** Builds the contract the producer submits: identity, authority and pins come from the basis
 * the server assembled, the method bytes are copied from the released profile untouched, and the
 * snapshot is pinned by the digest of the exact text sent beside the contract. The basis carries no
 * material to recompute the profile fingerprint, so this only checks the profile is complete. */
export function composeExecutionContract(basis: ExecutionContractBasis, snapshotText: string, ids: ExecutionRequestIds, now: Date = new Date()): ExecutionContract {
  const {profile} = basis;
  if (!profile.method?.methodId || !Array.isArray(profile.tools) || !profile.allowedEffects.length) throw new Error("execution_basis_profile_incomplete");
  return executionContractSchema.parse({
    schemaVersion: "execution-contract.v1",
    executionId: ids.executionId, organizationId: basis.organizationId, workId: basis.workId, principalId: basis.principalId,
    requestId: ids.requestId, processingRunId: ids.processingRunId,
    purpose: basis.purpose,
    audience: {kind: "work_participants", workId: basis.workId, policyFingerprint: basis.policyFingerprint},
    method: profile.method, tools: profile.tools, allowedEffects: profile.allowedEffects,
    inputs: {snapshotId: ids.snapshotId, fingerprint: snapshotFingerprint(snapshotText), sources: basis.sources, adoptions: basis.adoptions, hypotheses: basis.hypotheses},
    policy: {version: "execution-authority.v1", fingerprint: basis.policyFingerprint, authorityRevision: basis.authorityRevision},
    budget: {maxCostMicrousd: 0, maxModelCalls: 0, maxDurationMs: profile.limits.maxDurationMs, expiresAt: new Date(now.getTime() + executionBudgetWindowMs).toISOString()},
    requestedAt: now.toISOString(),
  });
}

/** The exact bytes the database stores and fingerprints; the same helper serializes the snapshot. */
export const executionContractText = (contract: ExecutionContract) => executionCanonicalText(contract);

/** The basis versions a contract pins, read the way the v2 producer reads them: the distinct
 * `assumptionVersionId` over adoptions and hypotheses. Gates are evaluated over one basis
 * version, so the producer accepts a contract only when this is exactly one version. */
export function contractBasisVersions(contract: ExecutionContract): string[] {
  return [...new Set([...contract.inputs.adoptions, ...contract.inputs.hypotheses].map(pin => pin.assumptionVersionId))];
}
