import {ArrowLeft} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {AuthShell} from "@/components/auth-shell";
import type {AppLocale} from "@/i18n/routing";

import {startRegistration} from "./actions";
import {PasswordFields} from "./password-fields";
import {SignupRoleSelector} from "./role-selector";
import {SignupSubmitButton} from "./submit-button";

export const metadata: Metadata = {title: "Create Account", robots: {index: false, follow: false}};

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string}>;
};

export default async function SignupPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Signup"});
  const errorMessage = state.error === "provider"
    ? t("providerMissing")
    : state.error === "password"
      ? t("passwordError")
      : state.error === "rate_limit"
        ? t("rateLimitError")
        : state.error === "email"
          ? t("emailError")
          : state.error === "email_exists"
            ? t("emailExistsError")
            : state.error === "delivery"
              ? t("deliveryError")
              : t("error");

  return (
    <AuthShell
      assurance={t("assurance")}
      body={t("contextBody")}
      locale={locale as AppLocale}
      title={t("contextTitle")}
    >
      <Link className="text-link auth-back" href={`/${locale}/login`}>
        <ArrowLeft aria-hidden="true" size={14} /> {t("back")}
      </Link>
      <form action={startRegistration} className="auth-form auth-form--registration">
        <input name="locale" type="hidden" value={locale} />
        <div className="auth-form__heading">
          <h2>{t("title")}</h2>
          <p>{t("body")}</p>
        </div>
        {state.error ? <p className="form-notice form-notice--error" role="alert">{errorMessage}</p> : null}

        <SignupRoleSelector labels={{
          pathLegend: t("pathLegend"),
          origination: t("origination"),
          originationBody: t("originationBody"),
          provider: t("provider"),
          providerBody: t("providerBody"),
          roleLegend: t("roleLegend"),
          company: t("company"),
          companyBody: t("companyBody"),
          originator: t("originator"),
          originatorBody: t("originatorBody"),
        }} />

        <div className="registration-fields">
          <label className="field"><span>{t("fullName")}</span><input autoComplete="name" maxLength={160} minLength={2} name="full_name" required /></label>
          <label className="field"><span>{t("jobTitle")}</span><input autoComplete="organization-title" maxLength={120} minLength={2} name="job_title" required /></label>
          <label className="field field--wide"><span>{t("email")}</span><input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
          <PasswordFields
            confirmLabel={t("confirmPassword")}
            labels={{
              length: t("passwordLength"),
              lowercase: t("passwordLowercase"),
              uppercase: t("passwordUppercase"),
              special: t("passwordSpecial"),
            }}
            passwordLabel={t("password")}
            validLabel={t("passwordValid")}
          />
        </div>

        <SignupSubmitButton idleLabel={t("continue")} pendingLabel={t("creatingAccount")} />
        <p className="auth-verification-note">{t("verificationNotice")}</p>
        <p className="auth-legal">{t("legal")}</p>
      </form>
    </AuthShell>
  );
}
