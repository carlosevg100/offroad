import {z} from "zod";
import {artifactAudienceSchema, freezeArtifactValue, type DeepReadonly, type RevisionChangeReport} from "./artifact-protocol";

/** Pure stage-20 contracts. Persistent authorization and locks remain the database's responsibility. */
const uuid = z.uuid();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(2000);
const reviewNote = z.string().trim().min(1).max(5000);
export const reviewActSchema = z.enum(["comment", "return", "approve", "reaffirm", "revoke_approval", "reassign"]);
export const reviewRoleSchema = z.enum(["preparer", "reviewer", "approver"]);
export const reviewRegimeSchema = z.strictObject({assignmentRequired: z.boolean(), selfApprovalAllowed: z.boolean()});
export type ReviewRegime = z.infer<typeof reviewRegimeSchema>;
export type ReviewAct = z.infer<typeof reviewActSchema>;
export type ReviewRole = z.infer<typeof reviewRoleSchema>;
export const exactReviewTargetSchema = z.strictObject({
  organizationId: uuid, workId: uuid, artifactId: uuid, revisionId: uuid,
  manifestFingerprint: fingerprint, audience: artifactAudienceSchema,
});
export type ExactReviewTarget = z.infer<typeof exactReviewTargetSchema>;
export const reviewChangeReportSchema = z.strictObject({
  outcome: z.enum(["identical", "cosmetic", "material"]),
  reasons: z.array(z.enum(["claim_set", "claim_value", "source_versions", "method_release", "execution",
    "institutional_result", "audience", "block_content", "claim_support", "manifest_context", "unverified_bytes", "invalid_snapshot"])),
}).refine((r) => (r.outcome === "material") === (r.reasons.length > 0), {message: "review_change_report_inconsistent"});
export const artifactReviewSchema = z.strictObject({
  id: uuid, target: exactReviewTargetSchema, act: reviewActSchema, reviewerId: uuid, preparedBy: uuid.nullable(),
  selfApprovalDeclared: z.boolean(), reviewMode: z.enum(["individual", "assigned", "open", "legacy"]),
  policySnapshot: reviewRegimeSchema.extend({roles: z.array(reviewRoleSchema),
    reassignment: z.strictObject({fromUserId: uuid, toUserId: uuid}).optional()}).nullable(),
  block: z.strictObject({id: uuid, key: text}).nullable(), basisReviewId: uuid.nullable(),
  changeReport: reviewChangeReportSchema.nullable(), commandId: uuid, note: reviewNote.nullable(), createdAt: z.iso.datetime({offset: true}),
}).superRefine((r, ctx) => {
  const reject = (message: string) => ctx.addIssue({code: "custom", message});
  if (r.reviewMode !== "legacy" && r.policySnapshot === null) reject("review_policy_snapshot_required");
  if ((r.act === "reaffirm" || r.act === "revoke_approval") && r.basisReviewId === null) reject("review_basis_required");
  if (r.act === "reaffirm" && r.changeReport?.outcome !== "cosmetic") reject("artifact_review_material_change");
  if (r.block !== null && r.act !== "comment" && r.act !== "return") reject("review_block_act_invalid");
  if (r.basisReviewId === r.id) reject("review_basis_self");
});
export type ArtifactReview = DeepReadonly<z.infer<typeof artifactReviewSchema>>;

export {approvalCoversRevision} from "./review-coverage";

export function requiredActForChange(report: RevisionChangeReport): "approve" | "reaffirm" | "replay" {
  const parsed = reviewChangeReportSchema.parse(report);
  return parsed.outcome === "material" ? "approve" : parsed.outcome === "cosmetic" ? "reaffirm" : "replay";
}

