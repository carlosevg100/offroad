import {ArrowRight} from "lucide-react";
import Link from "next/link";
import {getLocale, getTranslations} from "next-intl/server";

/** Localized 404 for anything under /[locale] (unknown paths reach it through [...rest]/page.tsx). */
export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations({locale, namespace: "Errors"});
  return (
    <main className="app-canvas error-page">
      <section className="error-page__card">
        <p className="section-kicker">404</p>
        <h1>{t("notFoundTitle")}</h1>
        <p>{t("notFoundBody")}</p>
        <Link className="button" href={`/${locale}`}>{t("home")}<ArrowRight aria-hidden="true" size={15} /></Link>
      </section>
    </main>
  );
}
