import {PublicHome} from "@/components/public-site";
import type {AppLocale} from "@/i18n/routing";
import {websiteMetadata} from "@/lib/website-metadata";

type Props = {
  params: Promise<{locale: string}>;
};

export async function generateMetadata({params}: Props) {
  return websiteMetadata((await params).locale as AppLocale,"home");
}

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  const appLocale = locale as AppLocale;

  return <PublicHome locale={appLocale} />;
}
