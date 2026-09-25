import {workMilestoneKindSchema} from "@offroad/work-plan";
import {z} from "zod";

/**
 * The shape `work_update_view_v1` returns (schema `work-update-view.v1`). Identifiers are checked
 * as any 8-4-4-4-12 hexadecimal id: the database derives some of them (the milestone a command
 * records, the synthetic execution ids of tests), so they carry no RFC version.
 */
export const recordIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const json = z.record(z.string(), z.unknown());

export const workMilestoneRowSchema = z.object({
  milestoneId: recordIdSchema,
  sequence: z.number().int().positive(),
  kind: workMilestoneKindSchema,
  subjectKind: z.string().min(1),
  subjectId: recordIdSchema,
  label: z.string().min(1),
  revision: z.number().int().positive().nullable(),
  outcome: z.enum(["succeeded", "partial", "approved", "rejected"]).nullable(),
  references: z.array(recordIdSchema),
  createdBy: recordIdSchema.nullable(),
  occurredAt: z.string(),
});
export type WorkMilestoneRow = z.infer<typeof workMilestoneRowSchema>;

export const continuationBaseRowSchema = z.object({
  milestoneId: recordIdSchema,
  decisionId: recordIdSchema,
  revision: z.number().int().positive(),
  label: z.string().min(1),
  kind: z.enum(["decision", "update_adopted"]),
});

export const workUpdateStatusSchema = z.enum(["open", "awaiting_authorization", "scheduled", "ready", "adopted", "declined", "superseded"]);
export type WorkUpdateStatus = z.infer<typeof workUpdateStatusSchema>;
export const holdKindSchema = z.enum(["derived_source_not_rederived", "basis_behind_source", "source_not_bindable", "method_not_executable", "graph_incomplete"]);
export type WorkUpdateHoldKind = z.infer<typeof holdKindSchema>;
export const candidateStateSchema = z.enum(["awaiting_authorization", "scheduled", "settled", "declined", "failed"]);

/** A method as the view names it: its catalogue id and, when the execution pinned a house release,
 * the title that release was published under. Neither the id nor the label is ever shown. */
export const methodRefSchema = z.object({methodId: z.string().min(1).nullable(), houseTitle: z.string().nullable()});
export type MethodRef = z.infer<typeof methodRefSchema>;
/** A premise as the basis records it: the metric (a dotted field path, never shown) and the
 * definition the person adopted. */
export const premiseRefSchema = z.object({fieldPath: z.string().min(1), definition: z.string().nullable()});
export type PremiseRef = z.infer<typeof premiseRefSchema>;

const changeSchema = z.object({
  eventId: recordIdSchema,
  dependencyKind: z.enum(["source_version", "assumption_slot", "method_release"]).nullable(),
  logicalKey: z.string().min(1),
  reasonClass: z.enum(["data_change", "method_update", "graph_incomplete"]),
  gap: z.enum(["no_recorded_edges", "head_unknown", "head_behind_pin"]).nullable(),
  pinned: json.nullable(),
  head: json.nullable(),
  viaSourceVersionIds: z.array(recordIdSchema),
  createdAt: z.string(),
  name: z.string().nullable(),
  premise: premiseRefSchema.nullable().default(null),
  method: methodRefSchema.nullable().default(null),
});
export type WorkUpdateChangeRow = z.infer<typeof changeSchema>;

const holdSchema = z.object({kind: holdKindSchema, signal: z.string(), subject: json, createdAt: z.string(), releasedAt: z.string().nullable()});

const updateSchema = z.object({
  requestId: recordIdSchema,
  status: workUpdateStatusSchema,
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  supersededByRequestId: recordIdSchema.nullable(),
  declineReason: z.string().nullable(),
  proposalMilestoneId: recordIdSchema.nullable(),
  decision: z.object({
    milestoneId: recordIdSchema,
    kind: z.enum(["update_adopted", "decision"]),
    outcome: z.enum(["approved", "rejected"]).nullable(),
    revision: z.number().int().positive().nullable(),
    createdBy: recordIdSchema.nullable(),
    occurredAt: z.string(),
  }).nullable(),
  events: z.array(z.object({eventId: recordIdSchema, aggregateKind: z.string(), aggregateId: z.string(), aggregateVersion: z.number()})),
  affected: z.array(z.object({
    executionId: recordIdSchema,
    rootExecutionId: recordIdSchema,
    label: z.string().nullable(),
    method: methodRefSchema.nullable().default(null),
    resultMilestoneId: recordIdSchema.nullable(),
    candidateId: recordIdSchema.nullable(),
    changes: z.array(changeSchema),
    holds: z.array(holdSchema),
  })),
  candidates: z.array(z.object({
    candidateId: recordIdSchema,
    state: candidateStateSchema,
    reason: z.string().nullable(),
    action: z.enum(["recompute", "await_authorization"]),
    revision: z.number().int().positive(),
    maxCostMicrousd: z.number().int().nonnegative(),
    maxModelCalls: z.number().int().nonnegative(),
    baseExecutionId: recordIdSchema,
    baseLabel: z.string().nullable(),
    baseMethod: methodRefSchema.nullable().default(null),
    executionIds: z.array(recordIdSchema),
    executionId: recordIdSchema.nullable(),
    resultMilestoneId: recordIdSchema.nullable(),
    waitMilestoneId: recordIdSchema.nullable(),
    waitOpen: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  unaffected: z.array(z.object({executionId: recordIdSchema, label: z.string().nullable(), method: methodRefSchema.nullable().default(null), resultMilestoneId: recordIdSchema.nullable()})),
});
export type WorkUpdateRow = z.infer<typeof updateSchema>;

export const workUpdateViewSchema = z.object({
  schemaVersion: z.literal("work-update-view.v1"),
  workId: recordIdSchema,
  conversationId: recordIdSchema.nullable(),
  milestones: z.array(workMilestoneRowSchema),
  bases: z.array(continuationBaseRowSchema),
  updates: z.array(updateSchema),
  followups: z.array(z.object({
    requestId: recordIdSchema,
    status: workUpdateStatusSchema,
    createdAt: z.string(),
    createdBy: recordIdSchema.nullable(),
    request: z.string(),
    baseMilestoneId: recordIdSchema,
    baseDecisionId: recordIdSchema,
    baseRevision: z.number().int().positive(),
    milestoneId: recordIdSchema.nullable(),
  })),
});
export type WorkUpdateView = z.infer<typeof workUpdateViewSchema>;

/**
 * Labels the database writes as stable keys, which the interface translates. Any other label is
 * the source's own text (a purpose, an objective, the person's follow-up) and is shown as it is.
 */
export const milestoneLabelKeys = [
  "dependency_update",
  "dependency_update_adopted",
  "dependency_update_declined",
  "dependency_recompute_authorization",
  "dependency_recompute_declined",
  "user_followup",
  "execution_brief",
  "institutional_model_configuration",
  "capital_project_artifact",
  "company_debt_diagnostic",
  "alternative_map",
  "meeting_brief",
] as const;
export type MilestoneLabelKey = (typeof milestoneLabelKeys)[number];
const labelKeys: ReadonlySet<string> = new Set(milestoneLabelKeys);

/** The label a person reads: a known key translated, another key spelled out, any text as it is. */
export function milestoneLabelText(raw: string, translate: (key: MilestoneLabelKey) => string): string {
  if (labelKeys.has(raw)) return translate(raw as MilestoneLabelKey);
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(raw)) return raw.replaceAll("_", " ");
  return raw;
}
