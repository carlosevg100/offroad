import {isGovernedWorkProductRevisionRequest} from "@offroad/agent-contracts";
import {
  isWorkContinuationRequest,
  namesPendingDraft,
  resolveWorkContinuation,
  type ContinuationBaseOption,
  type WorkMilestone,
} from "@offroad/work-plan";
import {z} from "zod";

import {milestoneLabelText, recordIdSchema, type MilestoneLabelKey, type WorkMilestoneRow} from "./work-update-view";

/**
 * How a message typed in a work's conversation is handled.
 *
 * - `continuation`: it uses a continuation verb (the words `resolveWorkContinuation` treats as
 *   non-referential). It is resolved against the work's approved bases and recorded only with an
 *   explicit base; an ambiguous or absent base becomes a question.
 * - `draft_revision`: an explicit revision request that names the draft still awaiting
 *   confirmation. Only then does the draft revision keep its path.
 * - `ordinary`: every other message is a turn of the conversation.
 *
 * `tryDraft` is set when the message names the draft: the draft path is tried first and, when the
 * work has no draft awaiting confirmation (or no intake session), the message follows its route.
 * A draft is never the default target of a continuation.
 */
export type AdvisorMessageRoute = Readonly<{kind: "continuation" | "draft_revision" | "ordinary"; tryDraft: boolean}>;

export function advisorMessageRoute(text: string): AdvisorMessageRoute {
  const namesDraft = namesPendingDraft(text);
  if (isWorkContinuationRequest(text)) return {kind: "continuation", tryDraft: namesDraft};
  if (namesDraft && isGovernedWorkProductRevisionRequest(text)) return {kind: "draft_revision", tryDraft: true};
  return {kind: "ordinary", tryDraft: false};
}

/** The draft revision command reports "nothing to revise here" as P0002: no draft awaits
 * confirmation, the work is not of a kind that has one, or it has no intake session. */
export function draftRevisionUnavailable(error: {code?: string} | null): boolean {
  return error?.code === "P0002";
}

/**
 * The milestone log as the continuation contract reads it, with each label in the person's
 * language. A decision about one recompute candidate authorizes or declines a cost: it is about
 * spending, not about a result, so it is left out, exactly as `private.work_continuation_bases_v1`
 * leaves it out. Nothing references it, so the log stays whole.
 */
export function continuationMilestones(workId: string, rows: readonly WorkMilestoneRow[], label: (raw: string) => string): WorkMilestone[] {
  return rows
    .filter((row) => !(row.kind === "decision" && row.subjectKind === "work_recompute_candidate"))
    .map((row) => ({
      milestoneId: row.milestoneId,
      workId,
      sequence: row.sequence,
      kind: row.kind,
      label: label(row.label).slice(0, 300),
      executionId: row.kind === "execution_result" ? row.subjectId : null,
      references: [...row.references],
      decision: row.kind === "decision" || row.kind === "update_adopted"
        ? {decisionId: row.subjectId, revision: row.revision ?? 0, outcome: row.outcome === "rejected" ? "rejected" as const : "approved" as const}
        : null,
    }));
}

export type ContinuationChoice = Readonly<{milestoneId: string; decisionId: string; revision: number; label: string}>;
export type ContinuationOutcome =
  | Readonly<{status: "proposed"; base: ContinuationChoice}>
  | Readonly<{status: "question"; code: "ambiguous_base" | "no_approved_base"; options: readonly ContinuationChoice[]}>;

/** Runs the contract over the log of a work: an explicit base, or the question and its options. */
export function resolveContinuation(input: {
  workId: string;
  conversationId: string | null;
  text: string;
  milestones: readonly WorkMilestoneRow[];
  translate: (key: MilestoneLabelKey) => string;
}) {
  const label = (raw: string) => milestoneLabelText(raw, input.translate);
  return resolveWorkContinuation({
    workId: input.workId,
    // The conversation only names where the request is recorded; before a work's first turn in an
    // intake conversation there is none yet, and the work itself names it.
    conversationId: input.conversationId ?? input.workId,
    text: input.text,
    milestones: continuationMilestones(input.workId, input.milestones, label),
  });
}

export function choiceOf(option: ContinuationBaseOption): ContinuationChoice {
  return {milestoneId: option.milestoneId, decisionId: option.decisionId, revision: option.revision, label: option.label};
}

export const continuationChoiceInputSchema = z.object({milestoneId: recordIdSchema, decisionId: recordIdSchema, revision: z.number().int().positive()});

const continuationMetadataSchema = z.object({
  kind: z.literal("work_continuation"),
  requestId: recordIdSchema,
  base: z.object({milestoneId: recordIdSchema, decisionId: recordIdSchema, revision: z.number().int().positive(), kind: z.string(), label: z.string().min(1)}),
});

/** The base a recorded follow-up used, read from the metadata of its turn. */
export type ContinuationNote = Readonly<{requestId: string; label: string; revision: number}>;
export function continuationNote(metadata: unknown): ContinuationNote | null {
  const parsed = continuationMetadataSchema.safeParse(metadata);
  return parsed.success ? {requestId: parsed.data.requestId, label: parsed.data.base.label, revision: parsed.data.base.revision} : null;
}
