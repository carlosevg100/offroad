export function workSectionHref(id: string): string {
  return `#work-${encodeURIComponent(id)}`;
}

export function workSectionFromHash(hash: string): string | null {
  if (!hash.startsWith("#work-")) return null;
  try { return decodeURIComponent(hash.slice(6)) || null; } catch { return null; }
}

