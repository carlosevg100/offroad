import "@/app/vault.css";
import {getTranslations} from "next-intl/server";
import {VaultWorkspace} from "@/components/vault-publication-review";
import {loadVault} from "./actions";

export const dynamic = "force-dynamic";
export default async function VaultPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Vault"});
  const page = await loadVault({locale, search: "", offset: 0, mode: "published", purpose: "analysis", workId: null});
  return <main className="vault-page"><header><p className="vault-eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p></header><VaultWorkspace locale={locale} initialPage={page} /></main>;
}
