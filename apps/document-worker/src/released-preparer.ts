import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {releasedPreparers} from "./released-preparers.generated";
import type {prepareReceivablesExecutionInput} from "./receivables-preparer-entry";
const require = createRequire(import.meta.url);
const registry = Object.freeze(releasedPreparers.map(release => Object.freeze({...release})));
type Preparer = {receivablesPreparationVersion:string;prepareReceivablesExecutionInput:typeof prepareReceivablesExecutionInput};

/** Technical identity is independent of the financial method; no fallback to source code. */
export function loadReleasedPreparer(id:string) {
  const release = registry.find(item => item.id === id);
  if (!release) throw new Error("preparer_release_unavailable");
  const file = new URL(`../released-methods/${release.artifactHash}.cjs`,import.meta.url);
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== release.artifactHash) throw new Error("preparer_artifact_mismatch");
  const preparer = require(fileURLToPath(file)) as Preparer;
  if (preparer.receivablesPreparationVersion !== release.id || typeof preparer.prepareReceivablesExecutionInput !== "function") throw new Error("preparer_exports_mismatch");
  return Object.freeze({release,preparer:Object.freeze({receivablesPreparationVersion:preparer.receivablesPreparationVersion,prepareReceivablesExecutionInput:preparer.prepareReceivablesExecutionInput})});
}
export function verifyInstalledPreparers():number {
  for (const release of registry) loadReleasedPreparer(release.id);
  return registry.length;
}
