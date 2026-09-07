import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";

export const WORKER_RUNTIME_SCHEMA_VERSION =
  "document-worker-runtime.2026-09-07.r01-governed-answer.v1" as const;

const runtimeSchemaContract = z.object({
  schemaVersion: z.literal(WORKER_RUNTIME_SCHEMA_VERSION),
  capabilities: z.array(z.string().min(1)).min(1),
});

export type WorkerRuntimeSchemaContract = z.infer<typeof runtimeSchemaContract>;

/**
 * Fail closed before queue construction. A new image that expects database functions which
 * production does not yet expose must never claim work and fail halfway through a customer job.
 * ECS keeps the previously healthy task serving while the incompatible task exits at boot.
 */
export async function assertWorkerRuntimeSchema(
  supabase: SupabaseClient,
): Promise<WorkerRuntimeSchemaContract> {
  const {data, error} = await supabase.rpc("worker_runtime_schema_contract_v1");
  if (error) {
    throw new Error(`worker database schema contract is unavailable (${error.code ?? "unknown"})`);
  }

  const parsed = runtimeSchemaContract.safeParse(data);
  if (!parsed.success) {
    const actual = data && typeof data === "object" && "schemaVersion" in data
      ? String((data as {schemaVersion?: unknown}).schemaVersion ?? "missing")
      : "missing";
    throw new Error(
      `worker database schema contract mismatch: expected ${WORKER_RUNTIME_SCHEMA_VERSION}, received ${actual}`,
    );
  }
  return parsed.data;
}
