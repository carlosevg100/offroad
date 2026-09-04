"use client";

import {Check, ChevronDown, ChevronRight, CircleGauge, LogOut, PanelLeft, Plus, Search, UserRoundCog, X} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useActionState, useCallback, useEffect, useMemo, useRef, useState} from "react";

import {ProjectActions, GroupActions, type WorkspaceNavigationGroup, type WorkspaceNavigationProject, type WorkspaceNavigationCopy} from "@/components/workspace-project-navigation";
import {WorkspaceLanguageSwitcher} from "@/components/workspace-language-switcher";
import {createWorkspaceProjectGroup, type WorkspaceProjectActionState} from "@/app/[locale]/app/actions";

export const RAIL_COLLAPSE_COOKIE = "offroad_rail_collapsed";

const initialActionState: WorkspaceProjectActionState = {ok: false};

export type WorkspaceRailCopy = WorkspaceNavigationCopy & {
  createFolder: string;
  createFolderPlaceholder: string;
  collapse: string;
  expand: string;
  newChat: string;
  overview: string;
  professionalContext: string;
  recent: string;
  folders: string;
  language: string;
  signOut: string;
  account: string;
};

type Props = {
  copy: WorkspaceRailCopy;
  email: string;
  fullName: string;
  groups: WorkspaceNavigationGroup[];
  locale: "pt-BR" | "en-US";
  organizationName: string;
  initialCollapsed: boolean;
  projects: WorkspaceNavigationProject[];
  showProjects: boolean;
  signOutAction: (formData: FormData) => void | Promise<void>;
};

/**
 * The rail is one client component because collapse, search and the keyboard
 * shortcuts are a single piece of state. Splitting them across the server layout
 * is what previously left the search input buried inside the project list.
 */