export type ReviewAuthorization = {
  readonly act: ReviewAct; readonly regime: ReviewRegime; readonly roles: readonly ReviewRole[];
  readonly preparedBy: string | null; readonly reviewerId: string; readonly selfApprovalDeclared: boolean;
  readonly workAccess: boolean; readonly sourceAccess: boolean; readonly hasSubstance: boolean;
  readonly manageAccess: boolean;
};
export function reviewActionAllowed(input: ReviewAuthorization): {readonly allowed: true} | {readonly allowed: false; readonly reason: string} {
  const deny = (reason: string) => ({allowed: false as const, reason});
  if (!input.workAccess) return deny("review_work_access_required");
  if (input.act === "reassign") return input.manageAccess ? {allowed: true} : deny("review_manage_access_required");
  if (!input.sourceAccess) return deny("review_source_access_required");
  const approving = input.act === "approve" || input.act === "reaffirm";
  if (input.regime.assignmentRequired && input.act !== "comment") {
    const roleAllowed = approving || input.act === "revoke_approval" ? input.roles.includes("approver")
      : input.roles.includes("reviewer") || input.roles.includes("approver");
    if (!roleAllowed) return deny("review_assignment_required");
  }
  if (approving) {
    if (!input.hasSubstance) return deny("review_substance_required");
    if (input.preparedBy === input.reviewerId && (!input.regime.selfApprovalAllowed || !input.selfApprovalDeclared)) {
      return deny("capital_project_self_approval_forbidden");
    }
  }
  return {allowed: true};
}

export const workDecisionKindSchema = z.enum(["authorize_execution", "approve_material_package", "approve_configuration",
  "adopt_update", "adopt_import", "choose_alternative", "confirm_assessment", "record_report"]);
export const workDecisionEffectSchema = z.enum(["queue_execution", "recompute", "freeze_assessment", "none"]);
export const workDecisionReferenceSchema = z.strictObject({decisionId: uuid, revision: z.number().int().positive(), fingerprint});
export const workDecisionBasisSchema = z.strictObject({
  artifacts: z.array(z.strictObject({artifactRevisionId: uuid, manifestFingerprint: fingerprint})).max(100),
  milestones: z.array(z.strictObject({milestoneId: uuid})).max(100),
  assessments: z.array(z.strictObject({decisionKey: text, revision: z.number().int().positive(), decisionFingerprint: fingerprint})).max(100),
  decisions: z.array(workDecisionReferenceSchema).max(100),
  execution: z.strictObject({briefFingerprint: fingerprint, payloadFingerprint: fingerprint, inputFingerprint: fingerprint}).nullable(),
  configuration: z.strictObject({configurationFingerprint: fingerprint, structureFingerprint: fingerprint.nullable(), uploadFingerprint: fingerprint.nullable()})
    .refine((value) => (value.structureFingerprint === null) === (value.uploadFingerprint === null), {message: "configuration_import_basis_incomplete"}).nullable(),
});
export const decisionReportSchema = z.strictObject({decidedBy: text, forum: text, decidedOn: z.iso.date(), evidenceSourceVersionId: uuid.nullable()});
export const workDecisionSchema = z.strictObject({
  id: uuid, organizationId: uuid, workId: uuid, decisionKey: text, revision: z.number().int().positive(), fingerprint,
  kind: workDecisionKindSchema, outcome: z.enum(["approved", "rejected", "recorded"]).default("approved"), basis: workDecisionBasisSchema, effects: z.array(workDecisionEffectSchema).min(1).max(3),
  origin: z.enum(["in_product", "reported"]), report: decisionReportSchema.nullable(), note: reviewNote.nullable().default(null), decidedBy: uuid,
  expectedPreviousRevision: z.number().int().positive().nullable(), supersedesDecisionId: uuid.nullable(),
  contested: z.boolean(), commandId: uuid, createdAt: z.iso.datetime({offset: true}),
}).superRefine((d, ctx) => {
  const reject = (message: string) => ctx.addIssue({code: "custom", message});
  if (new Set(d.effects).size !== d.effects.length || (d.effects.includes("none") && d.effects.length !== 1)) reject("decision_effects_invalid");
  if (d.outcome === "rejected" && !(d.effects.length === 1 && (d.effects[0] === "none"
    || (d.kind === "confirm_assessment" && d.effects[0] === "freeze_assessment")))) reject("rejected_decision_has_operational_effect");
  if (d.origin === "reported" && (d.report === null || d.effects.length !== 1 || d.effects[0] !== "none")) reject("reported_decision_has_effect");
  if ((d.origin === "reported") !== (d.outcome === "recorded")) reject("decision_outcome_origin_mismatch");
  if (d.origin === "in_product" && d.report !== null) reject("decision_report_origin_mismatch");
  if (d.kind === "record_report" && d.origin !== "reported") reject("decision_report_required");
  if (d.expectedPreviousRevision !== null && d.expectedPreviousRevision >= d.revision) reject("decision_previous_revision_invalid");
  if (d.supersedesDecisionId === d.id || (d.contested && d.supersedesDecisionId !== null)) reject("decision_supersession_invalid");
  if (new Set(d.basis.decisions.map((ref) => ref.decisionId)).size !== d.basis.decisions.length) reject("decision_basis_duplicate");
});
export type WorkDecision = DeepReadonly<z.infer<typeof workDecisionSchema>>;

