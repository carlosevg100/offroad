import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getTranslations} from "next-intl/server";

import type {Database} from "@/types/database";

import {workUpdateNames} from "./work-update-names";
import {milestoneLabelText, workUpdateViewSchema, type MilestoneLabelKey} from "./work-update-view";
import {workUpdatesModel, type WorkUpdatesModel} from "./work-updates";

/**
 * The update section of a work, read through `work_update_view_v1` under the work's read
 * authority, with every method, premise and milestone label named on the server in the person's
 * language. `null` when the read fails or does not have the expected shape: the section says the
 * updates could not be read, and nothing is inferred.
 */
export async function loadWorkUpdates(supabase: SupabaseClient<Database>, workId: string, locale: "pt-BR" | "en-US"): Promise<WorkUpdatesModel | null> {
  const {data, error} = await supabase.rpc("work_update_view_v1", {p_work_id: workId});
  if (error) return null;
  const parsed = workUpdateViewSchema.safeParse(data);
  if (!parsed.success) return null;
  const [t, labels] = await Promise.all([getTranslations({locale, namespace: "App.workUpdateNames"}), getTranslations({locale, namespace: "App.workUpdates.labels"})]);
  return workUpdatesModel(parsed.data, workUpdateNames({text: (key, values) => t(key, values), has: (key) => t.has(key)}),
    (raw) => milestoneLabelText(raw, (key: MilestoneLabelKey) => labels(key)));
}
