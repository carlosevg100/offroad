import {writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {currentEvidenceRegistry} from "../src/current-evidence-registry.ts";
import {
  canonicalEvidenceFreshnessPolicy,
  evaluateEvidenceRegistryWithResolvers,
} from "../src/evidence-registry.ts";
import {renderEvidenceRegistry} from "../src/evidence-registry-markdown.ts";

const unavailable = async () => { throw new Error("bootstrap registry contains no evidence or claims"); };
const decision = await evaluateEvidenceRegistryWithResolvers(currentEvidenceRegistry, {
  resolveRepository: unavailable,
  resolveExternalArtifact: unavailable,
  resolveSubject: unavailable,
  verifyExternalAttestation: unavailable,
  allowedCollectors: [],
  allowedAttestationIssuers: [],
  freshnessByType: canonicalEvidenceFreshnessPolicy,
  verifier: {principal: "release-governance:registry-renderer", version: "1.0.0"},
}, new Date());
if (!decision.valid) throw new Error(`Evidence registry invalid: ${decision.blockers.map((entry) => entry.code).join(", ")}`);
const outputPath = fileURLToPath(new URL("../../../docs/build/ACCEPTANCE_EVIDENCE_INDEX.md", import.meta.url));
await writeFile(outputPath, renderEvidenceRegistry(currentEvidenceRegistry, decision), "utf8");
