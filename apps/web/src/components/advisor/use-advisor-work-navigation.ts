"use client";

import {useEffect, useRef, useState} from "react";
import {workSectionFromHash, workSectionHref} from "./advisor-work-links";

/** Keep local navigation stable while refreshed work products replace server props. */
export function useAdvisorWorkNavigation(sections: readonly {id: string}[], initialId?: string) {
  const [selectedId, setSelectedId] = useState(initialId);
  const [mobileView, setMobileView] = useState<"conversation" | "work">("conversation");
  const availableIds = useRef<readonly string[]>([]);
  const sectionKey = JSON.stringify(sections.map(section => section.id));

  useEffect(() => {
    const ids = JSON.parse(sectionKey) as string[];
    availableIds.current = ids;

  }, [sectionKey]);

  useEffect(() => {
    const applyNavigation = () => {
      const id = workSectionFromHash(window.location.hash);
      if (id && availableIds.current.includes(id)) {
        setSelectedId(id);
        setMobileView("work");
      }
    };
    applyNavigation();
    window.addEventListener("hashchange", applyNavigation);
    window.addEventListener("popstate", applyNavigation);
    return () => {
      window.removeEventListener("hashchange", applyNavigation);
      window.removeEventListener("popstate", applyNavigation);
    };
  }, []);

  function selectSection(id: string) {
    if (!availableIds.current.includes(id)) return;
    setSelectedId(id);
    setMobileView("work");
    // Next instruments History API calls to update its canonical URL. A direct
    // location.hash assignment leaves router.refresh() able to restore an old hash.
    if (window.location.hash !== workSectionHref(id)) window.history.pushState(null, "", workSectionHref(id));
  }
  return {selectedId: sections.some(section => section.id === selectedId) ? selectedId : sections[0]?.id, selectSection, mobileView, setMobileView};
}
