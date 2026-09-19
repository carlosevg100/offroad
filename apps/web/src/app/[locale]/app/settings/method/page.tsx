import "@/app/vault.css";
import {getTranslations} from "next-intl/server";
import {MethodPublicationWorkspace} from "@/components/method-publication-workspace";
import {loadMethodPage} from "./actions";
export const dynamic = "force-dynamic";
export default async function MethodPage({params}: {params: Promise<{locale: string}>}) {
 const {locale} = await params; const t = await getTranslations({locale, namespace: "MethodPublication"});
 const data = await loadMethodPage(locale);
 return <main className="vault-page"><header><p className="vault-eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p></header><MethodPublicationWorkspace locale={locale} initialPage={data} /></main>;
}
