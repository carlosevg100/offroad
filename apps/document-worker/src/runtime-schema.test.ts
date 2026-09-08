import {readFileSync, readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {
  assertWorkerRuntimeSchema,
  REQUIRED_WORKER_RUNTIME_CAPABILITIES,
  WORKER_RUNTIME_SCHEMA_VERSION,
} from "./runtime-schema";

function clientWith(result: {data: unknown; error: {code?: string} | null}): SupabaseClient {
  return {rpc: vi.fn().mockResolvedValue(result)} as unknown as SupabaseClient;
}

describe("worker runtime schema preflight", () => {
  it("accepts the exact authenticated database contract", async () => {
    const contract = await assertWorkerRuntimeSchema(clientWith({
      data: {
        schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
        capabilities: [
          "integration-preview-workflow-continuity.v1",
          "receivables-information-request-bindings.v1",
          "receivables-complete-draft-refresh.v1",
          "universal-dispatch-candidate-shadow.v1",
          "explicit-execution-brief-approval.v1",
          "execution-brief-proposal.v1",
          "governed-sector-planning-context.v1",
          "confirmed-receivables-evidence-scope.v1",
  "document-work-product-request-binding.v1",
        ],
      },
      error: null,
    }));

    expect(contract.schemaVersion).toBe(WORKER_RUNTIME_SCHEMA_VERSION);
  });

  it("stops before queue polling when the endpoint is absent", async () => {
    await expect(assertWorkerRuntimeSchema(clientWith({
      data: null,
      error: {code: "PGRST202"},
    }))).rejects.toThrow("worker database schema contract is unavailable (PGRST202)");
  });

  it("stops when production exposes an older contract", async () => {
    await expect(assertWorkerRuntimeSchema(clientWith({
      data: {schemaVersion: "document-worker-runtime.old", capabilities: []},
      error: null,
    }))).rejects.toThrow(`expected ${WORKER_RUNTIME_SCHEMA_VERSION}`);
  });

  it("stops on the prior production contract even when its version matches", async () => {
    await expect(assertWorkerRuntimeSchema(clientWith({
      data: {
        schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
        capabilities: REQUIRED_WORKER_RUNTIME_CAPABILITIES.slice(0, -1),
      },
      error: null,
    }))).rejects.toThrow("missing capabilities: document-work-product-request-binding.v1");
  });

  it("keeps the image constant aligned with the latest contract migration", () => {
    const migrationsDirectory = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
    const contractMigration = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith("_worker_runtime_schema_contract.sql"))
      .sort()
      .at(-1);

    expect(contractMigration).toBeDefined();
    const sql = readFileSync(`${migrationsDirectory}/${contractMigration}`, "utf8");
    expect(sql.replace(/,\s*/g, ",")).toContain(`'schemaVersion','${WORKER_RUNTIME_SCHEMA_VERSION}'`);
    for (const capability of REQUIRED_WORKER_RUNTIME_CAPABILITIES) {
      expect(sql).toContain(`'${capability}'`);
    }
  });
});
