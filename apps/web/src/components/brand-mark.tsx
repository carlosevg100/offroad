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
          src={inverted ? "/brand/offroad-capital-wordmark-inverted-v2.png" : "/brand/offroad-capital-wordmark-v2.png"}
          alt=""
          width={2036}
          height={484}
          loading="eager"
          sizes={size === "hero" ? "(max-width: 700px) 176px, 216px" : "216px"}
        />
      </span>
    </Link>
  );
}
