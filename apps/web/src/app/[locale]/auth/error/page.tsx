import {AlertTriangle, ArrowLeft} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

type Props = {params: Promise<{locale: string}>};

export const metadata: Metadata = {title: "Authentication Error", robots: {index: false, follow: false}};

export default async function AuthErrorPage({params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Auth"});

  return (
    <main className="system-state">
      <AlertTriangle aria-hidden="true" size={28} />
      <h1>{t("errorTitle")}</h1>
      <p>{t("errorBody")}</p>
      <Link className="button" href={`/${locale}/login`}><ArrowLeft aria-hidden="true" size={15} /> {t("back")}</Link>
    </main>
  );
}
