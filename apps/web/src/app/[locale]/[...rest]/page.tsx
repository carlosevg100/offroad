import {notFound} from "next/navigation";
import {PublicShell} from "@/components/public-site";
import {PublicPageContent} from "@/components/public-content";
import type {AppLocale} from "@/i18n/routing";
import {publicPages, publicPath, resolvePublicPage} from "@/lib/website-routes";
import {websiteMetadata} from "@/lib/website-metadata";

type Props = {params: Promise<{locale: string; rest: string[]}>};

export function generateStaticParams({params}: {params: {locale: string}}) {
  return publicPages.filter(page => page !== "home").map(page => ({rest: publicPath(params.locale as AppLocale,page).split("/").slice(2)}));
}

export async function generateMetadata({params}: Props) {
  const {locale, rest} = await params;
  const page = resolvePublicPage(locale as AppLocale, rest);
  if (!page || page === "home") notFound();
  return websiteMetadata(locale as AppLocale, page);
}

/** Only explicit public routes are served; application and auth routes retain precedence. */
export default async function CatchAllPage({params}: Props) {
  const {locale, rest} = await params;
  const page = resolvePublicPage(locale as AppLocale, rest);
  if (!page || page === "home") notFound();
  return <PublicShell locale={locale as AppLocale} page={page}><PublicPageContent locale={locale as AppLocale} page={page}/></PublicShell>;
}
