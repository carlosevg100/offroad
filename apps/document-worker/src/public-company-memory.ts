import {z} from "zod";
import {
  publicCompanyMemoryRecordSchema,
  type PublicCompanyMemory,
  type PublicResearchSubject,
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

/** An unresolved or differently named subject still researches normally, without identity reuse. */
export async function verifiedCompanyMemorySubject(queue: QueueClient, job: CapitalProjectAnalysisJob, subject: PublicResearchSubject): Promise<PublicResearchSubject | undefined> {
  if (!queue.loadPublicCompanyIdentity) return undefined;
  const result = z.object({legalName: z.string().min(2).max(200), verifiedEntityId: z.uuid()}).strict().nullable().parse(await queue.loadPublicCompanyIdentity(job));
  const normalize = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!result || normalize(subject.legalName) !== normalize(result.legalName)) return undefined;
  return result;
}
