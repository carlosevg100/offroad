"use server";

import {cookies} from "next/headers";
import {redirect} from "next/navigation";

import {
  canContinuePendingRegistration,
  initializeRegistrationWorkspace,
  registrationSchema,
} from "@/lib/auth/registration";
import {createClient} from "@/lib/supabase/server";
import {reportServerFailure} from "@/lib/observability/report";

const emailCookie = "offroad_signup_email";

const registrationErrorReason: Record<string, string> = {
  email_address_invalid: "email",
  email_address_not_authorized: "delivery",
  email_exists: "email_exists",
  over_email_send_rate_limit: "rate_limit",
  over_request_rate_limit: "rate_limit",
  user_already_exists: "email_exists",
  weak_password: "password",
};

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function verificationPath(locale: string, pending = false) {
  return `/${locale}/signup/verify${pending ? "?pending=1" : ""}`;
}

async function rememberSignupEmail(locale: string, email: string) {
  const cookieStore = await cookies();
  cookieStore.set(emailCookie, email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/${locale}`,
    maxAge: 15 * 60,
    priority: "high",
  });
  return cookieStore;
}

export async function startRegistration(formData: FormData) {
  const parsed = registrationSchema.safeParse({
    locale: field(formData, "locale"),
    journey: field(formData, "journey"),
    fullName: field(formData, "full_name"),
    jobTitle: field(formData, "job_title"),
    email: field(formData, "email"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirm_password"),
  });
  const locale = field(formData, "locale") === "en-US" ? "en-US" : "pt-BR";
  if (!parsed.success) redirect(`/${locale}/signup?error=validation`);

  const cookieStore = await cookies();
  const pendingEmail = cookieStore.get(emailCookie)?.value;
  if (canContinuePendingRegistration(pendingEmail, parsed.data.email)) {
    redirect(verificationPath(locale, true));
  }

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/signup?error=provider`);

  const {data, error} = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        job_title: parsed.data.jobTitle,
        locale: parsed.data.locale,
        registration_role: parsed.data.journey,
      },
    },
  });

  if (error) {
    reportServerFailure({step: "auth.signup", error, context: {status: error.status ?? null}});
    if (canContinuePendingRegistration(pendingEmail, parsed.data.email, error.code)) {
      await rememberSignupEmail(locale, parsed.data.email);
      redirect(verificationPath(locale, true));
    }
    redirect(`/${locale}/signup?error=${registrationErrorReason[error.code ?? ""] ?? "registration"}`);
  }

  if (data.session) {
    const initialized = await initializeRegistrationWorkspace(supabase);
    if (initialized.error) redirect(`/${locale}/signup?error=workspace`);
    redirect(`/${locale}/onboarding`);
  }

  await rememberSignupEmail(locale, parsed.data.email);
  redirect(verificationPath(locale));
}

export async function verifyRegistrationCode(formData: FormData) {
  const locale = field(formData, "locale") === "en-US" ? "en-US" : "pt-BR";
  const token = field(formData, "token").replace(/\D/g, "");
  const cookieStore = await cookies();
  const email = cookieStore.get(emailCookie)?.value;
  if (!email || !/^\d{6}$/.test(token)) redirect(`/${locale}/signup/verify?error=code`);

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/signup/verify?error=provider`);

  const {error} = await supabase.auth.verifyOtp({email, token, type: "email"});
  if (error) redirect(`/${locale}/signup/verify?error=code`);

  const initialized = await initializeRegistrationWorkspace(supabase);
  if (initialized.error) redirect(`/${locale}/signup/verify?error=workspace`);

  cookieStore.delete(emailCookie);
  redirect(`/${locale}/onboarding`);
}

export async function resendRegistrationCode(formData: FormData) {
  const locale = field(formData, "locale") === "en-US" ? "en-US" : "pt-BR";
  const email = (await cookies()).get(emailCookie)?.value;
  if (!email) redirect(`/${locale}/signup?error=session`);

  const supabase = await createClient();
  if (!supabase) redirect(`/${locale}/signup/verify?error=provider`);
  const {error} = await supabase.auth.resend({type: "signup", email});
  if (error) {
    const reason = canContinuePendingRegistration(undefined, email, error.code) ? "resend_rate_limit" : "resend";
    redirect(`/${locale}/signup/verify?error=${reason}`);
  }
  redirect(`/${locale}/signup/verify?sent=1`);
}

export async function restartRegistration(formData: FormData) {
  const locale = field(formData, "locale") === "en-US" ? "en-US" : "pt-BR";
  (await cookies()).delete(emailCookie);
  redirect(`/${locale}/signup`);
}
