"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {methodPageSchema, methodCommandSchema, type MethodActionResult} from "@/lib/advisor/method-publication";
import type {Json} from "@/types/database";

export async function loadMethodPage(locale: string, offset = 0) {
  const p = z.object({locale: z.enum(["pt-BR", "en-US"]), offset: z.number().int().min(0).max(100000)}).parse({locale, offset});
  const {supabase, userId, organization} = await requireWorkspace(p.locale);
  const {data, error} = await supabase.rpc("list_method_releases_v1", {p_offset: p.offset});
  if (error) throw new Error("method_publication_unavailable");
  return {...methodPageSchema.parse(data), viewerId: userId, organizationId: organization.id};
}
export async function changeMethod(input: unknown): Promise<MethodActionResult> {
  const parsed = methodCommandSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const p = parsed.data; const {supabase} = await requireWorkspace(p.locale);
  const response = await (async () => {
    switch (p.action) {
      case "submit": return supabase.rpc("submit_method_candidate_v1", {p_id: p.id, p_title: p.title, p_base_release_id: p.baseReleaseId, p_overrides: p.overrides as Json, p_unit_id: p.unitId!, p_work_type: p.workType});
      case "review": return supabase.rpc("review_method_candidate_v1", {p_release_id: p.id, p_review_id: p.reviewId, p_manifest_fingerprint: p.fingerprint, p_evidence_fingerprint: p.evidenceFingerprint, p_review_text: p.reason});
      case "publish": return supabase.rpc("publish_method_release_v1", {p_release_id: p.id, p_review_id: p.reviewId, p_manifest_fingerprint: p.fingerprint});
      case "retire": return supabase.rpc("retire_method_release_v1", {p_release_id: p.id, p_reason: p.reason});
      case "bind": return supabase.rpc("bind_method_release_v1", {p_binding_id: p.bindingId, p_release_id: p.id, p_expected_binding_id: p.expectedBindingId!, p_unit_id: p.unitId!, p_work_type: p.workType!, p_work_id: p.workId!});
      case "policy": return supabase.rpc("set_method_publication_policy_v1", {p_separate_reviewer: p.separateReviewer});
    }
  })();
  if (response.error) return {ok: false, error: response.error.code === "42501" ? "denied" : response.error.code === "40001" ? "stale" : "invalid"};
  revalidatePath(`/${p.locale}/app/settings/method`); return {ok: true};
}
