import {releasedMethodArtifact} from "./released-method-executor";
import {z} from "zod";
import {procedureBuildProvenance} from "@offroad/credit-playbook";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const publishedMethodBindingSchema = z.object({platformReleaseId: z.string().min(1), baseManifestHash: hash, houseReleaseId: z.uuid().nullable(), manifestFingerprint: hash, processingRunId: z.uuid(), methodId: z.string().min(1), methodVersion: z.string().min(1)}).strict();
export type PublishedMethodBinding = z.infer<typeof publishedMethodBindingSchema>;
export function assertPublishedMethodBinding(value: unknown): PublishedMethodBinding {
 const parsed = publishedMethodBindingSchema.safeParse(value);
 if (!parsed.success) throw new Error("method_release_binding_required");
 const binding = parsed.data;
 const built = procedureBuildProvenance.find(p => p.procedure.id === binding.methodId && p.procedure.version === binding.methodVersion);
 if (!built || built.manifestHash !== binding.baseManifestHash || (!binding.houseReleaseId && binding.manifestFingerprint !== binding.baseManifestHash)) throw new Error("method_release_manifest_mismatch");
 const artifact = releasedMethodArtifact({methodId: binding.methodId, methodVersion: binding.methodVersion, manifestHash: binding.baseManifestHash});
 if (artifact.platformReleaseId !== binding.platformReleaseId) throw new Error("method_release_executor_mismatch");
 return binding;
}
