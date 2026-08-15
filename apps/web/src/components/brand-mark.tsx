import Link from "next/link";

import {brand} from "@/config/brand";
import type {AppLocale} from "@/i18n/routing";

type BrandMarkProps = {
  inverted?: boolean;
  locale: AppLocale;
};

export function BrandMark({inverted = false, locale}: BrandMarkProps) {
  return (
    <Link
      className="brand-mark"
      data-inverted={inverted || undefined}
      href={`/${locale}`}
      aria-label={brand.name}
    >
      <svg
        className="brand-mark__symbol"
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <path d="M5.5 23.5 12.9 8h6.2l7.4 15.5h-5.7l-1.6-3.6h-6.5l-1.6 3.6H5.5Zm9-8h3l-1.5-3.7-1.5 3.7Z" />
        <path className="brand-mark__trail" d="M4.5 27h23" />
      </svg>
      <span>{brand.name}</span>
    </Link>
  );
}
