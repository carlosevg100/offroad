import {HomeLanding} from "@/components/home-landing";
import {SiteHeader} from "@/components/site-header";
import type {AppLocale} from "@/i18n/routing";

type Props = {
  params: Promise<{locale: string}>;
};

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  const appLocale = locale as AppLocale;

  return (
    <>
      <SiteHeader locale={appLocale} variant="landing" />
      <HomeLanding locale={appLocale} />
    </>
  );
}
