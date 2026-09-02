import {
  publicResearchCacheRecordSchema,
  type PublicResearchCache,
} from "@offroad/public-research";

import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

/** Adapts capability-bound database commands to the public-only cache contract. */
export function createWorkerPublicResearchCache(
  queue: QueueClient,
  job: CapitalProjectAnalysisJob,
): PublicResearchCache | undefined {
  if (!queue.loadPublicResearchCache || !queue.storePublicResearchCache) return undefined;
  return {
    async load(queryIds) {
      const payload = await queue.loadPublicResearchCache!(job, [...queryIds]);
      return publicResearchCacheRecordSchema.array().parse(payload);
    },
    async store(records) {
      await queue.storePublicResearchCache!(job, [...records]);
    },
  };
}
