import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database} from "@/types/database";

import {workUpdateViewSchema} from "./work-update-view";
import {workUpdatesModel, type WorkUpdatesModel} from "./work-updates";

/**
 * The update section of a work, read through `work_update_view_v1` under the work's read
 * authority. `null` when the read fails or does not have the expected shape: the section says
 * the updates could not be read, and nothing is inferred.
 */
export async function loadWorkUpdates(supabase: SupabaseClient<Database>, workId: string): Promise<WorkUpdatesModel | null> {
  const {data, error} = await supabase.rpc("work_update_view_v1", {p_work_id: workId});
  if (error) return null;
  const parsed = workUpdateViewSchema.safeParse(data);
  return parsed.success ? workUpdatesModel(parsed.data) : null;
}
