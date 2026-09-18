"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {workContributionInput, workPeopleResult, contributionPromotionResult, type ContributionCommandState, type ContributionPage} from "@/lib/advisor/work-contributions";

const identity = z.object({locale: z.enum(["pt-BR", "en-US"]), workId: z.uuid()});
const pageInput = identity.extend({offset: z.number().int().min(0).max(100000)});
function failure(error: {code?: string; message?: string}): ContributionCommandState {
  return {ok: false, error: error.code === "42501" ? "denied" : error.code === "40001" ? "stale" : error.code === "22023" ? "invalid" : "save"};
}
export async function submitWorkContribution(input: unknown): Promise<ContributionCommandState> {
  const parsed = workContributionInput.safeParse(input); if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const {error} = await supabase.rpc("submit_work_contribution_v1", {p_work_id: p.workId, p_contribution_id: p.contributionId, p_revision_id: p.revisionId,
    p_expected_revision_id: p.expectedRevisionId!, p_base_revision_id: p.baseRevisionId!, p_content: p.content, p_source_version_ids: p.sourceVersionIds});
  if (error) return failure(error);
  revalidatePath(`/${p.locale}/app/projects/${p.workId}`); return {ok: true};
}
export async function promoteWorkContribution(input: unknown): Promise<ContributionCommandState> {
  const parsed = identity.extend({revisionId: z.uuid(), promotionId: z.uuid(), expectedSharedRevisionId: z.uuid().nullable()}).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase, organization} = await requireWorkspace(p.locale);
  // Bind the caller's route to the revision as well as the command's database authority.
  const {data: revision, error: readError} = await supabase.from("contribution_revisions").select("work_id").eq("organization_id", organization.id).eq("id", p.revisionId).eq("work_id", p.workId).maybeSingle();
  if (readError || !revision) return {ok: false, error: "denied"};
  const {data, error} = await supabase.rpc("promote_contribution_to_work_v1", {p_revision_id: p.revisionId, p_promotion_id: p.promotionId, p_expected_shared_revision_id: p.expectedSharedRevisionId!});
  if (error) return failure(error);
  const result = contributionPromotionResult.safeParse(data); if (!result.success) return {ok: false, error: "save"};
  if (result.data.status === "conflict") return {ok: false, conflict: result.data};
  revalidatePath(`/${p.locale}/app/projects/${p.workId}`); return {ok: true};
}
export async function changeWorkParticipant(input: unknown): Promise<ContributionCommandState> {
  const parsed = identity.extend({userId: z.uuid(), access: z.enum(["read", "work", "manage", "remove"])}).safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const {error} = p.access === "remove" ? await supabase.rpc("revoke_resource_access_v1", {p_resource_id: p.workId, p_subject_user_id: p.userId})
    : await supabase.rpc("add_work_participant_v1", {p_work_id: p.workId, p_user_id: p.userId, p_action: p.access});
  if (error) return failure(error);
  revalidatePath(`/${p.locale}/app/projects/${p.workId}`); return {ok: true};
}
export async function loadWorkPeople(input: unknown) {
  const p = pageInput.extend({search: z.string().max(160)}).parse(input); const {supabase} = await requireWorkspace(p.locale);
  const {data, error} = await supabase.rpc("list_work_people_v1", {p_work_id: p.workId, p_search: p.search, p_offset: p.offset});
  if (error) throw new Error("work_people_unavailable");
  return workPeopleResult.parse(data);
}
export async function loadWorkContributions(input: unknown): Promise<ContributionPage> {
  const p = pageInput.extend({audience: z.enum(["personal", "shared"])}).parse(input); const {supabase, organization} = await requireWorkspace(p.locale);
  const {data: channels, error: channelError} = await supabase.from("work_channels").select("id").eq("organization_id", organization.id).eq("work_id", p.workId).eq("kind", p.audience);
  if (channelError) throw new Error("work_contributions_unavailable");
  if (!channels?.length) return {rows: [], more: false};
  const {data: heads, error: headError} = await supabase.from("work_contributions").select("head_revision_id").eq("organization_id", organization.id).eq("work_id", p.workId)
    .in("channel_id", channels.map(c => c.id)).order("created_at", {ascending: false}).order("id", {ascending: false}).range(p.offset, p.offset + 25);
  if (headError) throw new Error("work_contributions_unavailable");
  const ids = heads?.slice(0, 25).flatMap(h => h.head_revision_id ? [h.head_revision_id] : []) ?? [];
  if (!ids.length) return {rows: [], more: false};
  const {data, error} = await supabase.from("contribution_revisions").select("id, contribution_id, author_user_id, content, revision, base_revision_id, created_at")
    .eq("organization_id", organization.id).eq("work_id", p.workId).in("id", ids);
  if (error) throw new Error("work_contributions_unavailable");
  return {rows: ids.flatMap(id => data?.filter(r => r.id === id) ?? []), more: (heads?.length ?? 0) > 25};
}
export async function loadContributionHistory(input: unknown): Promise<ContributionPage> {
  const p = pageInput.extend({contributionId: z.uuid()}).parse(input); const {supabase, organization} = await requireWorkspace(p.locale);
  const {data, error} = await supabase.from("contribution_revisions").select("id, contribution_id, author_user_id, content, revision, base_revision_id, created_at")
    .eq("organization_id", organization.id).eq("work_id", p.workId).eq("contribution_id", p.contributionId).order("revision", {ascending: false}).range(p.offset, p.offset + 25);
  if (error) throw new Error("work_contribution_history_unavailable");
  return {rows: data?.slice(0, 25) ?? [], more: (data?.length ?? 0) > 25};
}
export async function loadContributionSources(input: unknown) {
  const p = pageInput.extend({search: z.string().max(160)}).parse(input); const {supabase, organization} = await requireWorkspace(p.locale);
  const {error: accessError} = await supabase.rpc("list_work_people_v1", {p_work_id: p.workId, p_offset: 0});
  if (accessError) throw new Error("work_contribution_sources_unavailable");
  let query = supabase.from("source_versions").select("id, original_name, version_no").eq("organization_id", organization.id);
  if (p.search) query = query.ilike("original_name", `%${p.search.replace(/[%_]/g, "\\$&")}%`);
  const {data, error} = await query.order("original_name").order("id").range(p.offset, p.offset + 25);
  if (error) throw new Error("work_contribution_sources_unavailable");
  return {rows: data?.slice(0, 25) ?? [], more: (data?.length ?? 0) > 25};
}
