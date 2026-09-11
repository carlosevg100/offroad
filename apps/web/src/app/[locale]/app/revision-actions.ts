"use server";

import {readInstitutionalWorkbookProposal, type InstitutionalWorkbookRefusalReason} from "@offroad/financial-model";
import {z} from "zod";

import {advisorActionError, type AdvisorActionError} from "@/lib/advisor/advisor-action-error";
import {loadInstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {requireWorkspace} from "@/lib/auth/workspace";

/**
 * The commands behind the revision surface: bring an edited workbook back as a proposal, decide
 * on one, and recompute what an approved change made outdated.
 *
 * The upload is verified in this process and then discarded. Only the fingerprints and the
 * assumption cells that moved are recorded, so an edited copy of a company's model never becomes
 * a second stored document nobody asked for.
 */

const localeSchema = z.enum(["pt-BR", "en-US"]);
const projectSchema = z.object({locale: localeSchema, projectId: z.uuid()});
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export type RevisionActionError = AdvisorActionError;
export type WorkbookImportResult =
  | {ok: true; proposalId: string; changes: number; replayed: boolean}
  | {ok: false; error: RevisionActionError}
  | {ok: false; error: "refused"; reason: InstitutionalWorkbookRefusalReason; sheet: string | null; cell: string | null};

/** Twelve megabytes is well above any workbook this product produces and far below a payload
 * worth accepting from a browser. */
const maximumUploadBytes = 12 * 1024 * 1024;

export async function importInstitutionalWorkbook(formData: FormData): Promise<WorkbookImportResult> {
  const parsed = projectSchema.extend({proposalId: z.uuid()}).safeParse({
    locale: formData.get("locale"), projectId: formData.get("projectId"), proposalId: formData.get("proposalId"),
  });
  const file = formData.get("workbook");
  if (!parsed.success || !(file instanceof File) || file.size === 0 || file.size > maximumUploadBytes) {
    return {ok: false, error: "invalid"};
  }
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const result = await loadInstitutionalModelResult(supabase, parsed.data.projectId);
  if (!result || result.status !== "completed" || !result.artifact) return {ok: false, error: "stale"};
  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = await readInstitutionalWorkbookProposal({bytes, artifact: result.artifact});
  if (read.status === "refused") {
    return {ok: false, error: "refused", reason: read.refusal.reason, sheet: read.refusal.sheet, cell: read.refusal.cell};
  }
  const {proposal} = read;
  const {data, error} = await supabase.rpc("submit_institutional_revision_proposal_v1", {
    p_project_id: parsed.data.projectId,
    p_proposal_id: parsed.data.proposalId,
    p_payload: {
      configurationFingerprint: proposal.configurationFingerprint,
      artifactFingerprint: proposal.artifactFingerprint,
      structureFingerprint: proposal.structureFingerprint,
      uploadFingerprint: proposal.uploadFingerprint,
      changes: proposal.changes.map(change => ({
        assumptionId: change.assumptionId, label: change.label, unit: change.unit,
        period: change.period, approved: change.approved, proposed: change.proposed, difference: change.difference,
      })),
    },
  });
  if (error) return {ok: false, error: advisorActionError(error)};
  const receipt = z.object({proposalId: z.uuid(), replayed: z.boolean()}).safeParse(data);
  if (!receipt.success) return {ok: false, error: "save"};
  return {ok: true, proposalId: receipt.data.proposalId, changes: proposal.changes.length, replayed: receipt.data.replayed};
}

export type RevisionDecisionResult = {ok: true} | {ok: false; error: RevisionActionError};

export async function reviewInstitutionalWorkbookProposal(input: unknown): Promise<RevisionDecisionResult> {
  const parsed = z.object({
    locale: localeSchema, proposalId: z.uuid(), requestId: z.uuid(),
    expectedStructureFingerprint: hashSchema, decision: z.enum(["approved", "rejected"]),
  }).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("review_institutional_revision_proposal_v1", {
    p_proposal_id: parsed.data.proposalId,
    p_decision: parsed.data.decision,
    p_expected_structure_fingerprint: parsed.data.expectedStructureFingerprint,
    p_request_id: parsed.data.requestId,
    p_locale: parsed.data.locale,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

export async function propagateProjectRevision(input: unknown): Promise<RevisionDecisionResult> {
  const parsed = projectSchema.extend({requestId: z.uuid()}).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("propagate_project_canonical_revision_v1", {
    p_project_id: parsed.data.projectId, p_request_id: parsed.data.requestId, p_locale: parsed.data.locale,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}
