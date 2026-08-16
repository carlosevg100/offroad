"use server";

import {cookies} from "next/headers";
import {redirect} from "next/navigation";

import {initializeRegistrationWorkspace, registrationSchema} from "@/lib/auth/registration";
import {createClient} from "@/lib/supabase/server";

const emailCookie = "offroad_signup_email";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
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

  if (error) redirect(`/${locale}/signup?error=registration`);

  if (data.session) {
    const initialized = await initializeRegistrationWorkspace(supabase);
    if (initialized.error) redirect(`/${locale}/signup?error=workspace`);
    redirect(`/${locale}/onboarding`);
  }

  const cookieStore = await cookies();
  cookieStore.set(emailCookie, parsed.data.email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/${locale}`,
    maxAge: 15 * 60,
    priority: "high",
  });
  redirect(`/${locale}/signup/verify`);
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
  if (error) redirect(`/${locale}/signup/verify?error=resend`);
  redirect(`/${locale}/signup/verify?sent=1`);
}
