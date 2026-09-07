import {evidenceRegistrySchema} from "./evidence-registry";

/**
 * Bootstrap registry for CTRL-03. It intentionally contains no evidence-backed claims: repository
 * documents below are design references only and cannot promote a task or capability.
 */
export const currentEvidenceRegistry = evidenceRegistrySchema.parse({
  registryVersion: "2026.09.07-bootstrap-v2",
  generatedAt: "2026-09-07T00:00:00.000Z",
  evidence: [],
  designReferences: [
    {
      designReferenceId: "DSR-ENDGAME-BLUEPRINT",
      classification: "design_reference",
      title: "Offroad Endgame Execution Blueprint",
      ref: "docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md",
      revision: null,
      purpose: "Defines intended delivery and assurance architecture.",
      limitation: "Design references describe intended behavior and never prove a claim.",
    },
    {
      designReferenceId: "DSR-ACCEPTANCE-EVIDENCE",
      classification: "design_reference",
      title: "Acceptance Evidence working document",
      ref: "docs/build/ACCEPTANCE_EVIDENCE.md",
      revision: null,
      purpose: "Provides historical acceptance context pending migration to verified records.",
      limitation: "Design references describe intended behavior and never prove a claim.",
    },
  ],
  criteria: [],
  claims: [],
  limitations: [
    "This bootstrap establishes the registry contract; it does not assert that any capability, task, control or release has passed a gate.",
    "Existing program evidence must be collected, hashed, verified and bound in a later slice before it can support a claim.",
    "External artifacts require a sanitized immutable reference, SHA-256, exact collector identity, method, version, scope and expiry.",
    "A claim can be supported only by the asynchronous trusted-resolution path; verification fields stored in this registry are never trusted by themselves.",
    "Trusted resolver and attestation-verifier interfaces are implemented, but production collectors, KMS/signature adapters, immutable evidence storage and continuous ingestion remain future slices.",
    "The built-in credential scan covers raw textual external artifacts; binary and encoded-secret inspection remains the responsibility of the future collector pipeline.",
  ],
});
