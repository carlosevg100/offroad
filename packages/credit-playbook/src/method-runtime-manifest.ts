import {createHash} from "node:crypto";
import {methodContentHash} from "./procedure-compiler";
import {specialistMethodRuntimeManifest, specialistTaskCapabilityRuntimeManifest, procedureBuildProvenance, procedureExecutorSourceClosures} from "./method-runtime-manifest.generated";

// Source of truth: Markdown and the compiler. Generate; never edit the projection by hand.
export {specialistMethodRuntimeManifest, specialistTaskCapabilityRuntimeManifest, specialistMethodApprovalManifest, procedureBuildProvenance, procedureExecutorSourceClosures} from "./method-runtime-manifest.generated";

// Compatibility boundary: existing R01 routing/accreditation hashes remain byte-identical.
export const specialistMethodRuntimeManifestHash = createHash("sha256")
  .update(JSON.stringify(specialistMethodRuntimeManifest)).digest("hex");
export const specialistTaskCapabilityRuntimeManifestHash = createHash("sha256")
  .update(JSON.stringify(specialistTaskCapabilityRuntimeManifest)).digest("hex");

/** Integrity check only; database release and access gates remain mandatory. */
export function assertBundledMethodProvenance(method: {
  procedure: {id: string; version: string};
  sourceHash: string;
  executor: {module: string; exportName: string};
}): void {
  const provenance = procedureBuildProvenance.find((entry) => entry.procedure.id === method.procedure.id && entry.procedure.version === method.procedure.version);
  if (!provenance || !("executor" in provenance) || !provenance.executor) throw new Error("method_build_provenance_missing");
  const {manifestHash, ...payload} = provenance;
  const closure = (procedureExecutorSourceClosures as Record<string, readonly {path: string; hash: string}[]>)[provenance.executor.sourceClosureHash];
  if (methodContentHash(payload) !== manifestHash || provenance.source.hash !== method.sourceHash
    || provenance.executor.module !== method.executor.module || provenance.executor.exportName !== method.executor.exportName
    || !closure || methodContentHash(closure) !== provenance.executor.sourceClosureHash
    || methodContentHash(provenance.compiler.sources) !== provenance.compiler.hash) throw new Error("method_build_provenance_mismatch");
}
