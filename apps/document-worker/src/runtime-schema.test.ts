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
          "domain-event-outbox.v1",
          "pinned-execution-consumer.v1",
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
          "dependency-recompute.v1",
          "dependency-recompute-health.v1",
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
    }))).rejects.toThrow("missing capabilities: dependency-recompute-health.v1");
  });

  it("refuses to read the recompute health before its database migration", async () => {
    await expect(assertWorkerRuntimeSchema(clientWith({
      data: {schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
        capabilities: REQUIRED_WORKER_RUNTIME_CAPABILITIES.filter((capability) => capability !== "dependency-recompute-health.v1")},
      error: null,
    }))).rejects.toThrow("missing capabilities: dependency-recompute-health.v1");
  });

  it("refuses to start the dependency recompute before its database migration", async () => {
    await expect(assertWorkerRuntimeSchema(clientWith({
      data: {schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
        capabilities: REQUIRED_WORKER_RUNTIME_CAPABILITIES.filter((capability) => capability !== "dependency-recompute.v1" && capability !== "provider-resource-retention.v2")},
      error: null,
    }))).rejects.toThrow("missing capabilities: provider-resource-retention.v2, dependency-recompute.v1");
  });

  it("refuses to start the event consumer before its database migration", async () => {
    await expect(assertWorkerRuntimeSchema(clientWith({
      data: {schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
        capabilities: REQUIRED_WORKER_RUNTIME_CAPABILITIES.filter((capability) => capability !== "domain-event-outbox.v1")},
      error: null,
    }))).rejects.toThrow("missing capabilities: domain-event-outbox.v1");
  });

  it("refuses to start before the governed evaluation migration", async () => {
    await expect(assertWorkerRuntimeSchema(clientWith({
      data: {schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
        capabilities: REQUIRED_WORKER_RUNTIME_CAPABILITIES.filter((capability) => capability !== "governed-evaluation-consumer.v1")},
      error: null,
    }))).rejects.toThrow("missing capabilities: governed-evaluation-consumer.v1");
  });

  // The check is image-requires-subset-of-database: a database that lists a capability an image
  // does not know keeps that image booting. This is what lets a migration add a key before the
  // image that requires it is deployed, without stopping the image already running.
  it("boots against a database that lists capabilities this image does not require", async () => {
    const contract = await assertWorkerRuntimeSchema(clientWith({
      data: {schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
        capabilities: [...REQUIRED_WORKER_RUNTIME_CAPABILITIES, "future-consumer.v9"]},
      error: null,
    }));
    expect(contract.capabilities).toContain("future-consumer.v9");
  });

  it("keeps the image constant aligned with the latest contract migration", () => {
    const migrationsDirectory = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
    const contractMigration = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith("_worker_runtime_schema_contract.sql"))
      .sort()
      .at(-1);

    expect(contractMigration).toBeDefined();
    const sql = readFileSync(`${migrationsDirectory}/${contractMigration}`, "utf8");
    const retentionMigration = readdirSync(migrationsDirectory).find((name) => name.endsWith("_provider_resource_retention_eligibility.sql"));
    expect(retentionMigration).toBeDefined();
    expect(readFileSync(`${migrationsDirectory}/${retentionMigration}`, "utf8")).toContain("provider-resource-retention.v2");
    expect(sql.replace(/,\s*/g, ",")).toContain(`'schemaVersion','${WORKER_RUNTIME_SCHEMA_VERSION}'`);
    const accessExtension = readdirSync(migrationsDirectory).find((name) => name.endsWith("_explicit_legacy_resource_access.sql"));
    expect(accessExtension).toBeDefined();
    const accessSql = readFileSync(`${migrationsDirectory}/${accessExtension}`, "utf8");
    const accessCapabilities = ["explicit-resource-access.v1", "explicit-workspace-context.v1", "authenticated-document-storage.v1", "review-bound-execution.v1", "legacy-storage-rotation.v1"];
    for (const capability of accessCapabilities) expect(accessSql).toContain(capability);
    const consumerExtension = readdirSync(migrationsDirectory).find((name) => name.endsWith("_execution_consumer_authority.sql"));
    expect(consumerExtension).toBeDefined();
    const consumerSql = readFileSync(`${migrationsDirectory}/${consumerExtension}`, "utf8");
    expect(consumerSql).toContain("pinned-execution-consumer.v1");
    expect(consumerSql).toContain("pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure)");
    const evaluationExtension = readdirSync(migrationsDirectory).find((name) => name.endsWith("_governed_evaluation_transport.sql"));
    expect(evaluationExtension).toBeDefined();
    const evaluationSql = readFileSync(`${migrationsDirectory}/${evaluationExtension}`, "utf8");
    expect(evaluationSql).toContain("pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure)");
    expect(evaluationSql).toContain(`replace(body,'pinned-execution-consumer.v1','pinned-execution-consumer.v1","governed-evaluation-consumer.v1')`);
    for (const capability of REQUIRED_WORKER_RUNTIME_CAPABILITIES.filter((capability) => capability !== "pinned-execution-consumer.v1" && capability !== "governed-evaluation-consumer.v1" && capability !== "provider-resource-retention.v2" && capability !== "domain-event-outbox.v1" && capability !== "confirmed-receivables-support-sheets.v1" && capability !== "dependency-recompute.v1" && capability !== "dependency-recompute-health.v1" && !accessCapabilities.includes(capability))) {
      expect(sql).toContain(`'${capability}'`);
    }
    const extension = readdirSync(migrationsDirectory).filter((name) => name.endsWith("_confirmed_receivables_support_sheets_v2.sql")).sort().at(-1);
    expect(extension).toBeDefined();
    const additive = readFileSync(`${migrationsDirectory}/${extension}`, "utf8");
    expect(additive).toContain("pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure)");
    expect(additive).toContain("private.worker_runtime_schema_contract_before_support_sheets()");
    expect(additive).toContain(`(c->'capabilities')||'["confirmed-receivables-support-sheets.v1"]'::jsonb`);
    const recompute = readdirSync(migrationsDirectory).filter((name) => name.endsWith("_work_dependency_recompute.sql")).sort().at(-1);
    expect(recompute).toBeDefined();
    const recomputeSql = readFileSync(`${migrationsDirectory}/${recompute}`, "utf8");
    expect(recomputeSql).toContain("pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure)");
    expect(recomputeSql).toContain(`'"provider-resource-retention.v2","dependency-recompute.v1"]''::jsonb'`);
    const health = readdirSync(migrationsDirectory).filter((name) => name.endsWith("_dependency_recompute_health.sql")).sort().at(-1);
    expect(health).toBeDefined();
    const healthSql = readFileSync(`${migrationsDirectory}/${health}`, "utf8");
    expect(healthSql).toContain("pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure)");
    expect(healthSql).toContain(`'"dependency-recompute.v1","dependency-recompute-health.v1"]''::jsonb'`);
  });
});
