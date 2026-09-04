import {ArrowLeft} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {AuthShell} from "@/components/auth-shell";
import type {AppLocale} from "@/i18n/routing";

import {signInWithPassword} from "./actions";
import {LoginSubmit} from "./login-submit";

export const metadata: Metadata = {title: "Sign in", robots: {index: false, follow: false}};

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string; reset?: string}>;
};

export default async function LoginPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Auth"});

  return (
    <AuthShell
      assurance={t("security")}
      body={t("body")}
      locale={locale as AppLocale}
      title={t("title")}
    >
        <Link className="text-link auth-back" href={`/${locale}`}>
          <ArrowLeft aria-hidden="true" size={14} /> {t("back")}
        </Link>

        <form action={signInWithPassword} className="auth-form" id="access-form">
          <div className="auth-form__heading">
            <h2>{t("loginTitle")}</h2>
            <p>{t("loginBody")}</p>
          </div>
          <input name="locale" type="hidden" value={locale} />
          {state.reset === "1" ? <p className="form-notice form-notice--success" role="status">{t("resetComplete")}</p> : null}
          {state.error ? <p className="form-notice form-notice--error" role="alert">{state.error === "provider" ? t("providerMissing") : t("error")}</p> : null}

          <label className="field">
            <span>{t("email")}</span>
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label className="field">
            <span>{t("password")}</span>
            {/* No client-side length rule here: the login form must accept every password Auth accepts. Policy is enforced at signup/recovery and by Supabase Auth. */}
            <input autoComplete="current-password" name="password" required type="password" />
          </label>

          <div className="auth-form__utility">
            <Link href={`/${locale}/forgot-password`}>{t("forgotPassword")}</Link>
          </div>

          <LoginSubmit idle={t("signIn")} pending={t("signingIn")} />
          <div className="auth-form__switch">
            <span>{t("noAccount")}</span>
            <Link className="text-link" href={`/${locale}/signup`}>{t("signUp")}</Link>
          </div>
        </form>
    </AuthShell>
  );
}
