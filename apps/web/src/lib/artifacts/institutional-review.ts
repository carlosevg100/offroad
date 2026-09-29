import {artifactReviewSchema, reviewRegimeSchema, reviewRoleSchema} from "@offroad/domain-contracts";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {Database} from "@/types/database";

const contextSchema = z.object({revisionId: z.uuid(), withheld: z.literal(false),
  artifact: z.object({id: z.uuid(), workId: z.uuid(), kind: z.literal("model_result"), subject: z.string()}),
  snapshot: z.object({revision: z.object({id: z.uuid(), revisionNo: z.number().int(), manifestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    audience: z.enum(["internal", "advisor", "external"]), createdAt: z.string()}),
    blocks: z.array(z.object({id: z.uuid(), blockNo: z.number().int()}))}),
  policy: reviewRegimeSchema.extend({roles: z.array(reviewRoleSchema)}), preparedBy: z.uuid().nullable(),
  release: z.enum(["internal", "released", "blocked"]), freshness: z.enum(["current", "stale", "unknown"]), reviews: z.array(artifactReviewSchema),
});
export type InstitutionalReview = z.infer<typeof contextSchema>;
export function parseInstitutionalReview(data: unknown, workId: string, resultId: string, revisionId: string): InstitutionalReview | null {
  const p = contextSchema.safeParse(data);
  if (!p.success || p.data.revisionId !== revisionId || p.data.snapshot.revision.id !== revisionId
    || p.data.artifact.workId !== workId || p.data.artifact.subject !== `institutional-native:${resultId}`) return null;
  return p.data;
}
export async function loadInstitutionalReview(client: SupabaseClient<Database>, workId: string, resultId: string, revisionId: string) {
  const {data,error} = await client.rpc("read_artifact_revision_reviews_v1", {p_revision_id: revisionId});
  return error ? null : parseInstitutionalReview(data, workId, resultId, revisionId);
}
