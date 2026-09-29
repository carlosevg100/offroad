import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {artifactReviewContextSchema} from "./institutional-review";

export function parseExecutionReview(data: unknown, workId: string, executionId: string, revisionId: string) {
 const p=artifactReviewContextSchema.safeParse(data);
 if(!p.success || p.data.revisionId!==revisionId || p.data.snapshot.revision.id!==revisionId
  || p.data.artifact.kind!=="execution_result" || p.data.artifact.workId!==workId
  || p.data.artifact.subject!==`execution:${executionId}`) return null;
 return p.data;
}
export async function loadExecutionReview(client: SupabaseClient<Database>, workId: string, executionId: string, revisionId: string) {
 const {data,error}=await client.rpc("read_artifact_revision_reviews_v1",{p_revision_id:revisionId});
 return error?null:parseExecutionReview(data,workId,executionId,revisionId);
}
