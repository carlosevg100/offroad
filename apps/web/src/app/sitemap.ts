import type {MetadataRoute} from "next";

import {brand} from "@/config/brand";
import {routing} from "@/i18n/routing";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, `${brand.url}/${locale}`]),
  );

  return routing.locales.map((locale) => ({
    url: `${brand.url}/${locale}`,
    changeFrequency: "weekly",
    priority: locale === routing.defaultLocale ? 1 : 0.9,
    alternates: {languages},
  }));
}
