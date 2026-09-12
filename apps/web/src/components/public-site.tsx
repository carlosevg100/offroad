import Image from "next/image";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type {ReactNode} from "react";
import type {AppLocale} from "@/i18n/routing";
import {publicPath, type PublicPage} from "@/lib/website-routes";
import {HomeSections} from "./public-content";
import styles from "./public-site.module.css";

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
      <div className={styles.footerTop}><h2>{t("footer.title")}</h2><div><p>{t("footer.body")}</p><Link className={styles.button} href={publicPath(locale, "demo")}>{t("nav.demo")} <span aria-hidden="true">↗</span></Link></div></div>
      <div className={styles.footerBottom}><Link href={publicPath(locale,"home")} className={styles.logo}><Image src="/brand/offroad-lockup.png" width={1600} height={482} alt="Offroad" /></Link><nav aria-label={t("nav.menu")}>{nav}</nav><div><Link href={publicPath(locale,"privacy")}>{t("footer.privacy")}</Link><Link href={publicPath(locale,"legal")}>{t("footer.legal")}</Link></div><small>© {new Date().getFullYear()} Offroad. {t("footer.rights")}</small></div>
    </footer>
  </div>;
}

export async function PublicHome({locale}: {locale: AppLocale}) {
  const t = await getTranslations({locale, namespace: "Website"});
  return <PublicShell locale={locale} page="home">
    <section className={styles.hero} aria-labelledby="hero-title">
      <input type="checkbox" id="hero-motion" className={styles.motionToggle} aria-label={t("hero.motion")} />
      <label htmlFor="hero-motion" className={styles.motionLabel} title={t("hero.motion")}><span aria-hidden="true">Ⅱ / ▶</span></label>
      <div className={styles.heroImage}><Image src="/website/hero-city.png" alt="" fill priority sizes="100vw" /></div>
      <div className={styles.heroContent}><h1 id="hero-title">{t("hero.title")}</h1><p className={styles.heroSupport}>{t("hero.support")}</p><p className={styles.heroCredit}>{t("hero.credit")}</p><div className={styles.ctas}><Link className={styles.button} href={publicPath(locale,"demo")}>{t("nav.demo")} <span aria-hidden="true">↗</span></Link><Link className={styles.textLink} href={publicPath(locale,"cases")}>{t("hero.secondary")} <span aria-hidden="true">↗</span></Link></div></div>
    </section>
    <section className={styles.section}><div className={styles.sectionHeading}><h2>{t("intro.title")}</h2><p>{t("intro.body")}</p></div><figure className={styles.productPhoto}><Image src={`/website/product-${locale === "pt-BR" ? "pt" : "en"}.png`} width={1672} height={941} sizes="(max-width: 800px) 100vw, 1200px" alt={t("intro.alt")} /><figcaption>{t("intro.caption")}</figcaption></figure></section>
    <HomeSections locale={locale}/>
  </PublicShell>;
}
