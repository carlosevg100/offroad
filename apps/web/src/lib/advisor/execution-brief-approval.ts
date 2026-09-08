import {z} from "zod";

const reasonSchema = z.enum(["awaiting_preliminary_confirmation", "required_information_missing", "plan_generation_pending", "dispatch_unavailable", "context_changed", "approval_required", "approved"]);
export type ExecutionBriefApprovalReason = z.infer<typeof reasonSchema>;

const approvalSchema = z.object({
  status: z.enum(["proposed", "approved", "superseded", "unavailable"]),
  execution_brief_id: z.uuid(),
  brief_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  processing_job_id: z.uuid().nullable(),
  accepted_at: z.iso.datetime({offset: true}).nullable(),
  reason: reasonSchema.optional(),
}).refine((value) => !value.reason || ({
  proposed: ["approval_required"], approved: ["approved"], superseded: ["context_changed"],
  unavailable: ["awaiting_preliminary_confirmation", "required_information_missing", "plan_generation_pending", "dispatch_unavailable"],
}[value.status]).includes(value.reason));

/** A failed/mismatched read is never permission to start work. The RPC remains authoritative
 * at dispatch time; this projection only controls the explanation and affordance in the card. */
export function projectExecutionBriefApproval(raw: unknown, expected: {id: string; fingerprint: string; version: number}) {
  const unavailable = {status: "unavailable" as const, fingerprint: expected.fingerprint, version: expected.version};
  const parsed = approvalSchema.safeParse(raw);
  if (!parsed.success || parsed.data.execution_brief_id !== expected.id
    || parsed.data.brief_fingerprint !== expected.fingerprint) return unavailable;
  const value = parsed.data;
  if (["proposed", "approved"].includes(value.status) && !value.processing_job_id) return unavailable;
  if (value.status === "approved" && !value.accepted_at) return unavailable;
  return {
    status: value.status === "proposed" ? "awaiting" as const : value.status,
    fingerprint: expected.fingerprint,
    version: expected.version,
    ...(value.reason ? {reason: value.reason} : {}),
  };
}
