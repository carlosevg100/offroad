import {z} from "zod";

const uuid = z.uuid();
export const vaultPurpose = z.enum(["analysis", "retrieval", "export"]);
export const vaultKind = z.enum(["directive", "source", "adoption", "template"]);
export const vaultIdentity = z.object({locale: z.enum(["pt-BR", "en-US"])});
export const vaultVersionInput = vaultIdentity.extend({entryId: uuid, versionId: uuid, expectedVersionId: uuid.nullable(),
  kind: vaultKind, title: z.string().trim().min(1).max(180), text: z.string().max(32000).nullable(), referenceId: uuid.nullable(), sourceVersionIds: z.array(uuid).max(1000)}).superRefine((v,c) => {
  if (v.kind === "directive" ? !v.text?.trim() || v.referenceId !== null : v.referenceId === null || v.text !== null)
    c.addIssue({code: "custom", message: "invalid_reference"});
});
export const vaultProposalInput = vaultIdentity.extend({requestId: uuid, versionId: uuid, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedPublicationId: uuid.nullable(), workScopeId: uuid.nullable(), purpose: vaultPurpose, reason: z.string().trim().min(5).max(2000)});
export const vaultRow = z.object({entry_id: uuid, kind: vaultKind, version_id: uuid, revision: z.number().int(), title: z.string(), directive_text: z.string().nullable(),
  source_version_id: uuid.nullable(), assumption_version_id: uuid.nullable(), presentation_template_id: uuid.nullable(),
  content_fingerprint: z.string(), reference_fingerprint: z.string().nullable(), dependency_manifest: z.array(z.object({source: uuid, rights: uuid})),
  provenance: z.record(z.string(), z.unknown()), created_by: uuid.nullable(), created_at: z.string(), author_name: z.string().nullable(),
  publication_id: uuid.nullable(), published_at: z.string().nullable(), published_by: uuid.nullable(), publisher_name: z.string().nullable(), is_official: z.boolean(),
  request_id: uuid.nullable(), review_fingerprint: z.string().nullable(), work_scope_id: uuid.nullable(), purpose: vaultPurpose.nullable(), reason: z.string().nullable(), can_edit: z.boolean(), can_publish: z.boolean()});
export const vaultPage = z.object({scopeId: uuid, viewerId: uuid, canAdminister: z.boolean(), rows: z.array(vaultRow), offset: z.number().int()});
export const vaultPeople = z.object({rows: z.array(z.object({user_id: uuid, name: z.string(), can_read: z.boolean(), can_publish: z.boolean()})), offset: z.number().int()});
export type VaultRow = z.infer<typeof vaultRow>;
export type VaultPage = z.infer<typeof vaultPage>;
export type VaultState = {ok: true} | {ok: false; error: "invalid" | "denied" | "stale" | "save"};
export function vaultFailure(error: {code?: string}): VaultState {
  return {ok: false, error: error.code === "42501" ? "denied" : error.code === "40001" ? "stale" : error.code === "22023" ? "invalid" : "save"};
}
