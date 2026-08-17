import {z} from "zod";

import type {Database} from "@/types/database";

export const registrationJourneys = ["company", "originator", "capital_provider"] as const;
export type RegistrationJourney = (typeof registrationJourneys)[number];

export const registrationSchema = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  journey: z.enum(registrationJourneys),
  fullName: z.string().trim().min(2).max(160),
  jobTitle: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[\p{P}\p{S}]/u),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "password_mismatch",
});

type SupabaseServerClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export async function initializeRegistrationWorkspace(supabase: NonNullable<SupabaseServerClient>) {
  const {data: userData, error: userError} = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return {error: "identity" as const};

  const metadata = user.user_metadata as Record<string, unknown>;
  const parsed = z.object({
    registration_role: z.enum(registrationJourneys),
    full_name: z.string().trim().min(2).max(160),
    job_title: z.string().trim().max(120).optional().default(""),
    locale: z.enum(["pt-BR", "en-US"]).default("pt-BR"),
  }).safeParse(metadata);

  if (!parsed.success) return {error: "registration" as const};

  const {data, error} = await supabase.rpc("initialize_professional_onboarding", {
    p_full_name: parsed.data.full_name,
    p_job_title: parsed.data.job_title || undefined,
    p_journey: parsed.data.registration_role,
    p_locale: parsed.data.locale,
  } as Database["public"]["Functions"]["initialize_professional_onboarding"]["Args"]);

  if (error || !data) return {error: "workspace" as const};
  return {organizationId: data, journey: parsed.data.registration_role};
}
