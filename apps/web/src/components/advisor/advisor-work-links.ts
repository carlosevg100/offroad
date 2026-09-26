import type {MouseEvent} from "react";

/** The link to a section of the work, and optionally to one entry inside it (an update of the
 * Updates section). Both parts are encoded, so the literal slash between them is unambiguous. */
export function workSectionHref(id: string, target?: string): string {
  return `#work-${encodeURIComponent(id)}${target ? `/${encodeURIComponent(target)}` : ""}`;
}

export function workSectionFromHash(hash: string): string | null {
  if (!hash.startsWith("#work-")) return null;
  try { return decodeURIComponent(hash.slice(6).split("/")[0]!) || null; } catch { return null; }
}

/**
 * Follows a link to a section from inside another section. A plain fragment change is not seen by
 * the router, whose next refresh would put its own last address back (see
 * `useAdvisorWorkNavigation`), so the address changes through the History API, which the router
 * follows, and a hash change event tells the section navigation and the targeted section. A click
 * with a modifier keeps the browser's own behavior.
 */
export function followWorkSectionLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = event.currentTarget.getAttribute("href");
  if (!href?.startsWith("#work-")) return;
  event.preventDefault();
  const oldURL = window.location.href;
  if (window.location.hash !== href) window.history.pushState(null, "", href);
  window.dispatchEvent(new HashChangeEvent("hashchange", {oldURL, newURL: window.location.href}));
}

/** The entry a section link targets, when the hash names this section and one of its entries. */
export function workSectionTargetFromHash(hash: string, section: string): string | null {
  if (workSectionFromHash(hash) !== section) return null;
  const [, target] = hash.slice(6).split("/");
  if (!target) return null;
  try { return decodeURIComponent(target) || null; } catch { return null; }
}
