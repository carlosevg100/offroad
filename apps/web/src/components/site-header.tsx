import {ArrowUpRight, Menu} from "lucide-react";
import Link from "next/link";
import {useTranslations} from "next-intl";

import type {AppLocale} from "@/i18n/routing";

import {BrandMark} from "./brand-mark";

type SiteHeaderProps = {
  locale: AppLocale;
  variant?: "default" | "landing";
};

export function SiteHeader({locale, variant = "default"}: SiteHeaderProps) {
  const t = useTranslations("Navigation");
  const loginHref = `/${locale}/login#access-form`;
  const createAccountHref = `/${locale}/signup`;

  return (
    <header className={`site-header ${variant === "landing" ? "site-header--landing" : ""}`}>
      <a className="skip-link" href="#main-content">
        {t("skip")}
      </a>
      <div className="site-header__inner">
        <BrandMark locale={locale} />

        <nav className="desktop-nav" aria-label={t("menu")}>
          <a href="#produto">{t("product")}</a>
          <a href="#para-quem">{t("audiences")}</a>
          <a href="#inteligencia">{t("intelligence")}</a>
          <a href="#confianca">{t("trust")}</a>
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
          <Link className="access-link" href={loginHref}>
            {t("login")}
          </Link>
          <Link className="button button--small" href={createAccountHref}>
            <span>{t("start")}</span>
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
              <a href="#produto">{t("product")}</a>
              <a href="#para-quem">{t("audiences")}</a>
              <a href="#inteligencia">{t("intelligence")}</a>
              <a href="#confianca">{t("trust")}</a>
              <Link href={loginHref}>{t("login")}</Link>
              <Link href={createAccountHref}>{t("start")}</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
