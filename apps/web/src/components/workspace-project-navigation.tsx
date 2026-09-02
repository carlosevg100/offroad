"use client";

import {Archive, Check, ChevronDown, ChevronRight, Folder, FolderPlus, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Search, X} from "lucide-react";
import Link from "next/link";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useActionState, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";

import {
  archiveWorkspaceProject,
  archiveWorkspaceProjectGroup,
  createWorkspaceProjectGroup,
  renameWorkspaceProject,
  renameWorkspaceProjectGroup,
  type WorkspaceProjectActionState,
} from "@/app/[locale]/app/actions";

export type WorkspaceNavigationProject = {
  groupId: string;
  href: string;
  id: string;
  projectId?: string;
  name: string;
  opportunityId: string | null;
  status: string;
  jobLabel?: string;
};

export type WorkspaceNavigationGroup = {id: string; name: string};

type Copy = {
  actions: string;
  archive: string;
  archiveConfirm: string;
  close: string;
  createGroup: string;
  createGroupPlaceholder: string;
  empty: string;
  emptyGroup: string;
  errors: Record<NonNullable<WorkspaceProjectActionState["code"]>, string>;
  groupActions: string;
  groupArchive: string;
  groupArchiveConfirm: string;
  newConversation: string;
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
  groups: WorkspaceNavigationGroup[];
  locale: string;
  projects: WorkspaceNavigationProject[];
};

const initialActionState: WorkspaceProjectActionState = {ok: false};

function useFloatingMenu() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({left: 8, top: 8});

  function toggle() {
    if (open) return setOpen(false);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({
      left: Math.max(8, Math.min(rect.right - 216, window.innerWidth - 224)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 230)),
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return {buttonRef, open, position, setOpen, toggle};
}

function ProjectActions({copy, locale, project}: {copy: Copy; locale: string; project: WorkspaceNavigationProject}) {
  const router = useRouter();
  const {buttonRef, open, position, setOpen, toggle} = useFloatingMenu();
  const [renaming, setRenaming] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState(renameWorkspaceProject, initialActionState);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveWorkspaceProject, initialActionState);

  useEffect(() => {
    if (!renameState.ok) return;
    router.refresh();
  }, [renameState.ok, router]);
  useEffect(() => {
    if (!archiveState.ok) return;
    router.replace(`/${locale}/app`);
    router.refresh();
  }, [archiveState.ok, locale, router]);

  const errorCode = renameState.code ?? archiveState.code;
  const content = open ? (
    <><button aria-label={copy.close} className="workspace-project-actions__backdrop" onClick={() => setOpen(false)} type="button" />
    <div className="workspace-project-actions__menu workspace-project-actions__menu--floating" style={position}>
      <Link href={project.href} onClick={() => setOpen(false)}><ChevronRight aria-hidden="true" size={14} />{copy.open}</Link>
      {renaming ? (
        <form action={renameAction} onSubmit={() => {setRenaming(false); setOpen(false);}}>
          <input name="locale" type="hidden" value={locale} />
          <input name="session_id" type="hidden" value={project.id} />
          <label><span><Pencil aria-hidden="true" size={13} />{copy.rename}</span><input autoFocus defaultValue={project.name} maxLength={80} minLength={2} name="project_name" required /></label>
          <div className="workspace-project-actions__row">
            <button className="is-quiet" onClick={() => setRenaming(false)} type="button"><X aria-hidden="true" size={13} /></button>
            <button disabled={renamePending} type="submit"><Check aria-hidden="true" size={13} />{copy.save}</button>
          </div>
        </form>
      ) : <button className="workspace-project-actions__plain" onClick={() => setRenaming(true)} type="button"><Pencil aria-hidden="true" size={13} />{copy.rename}</button>}
      <form action={archiveAction} onSubmit={(event) => {
        if (!window.confirm(copy.archiveConfirm.replace("{project}", project.name))) event.preventDefault();
      }}>
        <input name="locale" type="hidden" value={locale} />
        <input name="session_id" type="hidden" value={project.id} />
        <button className="workspace-project-actions__archive" disabled={archivePending} type="submit"><Archive aria-hidden="true" size={13} />{copy.archive}</button>
      </form>
      {errorCode ? <p role="alert"><X aria-hidden="true" size={12} />{copy.errors[errorCode]}</p> : null}
    </div></>
  ) : null;

  return <>
    <button aria-expanded={open} aria-label={`${copy.actions}: ${project.name}`} className="workspace-project-actions__trigger" onClick={toggle} ref={buttonRef} title={copy.actions} type="button"><MoreHorizontal aria-hidden="true" size={15} /></button>
    {content && typeof document !== "undefined" ? createPortal(content, document.body) : null}
  </>;
}

