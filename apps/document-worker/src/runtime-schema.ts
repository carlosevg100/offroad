import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";

export const WORKER_RUNTIME_SCHEMA_VERSION =
  "document-worker-runtime.2026-09-08.execution-approval.v1" as const;

export const REQUIRED_WORKER_RUNTIME_CAPABILITIES = [
  "domain-event-outbox.v1",
  "pinned-execution-consumer.v1",
  // Evaluation claim, reserve, settle and commit exist (installed closed behind their switch).
  // Only required by images built after that migration; older images ignore the extra key.
  "governed-evaluation-consumer.v1",
  "explicit-resource-access.v1",
  "explicit-workspace-context.v1",
  "authenticated-document-storage.v1",
  "review-bound-execution.v1",
  "legacy-storage-rotation.v1",
  "integration-preview-workflow-continuity.v1",
  "receivables-information-request-bindings.v1",
  "receivables-complete-draft-refresh.v1",
  "universal-dispatch-candidate-shadow.v1",
  "explicit-execution-brief-approval.v1",
  "execution-brief-proposal.v1",
  "governed-sector-planning-context.v1",
  "confirmed-receivables-evidence-scope.v1",
  "confirmed-receivables-support-sheets.v1",
  "document-work-product-request-binding.v1",
  "documentary-execution-scope.v1",
  "atomic-documentary-commit.v1",
  "provider-resource-retention.v2",
] as const;

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
  const missing = REQUIRED_WORKER_RUNTIME_CAPABILITIES.filter(
    (capability) => !parsed.data.capabilities.includes(capability),
  );
  if (missing.length > 0) {
    throw new Error(`worker database schema contract is missing capabilities: ${missing.join(", ")}`);
  }
  return parsed.data;
}
