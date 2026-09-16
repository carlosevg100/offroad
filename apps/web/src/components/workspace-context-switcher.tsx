import Link from "next/link";

type Props = {
  locale: string;
  organization: {id: string; name: string};
  canAdminister: boolean;
  copy: {switch: string; access: string};
};

/** Navigation chooses a context; the next request must still prove current membership. */
export function WorkspaceContextSwitcher({locale, organization, canAdminister, copy}: Props) {
  return <nav className="workspace-context-navigation" aria-label={copy.switch}>
    <Link href={`/${locale}/workspaces`}>{organization.name} · {copy.switch}</Link>{" "}
    {canAdminister ? <Link href={`/${locale}/app/access?workspace=${organization.id}`}>{copy.access}</Link> : null}
  </nav>;
}
