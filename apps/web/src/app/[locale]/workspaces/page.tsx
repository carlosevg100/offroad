import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {z} from "zod";
import {requireUser} from "@/lib/auth/workspace";

import {acceptInvitation} from "./actions";

const workspaces = z.array(z.object({id: z.uuid(), name: z.string(), role: z.string()}));
export const dynamic = "force-dynamic";
export default async function WorkspacesPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const {supabase} = await requireUser(locale);
  const t = await getTranslations({locale, namespace: "WorkspaceContext"});
  const {data, error} = await supabase.rpc("list_my_workspaces_v1");
  if (error) throw new Error("workspace_list_unavailable");
  const choices = workspaces.parse(data);
  const {data: pending, error: inviteError} = await supabase.rpc("list_my_workspace_invites_v1");
  if (inviteError) throw new Error("workspace_invites_unavailable");
  const invitations = z.array(z.object({id:z.uuid(), organization_name:z.string()})).parse(pending);
  return <main className="application-content">
    <h1>{t("title")}</h1><p>{t("description")}</p>
    {choices.length ? <ul>{choices.map((workspace) => <li key={workspace.id}>
      <Link href={`/${locale}/app?workspace=${workspace.id}`}>{workspace.name}</Link>
    </li>)}</ul> : <p>{t("empty")}</p>}
    {invitations.length > 0 && <section><h2>{t("invitations")}</h2>{invitations.map(invite => <form key={invite.id} action={acceptInvitation.bind(null,locale)}>
      <input type="hidden" name="invite" value={invite.id}/><p>{invite.organization_name}</p><button type="submit">{t("accept")}</button>
    </form>)}</section>}
  </main>;
}
