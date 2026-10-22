import type {MetadataRoute} from "next";

import {brand} from "@/config/brand";
import {routing} from "@/i18n/routing";
import {readOdblRelease} from "@/lib/market/odbl-release";
import {dataPath, publicPages, publicPath} from "@/lib/website-routes";

// Open-data pages enter and leave with their data, without a deploy.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = publicPages.flatMap(page => routing.locales.map(locale => ({
    url: `${brand.url}${publicPath(locale,page)}`,
    changeFrequency: "monthly" as const,
    priority: page === "home" ? 1 : 0.7,
    alternates: {languages: Object.fromEntries(routing.locales.map(language => [language, `${brand.url}${publicPath(language,page)}`]))},
  })));
  let served = false;
  try {
    served = (await readOdblRelease()).state === "served";
  } catch {
    served = false;
  }
  if (!served) return pages;
  return [...pages, ...routing.locales.map(locale => ({
    url: `${brand.url}${dataPath(locale,"selicTarget")}`,
    changeFrequency: "daily" as const,
    priority: 0.5,
    alternates: {languages: Object.fromEntries(routing.locales.map(language => [language, `${brand.url}${dataPath(language,"selicTarget")}`]))},
  }))];
}
