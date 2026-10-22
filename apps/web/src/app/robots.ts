import type {MetadataRoute} from "next";

import {brand} from "@/config/brand";
import {routing} from "@/i18n/routing";
import {dataFiles, dataPath, dataRoutes, publicPages, publicPath, type DataPage} from "@/lib/website-routes";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
      allow: ["/_next/static/", "/_next/image", "/brand/", "/website/", ...publicPages.flatMap(page => routing.locales.map(locale => `${publicPath(locale,page)}$`)),
        ...(Object.keys(dataRoutes) as DataPage[]).flatMap(page => [...routing.locales.map(locale => `${dataPath(locale,page)}$`), `${dataFiles[page]}$`])],
    },
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
