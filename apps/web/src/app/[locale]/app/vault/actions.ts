"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {presentationTemplateFromStored} from "@offroad/case-export/presentation-template";
import {requireWorkspace} from "@/lib/auth/workspace";
import {vaultFailure, vaultIdentity, vaultPage, vaultPeople, vaultProposalInput, vaultPurpose, vaultVersionInput, type VaultState} from "@/lib/advisor/vault";

export async function saveVaultVersion(input: unknown): Promise<VaultState> {
  const parsed = vaultVersionInput.safeParse(input); if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const {error} = await supabase.rpc("submit_vault_entry_version_v1", {p_entry_id: p.entryId, p_version_id: p.versionId, p_expected_version_id: p.expectedVersionId!, p_kind: p.kind,
    p_title: p.title, p_directive_text: p.text!, p_reference_id: p.referenceId!, p_source_version_ids: p.sourceVersionIds});
  if (error) return vaultFailure(error); revalidatePath(`/${p.locale}/app/vault`); return {ok: true};
}
export async function proposeVaultPublication(input: unknown): Promise<VaultState> {
  const parsed = vaultProposalInput.safeParse(input); if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const {error} = await supabase.rpc("propose_vault_publication_v1", {p_request_id: p.requestId, p_version_id: p.versionId, p_version_fingerprint: p.fingerprint,
    p_expected_publication_id: p.expectedPublicationId!, p_work_scope_id: p.workScopeId!, p_purpose: p.purpose, p_reason: p.reason});
  if (error) return vaultFailure(error); revalidatePath(`/${p.locale}/app/vault`); return {ok: true};
}
export async function publishVaultVersion(input: unknown): Promise<VaultState> {
  const parsed = vaultIdentity.extend({requestId: z.uuid(), publicationId: z.uuid(), reviewedFingerprint: z.string().regex(/^[a-f0-9]{64}$/)}).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const {error} = await supabase.rpc("publish_vault_entry_v1", {p_request_id: p.requestId, p_publication_id: p.publicationId, p_reviewed_fingerprint: p.reviewedFingerprint});
  if (error) return vaultFailure(error); revalidatePath(`/${p.locale}/app/vault`); return {ok: true};
}
export async function withdrawVaultPublication(input: unknown): Promise<VaultState> {
  const parsed = vaultIdentity.extend({publicationId: z.uuid(), reason: z.string().trim().min(5).max(2000)}).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const {error} = await supabase.rpc("withdraw_vault_publication_v1", {p_publication_id: p.publicationId, p_reason: p.reason});
  if (error) return vaultFailure(error); revalidatePath(`/${p.locale}/app/vault`); return {ok: true};
}
export async function loadVault(input: unknown) {
  const p = vaultIdentity.extend({search: z.string().max(160), offset: z.number().int().min(0).max(100000), mode: z.enum(["published", "candidates"]), purpose: vaultPurpose, workId: z.uuid().nullable()}).parse(input);
  const {supabase} = await requireWorkspace(p.locale);
  const {data, error} = p.workId ? await supabase.rpc("search_vault_for_work_v1", {p_work_id: p.workId, p_search: p.search, p_offset: p.offset, p_include_candidates: p.mode === "candidates", p_purpose: p.purpose})
    : await supabase.rpc("list_vault_entries_v1", {p_search: p.search, p_offset: p.offset, p_mode: p.mode, p_purpose: p.purpose});
  if (error) throw new Error("vault_unavailable"); return vaultPage.parse(data);
}
export async function loadVaultPeople(input: unknown) {
  const p = vaultIdentity.extend({resourceId: z.uuid(), search: z.string().max(160), offset: z.number().int().min(0).max(100000)}).parse(input);
  const {supabase} = await requireWorkspace(p.locale);
  const {data, error} = await supabase.rpc("list_vault_people_v1", {p_resource_id: p.resourceId, p_search: p.search, p_offset: p.offset});
  if (error) throw new Error("vault_people_unavailable"); return vaultPeople.parse(data);
}
export async function designateVaultAccess(input: unknown): Promise<VaultState> {
  const parsed = vaultIdentity.extend({resourceId: z.uuid(), userId: z.uuid(), action: z.enum(["read", "publish"]), effect: z.enum(["allow", "deny"])}).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const {error} = await supabase.rpc("set_resource_policy_grant_v1", {p_resource_id: p.resourceId, p_user_id: p.userId, p_group_id: null!, p_action: p.action, p_effect: p.effect});
  if (error) return vaultFailure(error); revalidatePath(`/${p.locale}/app/vault`); return {ok: true};
}
export async function loadVaultReferences(input: unknown) {
  const p = vaultIdentity.extend({kind: z.enum(["source", "adoption", "template", "work"]), search: z.string().max(160), offset: z.number().int().min(0).max(100000)}).parse(input);
  const {supabase, organization} = await requireWorkspace(p.locale);
  const escaped = `%${p.search.replace(/[%_]/g, "\\$&")}%`;
  if (p.kind === "source") {
    const {data, error} = await supabase.from("source_versions").select("id, original_name, version_no").eq("organization_id", organization.id).ilike("original_name", escaped).order("original_name").order("id").range(p.offset, p.offset + 25);
    if (error) throw new Error("vault_references_unavailable"); return {rows: data.slice(0,25).map(r => ({id: r.id, title: r.original_name, revision: r.version_no})), more: data.length > 25};
  }
  if (p.kind === "work") {
    const {data, error} = await supabase.from("capital_projects").select("id, project_name").eq("organization_id", organization.id).neq("status", "archived").ilike("project_name", escaped).order("project_name").order("id").range(p.offset, p.offset + 25);
    if (error) throw new Error("vault_references_unavailable"); return {rows: data.slice(0,25).map(r => ({id: r.id, title: r.project_name, revision: null})), more: data.length > 25};
  }
  if (p.kind === "template") {
    const {data, error} = await supabase.from("presentation_templates").select("id, template_key, template_version").eq("organization_id", organization.id).ilike("template_key", escaped).order("template_key").order("id").range(p.offset, p.offset + 25);
    if (error) throw new Error("vault_references_unavailable"); return {rows: data.slice(0,25).map(r => ({id: r.id, title: `${r.template_key} · ${r.template_version}`, revision: null})), more: data.length > 25};
  }
  const {data, error} = await supabase.from("assumption_versions").select("id, revision, assumption_sets!inner(work_reference, purpose)").eq("organization_id", organization.id).ilike("assumption_sets.work_reference", escaped).order("created_at", {ascending: false}).order("id").range(p.offset, p.offset + 25);
  if (error) throw new Error("vault_references_unavailable"); return {rows: data.slice(0,25).map(r => ({id: r.id, title: `${r.assumption_sets.work_reference} · ${r.assumption_sets.purpose}`, revision: r.revision})), more: data.length > 25};
}
export async function loadVaultHistory(input: unknown) {
  const p = vaultIdentity.extend({entryId: z.uuid(), offset: z.number().int().min(0).max(100000)}).parse(input);
  const {supabase, organization} = await requireWorkspace(p.locale);
  const {data, error} = await supabase.from("vault_entry_versions").select("id, revision, title, directive_text, content_fingerprint, created_at, created_by, provenance, dependency_manifest")
    .eq("organization_id", organization.id).eq("entry_id", p.entryId).order("revision", {ascending: false}).range(p.offset, p.offset + 25);
  if (error) throw new Error("vault_history_unavailable"); return {rows: data.slice(0,25), more: data.length > 25};
}
export async function loadVaultReceipts(input: unknown) {
  const p = vaultIdentity.extend({offset: z.number().int().min(0).max(100000)}).parse(input);
  const {supabase} = await requireWorkspace(p.locale);
  const {data, error} = await supabase.rpc("list_vault_publication_receipts_v1", {p_offset: p.offset});
  if (error) throw new Error("vault_receipts_unavailable");
  return z.object({rows: z.array(z.object({publication_id: z.uuid(), entry_id: z.uuid(), published_at: z.string(), withdrawn_at: z.string().nullable(), revision: z.number(), title: z.string().nullable(), available: z.boolean()})), offset: z.number()}).parse(data);
}
export async function loadVaultReferenceDetail(input: unknown) {
  const p = vaultIdentity.extend({versionId: z.uuid()}).parse(input);
  const {supabase, organization} = await requireWorkspace(p.locale);
  const {data: version,error} = await supabase.from("vault_entry_versions").select("source_version_id, assumption_version_id, presentation_template_id, reference_fingerprint").eq("organization_id",organization.id).eq("id",p.versionId).maybeSingle();
  if (error || !version) throw new Error("vault_reference_unavailable");
  if (version.source_version_id) {
    const {data,error} = await supabase.from("source_versions").select("original_name, version_no, declared_sha256").eq("organization_id",organization.id).eq("id",version.source_version_id).single();
    if (error) throw new Error("vault_reference_unavailable");
    return {kind:"source" as const, title:data.original_name, revision:data.version_no, body:data.declared_sha256, download:`/${p.locale}/app/documents/${version.source_version_id}`};
  }
  if (version.assumption_version_id) {
    const {data,error} = await supabase.from("assumption_versions").select("canonical_snapshot, revision, assumption_sets!inner(work_id, purpose, context_key)").eq("organization_id",organization.id).eq("id",version.assumption_version_id).single();
    if (error) throw new Error("vault_reference_unavailable");
    const set = data.assumption_sets;
    return {kind:"adoption" as const,title:set.purpose,revision:data.revision,body:null,download:set.work_id ? `/${p.locale}/app/projects/${set.work_id}/basis?context=${encodeURIComponent(set.context_key)}&version=${version.assumption_version_id}` : null};
  }
  if (version.presentation_template_id) {
    const {data,error} = await supabase.from("presentation_templates").select("template_key, template_version, fingerprint, definition").eq("organization_id",organization.id).eq("id",version.presentation_template_id).single();
    if (error || data.fingerprint !== version.reference_fingerprint) throw new Error("vault_reference_unavailable");
    const definition = presentationTemplateFromStored(data.definition);
    if (!definition) throw new Error("vault_reference_unavailable");
    return {kind:"template" as const,title:`${data.template_key} · ${data.template_version}`,revision:null,body:null,download:null,preview:{colors:definition.colors,fonts:definition.fonts,confidentiality:definition.confidentialityLabel}};
  }
  return null;
}
