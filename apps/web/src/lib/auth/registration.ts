import {z} from "zod";

import type {Database} from "@/types/database";

export const registrationJourneys = ["company", "originator", "capital_provider"] as const;
export type RegistrationJourney = (typeof registrationJourneys)[number];

/**
 * Account creation no longer asks which side of the market someone is on. That split
 * belonged to an earlier product and did not describe how the platform is used; the
 * professional onboarding asks the questions that actually shape the work. Every new
 * workspace starts on the borrower side, which is the one that can begin work, and the
 * capital-provider workspace stays reachable only for organizations that already have it.
 */
export const defaultRegistrationJourney: RegistrationJourney = "company";

export const passwordSchema = z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[\p{P}\p{S}]/u);

const confirmationAlreadyRequestedErrors = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

export function canContinuePendingRegistration(
  pendingEmail: string | undefined,
  submittedEmail: string,
  errorCode?: string,
) {
  return pendingEmail === submittedEmail
    || (errorCode ? confirmationAlreadyRequestedErrors.has(errorCode) : false);
}

export const registrationSchema = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  journey: z.enum(registrationJourneys),
  fullName: z.string().trim().min(2).max(160),
  email: z.email().trim().toLowerCase().max(254),
  password: passwordSchema,
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
    locale: z.enum(["pt-BR", "en-US"]).default("pt-BR"),
  }).safeParse(metadata);

  if (!parsed.success) return {error: "registration" as const};

  const {data, error} = await supabase.rpc("initialize_professional_onboarding", {
    p_full_name: parsed.data.full_name,
    p_journey: parsed.data.registration_role,
    p_locale: parsed.data.locale,
  } as Database["public"]["Functions"]["initialize_professional_onboarding"]["Args"]);

  if (error || !data) return {error: "workspace" as const};
  return {organizationId: data, journey: parsed.data.registration_role};
}