export function WorkspaceRail(props: Props) {
  const {copy, locale, projects, groups} = props;
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(props.initialCollapsed);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createState, createAction, createPending] = useActionState(createWorkspaceProjectGroup, initialActionState);

  /**
   * The preference travels in a cookie rather than local storage so the server
   * renders the rail already in the chosen state. Reading it after mount would
   * either flash the wrong width or mismatch hydration.
   */
  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      document.cookie = `${RAIL_COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!createState.ok || !createState.id) return;
    router.push(`/${locale}/app?group=${createState.id}`);
    router.refresh();
  }, [createState.id, createState.ok, locale, router]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key === "k") {
        event.preventDefault();
        setCollapsed(false);
        setSearching(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === "j") {
        event.preventDefault();
        router.push(`/${locale}/app`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locale, router]);

  const activeProject = useMemo(() => projects.find((project) => (
    search.get("session") === project.id
      || Boolean(project.projectId && pathname.includes(`/projects/${project.projectId}`))
      || Boolean(project.opportunityId && pathname.includes(`/opportunities/${project.opportunityId}`))
  )), [pathname, projects, search]);

  const normalized = query.trim().toLocaleLowerCase(locale);
  const matches = useCallback((project: WorkspaceNavigationProject) => (
    !normalized || `${project.name} ${project.jobLabel ?? ""}`.toLocaleLowerCase(locale).includes(normalized)
  ), [locale, normalized]);

  /**
   * A database trigger creates one folder per project, named after it, and those are
   * noise: a conversation nested under a folder repeating its own name is what made
   * starting work read as two steps. The database marks them, so this is a fact rather
   * than a guess. Matching on the name would break the moment either side is renamed,
   * and matching on the child count would hide a real folder that holds one
   * conversation. Renaming a folder clears the mark, because naming it is the act that
   * makes it the person's own.
   */
  const visibleFolders = useMemo(() => groups
    .filter((group) => !group.autoCreated)
    .map((group) => ({group, children: projects.filter((project) => project.groupId === group.id)}))
    .map((entry) => ({group: entry.group, children: entry.children.filter(matches)}))
    .filter((entry) => !normalized
      || entry.children.length > 0
      || entry.group.name.toLocaleLowerCase(locale).includes(normalized)), [groups, locale, matches, normalized, projects]);

  const foldered = useMemo(
    () => new Set(visibleFolders.flatMap((entry) => entry.children.map((project) => project.id))),
    [visibleFolders],
  );
  const recents = projects.filter((project) => matches(project) && !foldered.has(project.id));
  const empty = recents.length === 0 && visibleFolders.length === 0;

  function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "··";
    return (parts[0]!.slice(0, 1) + (parts[1]?.slice(0, 1) ?? parts[0]!.slice(1, 2))).toLocaleUpperCase(locale);
  }

  return (
    <aside className="app-rail" data-collapsed={collapsed || undefined}>
      <div className="app-rail__head">
        <Link aria-label="Offroad" className="app-rail__brand" href={`/${locale}/app`}>
          <Image
            alt="Offroad"
            className="app-rail__lockup"
            height={482}
            priority
            src="/brand/offroad-lockup-inverted.png"
            width={1600}
          />
          <Image
            alt="Offroad"
            className="app-rail__glyph"
            height={520}
            priority
            src="/brand/offroad-symbol-inverted.png"
            width={512}
          />
        </Link>
        <button
          aria-label={collapsed ? copy.expand : copy.collapse}
          className="app-rail__ghost"
          onClick={toggleCollapsed}
          title={collapsed ? copy.expand : copy.collapse}
          type="button"
        ><PanelLeft aria-hidden="true" size={15} /></button>
      </div>

      <div className="app-rail__actions">
        <Link className="app-rail__row app-rail__row--primary" href={`/${locale}/app`} title={copy.newChat}>
          <Plus aria-hidden="true" size={15} /><span>{copy.newChat}</span><kbd>⌘J</kbd>
        </Link>
        {props.showProjects ? (
          searching && !collapsed ? (
            <div className="app-rail__row app-rail__row--search">
              <Search aria-hidden="true" size={15} />
              <input
                aria-label={copy.search}
                onBlur={() => {if (!query) setSearching(false);}}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {if (event.key === "Escape") {setQuery(""); setSearching(false);}}}
                placeholder={copy.search}
                ref={searchRef}
                type="search"
                value={query}
              />
            </div>
          ) : (
            <button
              className="app-rail__row"
              onClick={() => {
                setCollapsed(false);
                setSearching(true);
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }}
              title={copy.search}
              type="button"
            ><Search aria-hidden="true" size={15} /><span>{copy.search}</span><kbd>⌘K</kbd></button>
          )
        ) : null}
      </div>

      <nav aria-label={copy.workspaceNav} className="app-rail__nav">
        <Link
          aria-current={pathname.endsWith("/app") ? "page" : undefined}
          className="app-rail__row"
          href={`/${locale}/app`}
          title={copy.overview}
        ><CircleGauge aria-hidden="true" size={15} /><span>{copy.overview}</span></Link>
        <Link
          aria-current={pathname.includes("/app/context") ? "page" : undefined}
          className="app-rail__row"
          href={`/${locale}/app/context`}
          title={copy.professionalContext}
        ><UserRoundCog aria-hidden="true" size={15} /><span>{copy.professionalContext}</span></Link>
      </nav>

      {props.showProjects ? (
        <div className="app-rail__scroll">
          {recents.length > 0 ? <p className="app-rail__label">{copy.recent}</p> : null}
          {recents.map((project) => {
            const selected = activeProject?.id === project.id;
            return (
              <div className={selected ? "app-rail__item is-active" : "app-rail__item"} key={project.id}>
                <Link
                  aria-current={selected ? "page" : undefined}
                  data-initial={initials(project.name)}
                  href={project.href}
                  title={project.name}
                >
                  <span>{project.name}</span>
                  <small>{project.jobLabel ?? copy.status[project.status] ?? copy.status.collecting}</small>
                </Link>
                <ProjectActions copy={copy} locale={locale} project={project} />
              </div>
            );
          })}

          <p className="app-rail__label app-rail__label--action">
            {copy.folders}
            <button
              aria-label={copy.createFolder}
              onClick={() => setCreatingFolder((current) => !current)}
              title={copy.createFolder}
              type="button"
            ><Plus aria-hidden="true" size={13} /></button>
          </p>
          {creatingFolder ? (
            <form action={createAction} className="app-rail__create" onSubmit={() => setCreatingFolder(false)}>
              <input name="locale" type="hidden" value={locale} />
              <input aria-label={copy.createFolder} autoFocus maxLength={80} minLength={2} name="group_name" placeholder={copy.createFolderPlaceholder} required />
              <button aria-label={copy.save} disabled={createPending} type="submit"><Check aria-hidden="true" size={13} /></button>
              <button aria-label={copy.close} onClick={() => setCreatingFolder(false)} type="button"><X aria-hidden="true" size={13} /></button>
            </form>
          ) : null}
          {createState.code ? <p className="app-rail__error" role="alert">{copy.errors[createState.code]}</p> : null}
          {visibleFolders.map(({group, children}) => {
            const open = openFolders.includes(group.id) || Boolean(normalized);
            return (
              <div className="app-rail__folder" key={group.id}>
                <button
                  aria-expanded={open}
                  className="app-rail__item app-rail__item--folder"
                  data-initial={initials(group.name)}
                  onClick={() => setOpenFolders((current) => (
                    current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]
                  ))}
                  type="button"
                >
                  {open ? <ChevronDown aria-hidden="true" size={12} /> : <ChevronRight aria-hidden="true" size={12} />}
                  <span>{group.name}</span>
                  <em>{children.length}</em>
                </button>
                <GroupActions copy={copy} group={group} locale={locale} />
                {open ? (
                  <div className="app-rail__folder-children">
                    {children.map((project) => {
                      const selected = activeProject?.id === project.id;
                      return (
                        <div className={selected ? "app-rail__item is-active" : "app-rail__item"} key={project.id}>
                          <Link
                            aria-current={selected ? "page" : undefined}
                            data-initial={initials(project.name)}
                            href={project.href}
                            title={project.name}
                          ><span>{project.name}</span></Link>
                          <ProjectActions copy={copy} locale={locale} project={project} />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}

          {empty ? <p className="app-rail__empty">{normalized ? copy.noResults : copy.empty}</p> : null}
        </div>
      ) : <div className="app-rail__scroll" />}

      <div className="app-rail__foot">
        {accountOpen && !collapsed ? (
          <div className="app-rail__menu">
            <div className="app-rail__menu-lang">
              <span>{copy.language}</span>
              <WorkspaceLanguageSwitcher locale={locale} />
            </div>
            <form action={props.signOutAction}>
              <input name="locale" type="hidden" value={locale} />
              <button type="submit"><LogOut aria-hidden="true" size={14} />{copy.signOut}</button>
            </form>
          </div>
        ) : null}
        <button
          aria-expanded={accountOpen}
          aria-label={copy.account}
          className="app-rail__account"
          onClick={() => setAccountOpen((current) => !current)}
          title={props.email}
          type="button"
        >
          <span className="app-rail__avatar">{initials(props.fullName || props.email)}</span>
          <span className="app-rail__who">
            <strong>{props.fullName || props.email}</strong>
            <small>{props.organizationName}</small>
          </span>
          <ChevronDown aria-hidden="true" size={12} />
        </button>
      </div>
    </aside>
  );
}
