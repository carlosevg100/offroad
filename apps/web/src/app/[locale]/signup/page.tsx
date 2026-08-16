import {ArrowLeft, Building2, Landmark, Network} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {AuthShell} from "@/components/auth-shell";
import type {AppLocale} from "@/i18n/routing";

import {startRegistration} from "./actions";

export const metadata: Metadata = {title: "Create Account", robots: {index: false, follow: false}};

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string}>;
};

export default async function SignupPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Signup"});

  return (
    <AuthShell
      assurance={t("assurance")}
      body={t("contextBody")}
      eyebrow={t("contextEyebrow")}
      locale={locale as AppLocale}
      title={t("contextTitle")}
    >
      <Link className="text-link auth-back" href={`/${locale}/login`}>
        <ArrowLeft aria-hidden="true" size={14} /> {t("back")}
      </Link>
      <form action={startRegistration} className="auth-form auth-form--registration">
        <input name="locale" type="hidden" value={locale} />
        <div className="auth-form__heading">
          <p className="section-kicker">{t("eyebrow")}</p>
          <h2>{t("title")}</h2>
          <p>{t("body")}</p>
        </div>
        {state.error ? <p className="form-notice form-notice--error" role="alert">{state.error === "provider" ? t("providerMissing") : t("error")}</p> : null}

        <fieldset className="registration-roles">
          <legend>{t("roleLegend")}</legend>
          <label>
            <input defaultChecked name="journey" type="radio" value="company" />
            <Building2 aria-hidden="true" size={20} />
            <span><strong>{t("company")}</strong><small>{t("companyBody")}</small></span>
          </label>
          <label>
            <input name="journey" type="radio" value="originator" />
            <Network aria-hidden="true" size={20} />
            <span><strong>{t("originator")}</strong><small>{t("originatorBody")}</small></span>
          </label>
          <label>
            <input name="journey" type="radio" value="capital_provider" />
            <Landmark aria-hidden="true" size={20} />
            <span><strong>{t("provider")}</strong><small>{t("providerBody")}</small></span>
          </label>
        </fieldset>

        <div className="registration-fields">
          <label className="field"><span>{t("fullName")}</span><input autoComplete="name" maxLength={160} minLength={2} name="full_name" required /></label>
          <label className="field"><span>{t("jobTitle")}</span><input autoComplete="organization-title" maxLength={120} minLength={2} name="job_title" required /></label>
          <label className="field field--wide"><span>{t("email")}</span><input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
          <label className="field"><span>{t("password")}</span><input autoComplete="new-password" maxLength={128} minLength={10} name="password" required type="password" /><small>{t("passwordHint")}</small></label>
          <label className="field"><span>{t("confirmPassword")}</span><input autoComplete="new-password" maxLength={128} minLength={10} name="confirm_password" required type="password" /></label>
        </div>

        <button className="button auth-form__primary" type="submit">{t("continue")}</button>
        <p className="auth-verification-note">{t("verificationNotice")}</p>
        <p className="auth-legal">{t("legal")}</p>
      </form>
    </AuthShell>
  );
}
