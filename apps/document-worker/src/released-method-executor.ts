import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {releasedMethodArtifacts} from "./released-methods.generated";
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
