"use server";

import {z} from "zod";

import {advisorActionError, type AdvisorActionError} from "@/lib/advisor/advisor-action-error";
import {recordIdSchema} from "@/lib/advisor/work-update-view";
import {declineReasonCodes} from "@/lib/advisor/work-updates";
import {requireWorkspace} from "@/lib/auth/workspace";

export type WorkUpdateActionResult = {ok: true} | {ok: false; error: AdvisorActionError};

const base = z.object({
  locale: z.enum(["pt-BR", "en-US"]),
  /** Chosen by the caller once per decision, so a retry is recognised as the same command. */
  commandId: z.uuid(),
  expectedRevision: z.number().int().positive(),
});
const adoptSchema = base.extend({updateId: recordIdSchema});
const authorizeSchema = base.extend({candidateId: recordIdSchema});
const declineSchema = base.extend({updateId: recordIdSchema, reason: z.enum(declineReasonCodes), candidateId: recordIdSchema.nullable()});

/** Adopts a ready update at the revision the person saw. The database refuses any other state. */
export async function adoptWorkUpdate(input: unknown): Promise<WorkUpdateActionResult> {
  const parsed = adoptSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("adopt_work_update_v1", {
    p_command_id: parsed.data.commandId, p_update_id: parsed.data.updateId, p_expected_revision: parsed.data.expectedRevision,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

/** Authorizes the cost of one recomputation that waits for a person. */
export async function authorizeWorkUpdate(input: unknown): Promise<WorkUpdateActionResult> {
  const parsed = authorizeSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("authorize_work_update_v1", {
    p_command_id: parsed.data.commandId, p_candidate_id: parsed.data.candidateId, p_expected_revision: parsed.data.expectedRevision,
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}

/** Declines an update, or one recomputation that waits for authorization, with the person's reason. */
export async function declineWorkUpdate(input: unknown): Promise<WorkUpdateActionResult> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: "invalid"};
  const {supabase} = await requireWorkspace(parsed.data.locale);
  const {error} = await supabase.rpc("decline_work_update_v1", {
    p_command_id: parsed.data.commandId, p_update_id: parsed.data.updateId, p_expected_revision: parsed.data.expectedRevision,
    p_reason: parsed.data.reason, ...(parsed.data.candidateId ? {p_candidate_id: parsed.data.candidateId} : {}),
  });
  return error ? {ok: false, error: advisorActionError(error)} : {ok: true};
}
