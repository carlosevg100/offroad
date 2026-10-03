import {z} from "zod";
import type {MaterialPackageReviewRpcPort} from "./material-package-review";
const uuid = z.uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/);
const planSchema = z.object({schemaVersion: z.literal("capital-material-production-plan.v1"), workId: uuid,
  planId: uuid, planFingerprint: hash});
const approvalSchema = z.strictObject({schemaVersion: z.literal("capital-material-plan-approval.v1"),
  workId: uuid, precursorId: uuid, proposedPlanId: uuid, approvedPlanId: uuid, approvedPlanFingerprint: hash,
  jobId: uuid, runId: uuid, replayed: z.boolean()});
/** One database transaction owns plan approval and its held follow-up job. */
export async function approveNativeMaterialProductionPlan(client: MaterialPackageReviewRpcPort, input: {
  workId: string; planId: string; planFingerprint: string; commandId: string;
}) {
  const c = z.strictObject({workId: uuid, planId: uuid, planFingerprint: hash, commandId: uuid}).parse(input);
  const read = await client.rpc("read_material_production_plan_v1", {p_work_id: c.workId, p_plan_id: c.planId});
  if (read.error) throw new Error("material_plan_current_basis_denied");
  const basis = planSchema.parse(read.data);
  if (basis.workId !== c.workId || basis.planId !== c.planId || basis.planFingerprint !== c.planFingerprint)
    throw new Error("material_plan_current_basis_changed");
  const write = await client.rpc("approve_material_production_plan_v1", {p_work_id: c.workId,
    p_plan_id: c.planId, p_plan_fingerprint: c.planFingerprint, p_command_id: c.commandId});
  if (write.error) throw new Error("material_plan_atomic_approval_denied");
  const receipt = approvalSchema.parse(write.data);
  if (receipt.workId !== c.workId || receipt.proposedPlanId !== c.planId) throw new Error("material_plan_receipt_identity_mismatch");
  return receipt;
}
