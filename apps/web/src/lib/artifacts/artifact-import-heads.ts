import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {artifactImportRpc} from "./artifact-import";
const headsSchema = z.strictObject({workId: z.uuid(), artifacts: z.array(z.strictObject({id: z.uuid(), headRevisionId: z.uuid()})).max(100)});
/** Identity listing is an authorized command. Content remains behind the exact revision reader. */
export async function readWorkArtifactHeads(client: SupabaseClient<Database>, workId: string) {
  if (!z.uuid().safeParse(workId).success) return null;
  const result = await artifactImportRpc(client)("list_work_artifact_heads_v1", {p_work_id: workId});
  const parsed = headsSchema.safeParse(result.data);
  if (result.error || !parsed.success || parsed.data.workId !== workId) return null;
  return parsed.data.artifacts;
}
