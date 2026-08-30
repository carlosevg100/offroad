import {cache} from "react";
import {redirect} from "next/navigation";

import {createClient} from "@/lib/supabase/server";
import type {Json} from "@/types/database";

type WorkspaceBootstrap = {
  user_id: string;
  email: string;
  workspace_ready: boolean;
  membership: {
    organization_id: string;
    role: string;
  };
  organization: {
    id: string;
    name: string;
    legal_name: string | null;
    website: string | null;
    description: string | null;
    organization_type: string;
    verification_status: string;
  };
  onboarding: {
    journey: string;
    current_step: string;
    answers: Json;
    completed_at: string | null;
  } | null;
};

export async function requireUser(locale: string) {
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);

  const {data, error} = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect(`/${locale}/login`);

  return {
    supabase,
    userId,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
  };
}

export const requireWorkspace = cache(async (locale: string) => {
  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/login?error=provider`);

  // One authorization-aware RPC replaces four sequential network round trips.
  // It intentionally contains no project, document or processing data.
  const {data, error} = await supabase.rpc("get_workspace_bootstrap");
  if (error || !data) {
    // Rolling deployment compatibility: application code may reach Vercel a few minutes
    // before the database migration. This path preserves access during that window and
    // disappears automatically as soon as the compact RPC exists.
    if (error?.code === "PGRST202" || error?.code === "42883") {
      const {data: claimsData, error: claimsError} = await supabase.auth.getClaims();
      const userId = claimsData?.claims?.sub;
      if (claimsError || !userId) redirect(`/${locale}/login`);

      const {data: membership} = await supabase.from("organization_memberships")
        .select("organization_id, role")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!membership) redirect(`/${locale}/onboarding`);

      const [{data: organization}, {data: onboarding}] = await Promise.all([
        supabase.from("organizations")
          .select("id, name, legal_name, website, description, organization_type, verification_status")
          .eq("id", membership.organization_id)
          .single(),
        supabase.from("onboarding_progress")
          .select("journey, current_step, answers, completed_at")
          .eq("organization_id", membership.organization_id)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (!organization || !onboarding) redirect(`/${locale}/onboarding`);

      const answers = onboarding.answers && typeof onboarding.answers === "object" && !Array.isArray(onboarding.answers)
        ? onboarding.answers as Record<string, Json | undefined>
        : {};
      const intakeSessionId = typeof answers.intake_session_id === "string" ? answers.intake_session_id : "";
      const {data: activeSession} = !onboarding.completed_at && intakeSessionId
        ? await supabase.from("document_intake_sessions")
            .select("id")
            .eq("organization_id", organization.id)
            .eq("started_by", userId)
            .eq("id", intakeSessionId)
            .neq("status", "cancelled")
            .maybeSingle()
        : {data: null};
      if (!onboarding.completed_at && !activeSession) redirect(`/${locale}/onboarding`);

      return {
        supabase,
        userId,
        email: typeof claimsData.claims.email === "string" ? claimsData.claims.email : "",
        membership,
        organization,
        onboarding,
      };
    }
    if (error?.code === "42501") redirect(`/${locale}/login`);
    redirect(`/${locale}/onboarding`);
  }

  const bootstrap = data as unknown as WorkspaceBootstrap;
  if (!bootstrap.workspace_ready || !bootstrap.onboarding) redirect(`/${locale}/onboarding`);

  return {
    supabase,
    userId: bootstrap.user_id,
    email: bootstrap.email,
    membership: bootstrap.membership,
    organization: bootstrap.organization,
    onboarding: bootstrap.onboarding,
  };
});
