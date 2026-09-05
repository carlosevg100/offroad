import type {Metadata} from "next";
import {cookies} from "next/headers";
import {getTranslations} from "next-intl/server";
import {capitalProjectJob, capitalProjectJobSchema} from "@offroad/work-plan";

import type {WorkspaceNavigationGroup, WorkspaceNavigationProject} from "@/components/workspace-project-navigation";
import {RAIL_COLLAPSE_COOKIE, WorkspaceRail, type WorkspaceRailCopy} from "@/components/workspace-rail";
import {IntegrationPreviewBanner} from "@/components/integration-preview/integration-preview-banner";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadIntegrationPreviewStatus} from "@/lib/integration-preview";

import {signOut} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Workspace", robots: {index: false, follow: false}};

type Props = {children: React.ReactNode; params: Promise<{locale: string}>};

export default async function ApplicationLayout({children, params}: Props) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "App"});
  const {organization, email, supabase, userId} = await requireWorkspace(locale);
  const canOriginate = organization.organization_type !== "capital_provider";
  const {data: navigationSessions} = canOriginate
    ? await supabase.from("document_intake_sessions")
        .select("id, capital_project_id, project_name, status, opportunity_id, updated_at, archived_at")
        .eq("organization_id", organization.id)
        .is("archived_at", null)
        .neq("status", "cancelled")
        .order("updated_at", {ascending: false})
        .limit(100)
    : {data: []};
  const capitalProjectIds = (navigationSessions ?? []).flatMap((session) => session.capital_project_id ? [session.capital_project_id] : []);
  const [{data: capitalProjects}, {data: workspaceGroups}] = await Promise.all([
    capitalProjectIds.length > 0
      ? supabase.from("capital_projects")
          .select("id, entry_job, current_phase, workspace_group_id")
          .eq("organization_id", organization.id)
          .in("id", capitalProjectIds)
      : Promise.resolve({data: []}),
    canOriginate
      ? supabase.from("workspace_project_groups")
          .select("id, name, auto_created, updated_at")
          .eq("organization_id", organization.id)
          .is("archived_at", null)
          .order("updated_at", {ascending: false})
          .limit(100)
      : Promise.resolve({data: []}),
  ]);
  const capitalProjectById = new Map((capitalProjects ?? []).map((project) => [project.id, project]));
  const groups: WorkspaceNavigationGroup[] = (workspaceGroups ?? []).map((group) => ({autoCreated: group.auto_created, id: group.id, name: group.name}));
  const projects: WorkspaceNavigationProject[] = (navigationSessions ?? []).map((session) => {
    const capitalProject = session.capital_project_id ? capitalProjectById.get(session.capital_project_id) : null;
    return {
    groupId: capitalProject?.workspace_group_id ?? session.capital_project_id ?? session.id,
    href: session.capital_project_id
      ? `/${locale}/app/projects/${session.capital_project_id}`
      : session.status === "confirmed" && session.opportunity_id
        ? `/${locale}/app/opportunities/${session.opportunity_id}`
        : `/${locale}/app/new?mode=documents&session=${session.id}`,
    id: session.id,
    name: session.project_name || t("untitledProject"),
    opportunityId: session.opportunity_id,
    projectId: session.capital_project_id ?? undefined,
    status: session.status,
    jobLabel: (() => {
      const parsed = capitalProjectJobSchema.safeParse(capitalProject?.entry_job);
      if (!parsed.success) return undefined;
      return capitalProjectJob(parsed.data).title[locale === "en-US" ? "en" : "pt"];
    })(),
  }});

  const railCollapsed = (await cookies()).get(RAIL_COLLAPSE_COOKIE)?.value === "1";
  const integrationPreview = await loadIntegrationPreviewStatus(supabase, organization.id);
  const {data: profile} = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const copy: WorkspaceRailCopy = {
    account: t("account"),
    actions: t("projectActions"),
    archive: t("deleteProject"),
    archiveConfirm: t("deleteProjectConfirm"),
    close: t("close"),
    collapse: t("collapseRail"),
    createFolder: t("createFolder"),
    createFolderPlaceholder: t("createFolderPlaceholder"),
    empty: t("noProjects"),
    errors: {
      denied: t("projectErrors.denied"),
      duplicate: t("projectErrors.duplicate"),
      invalid: t("projectErrors.invalid"),
      not_found: t("projectErrors.notFound"),
      save: t("projectErrors.save"),
    },
    expand: t("expandRail"),
    folders: t("folders"),
    groupActions: t("projectActions"),
    groupArchive: t("deleteProjectGroup"),
    groupArchiveConfirm: t("deleteProjectGroupConfirm"),
    language: t("language"),
    newChat: t("newChat"),
    newConversation: t("newConversation"),
    noResults: t("noProjectResults"),
    open: t("openProject"),
    overview: t("overview"),
    professionalContext: t("professionalContext"),
    recent: t("recent"),
    rename: t("renameProject"),
    save: t("saveProjectName"),
    search: t("searchProjects"),
    signOut: t("signOut"),
    status: {
      cancelled: t("projectStatus.cancelled"),
      collecting: t("projectStatus.collecting"),
      confirmed: t("projectStatus.confirmed"),
      failed: t("projectStatus.failed"),
      processing: t("projectStatus.processing"),
      review_ready: t("projectStatus.reviewReady"),
    },
    workspaceNav: t("workspaceNav"),
  };

  return (
    <div className="application-shell">
      <WorkspaceRail
        copy={copy}
        email={email}
        fullName={profile?.full_name ?? ""}
        groups={groups}
        initialCollapsed={railCollapsed}
        locale={locale === "en-US" ? "en-US" : "pt-BR"}
        organizationName={organization.name}
        projects={projects}
        showProjects={canOriginate}
        signOutAction={signOut}
      />
      <div className="app-main">
        {integrationPreview.enabled && integrationPreview.scope === "organization" ? <IntegrationPreviewBanner
          copy={{
            kicker: t("integrationPreview.kicker"),
            title: t("integrationPreview.title"),
            body: t("integrationPreview.body"),
            note: t("integrationPreview.note"),
          }}
          note={integrationPreview.note}
        /> : null}
        {children}
      </div>
    </div>
  );
}
