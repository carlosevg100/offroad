"use client";

import type {ReactNode} from "react";
import {useTranslations} from "next-intl";
import {workSectionHref} from "./advisor-work-links";

export type AdvisorWorkSection = {
  id: string;
  title: string;
  artifactId?: string;
  version?: number;
  /** Already localized by the server assembly; never infer completion here. */
  status?: string;
  content: ReactNode;
};

export function AdvisorWorkSurface({sections, selectedId, onSelect}: {
  sections: AdvisorWorkSection[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("AdvisorWorkSurface");
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
  if (!selected) return null;
  return <section className="advisor-work-surface" aria-label={t("work")}>
    <header className="advisor-work-surface__header">
      <h2 className="section-kicker">{t("work")}</h2>
      <div className="advisor-work-surface__metadata">
        {selected.version !== undefined ? <span>{t("version", {version: selected.version})}</span> : null}
        {selected.status ? <span>{selected.status}</span> : null}
      </div>
    </header>
    <nav className="advisor-work-surface__navigation" aria-label={t("results")}>
      {sections.map((section) => <a key={section.id} href={workSectionHref(section.id)} aria-current={section.id === selected.id ? "true" : undefined} onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onSelect(section.id);
      }}>{section.title}</a>)}
    </nav>
    <div className="advisor-work-surface__content" id={`work-${selected.id}`} tabIndex={-1} key={selected.id}>{selected.content}</div>
  </section>;
}
