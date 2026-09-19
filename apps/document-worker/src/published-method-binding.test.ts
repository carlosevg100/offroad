import {describe, expect, it} from "vitest";
import {procedureBuildProvenance} from "@offroad/credit-playbook";
import {assertPublishedMethodBinding} from "./published-method-binding";
const built = procedureBuildProvenance.find(p => p.procedure.id === "underwrite-receivables-pool")!;
const binding = {platformReleaseId: "r01-2026.09.06-v1", baseManifestHash: built.manifestHash, houseReleaseId: null, manifestFingerprint: built.manifestHash, processingRunId: "20000000-0000-4000-8000-000000000001", methodId: built.procedure.id, methodVersion: built.procedure.version};
describe("published method worker boundary", () => {
 it("accepts only a pin whose build manifest is available in this image", () => {expect(assertPublishedMethodBinding(binding)).toEqual(binding);});
 it("rejects missing publication and a substituted manifest or executor version", () => {
  expect(() => assertPublishedMethodBinding(null)).toThrow("method_release_binding_required");
  expect(() => assertPublishedMethodBinding({...binding,baseManifestHash:"0".repeat(64)})).toThrow("method_release_manifest_mismatch");
  expect(() => assertPublishedMethodBinding({...binding,methodVersion:"2026.09.19-v1"})).toThrow("method_release_manifest_mismatch");
  expect(() => assertPublishedMethodBinding({...binding,manifestFingerprint:"0".repeat(64)})).toThrow("method_release_manifest_mismatch");
 });
 it("does not accept a publication flag in place of the server pin", () => {expect(() => assertPublishedMethodBinding({published:true})).toThrow("method_release_binding_required");});
});
