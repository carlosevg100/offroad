import {Building2, CircleGauge, FileLock2, Landmark, LogOut} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {BrandMark} from "@/components/brand-mark";
import {WorkspaceProjectNavigation, type WorkspaceNavigationProject} from "@/components/workspace-project-navigation";
import type {AppLocale} from "@/i18n/routing";
import {requireWorkspace} from "@/lib/auth/workspace";

import {signOut} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Workspace", robots: {index: false, follow: false}};

type Props = {children: React.ReactNode; params: Promise<{locale: string}>};

export default async function ApplicationLayout({children, params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "App"});
  const {organization, membership, email, supabase} = await requireWorkspace(locale);
  const canOriginate = organization.organization_type !== "capital_provider";
  const {data: navigationSessions} = canOriginate
    ? await supabase.from("document_intake_sessions")
        .select("id, project_name, status, opportunity_id, updated_at, archived_at")
        .eq("organization_id", organization.id)
        .is("archived_at", null)
        .neq("status", "cancelled")
        .order("updated_at", {ascending: false})
        .limit(100)
    : {data: []};
  const projects: WorkspaceNavigationProject[] = (navigationSessions ?? []).map((session) => ({
    href: session.status === "confirmed" && session.opportunity_id
      ? `/${locale}/app/opportunities/${session.opportunity_id}`
      : `/${locale}/app/new?mode=documents&session=${session.id}`,
    id: session.id,
    name: session.project_name || t("untitledProject"),
    opportunityId: session.opportunity_id,
    status: session.status,
  }));

  return (
    <div className="application-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand"><BrandMark inverted locale={locale as AppLocale} /></div>
        <div className="app-workspace-id">
          <span className="app-workspace-id__icon">{canOriginate ? <Building2 aria-hidden="true" size={15} /> : <Landmark aria-hidden="true" size={15} />}</span>
          <span><small>{t("workspace")}</small><strong>{organization.name}</strong><em>{membership.role}</em></span>
        </div>
        <nav aria-label={t("workspace")} className="app-nav">
          <div className="app-nav__group">
            <p>{t("workspaceNav")}</p>
            <Link href={`/${locale}/app`}><CircleGauge aria-hidden="true" size={16} /><span>{t("overview")}</span></Link>
          </div>
          {canOriginate ? <WorkspaceProjectNavigation
            copy={{
              actions: t("projectActions"),
              archive: t("deleteProject"),
              archiveConfirm: t("deleteProjectConfirm"),
              empty: t("noProjects"),
              errors: {
                denied: t("projectErrors.denied"),
                duplicate: t("projectErrors.duplicate"),
                invalid: t("projectErrors.invalid"),
                not_found: t("projectErrors.notFound"),
                save: t("projectErrors.save"),
              },
              newProject: organization.organization_type === "company" ? t("newCapitalNeed") : t("newOpportunity"),
              noResults: t("noProjectResults"),
              open: t("openProject"),
              projects: t("projects"),
              rename: t("renameProject"),
              save: t("saveProjectName"),
              search: t("searchProjects"),
              status: {
                cancelled: t("projectStatus.cancelled"),
                collecting: t("projectStatus.collecting"),
                confirmed: t("projectStatus.confirmed"),
                failed: t("projectStatus.failed"),
                processing: t("projectStatus.processing"),
                review_ready: t("projectStatus.reviewReady"),
              },
            }}
            locale={locale}
            projects={projects}
          /> : <div className="app-nav__group"><p>{t("projects")}</p><Link href={`/${locale}/app#funds`}><Landmark aria-hidden="true" size={16} /><span>{t("fundsAndMandates")}</span></Link></div>}
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
