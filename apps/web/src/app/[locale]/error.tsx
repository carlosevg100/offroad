"use client";

import {ArrowRight, RotateCcw} from "lucide-react";
import {useTranslations} from "next-intl";
import Link from "next/link";
import {useParams} from "next/navigation";

type Props = {error: Error & {digest?: string}; reset: () => void};

/**
 * Localized error boundary for everything under /[locale]. Only the copy from the `Errors`
 * namespace is available on the client (see the layout's NextIntlClientProvider). Nothing about
 * the error itself is rendered except Next's opaque digest, so no confidential content can leak.
 */
export default function LocaleError({error, reset}: Props) {
  const t = useTranslations("Errors");
  const params = useParams<{locale?: string}>();
  const locale = typeof params?.locale === "string" ? params.locale : "pt-BR";
  return (
    <main className="app-canvas error-page">
      <section className="error-page__card" role="alert">
        <p className="section-kicker">500</p>
        <h1>{t("errorTitle")}</h1>
        <p>{t("errorBody")}</p>
        {error.digest ? <small>{t("reference")}: {error.digest}</small> : null}
        <div className="error-page__actions">
          <button className="button" onClick={() => reset()} type="button"><RotateCcw aria-hidden="true" size={15} />{t("retry")}</button>
          <Link className="button button--ghost" href={`/${locale}`}>{t("home")}<ArrowRight aria-hidden="true" size={15} /></Link>
        </div>
      </section>
    </main>
  );
}
