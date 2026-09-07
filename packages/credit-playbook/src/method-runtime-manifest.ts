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
      maturity: "implemented",
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
    sourceHash: "2c7911e31f79556ce77bbf197eebe5d5c19e734dc86a5a0e1e83f701331b7ecc",
  },
] as const;

/**
 * Accredited execution policy projected from the same Markdown source as the method binding.
 * Exposure allowlists are deliberately absent here: an internal/shadow method cannot become a
 * customer capability merely because a tenant id appeared in source control.
 */
export const specialistTaskCapabilityRuntimeManifest = [
  {
    taskId: "R01",
    executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
    executorVersion: "2026.09.06-v1",
    procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
    availability: "shadow",
    exposure: "internal",
    allowedUses: ["internal_validation"],
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
