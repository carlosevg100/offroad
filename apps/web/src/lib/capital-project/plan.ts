import {capitalProjectPlanSnapshot, type CapitalProjectJob} from "@offroad/work-plan";

import type {Json} from "@/types/database";

/**
 * Server-side payload persisted atomically with a new project. The database computes the
 * canonical fingerprint from jsonb so JavaScript key ordering can never change plan identity.
 */
export function compiledCapitalProjectPlan(job: CapitalProjectJob): Json {
  return capitalProjectPlanSnapshot(job) as unknown as Json;
}

