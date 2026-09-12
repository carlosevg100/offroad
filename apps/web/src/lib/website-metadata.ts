import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {brand} from "@/config/brand";
import type {AppLocale} from "@/i18n/routing";
import {publicPath, type PublicPage} from "./website-routes";

export async function websiteMetadata(locale: AppLocale, page: PublicPage): Promise<Metadata> {
  const t = await getTranslations({locale, namespace: "Website"});
  const namespace = page === "home" ? "hero" : ["about", "security", "demo", "privacy", "legal"].includes(page) ? page : `pages.${page}`;
  const title = t(`${namespace}.title`);
  const description = page === "home" ? t("intro.body") : t(`${namespace}.intro`);
  return {
    title: {absolute: `${title} | ${brand.name}`}, description,
    alternates: {canonical: publicPath(locale,page), languages: {"pt-BR": publicPath("pt-BR",page), "en-US": publicPath("en-US",page), "x-default": publicPath("pt-BR",page)}},
    robots: {index: true, follow: true, googleBot: {index: true, follow: true}},
    openGraph: {type: "website", locale: locale.replace("-","_"), url: publicPath(locale,page), siteName: brand.name, title, description, images: [{url: "/social-preview.png?v=6", width: 1200, height: 630, alt: `${brand.name}. ${brand.socialHeadline}`}]},
    twitter: {card: "summary_large_image", title, description, images: [{url: "/social-preview.png?v=6", alt: `${brand.name}. ${brand.socialHeadline}`}]},
  };
}
