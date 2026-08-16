import {ArrowLeft, ArrowRight} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {AuthShell} from "@/components/auth-shell";
import type {AppLocale} from "@/i18n/routing";

import {requestPasswordCode} from "./actions";

export const metadata: Metadata = {title: "Reset Password", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{error?: string}>};

export default async function ForgotPasswordPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Recovery"});
  return (
    <AuthShell assurance={t("assurance")} body={t("contextBody")} eyebrow={t("contextEyebrow")} locale={locale as AppLocale} title={t("contextTitle")}>
      <Link className="text-link auth-back" href={`/${locale}/login`}><ArrowLeft aria-hidden="true" size={14} /> {t("back")}</Link>
      <form action={requestPasswordCode} className="auth-form">
        <div className="auth-form__heading"><p className="section-kicker">{t("eyebrow")}</p><h2>{t("title")}</h2><p>{t("body")}</p></div>
        <input name="locale" type="hidden" value={locale} />
        {state.error ? <p className="form-notice form-notice--error" role="alert">{t("error")}</p> : null}
        <label className="field"><span>{t("email")}</span><input autoComplete="email" name="email" required type="email" /></label>
        <button className="button auth-form__primary" type="submit">{t("send")} <ArrowRight aria-hidden="true" size={15} /></button>
      </form>
    </AuthShell>
  );
}
