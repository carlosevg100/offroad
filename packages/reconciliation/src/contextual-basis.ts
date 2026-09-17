import {createHash} from "node:crypto";
import {adoptionBasisEnvelopeSchema, adoptionBasisSnapshotSchema, type AdoptionBasisEnvelope, type AdoptionBasisSnapshot} from "@offroad/domain-contracts";

export type {AdoptionBasisEnvelope, AdoptionBasisSnapshot, AdoptionBasisEntry} from "@offroad/domain-contracts";
export type AdoptionBasisScope = {workId: string; purpose: string; versionId: string};

/** Integrity and scope only. Callers obtain bytes through the authorized database reader.
 * A digest does not prove access, human approval, source verification or publication.
 */
export function readContextualBasis(input: AdoptionBasisEnvelope, scope: AdoptionBasisScope): AdoptionBasisSnapshot {
  const envelope = adoptionBasisEnvelopeSchema.parse(input);
  if (createHash("sha256").update(envelope.canonical, "utf8").digest("hex") !== envelope.fingerprint) throw new Error("adoption_basis_integrity_mismatch");
  const snapshot = adoptionBasisSnapshotSchema.parse(JSON.parse(envelope.canonical));
  if (snapshot.workId !== scope.workId || snapshot.purpose !== scope.purpose || snapshot.versionId !== scope.versionId) throw new Error("adoption_basis_scope_mismatch");
  return snapshot;
}
