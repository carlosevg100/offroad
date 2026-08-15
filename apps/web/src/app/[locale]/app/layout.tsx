import {CircleGauge, FileLock2, LogOut, Plus, Route, ShieldCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {BrandMark} from "@/components/brand-mark";
import type {AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";

import {signOut} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Workspace", robots: {index: false, follow: false}};

type Props = {children: React.ReactNode; params: Promise<{locale: string}>};

export default async function ApplicationLayout({children, params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "App"});
  const {organization, membership, email} = await requireWorkspace(locale);

  return (
    <div className="application-shell">
      <aside className="app-sidebar">
        <BrandMark inverted locale={locale as AppLocale} />
        <div className="app-workspace-id">
          <span>{t("workspace")}</span>
          <strong>{organization.name}</strong>
          <small>{membership.role}</small>
        </div>
        <nav aria-label={t("workspace")} className="app-nav">
          <Link href={`/${locale}/app`}><CircleGauge aria-hidden="true" size={17} />{t("overview")}</Link>
          <Link href={`/${locale}/app/new`}><Plus aria-hidden="true" size={17} />{t("newOpportunity")}</Link>
          <Link href={`/${locale}/demo`}><Route aria-hidden="true" size={17} />{t("demo")}</Link>
          <Link href={`/${locale}/security`}><ShieldCheck aria-hidden="true" size={17} />{t("security")}</Link>
        </nav>
        <div className="app-sidebar__footer">
          <div><FileLock2 aria-hidden="true" size={15} /><span>{email}</span></div>
          <form action={signOut}>
            <input name="locale" type="hidden" value={locale} />
            <button type="submit"><LogOut aria-hidden="true" size={15} />{t("signOut")}</button>
          </form>
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
