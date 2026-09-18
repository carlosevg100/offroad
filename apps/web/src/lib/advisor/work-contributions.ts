import {z} from "zod";

export const workContributionInput = z.object({
  locale: z.enum(["pt-BR", "en-US"]), workId: z.uuid(), contributionId: z.uuid(), revisionId: z.uuid(),
  expectedRevisionId: z.uuid().nullable(), baseRevisionId: z.uuid().nullable(),
  content: z.string().trim().min(1).max(16000), sourceVersionIds: z.array(z.uuid()).max(100),
});
export const contributionPromotionResult = z.discriminatedUnion("status", [
  z.object({status: z.literal("shared"), contributionId: z.uuid(), revisionId: z.uuid(), replayed: z.boolean()}),
  z.object({status: z.literal("conflict"), base: z.object({revisionId: z.uuid(), content: z.string()}),
    current: z.object({revisionId: z.uuid(), content: z.string()}), candidate: z.object({revisionId: z.uuid(), content: z.string()})}),
]);
export const workPeopleResult = z.object({canManage: z.boolean(), viewerId: z.uuid(), offset: z.number(), people: z.array(z.object({user_id: z.uuid(), name: z.string(), participates: z.boolean(), access: z.enum(["read", "work", "manage"])}))});
export type WorkPerson = z.infer<typeof workPeopleResult>["people"][number];
export type ContributionRevision = {id: string; contribution_id: string; author_user_id: string; content: string; revision: number; base_revision_id: string | null; created_at: string};
export type ContributionPage = {rows: ContributionRevision[]; more: boolean};
export type ContributionConflict = Extract<z.infer<typeof contributionPromotionResult>, {status: "conflict"}>;
export type ContributionCommandState = {ok: boolean; error?: "invalid" | "denied" | "stale" | "save"; conflict?: ContributionConflict};
