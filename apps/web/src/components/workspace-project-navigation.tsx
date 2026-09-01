"use client";

import {Archive, Check, ChevronRight, FolderOpen, MoreHorizontal, Pencil, Plus, Search, X} from "lucide-react";
import Link from "next/link";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useActionState, useEffect, useMemo, useRef, useState} from "react";

import {
  archiveWorkspaceProject,
  renameWorkspaceProject,
  type WorkspaceProjectActionState,
} from "@/app/[locale]/app/actions";

export type WorkspaceNavigationProject = {
  href: string;
  id: string;
  projectId?: string;
  name: string;
  opportunityId: string | null;
  status: string;
  jobLabel?: string;
};

type Copy = {
  actions: string;
  archive: string;
  archiveConfirm: string;
  empty: string;
  errors: Record<NonNullable<WorkspaceProjectActionState["code"]>, string>;
  newProject: string;
  noResults: string;
  open: string;
  projects: string;
  rename: string;
  save: string;
  search: string;
  status: Record<string, string>;
};

type Props = {
  copy: Copy;
  locale: string;
  projects: WorkspaceNavigationProject[];
};

const initialActionState: WorkspaceProjectActionState = {ok: false};

function ProjectActions({copy, locale, project}: {copy: Copy; locale: string; project: WorkspaceNavigationProject}) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [renameState, renameAction, renamePending] = useActionState(renameWorkspaceProject, initialActionState);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveWorkspaceProject, initialActionState);

  useEffect(() => {
    if (!renameState.ok) return;
    if (detailsRef.current) detailsRef.current.open = false;
    router.refresh();
  }, [renameState.ok, router]);

  useEffect(() => {
    if (!archiveState.ok) return;
    router.replace(`/${locale}/app`);
    router.refresh();
  }, [archiveState.ok, locale, router]);

  const errorCode = renameState.code ?? archiveState.code;

  return (
    <details className="workspace-project-actions" ref={detailsRef}>
      <summary aria-label={`${copy.actions}: ${project.name}`} title={copy.actions}><MoreHorizontal aria-hidden="true" size={15} /></summary>
      <div className="workspace-project-actions__menu">
        <Link href={project.href}><ChevronRight aria-hidden="true" size={14} />{copy.open}</Link>
        <form action={renameAction}>
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={project.id} />
          <label><span><Pencil aria-hidden="true" size={13} />{copy.rename}</span><input defaultValue={project.name} maxLength={80} minLength={2} name="project_name" required /></label>
          <button disabled={renamePending} type="submit"><Check aria-hidden="true" size={13} />{copy.save}</button>
        </form>
        <form
          action={archiveAction}
          onSubmit={(event) => {
            if (!window.confirm(copy.archiveConfirm.replace("{project}", project.name))) event.preventDefault();
          }}
        >
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={project.id} />
          <button className="workspace-project-actions__archive" disabled={archivePending} type="submit"><Archive aria-hidden="true" size={13} />{copy.archive}</button>
        </form>
        {errorCode ? <p role="alert"><X aria-hidden="true" size={12} />{copy.errors[errorCode]}</p> : null}
      </div>
    </details>
  );
}

export function WorkspaceProjectNavigation({copy, locale, projects}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const activeSessionId = searchParams.get("session");
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const visibleProjects = useMemo(() => normalizedQuery
    ? projects.filter((project) => `${project.name} ${project.jobLabel ?? ""}`.toLocaleLowerCase(locale).includes(normalizedQuery))
    : projects, [locale, normalizedQuery, projects]);

  return (
    <div className="workspace-project-navigation">
      <div className="workspace-project-navigation__header">
        <p>{copy.projects}</p>
        <Link aria-label={copy.newProject} href={`/${locale}/app/new`} title={copy.newProject}><Plus aria-hidden="true" size={15} /></Link>
      </div>

      {projects.length > 0 ? (
        <label className="workspace-project-search">
          <Search aria-hidden="true" size={13} />
          <span className="sr-only">{copy.search}</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} type="search" value={query} />
        </label>
      ) : null}

      <div className="workspace-project-list" role="list">
        {visibleProjects.map((project) => {
          const active = activeSessionId === project.id
            || Boolean(project.projectId && pathname.includes(`/projects/${project.projectId}`))
            || Boolean(project.opportunityId && pathname.includes(`/opportunities/${project.opportunityId}`));
          return (
            <div className={active ? "workspace-project is-active" : "workspace-project"} key={project.id} role="listitem">
              <Link aria-current={active ? "page" : undefined} href={project.href} title={project.name}>
                <span className={`workspace-project__state workspace-project__state--${project.status}`} />
                <span><strong>{project.name}</strong><small>{project.jobLabel ?? (copy.status[project.status] ?? copy.status.collecting)}</small></span>
              </Link>
              <ProjectActions copy={copy} locale={locale} project={project} />
            </div>
          );
        })}
        {projects.length === 0 ? <div className="workspace-project-list__empty"><FolderOpen aria-hidden="true" size={15} /><span>{copy.empty}</span></div> : null}
        {projects.length > 0 && visibleProjects.length === 0 ? <div className="workspace-project-list__empty"><Search aria-hidden="true" size={15} /><span>{copy.noResults}</span></div> : null}
      </div>

      <Link className="workspace-project-navigation__new" href={`/${locale}/app/new`}><Plus aria-hidden="true" size={14} /><span>{copy.newProject}</span></Link>
    </div>
  );
}
