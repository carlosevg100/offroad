import {redirect} from "next/navigation";

import {createClient} from "@/lib/supabase/server";

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

export async function requireWorkspace(locale: string) {
  const user = await requireUser(locale);
  const {data: membership} = await user.supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", user.userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect(`/${locale}/onboarding`);

  const {data: organization} = await user.supabase
    .from("organizations")
    .select("id, name, organization_type, verification_status")
    .eq("id", membership.organization_id)
    .single();

  if (!organization) redirect(`/${locale}/onboarding`);
  return {...user, membership, organization};
}
