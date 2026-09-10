import {ArrowLeft, LockKeyhole} from "lucide-react";
import {getTranslations} from "next-intl/server";
import Link from "next/link";

type Props = {locale: string};

/**
 * Shown where a company or advisor entry is unavailable to the current organization. It explains
 * the boundary instead of rendering a form the server would refuse; the action behind the form
 * keeps its own guard regardless.
 */
export async function FinancierUnavailableEntry({locale}: Props) {
  const t = await getTranslations({locale, namespace: "App.financierUnavailableEntry"});
  return (
    <main className="app-canvas origination-setup" data-testid="financier-unavailable-entry">
      <Link className="text-link origination-back" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("cta")}</Link>
      <header className="origination-setup__header">
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
      </header>
      <div className="origination-form__boundary">
        <LockKeyhole aria-hidden="true" size={17} />
        <p>{t("body")}</p>
      </div>
    </main>
  );
}
