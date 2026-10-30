import {z} from "zod";
import {receivablesDaysBetween} from "@offroad/financial-core";
import {documentFolderInventoryInputSchema, documentFolderInventoryOutputSchema, organizeDocumentFolder} from "./document-folder-inventory";

export const originatorKitRoles = ["financial_statements", "interim_statements", "monthly_revenue", "sales_abc", "receivables_tape", "debtor_registry", "assignment_evidence", "collections_and_losses", "bank_lines", "scr", "credit_policy", "cash_projection", "articles_and_amendments", "powers", "ownership_chain", "screening_reports"] as const;
const key = z.string().trim().min(1).max(160), date = z.iso.date(), role = z.enum(originatorKitRoles);
export const originatorKitFactsSchema = z.strictObject({
  inventory: documentFolderInventoryInputSchema,
  /** The person confirms the role and selected version; names do not select a document. */
  assignments: z.array(z.strictObject({fileId: key, role, selected: z.boolean()})).max(1000),
  policy: z.strictObject({source: z.string().trim().min(1).max(2000), origin: z.enum(["house", "document"]), effectiveFrom: date, effectiveUntil: date.nullable(),
    requirements: z.array(z.strictObject({role, maxAgeDays: z.number().int().min(0).max(3650).nullable(), dateBasis: z.enum(["document_reference", "reporting_period_end"]), required: z.boolean()})).min(1).max(16)}).nullable(),
});
export const originatorKitResultSchema = z.strictObject({
  schemaVersion: z.literal("originator-kit-review.v1"), executorVersion: z.literal("2026.10.30-v1"), asOf: date,
  inventory: documentFolderInventoryOutputSchema,
  readiness: z.array(z.strictObject({role, fileIds: z.array(key), status: z.enum(["available", "not_required", "missing", "selection_conflict", "unread_or_conflicted", "superseded", "outdated", "date_unconfirmed", "future_dated", "subject_mismatch"]), date: date.nullable(), ageDays: z.number().int().nullable(), maxAgeDays: z.number().int().nullable()})),
  gaps: z.array(z.strictObject({operand: key, reason: key})), policySource: z.string().min(1).max(2000).nullable(),
  status: z.enum(["pending_evidence", "ready_for_analysis"]), documentsValidated: z.literal(false), committeeDecision: z.literal("not_requested"),
});

/** Reuses the published folder engine. The additional gate answers whether the selected kit satisfies
 * the institution's documented freshness rules; it never claims that receiving a file validates it. */
export function reviewOriginatorKit(raw: unknown) {
  const f = originatorKitFactsSchema.parse(raw), inv = organizeDocumentFolder(f.inventory), gaps: Array<{operand: string; reason: string}> = [];
  const files = new Map(f.inventory.files.map(d => [d.fileId, d])), rows = new Map(inv.rows.map(r => [r.fileId, r]));
  const assignmentIds = f.assignments.map(a => `${a.role}:${a.fileId}`);
  if (new Set(assignmentIds).size !== assignmentIds.length || f.assignments.some(a => !files.has(a.fileId))) throw new Error("originator_kit_assignment_identity_conflict");
  if (f.policy === null) gaps.push({operand: "policy", reason: "kit_requirements_policy_missing"});
  if (f.policy && (f.policy.effectiveFrom > inv.asOf || (f.policy.effectiveUntil !== null && f.policy.effectiveUntil < inv.asOf))) gaps.push({operand: "policy", reason: "kit_requirements_policy_not_in_force"});
  const roles = f.policy?.requirements.map(r => r.role) ?? [];
  if (new Set(roles).size !== roles.length) throw new Error("originator_kit_requirement_duplicate");
  const readiness = (f.policy?.requirements ?? []).map(requirement => {
    const candidates = f.assignments.filter(a => a.role === requirement.role && a.selected), fileIds = candidates.map(c => c.fileId);
    let status: z.infer<typeof originatorKitResultSchema>["readiness"][number]["status"] = "available", reference: string | null = null, ageDays: number | null = null;
    if (!candidates.length) status = requirement.required ? "missing" : "not_required";
    else if (candidates.length > 1) status = "selection_conflict";
    else {
      const row = rows.get(candidates[0]!.fileId)!, file = files.get(row.fileId)!;
      reference = requirement.dateBasis === "reporting_period_end" ? file.period.end : file.referenceDate && ["stated", "stated_month"].includes(file.referenceDate.origin) ? file.referenceDate.date : null;
      if (row.situation.read !== "complete") status = "unread_or_conflicted";
      else if (!["ownership_chain", "credit_policy", "screening_reports", "debtor_registry"].includes(requirement.role) && file.entity.primaryId !== f.inventory.subjectEntityId) status = "subject_mismatch";
      else if (row.situation.supersededBy !== null) status = "superseded";
      else if (row.status === "outdated") status = "outdated";
      else if (reference === null) status = "date_unconfirmed";
      else if (reference > inv.asOf) status = "future_dated";
      else {
        ageDays = receivablesDaysBetween(reference as Parameters<typeof receivablesDaysBetween>[0], inv.asOf as Parameters<typeof receivablesDaysBetween>[1]);
        if (requirement.maxAgeDays !== null && ageDays > requirement.maxAgeDays) status = "outdated";
      }
    }
    if (!["available", "not_required"].includes(status)) gaps.push({operand: requirement.role, reason: "kit_" + status});
    return {role: requirement.role, fileIds, status, date: reference, ageDays, maxAgeDays: requirement.maxAgeDays};
  });
  // The selected-role checklist cannot hide a conflicting reading elsewhere in the same folder.
  for (const conflict of inv.readingConflicts) for (const id of conflict.fileIds) gaps.push({operand: id, reason: "kit_same_bytes_read_inconsistently"});
  return originatorKitResultSchema.parse({schemaVersion: "originator-kit-review.v1", executorVersion: "2026.10.30-v1", asOf: inv.asOf, inventory: inv, readiness, gaps, policySource: f.policy?.source ?? null,
    status: gaps.length ? "pending_evidence" : "ready_for_analysis", documentsValidated: false, committeeDecision: "not_requested"});
}
