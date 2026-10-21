import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {SelicOdblPage} from "@/components/market/selic-odbl-page";
import {dataPath} from "@/lib/website-routes";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (locale !== "pt-BR") return {};
  const t = await getTranslations({locale, namespace: "MarketData"});
  return {title: t("title"), description: t("metaDescription"),
    alternates: {canonical: dataPath("pt-BR", "selicTarget"), languages: {"pt-BR": dataPath("pt-BR", "selicTarget"), "en-US": dataPath("en-US", "selicTarget")}}};
}

export default async function Page({params}: Props) {
  const {locale} = await params;
  if (locale !== "pt-BR") notFound();
  return <SelicOdblPage locale="pt-BR"/>;
}
