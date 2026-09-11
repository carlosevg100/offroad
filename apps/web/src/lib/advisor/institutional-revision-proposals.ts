import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

/** Imported workbooks waiting for, or already carrying, a review decision. */

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const changeSchema = z.object({
  assumptionId: z.string().min(1),
  label: z.object({pt: z.string(), en: z.string()}).optional(),
  unit: z.string().optional(),
  period: z.string().min(1),
  approved: decimal,
  proposed: decimal,
  difference: decimal.optional(),
});
const proposalSchema = z.object({
  id: z.uuid(),
  status: z.enum(["proposed", "approved", "rejected"]),
  origin: z.literal("imported_workbook"),
  canonicalRevisionId: z.uuid(),
  configurationId: z.uuid(),
  configurationFingerprint: hash,
  artifactFingerprint: hash,
  structureFingerprint: hash,
  uploadFingerprint: hash,
  changes: z.array(changeSchema).min(1),
  candidateConfigurationId: z.uuid().nullable(),
  preparedBy: z.uuid(),
  reviewedBy: z.uuid().nullable(),
  reviewedAt: z.iso.datetime({offset: true}).nullable(),
  createdAt: z.iso.datetime({offset: true}),
  callerCanReview: z.boolean(),
});
const listSchema = z.object({projectId: z.uuid(), proposals: z.array(proposalSchema).max(24)});

export type InstitutionalRevisionProposalChange = z.infer<typeof changeSchema>;
export type InstitutionalRevisionProposal = z.infer<typeof proposalSchema>;

export function parseInstitutionalRevisionProposals(value: unknown, projectId: string): InstitutionalRevisionProposal[] {
  const parsed = listSchema.safeParse(value);
  return parsed.success && parsed.data.projectId === projectId ? parsed.data.proposals : [];
}

export async function loadInstitutionalRevisionProposals(client: SupabaseClient<Database>, projectId: string) {
  const {data, error} = await client.rpc("read_institutional_revision_proposals_v1", {p_project_id: projectId});
  return error ? [] : parseInstitutionalRevisionProposals(data, projectId);
}
