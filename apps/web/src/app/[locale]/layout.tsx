import type {Metadata} from "next";
import {Inter, Newsreader} from "next/font/google";
import {hasLocale} from "next-intl";
import {getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {brand} from "@/config/brand";
import {routing} from "@/i18n/routing";

import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-interface",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});

type Props = {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({locale, namespace: "Metadata"});

  return {
    metadataBase: new URL(brand.url),
    title: {
      default: t("title", {brand: brand.name}),
      template: `%s | ${brand.name}`,
    },
    description: t("description"),
    applicationName: brand.name,
    authors: [{name: brand.name}],
    creator: brand.name,
    publisher: brand.name,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        "pt-BR": "/pt-BR",
        "en-US": "/en-US",
      },
    },
    openGraph: {
      type: "website",
      locale,
      url: `/${locale}`,
      siteName: brand.name,
      title: t("title", {brand: brand.name}),
      description: t("description"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title", {brand: brand.name}),
      description: t("description"),
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {index: false, follow: false},
    },
  };
}

export default async function LocaleLayout({children, params}: Props) {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${newsreader.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