/** Validate reported effects rather than silently turning a requested execution into a harmless record. */
export function reportedDecisionEffects(effects: readonly string[]): readonly ["none"] {
  if (effects.length !== 1 || effects[0] !== "none") throw new Error("reported_decision_has_effect");
  return Object.freeze(["none"] as const);
}

export type DecisionPrecedence = {readonly state: "empty" | "current" | "contested"; readonly current: WorkDecision | null;
  readonly preceding: WorkDecision | null; readonly unresolved: readonly WorkDecision[]};
/** Full immutable history for one key. Caller scopes rows through authorized reads; mixed histories are rejected. */
export function decisionPrecedence(input: readonly WorkDecision[]): DecisionPrecedence {
  const rows = [...input].sort((a, b) => a.revision - b.revision);
  if (rows.length === 0) return freezeArtifactValue({state: "empty", current: null, preceding: null, unresolved: []});
  const scope = rows[0]!;
  const seen = new Map<string, WorkDecision>();
  const commands = new Set<string>();
  let current: WorkDecision | null = null;
  let preceding: WorkDecision | null = null;
  let tips: WorkDecision[] = [];
  for (const [index, row] of rows.entries()) {
    workDecisionSchema.parse(row);
    if (row.organizationId !== scope.organizationId || row.workId !== scope.workId || row.decisionKey !== scope.decisionKey
      || row.revision !== index + 1 || seen.has(row.id) || commands.has(row.commandId) || (index === 0 && row.contested)) throw new Error("decision_history_invalid");
    for (const ref of row.basis.decisions) {
      const target = seen.get(ref.decisionId);
      if (!target || target.revision !== ref.revision || target.fingerprint !== ref.fingerprint) throw new Error("decision_basis_invalid");
    }
    if (row.expectedPreviousRevision !== null && row.expectedPreviousRevision > index) throw new Error("decision_history_invalid");
    if (row.supersedesDecisionId !== null && row.supersedesDecisionId !== current?.id) throw new Error("decision_supersession_invalid");
    const references = new Set(row.basis.decisions.map((ref) => ref.decisionId));
    const resolves = tips.length > 1 && tips.every((tip) => references.has(tip.id));
    const follows = row.expectedPreviousRevision === (index === 0 ? null : index);
    if (!row.contested && follows && (tips.length < 2 || resolves)) {
      preceding = current ?? preceding; current = row; tips = [row];
    } else {
      preceding = current ?? preceding; current = null; tips.push(row);
    }
    seen.set(row.id, row); commands.add(row.commandId);
  }
  return freezeArtifactValue({state: current ? "current" : "contested", current, preceding, unresolved: current ? [] : tips});
}
