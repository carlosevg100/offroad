import type {MetadataRoute} from "next";

import {brand} from "@/config/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
