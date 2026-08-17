import {Bell, Building2, ChevronDown, ChevronRight, CircleGauge, FileLock2, FolderOpen, Landmark, LogOut, Plus, Route, Search, Settings2, ShieldCheck} from "lucide-react";
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
  const canOriginate = organization.organization_type !== "capital_provider";

  return (
    <div className="application-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand"><BrandMark inverted locale={locale as AppLocale} /></div>
        <button className="app-workspace-id" type="button">
          <span className="app-workspace-id__icon">{canOriginate ? <Building2 aria-hidden="true" size={15} /> : <Landmark aria-hidden="true" size={15} />}</span>
          <span><small>{t("workspace")}</small><strong>{organization.name}</strong><em>{membership.role}</em></span>
          <ChevronDown aria-hidden="true" size={14} />
        </button>
        <button className="app-search" type="button"><Search aria-hidden="true" size={14} /><span>{t("search")}</span><kbd>⌘ K</kbd></button>
        <nav aria-label={t("workspace")} className="app-nav">
          <div className="app-nav__group">
            <p>{t("workspaceNav")}</p>
            <Link href={`/${locale}/app`}><CircleGauge aria-hidden="true" size={16} /><span>{t("overview")}</span></Link>
            <Link href={`/${locale}/app#activity`}><Bell aria-hidden="true" size={16} /><span>{t("notifications")}</span><small>0</small></Link>
          </div>
          <div className="app-nav__group app-nav__projects">
            <p>{t("projects")}</p>
            {canOriginate ? (
              <div className="app-project-tree">
                <div><ChevronDown aria-hidden="true" size={13} /><FolderOpen aria-hidden="true" size={15} /><strong>{t("opportunityWorkspace")}</strong></div>
                <Link href={`/${locale}/app/new`}><ChevronRight aria-hidden="true" size={12} /><Plus aria-hidden="true" size={14} /><span>{organization.organization_type === "company" ? t("newCapitalNeed") : t("newOpportunity")}</span></Link>
              </div>
            ) : <Link href={`/${locale}/app#funds`}><Landmark aria-hidden="true" size={16} /><span>{t("fundsAndMandates")}</span></Link>}
          </div>
          <div className="app-nav__group">
            <p>{t("resources")}</p>
            <Link href={`/${locale}/demo`}><Route aria-hidden="true" size={16} /><span>{t("demo")}</span></Link>
            <Link href={`/${locale}/#seguranca`}><ShieldCheck aria-hidden="true" size={16} /><span>{t("security")}</span></Link>
            <Link href={`/${locale}/app#settings`}><Settings2 aria-hidden="true" size={16} /><span>{t("settings")}</span></Link>
          </div>
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
