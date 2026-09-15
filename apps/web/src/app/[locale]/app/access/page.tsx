import {getTranslations} from "next-intl/server";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {manageAccess} from "./actions";
const state = z.object({
 members:z.array(z.object({id:z.uuid(),name:z.string(),email:z.string(),role:z.string(),status:z.string()})),
 resources:z.array(z.object({id:z.uuid(),name:z.string()})),
 grants:z.array(z.object({id:z.uuid(),resource_id:z.uuid(),user_id:z.uuid(),action:z.string(),expires_at:z.string().nullable()})),
});
const roles = ["admin","member","analyst","relationship_manager","compliance"] as const;
export default async function AccessPage({params, searchParams}: {params:Promise<{locale:string}>;searchParams:Promise<{result?:string}>}) {
 const {locale} = await params;
 const {supabase} = await requireWorkspace(locale);
 const t = await getTranslations({locale,namespace:"WorkspaceAccess"});
 const {data,error} = await supabase.rpc("read_workspace_access_v1");
 if (error) return <section className="workspace-access"><h1>{t("title")}</h1><p>{t("denied")}</p></section>;
 const access = state.parse(data);
 const action = manageAccess.bind(null,locale);
 const result = (await searchParams).result;
 return <section className="workspace-access">
  <h1>{t("title")}</h1>
  {result && <p role="status">{t(result === "saved" ? "saved" : result === "invalid" ? "invalid" : "denied")}</p>}
  <h2>{t("invite")}</h2><p>{t("inviteHelp")}</p>
  <form action={action}><input type="hidden" name="command" value="invite"/>
   <label>{t("email")}<input name="email" type="email" required maxLength={254}/></label>
   <label>{t("role")}<select name="role" defaultValue="member">{roles.map(r=><option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select></label>
   <button type="submit">{t("invite")}</button>
  </form>
  <h2>{t("members")}</h2>
  {access.members.map(member=><div key={member.id}><p>{member.name} · {member.email}</p>
   {member.role === "owner" ? <p>{t("owner")}</p> : <form action={action}>
    <input type="hidden" name="command" value="member"/><input type="hidden" name="user" value={member.id}/>
    <label>{t("role")}<select name="role" defaultValue={member.role}>{roles.map(r=><option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select></label>
    <label>{t("status")}<select name="status" defaultValue={member.status}><option value="active">{t("active")}</option><option value="suspended">{t("suspended")}</option></select></label>
    <button type="submit">{t("save")}</button></form>}
  </div>)}
  <h2>{t("grant")}</h2>
  <form action={action}><input type="hidden" name="command" value="grant"/>
   <label>{t("person")}<select name="user" required>{access.members.filter(m=>m.status==="active").map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
   <label>{t("project")}<select name="resource" required>{access.resources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <label>{t("permission")}<select name="action">{(["read","work","manage"] as const).map(a=><option key={a} value={a}>{t(`actions.${a}`)}</option>)}</select></label>
   <button type="submit">{t("grant")}</button>
  </form>
  <h2>{t("currentGrants")}</h2>
  {access.grants.filter(g=>access.resources.some(r=>r.id===g.resource_id)).map(g=><form action={action} key={g.id}>
   <input type="hidden" name="command" value="revoke"/><input type="hidden" name="user" value={g.user_id}/><input type="hidden" name="resource" value={g.resource_id}/>
   <p>{access.members.find(m=>m.id===g.user_id)?.name} · {access.resources.find(r=>r.id===g.resource_id)?.name} · {t(`actions.${g.action}`)}</p>
   <button type="submit">{t("revoke")}</button>
  </form>)}
 </section>;
}
