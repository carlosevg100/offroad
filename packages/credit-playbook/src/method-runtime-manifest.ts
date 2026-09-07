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
    sourceHash: "a43caa74c08bc467e1c0c5e98e3d9ad9eb1b01a0d33d2b91e22a376fc9a41692",
  },
] as const;

export const specialistMethodRuntimeManifestHash = createHash("sha256")
  .update(JSON.stringify(specialistMethodRuntimeManifest))
  .digest("hex");