function GroupActions({copy, group, locale}: {copy: Copy; group: WorkspaceNavigationGroup; locale: string}) {
  const router = useRouter();
  const {buttonRef, open, position, setOpen, toggle} = useFloatingMenu();
  const [renaming, setRenaming] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState(renameWorkspaceProjectGroup, initialActionState);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveWorkspaceProjectGroup, initialActionState);

  useEffect(() => {
    if (!renameState.ok) return;
    router.refresh();
  }, [renameState.ok, router]);
  useEffect(() => {
    if (!archiveState.ok) return;
    router.replace(`/${locale}/app`);
    router.refresh();
  }, [archiveState.ok, locale, router]);

  const errorCode = renameState.code ?? archiveState.code;
  const content = open ? (
    <><button aria-label={copy.close} className="workspace-project-actions__backdrop" onClick={() => setOpen(false)} type="button" />
    <div className="workspace-project-actions__menu workspace-project-actions__menu--floating" style={position}>
      <Link href={`/${locale}/app?group=${group.id}`} onClick={() => setOpen(false)}><MessageSquarePlus aria-hidden="true" size={14} />{copy.newConversation}</Link>
      {renaming ? (
        <form action={renameAction} onSubmit={() => {setRenaming(false); setOpen(false);}}>
          <input name="locale" type="hidden" value={locale} />
          <input name="group_id" type="hidden" value={group.id} />
          <label><span><Pencil aria-hidden="true" size={13} />{copy.rename}</span><input autoFocus defaultValue={group.name} maxLength={80} minLength={2} name="group_name" required /></label>
          <div className="workspace-project-actions__row">
            <button className="is-quiet" onClick={() => setRenaming(false)} type="button"><X aria-hidden="true" size={13} /></button>
            <button disabled={renamePending} type="submit"><Check aria-hidden="true" size={13} />{copy.save}</button>
          </div>
        </form>
      ) : <button className="workspace-project-actions__plain" onClick={() => setRenaming(true)} type="button"><Pencil aria-hidden="true" size={13} />{copy.rename}</button>}
      <form action={archiveAction} onSubmit={(event) => {
        if (!window.confirm(copy.groupArchiveConfirm.replace("{project}", group.name))) event.preventDefault();
      }}>
        <input name="locale" type="hidden" value={locale} />
        <input name="group_id" type="hidden" value={group.id} />
        <button className="workspace-project-actions__archive" disabled={archivePending} type="submit"><Archive aria-hidden="true" size={13} />{copy.groupArchive}</button>
      </form>
      {errorCode ? <p role="alert"><X aria-hidden="true" size={12} />{copy.errors[errorCode]}</p> : null}
    </div></>
  ) : null;

  return <>
    <button aria-expanded={open} aria-label={`${copy.groupActions}: ${group.name}`} className="workspace-project-actions__trigger" onClick={(event) => {event.preventDefault(); toggle();}} ref={buttonRef} title={copy.groupActions} type="button"><MoreHorizontal aria-hidden="true" size={15} /></button>
    {content && typeof document !== "undefined" ? createPortal(content, document.body) : null}
  </>;
}

