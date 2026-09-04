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
    manifest: "/site.webmanifest?v=4",
    icons: {
      icon: [
        {url: "/favicon.ico?v=4", sizes: "16x16 32x32 48x48", type: "image/x-icon"},
        {url: "/icon.svg?v=4", sizes: "any", type: "image/svg+xml"},
        {url: "/icon-192.png?v=4", sizes: "192x192", type: "image/png"},
        {url: "/icon-512.png?v=4", sizes: "512x512", type: "image/png"},
      ],
      apple: [{url: "/apple-touch-icon.png?v=4", sizes: "180x180", type: "image/png"}],
      shortcut: [{url: "/favicon.ico?v=4", type: "image/x-icon"}],
    },
    openGraph: {
      type: "website",
      locale,
      url: `/${locale}`,
      siteName: brand.name,
      title: brand.browserTitle,
      description: brand.description,
      images: [{
        url: "/social-preview.png?v=6",
        width: 1200,
        height: 630,
        alt: `${brand.name}. ${brand.socialHeadline}`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: brand.browserTitle,
      description: brand.description,
      images: [{url: "/social-preview.png?v=6", alt: `${brand.name}. ${brand.socialHeadline}`}],
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

  // Keep the client bundle narrow, but include every namespace consumed by client
  // components. Omitting one makes next-intl render the key itself in production.
  const messages = await getMessages({locale});
  const clientMessages = {
    App: {privateCase: messages.App.privateCase},
    Errors: messages.Errors,
    Navigation: messages.Navigation,
  };

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
        logo: `${brand.url}/brand/offroad-lockup.png?v=4`,
        image: `${brand.url}/social-preview.png?v=6`,
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
        description: brand.description,
        featureList: brand.capabilities,
        image: `${brand.url}/social-preview.png?v=6`,
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
