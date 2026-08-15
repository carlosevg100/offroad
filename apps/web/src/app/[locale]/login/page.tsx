import {ArrowLeft, ArrowRight, KeyRound, ShieldCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {BrandMark} from "@/components/brand-mark";
import type {AppLocale} from "@/i18n/routing";

import {createAccount, sendMagicLink, signInWithPassword} from "./actions";

export const metadata: Metadata = {title: "Institutional Access", robots: {index: false, follow: false}};

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string; sent?: string}>;
};

export default async function LoginPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "Auth"});

  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--context">
        <BrandMark inverted locale={locale as AppLocale} />
        <div className="auth-panel__copy">
          <p className="section-kicker section-kicker--light">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("body")}</p>
        </div>
        <div className="auth-assurance">
          <ShieldCheck aria-hidden="true" size={18} />
          <span>{t("security")}</span>
        </div>
      </section>

      <section className="auth-panel auth-panel--form" aria-label={t("title")}>
        <Link className="text-link auth-back" href={`/${locale}`}>
          <ArrowLeft aria-hidden="true" size={14} /> {t("back")}
        </Link>

        <form className="auth-form">
          <input name="locale" type="hidden" value={locale} />
          {state.sent === "1" ? <p className="form-notice form-notice--success" role="status">{t("magicSent")}</p> : null}
          {state.error ? <p className="form-notice form-notice--error" role="alert">{state.error === "provider" ? t("providerMissing") : t("error")}</p> : null}

          <label className="field">
            <span>{t("email")}</span>
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label className="field">
            <span>{t("password")}</span>
            <input autoComplete="current-password" minLength={10} name="password" type="password" />
            <small>{t("passwordHint")}</small>
          </label>

          <button className="button auth-form__primary" formAction={signInWithPassword}>
            {t("signIn")} <ArrowRight aria-hidden="true" size={15} />
          </button>
          <div className="auth-form__secondary">
            <button className="button button--outline" formAction={sendMagicLink}>
              <KeyRound aria-hidden="true" size={15} /> {t("magic")}
            </button>
            <button className="button button--ghost" formAction={createAccount}>{t("signUp")}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
