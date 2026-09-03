import {
  publicCompanyMemoryRecordSchema,
  type PublicCompanyMemory,
} from "@offroad/public-research";

import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

/** Capability-bound adapter for the global public-company source catalog. */
export function createWorkerPublicCompanyMemory(
  queue: QueueClient,
  job: CapitalProjectAnalysisJob,
): PublicCompanyMemory | undefined {
  if (!queue.loadPublicCompanyMemory || !queue.storePublicCompanyMemory) return undefined;
  return {
    async load(companyKey) {
      const payload = await queue.loadPublicCompanyMemory!(job, companyKey);
      if (payload === null || payload === undefined) return null;
      return publicCompanyMemoryRecordSchema.parse(payload);
    },
    async store(record) {
      await queue.storePublicCompanyMemory!(job, record);
    },
  };
}
