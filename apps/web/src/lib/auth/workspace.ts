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
    // Fail closed when the authorization-aware bootstrap is unavailable. Choosing the first
    // active membership is not a safe workspace-selection policy for multi-organization users.
    // Database migrations must land before application code during production rollouts.
    if (error?.code === "PGRST202" || error?.code === "42883") redirect(`/${locale}/login?error=provider`);
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
