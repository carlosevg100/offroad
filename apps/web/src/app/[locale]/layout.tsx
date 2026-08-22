import type {Metadata} from "next";
import {Inter, Newsreader} from "next/font/google";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages} from "next-intl/server";
import {notFound} from "next/navigation";

import {brand} from "@/config/brand";
import {routing} from "@/i18n/routing";

import "../globals.css";
import "../offroad-premium.css";

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

  return {
    metadataBase: new URL(brand.url),
    title: {
      default: brand.browserTitle,
      template: `%s | ${brand.name}`,
    },
    description: brand.description,
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
    manifest: "/site.webmanifest?v=3",
    icons: {
      icon: [
        {url: "/favicon.ico?v=3", sizes: "16x16 32x32 48x48", type: "image/x-icon"},
        {url: "/icon.svg?v=3", sizes: "any", type: "image/svg+xml"},
        {url: "/icon-192.png?v=3", sizes: "192x192", type: "image/png"},
        {url: "/icon-512.png?v=3", sizes: "512x512", type: "image/png"},
      ],
      apple: [{url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png"}],
      shortcut: [{url: "/favicon.ico?v=3", type: "image/x-icon"}],
    },
    openGraph: {
      type: "website",
      locale,
      url: `/${locale}`,
      siteName: brand.name,
      title: brand.browserTitle,
      description: brand.description,
      images: [{
        url: "/social-preview.png?v=3",
        width: 1200,
        height: 630,
        alt: `${brand.name}. ${brand.socialHeadline}`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: brand.browserTitle,
      description: brand.description,
      images: [{url: "/social-preview.png?v=3", alt: `${brand.name}. ${brand.socialHeadline}`}],
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

  // Only the error copy crosses to the client (error boundaries cannot use server translations).
  const messages = await getMessages({locale});
  const clientMessages = {Errors: messages.Errors};

  const organizationId = `${brand.url}/#organization`;
  const websiteId = `${brand.url}/#website`;
  const applicationId = `${brand.url}/#software-application`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: brand.name,
        url: brand.url,
        logo: `${brand.url}/brand/offroad-capital-logo.png?v=3`,
        image: `${brand.url}/social-preview.png?v=3`,
        email: brand.email,
        description: brand.description,
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: brand.name,
        url: brand.url,
        description: brand.description,
        inLanguage: ["en-US", "pt-BR"],
        publisher: {"@id": organizationId},
      },
      {
        "@type": "SoftwareApplication",
        "@id": applicationId,
        name: brand.name,
        url: brand.url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: "Offroad Capital organizes and reconciles borrower information, structures private credit opportunities, prepares standardized investor materials, and matches opportunities with aligned private credit mandates.",
        featureList: [
          "Organizes and reconciles borrower information",
          "Structures private credit opportunities",
          "Prepares standardized investor materials",
          "Matches opportunities with aligned private credit mandates",
        ],
        image: `${brand.url}/social-preview.png?v=3`,
        provider: {"@id": organizationId},
      },
    ],
  };

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${newsreader.variable}`}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
