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
          src={inverted ? "/brand/offroad-lockup-inverted.png" : "/brand/offroad-lockup.png"}
          alt=""
          width={1600}
          height={482}
          loading="eager"
          sizes={size === "hero" ? "(max-width: 700px) 150px, 180px" : "180px"}
        />
        <span className="brand-mark__signature">
          <span>{brand.signatureLead}</span>
          <strong>{brand.signatureSubject}</strong>
        </span>
      </span>
    </Link>
  );
}
