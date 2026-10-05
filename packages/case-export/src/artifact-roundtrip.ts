import {createHash} from "node:crypto";
import {canonicalRoundtripJson, logicalManifestProjection, roundtripManifestSchema, type ArtifactManifest, type RoundtripManifest} from "@offroad/domain-contracts";
export {roundtripManifestSchema, roundtripManifestVersion} from "@offroad/domain-contracts";
export type {RoundtripManifest, RoundtripFormat, RoundtripRegion} from "@offroad/domain-contracts";
export {embedRoundtripManifest, extractRoundtripManifest, readRoundtripSnapshot} from "./roundtrip/formats";
export const roundtripSha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
export function roundtripDefinedName(prefix: "in" | "out" | "f", identity: string, period: string): string {
  return `${prefix}.id${roundtripSha256(identity)}.p${roundtripSha256(period)}`;
}
export function logicalManifestFingerprint(manifest: ArtifactManifest): string {
  return roundtripSha256(canonicalRoundtripJson(logicalManifestProjection(manifest)));
}
export type RoundtripEntry = {key: string; blockKey: string | null; role: "input" | "text" | "formula" | "recorded";
  value: string | null; formula: string | null; locator: string; claimIds: readonly string[]};
export type RoundtripSnapshot = {manifest: RoundtripManifest | null; manifestIssue: string | null; sha256: string;
  entries: readonly RoundtripEntry[]; unmatched: readonly {locator: string; value: string}[]};
export type RoundtripReceipt = {revisionId: string; logicalManifestFingerprint: string; sha256: string};
const verified = Symbol("verified historical roundtrip base");
export type VerifiedRoundtripSnapshot = RoundtripSnapshot & {[verified]: true};
/** Called only with a receipt and identity obtained by the authorized server reader. */
export function verifyRoundtripBase(snapshot: RoundtripSnapshot, receipt: RoundtripReceipt,
  identity: {artifactId: string; revisionId: string; revisionNo: number; logicalManifestFingerprint: string}): VerifiedRoundtripSnapshot {
  const manifest = roundtripManifestSchema.parse(snapshot.manifest);
  if (snapshot.manifestIssue || snapshot.sha256 !== receipt.sha256 || manifest.revisionId !== receipt.revisionId
    || manifest.logicalManifestFingerprint !== receipt.logicalManifestFingerprint || manifest.artifactId !== identity.artifactId
    || manifest.revisionId !== identity.revisionId || manifest.revisionNo !== identity.revisionNo
    || manifest.logicalManifestFingerprint !== identity.logicalManifestFingerprint) throw new Error("roundtrip_base_unverified");
  if (new Set(snapshot.entries.map(entry => entry.key)).size !== snapshot.entries.length) throw new Error("roundtrip_base_duplicate_identity");
  for (const formula of manifest.formulas) {
    const cell = snapshot.entries.find(entry => entry.key === `formula:${formula.name}`);
    if (!cell || cell.formula === null || roundtripSha256(cell.formula) !== formula.formulaSha256) throw new Error("roundtrip_base_formula_mismatch");
  }
  return {...snapshot, [verified]: true};
}
export type RoundtripClassification = "unchanged" | "edited" | "conflict" | "missing" | "unmatched" | "formula_changed" | "recorded_edited";
export type RoundtripDifference = {key: string; classification: RoundtripClassification; base: RoundtripEntry | null;
  received: RoundtripEntry | null; current: RoundtripEntry | null; alreadyPresent: boolean};
export type RoundtripComparison = {status: "candidate" | "unmatched"; baseRevisionId: string; headRevisionId: string;
  differences: readonly RoundtripDifference[]; manifestIssue: string | null; baseManifest: RoundtripManifest};
const equal = (a: RoundtripEntry | null, b: RoundtripEntry | null): boolean => a === null || b === null ? a === b
  : a.role === b.role && a.formula === b.formula && (a.role === "formula" || a.value === b.value);