export function WorkspaceProjectNavigation({copy, groups, locale, projects}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createState, createAction, createPending] = useActionState(createWorkspaceProjectGroup, initialActionState);
  const activeSessionId = searchParams.get("session");
  const activeProject = projects.find((project) => activeSessionId === project.id || Boolean(project.projectId && pathname.includes(`/projects/${project.projectId}`)) || Boolean(project.opportunityId && pathname.includes(`/opportunities/${project.opportunityId}`)));
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);

  useEffect(() => {
    if (!createState.ok || !createState.id) return;
    router.push(`/${locale}/app?group=${createState.id}`);
    router.refresh();
  }, [createState.id, createState.ok, locale, router]);

  const visibleGroups = useMemo(() => groups.map((group) => {
    const children = projects.filter((project) => project.groupId === group.id);
    if (!normalizedQuery) return {group, children};
    const groupMatches = group.name.toLocaleLowerCase(locale).includes(normalizedQuery);
    const matchingChildren = children.filter((project) => `${project.name} ${project.jobLabel ?? ""}`.toLocaleLowerCase(locale).includes(normalizedQuery));
    return groupMatches || matchingChildren.length > 0 ? {group, children: groupMatches ? children : matchingChildren} : null;
  }).filter((item): item is {group: WorkspaceNavigationGroup; children: WorkspaceNavigationProject[]} => item !== null), [groups, locale, normalizedQuery, projects]);

  return <div className="workspace-project-navigation">
    <div className="workspace-project-navigation__header">
      <p>{copy.projects}</p>
      <button aria-label={copy.createGroup} onClick={() => setCreating((current) => !current)} title={copy.createGroup} type="button"><Plus aria-hidden="true" size={15} /></button>
    </div>

    {creating ? <form action={createAction} className="workspace-project-create">
      <input name="locale" type="hidden" value={locale} />
      <FolderPlus aria-hidden="true" size={14} />
      <input aria-label={copy.createGroup} autoFocus maxLength={80} minLength={2} name="group_name" placeholder={copy.createGroupPlaceholder} required />
      <button aria-label={copy.save} disabled={createPending} type="submit"><Check aria-hidden="true" size={13} /></button>
      <button aria-label={copy.close} onClick={() => setCreating(false)} type="button"><X aria-hidden="true" size={13} /></button>
      {createState.code ? <p role="alert">{copy.errors[createState.code]}</p> : null}
    </form> : null}

    {groups.length > 0 ? <label className="workspace-project-search"><Search aria-hidden="true" size={13} /><span className="sr-only">{copy.search}</span><input onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} type="search" value={query} /></label> : null}

    <div className="workspace-project-list" role="list">
      {visibleGroups.map(({group, children}) => {
        const active = activeProject?.groupId === group.id || searchParams.get("group") === group.id;
        return <details className={active ? "workspace-project-group is-active" : "workspace-project-group"} key={group.id} open={active || Boolean(normalizedQuery)} role="listitem">
          <summary><ChevronDown aria-hidden="true" className="workspace-project-group__chevron" size={12} /><Folder aria-hidden="true" size={13} /><strong title={group.name}>{group.name}</strong><span>{children.length}</span><GroupActions copy={copy} group={group} locale={locale} /></summary>
          <div className="workspace-project-group__children">
            {children.map((project) => {
              const selected = activeSessionId === project.id || Boolean(project.projectId && pathname.includes(`/projects/${project.projectId}`)) || Boolean(project.opportunityId && pathname.includes(`/opportunities/${project.opportunityId}`));
              return <div className={selected ? "workspace-project is-active" : "workspace-project"} key={project.id}>
                <Link aria-current={selected ? "page" : undefined} href={project.href} title={project.name}><span className={`workspace-project__state workspace-project__state--${project.status}`} /><span><strong>{project.name}</strong><small>{project.jobLabel ?? (copy.status[project.status] ?? copy.status.collecting)}</small></span></Link>
                <ProjectActions copy={copy} locale={locale} project={project} />
              </div>;
            })}
            {children.length === 0 ? <span className="workspace-project-group__empty">{copy.emptyGroup}</span> : null}
            <Link className="workspace-project-group__new" href={`/${locale}/app?group=${group.id}`}><MessageSquarePlus aria-hidden="true" size={12} />{copy.newConversation}</Link>
          </div>
        </details>;
      })}
      {groups.length === 0 ? <div className="workspace-project-list__empty"><Folder aria-hidden="true" size={15} /><span>{copy.empty}</span></div> : null}
      {groups.length > 0 && visibleGroups.length === 0 ? <div className="workspace-project-list__empty"><Search aria-hidden="true" size={15} /><span>{copy.noResults}</span></div> : null}
    </div>

    <button className="workspace-project-navigation__new" onClick={() => setCreating(true)} type="button"><Plus aria-hidden="true" size={14} /><span>{copy.createGroup}</span></button>
  </div>;
}
