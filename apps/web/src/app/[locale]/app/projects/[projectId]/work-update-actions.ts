"use server";

import {revalidatePath} from "next/cache";
import {workUpdateAdoptionBasisSchema,workUpdateAdoptionCommand} from "@/lib/advisor/work-update-adoption-command";
import {z} from "zod";

import {workUpdateActionError, type WorkUpdateActionError} from "@/lib/advisor/advisor-action-error";
import {recordIdSchema} from "@/lib/advisor/work-update-view";
import {declineReasonCodes} from "@/lib/advisor/work-updates";
import {requireWorkspace} from "@/lib/auth/workspace";

export type WorkUpdateActionResult = {ok: true} | {ok: false; error: WorkUpdateActionError};

const base = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  /** Chosen by the caller once per decision, so a retry is recognised as the same command. */
  commandId: z.uuid(),
  expectedRevision: z.number().int().positive(),
});
const adoptSchema = base.extend({updateId: recordIdSchema,expectedBasisFingerprint:z.string().regex(/^[a-f0-9]{64}$/),selfApprovalDeclared:z.boolean()});
const authorizeSchema = base.extend({candidateId: recordIdSchema});
const declineSchema = base.extend({updateId: recordIdSchema, reason: z.enum(declineReasonCodes), candidateId: recordIdSchema.nullable()});

type NativeAdoptionRpc={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>};
export async function readWorkUpdateAdoption(input:unknown){
  const parsed=base.omit({commandId:true}).extend({updateId:recordIdSchema}).strict().safeParse(input);
  if(!parsed.success)return{ok:false as const,error:"invalid" as WorkUpdateActionError};
  const {supabase}=await requireWorkspace(parsed.data.locale);
  const result=await(supabase as unknown as NativeAdoptionRpc).rpc("read_work_update_adoption_basis_v2",{p_update_id:parsed.data.updateId});
  if(result.error)return{ok:false as const,error:workUpdateActionError(result.error)};
  const basis=workUpdateAdoptionBasisSchema.safeParse(result.data);
  if(!basis.success||basis.data.updateId!==parsed.data.updateId)return{ok:false as const,error:"denied" as WorkUpdateActionError};
  if(basis.data.revision!==parsed.data.expectedRevision)return{ok:false as const,error:"stale" as WorkUpdateActionError};
  return{ok:true as const,basis:basis.data};
}
/** Adopts the exact captured result set reviewed by the person. No legacy fallback. */
export async function adoptWorkUpdate(input:unknown):Promise<WorkUpdateActionResult>{
  const parsed=adoptSchema.strict().safeParse(input);if(!parsed.success)return{ok:false,error:"invalid"};
  const c=parsed.data,{supabase}=await requireWorkspace(c.locale),rpc=supabase as unknown as NativeAdoptionRpc;
  const read=await rpc.rpc("read_work_update_adoption_basis_v2",{p_update_id:c.updateId});
  if(read.error)return{ok:false,error:workUpdateActionError(read.error)};
  try{
    const basis=workUpdateAdoptionBasisSchema.parse(read.data);
    if(basis.updateId!==c.updateId)return{ok:false,error:"denied"};
    if(basis.revision!==c.expectedRevision||basis.basisFingerprint!==c.expectedBasisFingerprint)return{ok:false,error:"stale"};
    const action=workUpdateAdoptionCommand(basis,{commandId:c.commandId,selfApprovalDeclared:c.selfApprovalDeclared});
    const result=await rpc.rpc(action.rpc,action.args);if(result.error)return{ok:false,error:workUpdateActionError(result.error)};
    revalidatePath(`/${c.locale}/app/projects/${basis.workId}`);return{ok:true};
  }catch{return{ok:false,error:"denied"};}
}

/** Authorizes the cost of one recomputation that waits for a person. */
export async function authorizeWorkUpdate(input: unknown): Promise<WorkUpdateActionResult> {
  const parsed = authorizeSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("authorize_work_update_v1", {
    p_command_id: parsed.data.commandId, p_candidate_id: parsed.data.candidateId, p_expected_revision: parsed.data.expectedRevision,
  });
  return error ? {ok: false, error: workUpdateActionError(error)} : {ok: true};
}

/** Declines an update, or one recomputation that waits for authorization, with the person's reason.
 * While the worker holds one of the jobs the decline would stop, the database refuses and records
 * nothing (`busy`); the person repeats the decision in a moment. */
export async function declineWorkUpdate(input: unknown): Promise<WorkUpdateActionResult> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("decline_work_update_v1", {
    p_command_id: parsed.data.commandId, p_update_id: parsed.data.updateId, p_expected_revision: parsed.data.expectedRevision,
    p_reason: parsed.data.reason, ...(parsed.data.candidateId ? {p_candidate_id: parsed.data.candidateId} : {}),
  });
  return error ? {ok: false, error: workUpdateActionError(error)} : {ok: true};
}
