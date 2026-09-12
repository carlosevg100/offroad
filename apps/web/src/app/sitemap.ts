import type {MetadataRoute} from "next";

import {brand} from "@/config/brand";
import {routing} from "@/i18n/routing";
import {publicPages, publicPath} from "@/lib/website-routes";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.flatMap(page => routing.locales.map(locale => ({
    url: `${brand.url}${publicPath(locale,page)}`,
    changeFrequency: "monthly" as const,
    priority: page === "home" ? 1 : 0.7,
    alternates: {languages: Object.fromEntries(routing.locales.map(language => [language, `${brand.url}${publicPath(language,page)}`]))},
  })));
}
