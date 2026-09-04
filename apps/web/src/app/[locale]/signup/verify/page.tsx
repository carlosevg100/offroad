import {ArrowLeft, ArrowRight, MailCheck} from "lucide-react";
import type {Metadata} from "next";
import {cookies} from "next/headers";
import {getTranslations} from "next-intl/server";

import {AuthShell} from "@/components/auth-shell";
import type {AppLocale} from "@/i18n/routing";

import {resendRegistrationCode, restartRegistration, verifyRegistrationCode} from "../actions";
import {SIGNUP_EMAIL_COOKIE} from "../signup-cookie";

export const metadata: Metadata = {title: "Verify Email", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{error?: string; pending?: string; sent?: string}>};

export default async function VerifySignupPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Signup"});
  // The address is already in the browser from the step before, so the screen can name it
  // instead of saying "the e-mail you entered" and making the reader remember which one.
  const pendingEmail = (await cookies()).get(SIGNUP_EMAIL_COOKIE)?.value ?? "";

  return (
    <AuthShell body={t("verifyContextBody")} locale={locale as AppLocale} title={t("verifyContextTitle")}>
      <form action={restartRegistration}>
        <input name="locale" type="hidden" value={locale} />
        <button className="text-link auth-back auth-back--button" type="submit"><ArrowLeft aria-hidden="true" size={14} /> {t("changeEmail")}</button>
      </form>
      <form action={verifyRegistrationCode} className="auth-form auth-form--verification">
        <input name="locale" type="hidden" value={locale} />
        <MailCheck aria-hidden="true" className="auth-form__icon" size={26} />
        <div className="auth-form__heading">
          <h2>{t("verifyTitle")}</h2>
          <p>{pendingEmail ? t("verifyBodyNamed", {email: pendingEmail}) : t("verifyBody")}</p>
        </div>
        {state.sent === "1" ? <p className="form-notice form-notice--success" role="status">{t("resent")}</p> : null}
        {state.pending === "1" ? <p className="form-notice form-notice--success" role="status">{t("codeAlreadySent")}</p> : null}
        {state.error ? <p className="form-notice form-notice--error" role="alert">{state.error === "resend_rate_limit" ? t("resendRateLimit") : state.error === "resend" ? t("resendError") : t("codeError")}</p> : null}
        <label className="field otp-field"><span>{t("code")}</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} minLength={6} name="token" pattern="[0-9]{6}" required /></label>
        <button className="button auth-form__primary" type="submit">{t("verify")} <ArrowRight aria-hidden="true" size={15} /></button>
      </form>
      <form action={resendRegistrationCode} className="auth-resend"><input name="locale" type="hidden" value={locale} /><span>{t("notReceived")}</span><button type="submit">{t("resend")}</button></form>
    </AuthShell>
  );
}
