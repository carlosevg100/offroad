import Image from "next/image";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type {ReactNode} from "react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath, type PublicPage} from "@/lib/website-routes";
import {websiteCopy} from "./public-content";
import {ProductHome} from "./public-product-home";
import styles from "./public-site.module.css";
import hero from "./public-hero.module.css";

export async function PublicShell({locale, page, children}: {locale: AppLocale; page: PublicPage; children: ReactNode}) {
  const t = await getTranslations({locale, namespace: "Website"});
  const dark = page === "home";
  const otherLocale = locale === "pt-BR" ? "en-US" : "pt-BR";
  const nav = (["solutions", "audiences", "cases", "about", "security"] as const).map((key) => <Link key={key} href={publicPath(locale, key)} aria-current={page === key ? "page" : undefined}>{t(`nav.${key}`)}</Link>);
  return <div className={styles.site}>
    <a className={styles.skip} href="#content">{t("nav.skip")}</a>
    <header key={page} className={`${styles.header} ${dark ? styles.headerDark : ""}`}>
      <Link href={publicPath(locale, "home")} aria-label={`Offroad: ${t("nav.home")}`} className={styles.logo}><Image src={`/brand/offroad-lockup${dark ? "-inverted" : ""}.png`} width={1600} height={482} alt="Offroad" priority /></Link>
      <nav className={styles.desktopNav} aria-label={t("nav.menu")}>{nav}</nav>
      <div className={styles.headerActions}><Link href={publicPath(otherLocale, page)} hrefLang={otherLocale} aria-label={t("nav.language")}>{locale === "pt-BR" ? "EN" : "PT"}</Link><Link className={styles.login} href={`/${locale}/login`}>{t("nav.login")}</Link></div>
      <details className={styles.mobileNav}><summary>{t("nav.menu")}</summary><nav aria-label={t("nav.menu")}>{nav}<Link href={publicPath(locale, "demo")}>{t("nav.demo")}</Link><Link href={`/${locale}/login`}>{t("nav.login")}</Link></nav></details>
    </header>
    <main id="content">{children}</main>
    <footer className={styles.footer}>
      <div className={styles.footerTop}><h2>{t("footer.title")}</h2><div><p>{t("footer.body")}</p><Link className={styles.button} href={publicPath(locale, "demo")}>{t("nav.demo")}</Link></div></div>
      <div className={styles.footerBottom}><Link href={publicPath(locale,"home")} className={styles.logo}><Image src="/brand/offroad-lockup.png" width={1600} height={482} alt="Offroad" /></Link><nav aria-label={t("nav.menu")}>{nav}</nav><div><Link href={publicPath(locale,"privacy")}>{t("footer.privacy")}</Link><Link href={publicPath(locale,"legal")}>{t("footer.legal")}</Link></div><small>© {new Date().getFullYear()} Offroad. {t("footer.rights")}</small></div>
    </footer>
  </div>;
}

export async function PublicHome({locale}: {locale: AppLocale}) {
  const t = await getTranslations({locale, namespace: "Website"});
  const copy = await websiteCopy(locale);
  return <PublicShell locale={locale} page="home">
    <section className={hero.hero} aria-labelledby="hero-title">
      <div className={hero.image}><Image src="/website/hero-city.png" alt="" fill priority sizes="100vw" /></div>
      <div className={hero.content}><h1 id="hero-title">{t("hero.title")}</h1><p className={hero.support}>{t("hero.support")}</p><p className={hero.credit}>{t("hero.credit")}</p><div className={hero.actions}><Link className={hero.primary} href={publicPath(locale,"demo")}>{t("nav.demo")}</Link><Link className={hero.secondary} href={publicPath(locale,"cases")}>{t("hero.secondary")}</Link></div></div>
    </section>
    <ProductHome locale={locale} copy={copy}/>
  </PublicShell>;
}
