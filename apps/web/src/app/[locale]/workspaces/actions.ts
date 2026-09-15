"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {requireUser} from "@/lib/auth/workspace";
export async function acceptInvitation(locale: string, form: FormData) {
 const validLocale = z.enum(["pt-BR","en-US"]).parse(locale);
 const {supabase} = await requireUser(validLocale);
 const invite = z.uuid().parse(form.get("invite"));
 const {data,error} = await supabase.rpc("accept_workspace_invite_v1",{p_invite_id:invite});
 if (error) redirect(`/${validLocale}/workspaces?result=denied`);
 redirect(`/${validLocale}/app?workspace=${data}`);
}
