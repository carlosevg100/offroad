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
  prepared_by: z.uuid().nullable().optional(),
  reviewed_by: z.uuid().nullable().optional(),
  review_decision: z.enum(["approved", "returned"]).nullable().optional(),
  approved_brief_version: z.number().int().positive().nullable().optional(),
  review_mode: z.enum(["open", "assigned"]).optional(),
  caller_can_approve: z.boolean().optional(),
  caller_can_return: z.boolean().optional(),
}).refine((value) => !value.reason || ({
  proposed: ["approval_required"], approved: ["approved"], superseded: ["context_changed"],
  unavailable: ["awaiting_preliminary_confirmation", "required_information_missing", "plan_generation_pending", "dispatch_unavailable"],
}[value.status]).includes(value.reason));

export type ExecutionBriefApprovalRecord = {
  preparedBy: string | null;
  reviewedBy: string | null;
  decision: "approved" | "returned" | null;
  approvedVersion: number | null;
};

export type ExecutionBriefApprovalProjection = {
  status: "awaiting" | "approved" | "superseded" | "unavailable";
  fingerprint: string;
  version: number;
  reason?: ExecutionBriefApprovalReason;
  record?: ExecutionBriefApprovalRecord;
  reviewMode?: "open" | "assigned";
  callerCanApprove?: boolean;
};

/** A failed/mismatched read is never permission to start work. The RPC remains authoritative
 * at dispatch time; this projection only controls the explanation and affordance in the card. */
export function projectExecutionBriefApproval(raw: unknown, expected: {id: string; fingerprint: string; version: number}): ExecutionBriefApprovalProjection {
  const unavailable = {status: "unavailable" as const, fingerprint: expected.fingerprint, version: expected.version};
  const parsed = approvalSchema.safeParse(raw);
  if (!parsed.success || parsed.data.execution_brief_id !== expected.id
    || parsed.data.brief_fingerprint !== expected.fingerprint) return unavailable;
  const value = parsed.data;
  if (["proposed", "approved"].includes(value.status) && !value.processing_job_id) return unavailable;
  if (value.status === "approved" && !value.accepted_at) return unavailable;
  const record: ExecutionBriefApprovalRecord | undefined = value.prepared_by !== undefined || value.reviewed_by !== undefined
    ? {
      preparedBy: value.prepared_by ?? null,
      reviewedBy: value.reviewed_by ?? null,
      decision: value.review_decision ?? null,
      approvedVersion: value.approved_brief_version ?? null,
    }
    : undefined;
  return {
    status: value.status === "proposed" ? "awaiting" as const : value.status,
    fingerprint: expected.fingerprint,
    version: expected.version,
    ...(value.reason ? {reason: value.reason} : {}),
    ...(record ? {record} : {}),
    ...(value.review_mode ? {reviewMode: value.review_mode} : {}),
    ...(value.caller_can_approve !== undefined ? {callerCanApprove: value.caller_can_approve} : {}),
  };
}
