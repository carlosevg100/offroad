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
      maturity: "tested",
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
    sourceHash: "51215b4cfdbf01b42edfeb23772c83cb707c544e9c8fe1faa6b048bd1747bc0c",
  },
] as const;

/**
 * Accredited execution policy projected from the same Markdown source as the method binding.
 * Exposure allowlists are deliberately absent here: the organizations allowed to read the released
 * analytical result live in the database grant, never in source control, and an allowlisted method
 * with an empty bundled allowlist stays closed to the universal dispatcher.
 */
export const specialistTaskCapabilityRuntimeManifest = [
  {
    taskId: "R01",
    executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
    executorVersion: "2026.09.06-v1",
    procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
    availability: "shadow",
    exposure: "allowlisted",
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
