import Link from "next/link";
import Image from "next/image";

import {brand} from "@/config/brand";
import type {AppLocale} from "@/i18n/routing";

type BrandMarkProps = {
  inverted?: boolean;
  locale: AppLocale;
  size?: "default" | "hero";
};

export function BrandMark({inverted = false, locale, size = "default"}: BrandMarkProps) {
  return (
    <Link
      className="brand-mark"
      data-inverted={inverted || undefined}
      data-size={size}
      href={`/${locale}`}
      aria-label={brand.name}
    >
      <span className="brand-mark__asset-frame" aria-hidden="true">
        <Image
          className="brand-mark__asset"
          src="/brand/offroad-capital-logo.png"
          alt=""
          width={1536}
          height={1024}
          loading="eager"
          sizes={size === "hero" ? "(max-width: 700px) 90vw, 760px" : "220px"}
        />
      </span>
    </Link>
  );
}
