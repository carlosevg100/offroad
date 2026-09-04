import {ArrowRight, LockKeyhole} from "lucide-react";
import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";

import {AuthShell} from "@/components/auth-shell";
import type {AppLocale} from "@/i18n/routing";

import {updatePassword} from "../actions";

export const metadata: Metadata = {title: "Choose New Password", robots: {index: false, follow: false}};

type Props = {params: Promise<{locale: string}>; searchParams: Promise<{error?: string}>};

export default async function UpdatePasswordPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Recovery"});
  return (
    <AuthShell body={t("updateContextBody")} eyebrow={t("contextEyebrow")} locale={locale as AppLocale} title={t("updateContextTitle")}>
      <form action={updatePassword} className="auth-form auth-form--verification">
        <input name="locale" type="hidden" value={locale} />
        <LockKeyhole aria-hidden="true" className="auth-form__icon" size={26} />
        <div className="auth-form__heading"><p className="section-kicker">{t("updateEyebrow")}</p><h2>{t("updateTitle")}</h2><p>{t("updateBody")}</p></div>
        {state.error ? <p className="form-notice form-notice--error" role="alert">{t("passwordError")}</p> : null}
        <label className="field"><span>{t("password")}</span><input autoComplete="new-password" maxLength={128} minLength={8} name="password" pattern={"(?=.*[a-z])(?=.*[A-Z])(?=.*[\\p{P}\\p{S}]).{8,128}"} required type="password" /><small>{t("passwordHint")}</small></label>
        <label className="field"><span>{t("confirmPassword")}</span><input autoComplete="new-password" maxLength={128} minLength={8} name="confirm_password" required type="password" /></label>
        <button className="button auth-form__primary" type="submit">{t("update")} <ArrowRight aria-hidden="true" size={15} /></button>
      </form>
    </AuthShell>
  );
}
