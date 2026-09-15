/** A tab carries its workspace in the URL; no shared cookie can retarget a submit. */
export const WORKSPACE_HEADER = "x-offroad-workspace";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function workspaceRequestContext(url: URL, referer: string | null, method: string) {
  const values = url.searchParams.getAll("workspace");
  if (values.length > 1 || (values.length === 1 && !uuid.test(values[0]!))) return {invalid: true} as const;
  let previous: string | undefined;
  if (referer) {
    try {
      const source = new URL(referer);
      const value = source.searchParams.get("workspace");
      if (source.origin === url.origin && value && uuid.test(value)) previous = value;
    } catch { /* A missing or malformed navigation hint grants no authority. */ }
  }
  const selected = values[0];
  if (method !== "GET" && method !== "HEAD" && previous && selected && previous !== selected) {
    return {invalid: true} as const;
  }
  return {invalid: false, workspace: selected ?? previous, canonicalize: !selected && !!previous} as const;
}
