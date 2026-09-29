"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadExecutionReview} from "@/lib/artifacts/execution-review";

const command = z.strictObject({locale:z.enum(["pt-BR","en-US"]), projectId:z.uuid(), executionId:z.uuid(), revisionId:z.uuid(),
  fingerprint:z.string().regex(/^[a-f0-9]{64}$/), act:z.enum(["approve","comment","return","revoke_approval"]),
  declared:z.boolean(), commandId:z.uuid(), note:z.string().trim().max(5000), basisReviewId:z.uuid().nullable(), blockId:z.uuid().nullable()});
export async function reviewExecutionArtifact(input: unknown): Promise<{ok:true}|{ok:false;error:"denied"|"changed"|"save"}> {
  const p=command.safeParse(input);
  if (!p.success) return {ok:false,error:"save"};
  const c=p.data; const {supabase,organization}=await requireWorkspace(c.locale);
  const context=await loadExecutionReview(supabase,c.projectId,c.executionId,c.revisionId);
  if (!context) return {ok:false,error:"denied"};
  // Scope is resolved by the current session and database, never an organization supplied by the form.
  const {data:project,error:projectError}=await supabase.from("capital_projects").select("id").eq("id",c.projectId).eq("organization_id",organization.id).maybeSingle();
  if (projectError || !project) return {ok:false,error:"denied"};
  if (context.snapshot.revision.manifestFingerprint!==c.fingerprint) return {ok:false,error:"changed"};
  const sqlNull=null as never;
  const {error}=await supabase.rpc("review_artifact_revision_v1",{p_revision_id:c.revisionId,p_expected_fingerprint:c.fingerprint,p_act:c.act,
    p_block_id:c.blockId??sqlNull,p_note:c.note||sqlNull,p_self_approval_declared:c.declared,p_command_id:c.commandId,p_basis_review_id:c.basisReviewId??sqlNull});
  if (error) return {ok:false,error:error.code==="42501"?"denied":error.code==="22023"?"changed":"save"};
  revalidatePath(`/${c.locale}/app/projects/${c.projectId}/executions/${c.executionId}`);return {ok:true};
}