/** No write, authorization grant, revision mutation or economic calculation occurs here. */
export function compareRoundtrip(base: VerifiedRoundtripSnapshot, received: RoundtripSnapshot, current: RoundtripSnapshot): RoundtripComparison {
  if (!base[verified] || !base.manifest || !current.manifest || current.manifest.artifactId !== base.manifest.artifactId)
    throw new Error("roundtrip_trusted_snapshot_required");
  if (new Set(current.entries.map(entry => entry.key)).size !== current.entries.length) throw new Error("roundtrip_current_duplicate_identity");
  const identityLost = received.manifestIssue !== null || !received.manifest
    || canonicalRoundtripJson(received.manifest) !== canonicalRoundtripJson(base.manifest);
  const differences: RoundtripDifference[] = [];
  if (identityLost) {
    for (const [index, entry] of received.entries.entries()) differences.push({key: `unmatched:${entry.key}:${index}`, classification: "unmatched", base: null, received: entry, current: null, alreadyPresent: false});
  } else {
    const currentIndex = new Map(current.entries.map(entry => [entry.key, entry]));
    const receivedIndex = new Map<string, RoundtripEntry>();
    for (const [index, entry] of received.entries.entries()) {
      if (receivedIndex.has(entry.key)) differences.push({key: `duplicate:${roundtripSha256(`${entry.key}:${entry.locator}:${index}`)}`, classification: "unmatched", base: null, received: entry, current: null, alreadyPresent: false});
      else receivedIndex.set(entry.key, entry);
    }
    for (const original of base.entries) {
      const incoming = receivedIndex.get(original.key) ?? null;
      const head = currentIndex.get(original.key) ?? null;
      receivedIndex.delete(original.key);
      let classification: RoundtripClassification;
      if (!incoming) classification = "missing";
      else if (original.formula !== incoming.formula) classification = "formula_changed";
      else if (equal(original, incoming)) classification = "unchanged";
      else if (original.role === "recorded") classification = "recorded_edited";
      else if (equal(original, head) || equal(incoming, head)) classification = "edited";
      else classification = "conflict";
      differences.push({key: original.key, classification, base: original, received: incoming, current: head,
        alreadyPresent: incoming !== null && !equal(original, incoming) && equal(incoming, head)});
    }
    for (const entry of receivedIndex.values()) differences.push({key: entry.key, classification: "unmatched", base: null, received: entry, current: null, alreadyPresent: false});
  }
  for (const [index, content] of received.unmatched.filter(item => identityLost || !base.unmatched.some(original => original.locator === item.locator && original.value === item.value)).entries()) differences.push({key: `loose:${roundtripSha256(`${content.locator}:${index}`)}`, classification: "unmatched", base: null,
    received: {key: `unmatched:${content.locator}`, blockKey: null, role: "text", value: content.value, formula: null, locator: content.locator, claimIds: []}, current: null, alreadyPresent: false});
  return {status: identityLost ? "unmatched" : "candidate", baseRevisionId: base.manifest.revisionId,
    headRevisionId: current.manifest.revisionId, differences, baseManifest: base.manifest, manifestIssue: identityLost ? received.manifestIssue ?? "roundtrip_manifest_mismatch" : null};
}
const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
export type RoundtripContributions = {assumptionChanges: {assumptionId: string; period: string; configurationId?: string; approved: string; proposed: string}[];
  blockProposals: {blockKey: string; content: {text: string}; claims: never[]; supportIds: never[]; detachedClaimIds: string[]}[];
  observations: {key: string; kind: "formula_changed" | "recorded_edited" | "invalid_input"; beforeSha256: string; afterSha256: string}[];
  conflicts: string[]};
export function extractContributions(comparison: RoundtripComparison, manifest: RoundtripManifest): RoundtripContributions {
  if (manifest.revisionId !== comparison.baseRevisionId || canonicalRoundtripJson(manifest) !== canonicalRoundtripJson(comparison.baseManifest)) throw new Error("roundtrip_contribution_base_mismatch");
  const result: RoundtripContributions = {assumptionChanges: [], blockProposals: [], observations: [], conflicts: []};
  for (const diff of comparison.differences) {
    if (diff.classification === "conflict") result.conflicts.push(diff.key);
    if (!diff.base || !diff.received) continue;
    if (diff.classification === "formula_changed" || diff.classification === "recorded_edited") {
      result.observations.push({key: diff.key, kind: diff.classification,
        beforeSha256: roundtripSha256(diff.base.formula ?? diff.base.value ?? ""), afterSha256: roundtripSha256(diff.received.formula ?? diff.received.value ?? "")});
      continue;
    }
    if (comparison.status !== "candidate" || diff.classification !== "edited" || diff.alreadyPresent) continue;
    if (diff.base.role === "input") {
      const binding = manifest.inputs.find(input => `in:${input.name}` === diff.key);
      const approved = binding?.approved ?? diff.base.value; const proposed = diff.received.value;
      if (!binding || approved === null || proposed === null || !decimal.test(approved) || !decimal.test(proposed)) {
        result.observations.push({key: diff.key, kind: "invalid_input", beforeSha256: roundtripSha256(approved ?? ""), afterSha256: roundtripSha256(proposed ?? "")});
      } else result.assumptionChanges.push({assumptionId: binding.assumptionId, period: binding.period, ...(binding.configurationId ? {configurationId: binding.configurationId} : {}), approved, proposed});
    } else if (diff.base.role === "text" && diff.base.blockKey !== null) result.blockProposals.push({blockKey: diff.base.blockKey,
      content: {text: diff.received.value ?? ""}, claims: [], supportIds: [], detachedClaimIds: [...diff.base.claimIds]});
  }
  return result;
}
