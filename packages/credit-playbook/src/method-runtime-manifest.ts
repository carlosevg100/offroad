import {createHash} from "node:crypto";

/**
 * Build artifact consumed by the bundled worker. The Markdown library remains the source of truth;
 * `method-runtime-manifest.test.ts` fails whenever this projection is stale. Keeping only the
 * routing fields here avoids shipping prose files or a filesystem parser in the production worker.
 */
export const specialistMethodRuntimeManifest = [
  {
    procedure: {
      id: "underwrite-receivables-pool",
      version: "2026.09.06-v1",
      maturity: "production",
    },
    taskIds: ["R01"],
    requiredPackIds: ["analysis.receivables-underwriting"],
    bindingPriority: 100,
    executor: {
      module: "@offroad/receivables-analysis",
      exportName: "underwriteReceivablesPool",
    },
    resultContract: "method.underwrite-receivables-pool.v1",
    sourcePath: "receivables/underwrite-receivables-pool.md",
    sourceHash: "9f5cf24e6751c708a7ff9825afebdd1878e2e07fc652c295df7493cb8e246264",
  },
] as const;

/**
 * Accredited execution policy projected from the same Markdown source as the method binding.
 * Exposure allowlists stay empty on purpose: under `universal` exposure no organization list exists
 * in source control at all. Whether the released reading is open at a given moment is a database
 * answer, not a bundled one: the platform release record can be paused by an operator without a
 * deploy, and a single organization can be paused explicitly.
 */
export const specialistTaskCapabilityRuntimeManifest = [
  {
    taskId: "R01",
    executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
    executorVersion: "2026.09.06-v1",
    procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
    availability: "live",
    exposure: "universal",
    allowedUses: ["internal_validation", "customer_work"],
    allowedEvidenceRegimes: ["project_private", "mixed_governed"],
    allowedDataClasses: ["project_confidential"],
    allowedSourceClasses: ["project_context", "provided_documents", "house_method"],
    allowedProviderIds: [],
    allowedToolIds: [],
    providerRequired: false,
    maximumEffect: "none",
    allowlistedTenantIds: [],
    allowlistedProjectIds: [],
  },
] as const;

export const specialistMethodRuntimeManifestHash = createHash("sha256")
  .update(JSON.stringify(specialistMethodRuntimeManifest))
  .digest("hex");

export const specialistTaskCapabilityRuntimeManifestHash = createHash("sha256")
  .update(JSON.stringify(specialistTaskCapabilityRuntimeManifest))
  .digest("hex");
