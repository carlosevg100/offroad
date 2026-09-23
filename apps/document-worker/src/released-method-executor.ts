import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {releasedMethodArtifacts} from "./released-methods.generated";
import {deriveExecutionProfile, deriveReceivablesExecutionProfile, type ExecutionProfile} from "@offroad/agent-contracts";
import type * as Capital from "@offroad/financial-model";
import type * as Receivables from "@offroad/receivables-analysis";

/** Exact release lookup; unavailable versions never fall back to the current workspace. */
export function releasedMethodArtifact(identity: {methodId: string; methodVersion: string; manifestHash: string}) {
  const release = releasedMethodArtifacts.find((entry) => entry.methodId === identity.methodId && entry.methodVersion === identity.methodVersion && entry.manifestHash === identity.manifestHash);
  if (!release) throw new Error("published_method_executor_unavailable");
  return release;
}

const require = createRequire(import.meta.url);
type ReceivablesRelease = Pick<typeof Receivables, "underwriteReceivablesPool" | "receivablesPoolUnderwritingInputSchema" | "receivablesPoolUnderwritingSchema" | "assessReceivablesPoolMethodReadiness" | "receivablesPoolInputAssemblySchema">;
/** Files belong to the immutable worker image, never to an upload or customer-supplied path. */
export function loadReleasedReceivables(): ReceivablesRelease {
  const release = releasedMethodArtifact({methodId: "underwrite-receivables-pool", methodVersion: "2026.09.06-v1", manifestHash: "17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090"});
  const file = new URL(`../released-methods/${release.artifactHash}.cjs`, import.meta.url);
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== release.artifactHash) throw new Error("published_method_artifact_mismatch");
  return require(fileURLToPath(file)) as ReceivablesRelease;
}


type CapitalRelease = Pick<typeof Capital, "prepareCapitalProcedurePacketV2" | "capitalProcedurePacketV2InputSchema" | "capitalProcedurePacketV2OutputSchema">;
/** Only a packaged version can supply an available method. This loader grants no access. */
export function loadReleasedCapital(identity: {methodId: string; methodVersion: string; manifestHash: string}) {
  if (identity.methodId !== "prepare-capital-structure-decision") throw new Error("published_method_executor_unavailable");
  const release = releasedMethodArtifact(identity);
  const file = new URL(`../released-methods/${release.artifactHash}.cjs`, import.meta.url);
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== release.artifactHash) throw new Error("published_method_artifact_mismatch");
  const manifest = JSON.parse(readFileSync(new URL(`../released-methods/${release.artifactHash}.manifest.json`, import.meta.url), "utf8"));
  const profile = deriveExecutionProfile(manifest, {id: release.platformReleaseId, manifestHash: release.manifestHash});
  const executor = require(fileURLToPath(file)) as CapitalRelease;
  if (typeof executor.prepareCapitalProcedurePacketV2 !== "function" || typeof executor.capitalProcedurePacketV2InputSchema?.parse !== "function"
    || typeof executor.capitalProcedurePacketV2OutputSchema?.parse !== "function") throw new Error("published_method_exports_unavailable");
  return Object.freeze({profile, executor: Object.freeze(executor)});
}

/** Dispatch metadata is fixed by the installed release, never supplied by the caller. */
export function loadReleasedExecutionProfile(identity: {methodId: string; methodVersion: string; manifestHash: string}): ExecutionProfile {
  const release = releasedMethodArtifact(identity);
  if (identity.methodId === "prepare-capital-structure-decision") return loadReleasedCapital(identity).profile;
  if (identity.methodId !== "underwrite-receivables-pool") throw new Error("published_method_executor_unavailable");
  const executor = loadReleasedReceivables();
  for (const schema of [executor.receivablesPoolUnderwritingInputSchema, executor.receivablesPoolUnderwritingSchema]) {
    if (typeof schema?.parse !== "function") throw new Error("published_method_exports_unavailable");
  }
  if (typeof executor.underwriteReceivablesPool !== "function") throw new Error("published_method_exports_unavailable");
  const source = JSON.parse(readFileSync(new URL(`../released-methods/${release.artifactHash}.adapter.json`, import.meta.url), "utf8"));
  return deriveReceivablesExecutionProfile(source, {id: release.platformReleaseId, manifestHash: release.manifestHash, artifactHash: release.artifactHash});
}

/** Validate installed artifacts before polling. Availability is not an execution grant. */
export function verifyInstalledMethodArtifacts(): number {
  for (const release of releasedMethodArtifacts) {
    loadReleasedExecutionProfile(release);
  }
  return releasedMethodArtifacts.length;
}
