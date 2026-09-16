import {z} from "zod";

import type {Database} from "@/types/database";

export const registrationJourneys = ["personal", "company", "originator", "capital_provider"] as const;
export type RegistrationJourney = (typeof registrationJourneys)[number];

/** New identities receive a personal workspace; historical journey metadata is not authority. */
export const defaultRegistrationJourney: RegistrationJourney = "personal";

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
    full_name: z.string().trim().min(2).max(160),
    locale: z.enum(["pt-BR", "en-US"]).default("pt-BR"),
  }).safeParse(metadata);

  if (!parsed.success) return {error: "registration" as const};

  // This command creates the organization and its first active owner in one
  // transaction. Never restore client-side organization/membership bootstrap.
  const workspaceCommand: Database["public"]["Functions"]["initialize_workspace_v1"]["Args"] = {
    p_full_name: parsed.data.full_name,
    p_locale: parsed.data.locale,
  };
  const {data, error} = await supabase.rpc("initialize_workspace_v1", workspaceCommand);

  if (error?.message === "workspace_context_required" || error?.message === "workspace_context_denied") return {error: "workspace_selection" as const};
  if (error || !data) return {error: "workspace" as const};
  return {organizationId: data, journey: "personal" as const};
}
