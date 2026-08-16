import {ArrowUpRight, Menu} from "lucide-react";
import Link from "next/link";
import {useTranslations} from "next-intl";

import type {AppLocale} from "@/i18n/routing";

import {BrandMark} from "./brand-mark";

type SiteHeaderProps = {
  locale: AppLocale;
};

export function SiteHeader({locale}: SiteHeaderProps) {
  const t = useTranslations("Navigation");
  const demoHref = `/${locale}/demo`;
  const loginHref = `/${locale}/login#access-form`;
  const createAccountHref = `/${locale}/signup`;

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        {t("skip")}
      </a>
      <div className="site-header__inner">
        <BrandMark locale={locale} />

        <nav className="desktop-nav" aria-label={t("menu")}>
          <a href="#como-funciona">{t("how")}</a>
          <a href="#para-quem">{t("audiences")}</a>
          <a href="#seguranca">{t("trust")}</a>
        </nav>

        <div className="site-header__actions">
          <div className="locale-switcher" aria-label={t("language")}>
            <Link
              href="/pt-BR"
              aria-current={locale === "pt-BR" ? "page" : undefined}
            >
              {t("portuguese")}
            </Link>
            <span aria-hidden="true">/</span>
            <Link
              href="/en-US"
              aria-current={locale === "en-US" ? "page" : undefined}
            >
              {t("english")}
            </Link>
          </div>
          <Link className="access-link" href={createAccountHref}>
            {t("createAccount")}
          </Link>
          <Link className="access-link" href={loginHref}>
            {t("login")}
          </Link>
          <Link className="button button--small" href={demoHref}>
            <span>{t("demo")}</span>
            <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
          <div className="mobile-locale-switcher" aria-label={t("language")}>
            <Link
              href="/pt-BR"
              aria-current={locale === "pt-BR" ? "page" : undefined}
            >
              {t("portuguese")}
            </Link>
            <span aria-hidden="true">/</span>
            <Link
              href="/en-US"
              aria-current={locale === "en-US" ? "page" : undefined}
            >
              {t("english")}
            </Link>
          </div>
          <details className="mobile-nav">
            <summary aria-label={t("menu")}>
              <Menu aria-hidden="true" size={20} />
            </summary>
            <div className="mobile-nav__panel">
              <a href="#como-funciona">{t("how")}</a>
              <a href="#para-quem">{t("audiences")}</a>
              <a href="#seguranca">{t("trust")}</a>
              <Link href={createAccountHref}>{t("createAccount")}</Link>
              <Link href={loginHref}>{t("login")}</Link>
              <Link href={demoHref}>{t("demo")}</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
