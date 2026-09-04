"use client";

import {Archive, Check, ChevronRight, MessageSquarePlus, MoreHorizontal, Pencil, X} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useActionState, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

import {
  archiveWorkspaceProject,
  archiveWorkspaceProjectGroup,
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

export type WorkspaceNavigationCopy = {
  actions: string;
  archive: string;
  archiveConfirm: string;
  close: string;
  empty: string;
  errors: Record<NonNullable<WorkspaceProjectActionState["code"]>, string>;
  groupActions: string;
  groupArchive: string;
  groupArchiveConfirm: string;
  newConversation: string;
  noResults: string;
  open: string;
  rename: string;
  save: string;
  search: string;
  status: Record<string, string>;
  workspaceNav: string;
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

export function ProjectActions({copy, locale, project}: {copy: WorkspaceNavigationCopy; locale: string; project: WorkspaceNavigationProject}) {
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

export function GroupActions({copy, group, locale}: {copy: WorkspaceNavigationCopy; group: WorkspaceNavigationGroup; locale: string}) {
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
