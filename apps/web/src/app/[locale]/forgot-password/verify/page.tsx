import {ArrowLeft, ArrowRight, KeyRound} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {AuthShell} from "@/components/auth-shell";
import type {AppLocale} from "@/i18n/routing";

import {verifyPasswordCode} from "../actions";

export const metadata: Metadata = {title: "Verify Reset Code", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{error?: string}>};

export default async function VerifyPasswordPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Recovery"});
  return (
    <AuthShell assurance={t("assurance")} body={t("verifyContextBody")} eyebrow={t("contextEyebrow")} locale={locale as AppLocale} title={t("verifyContextTitle")}>
      <Link className="text-link auth-back" href={`/${locale}/forgot-password`}><ArrowLeft aria-hidden="true" size={14} /> {t("changeEmail")}</Link>
      <form action={verifyPasswordCode} className="auth-form auth-form--verification">
        <input name="locale" type="hidden" value={locale} />
        <KeyRound aria-hidden="true" className="auth-form__icon" size={26} />
        <div className="auth-form__heading"><p className="section-kicker">{t("verifyEyebrow")}</p><h2>{t("verifyTitle")}</h2><p>{t("verifyBody")}</p></div>
        {state.error ? <p className="form-notice form-notice--error" role="alert">{t("codeError")}</p> : null}
        <label className="field otp-field"><span>{t("code")}</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} minLength={6} name="token" pattern="[0-9]{6}" required /></label>
        <button className="button auth-form__primary" type="submit">{t("verify")} <ArrowRight aria-hidden="true" size={15} /></button>
      </form>
    </AuthShell>
  );
}
