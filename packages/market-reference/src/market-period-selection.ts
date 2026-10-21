import {createHash} from "node:crypto";
import {availableForDataBase, canonicalInstant, instantMicros} from "./market-availability";

/** Per-period selection among versions of one logical object (decision 4 of the M2 plan).
 *
 * Two clocks: the data-base D (what the source had given the Offroad before the limit of D) and the
 * knowledge instant K (what the Offroad had recorded by then: versions, reprocessings, revocations).
 * A reprocessing creates a version of the same acquisition, with the same acquisition instant and a
 * strictly later `recordedAt` than the version it supersedes; it replaces the earlier parse from K on
 * and never rewrites a manifest fixed with an earlier K. A version is superseded at most once.
 *
 * A version serves D only when its evidence was available for D: `evidenceAvailableAt` (the latest
 * acquisition among the series and the communiqués it was evaluated with) is before the limit of D.
 * In each chain of an acquisition, among the versions recorded by K, the most recent one available
 * for D counts; a successor relinked with a communiqué acquired after D leaves its predecessor in
 * place for D, as it stood on that date.
 *
 * Between acquisitions the most recent `acquiredAt` wins per period, ties broken by the greater
 * version id (lowercase canonical UUID, compared byte by byte). A newer answer that omits a period
 * does not withdraw it: a version covers only the periods it carries. An official withdrawal exists
 * only as a revocation with its own id and evidence; it removes the period from every version
 * acquired up to the revocation's acquisition, and a later acquisition that carries the period again
 * brings it back. Rights are a filter before the choice. Every instant is compared in microseconds,
 * the precision of the database. */
export const marketSelectionVersion = "2026.10.21-v3";

export type SelectableVersion = {
  id: string; acquisitionId: string; acquiredAt: string; recordedAt: string;
  /** The latest acquisition instant among the version's own acquisition and its evidence. */
  evidenceAvailableAt: string;
  /** The version of the same acquisition this one reprocesses, or null. */
  supersedes: string | null; periods: readonly string[];
};
export type PeriodRevocation = {id: string; period: string; acquiredAt: string; recordedAt: string; evidenceSha256: string};
export type ManifestEntry = {period: string; versionId: string};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha = /^[a-f0-9]{64}$/;
const date = /^\d{4}-\d{2}-\d{2}$/;

/** Checks the whole recorded history, whatever K is: identities, acquisition instants and the chain
 * of reprocessings. A broken history is an error, never a silent choice. */
function checkHistory(versions: readonly SelectableVersion[], revocations: readonly PeriodRevocation[]) {
  const byId = new Map<string, SelectableVersion>(), acquiredAt = new Map<string, bigint>(), successor = new Set<string>();
  for (const v of versions) {
    if (!uuid.test(v.id) || !uuid.test(v.acquisitionId)) throw new Error("market_version_id_not_canonical");
    if (byId.has(v.id)) throw new Error("market_version_repeated");
    if (!v.periods.every((p) => date.test(p)) || new Set(v.periods).size !== v.periods.length) throw new Error("market_version_periods");
    const at = instantMicros(v.acquiredAt), known = acquiredAt.get(v.acquisitionId);
    if (known !== undefined && known !== at) throw new Error("market_acquisition_instant_changed");
    if (instantMicros(v.recordedAt) < at) throw new Error("market_version_recorded_before_acquisition");
    if (instantMicros(v.evidenceAvailableAt) < at) throw new Error("market_version_evidence_before_acquisition");
    acquiredAt.set(v.acquisitionId, at); byId.set(v.id, v);
  }
  for (const v of versions) {
    if (v.supersedes === null) continue;
    const previous = byId.get(v.supersedes);
    if (!previous) throw new Error("market_reprocess_unknown_predecessor");
    if (previous.acquisitionId !== v.acquisitionId) throw new Error("market_reprocess_other_acquisition");
    if (instantMicros(v.recordedAt) <= instantMicros(previous.recordedAt)) throw new Error("market_reprocess_not_after_predecessor");
    if (successor.has(v.supersedes)) throw new Error("market_reprocess_forked");
    successor.add(v.supersedes);
  }
  const revocationIds = new Set<string>();
  for (const r of revocations) {
    if (!uuid.test(r.id) || revocationIds.has(r.id) || !sha.test(r.evidenceSha256) || !date.test(r.period)) throw new Error("market_revocation_invalid");
    if (instantMicros(r.recordedAt) < instantMicros(r.acquiredAt)) throw new Error("market_revocation_recorded_before_acquisition");
    revocationIds.add(r.id);
  }
}

export function selectPeriods(input: {
  versions: readonly SelectableVersion[]; revocations: readonly PeriodRevocation[];
  dataBase: string; knowledgeAt: string; window: {start: string; end: string};
  allowed: (version: SelectableVersion) => boolean;
}): ManifestEntry[] {
  checkHistory(input.versions, input.revocations);
  const k = instantMicros(input.knowledgeAt);
  const known = input.versions.filter((v) => instantMicros(v.recordedAt) <= k);
  const superseded = new Set(known.flatMap((v) => v.supersedes === null ? [] : [v.supersedes]));
  const current = known.filter((v) => !superseded.has(v.id));
  if (new Set(current.map((v) => v.acquisitionId)).size !== current.length) throw new Error("market_acquisition_two_current_versions");
  // Per chain, the most recent version recorded by K whose evidence was available for D. The right is
  // applied to that version only: refusing a successor never brings its predecessor back.
  const available = known.filter((v) => availableForDataBase({acquiredAt: v.acquiredAt, availableAt: v.evidenceAvailableAt}, input.dataBase));
  const latest = new Map<string, SelectableVersion>();
  for (const v of available) {
    const cur = latest.get(v.acquisitionId);
    if (!cur || instantMicros(v.recordedAt) > instantMicros(cur.recordedAt)) latest.set(v.acquisitionId, v);
  }
  const eligible = [...latest.values()].filter((v) => input.allowed(v));
  const revoked = input.revocations.filter((r) => instantMicros(r.recordedAt) <= k && availableForDataBase({acquiredAt: r.acquiredAt, availableAt: r.acquiredAt}, input.dataBase));
  const best = new Map<string, SelectableVersion>();
  for (const v of eligible) for (const p of v.periods) {
    if (p > input.dataBase || p < input.window.start || p > input.window.end) continue;
    const cur = best.get(p);
    const a = instantMicros(v.acquiredAt), b = cur ? instantMicros(cur.acquiredAt) : -1n;
    if (!cur || a > b || (a === b && v.id > cur.id)) best.set(p, v);
  }
  const out: ManifestEntry[] = [];
  for (const [period, v] of [...best.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (revoked.some((r) => r.period === period && instantMicros(r.acquiredAt) >= instantMicros(v.acquiredAt))) continue;
    out.push({period, versionId: v.id});
  }
  return out;
}

/** The fingerprint a reading fixes: data-base, knowledge instant (microseconds), window and every
 * (period, version) in ascending period order. */
export function manifestSha256(input: {logicalId: string; dataBase: string; knowledgeAt: string; window: {start: string; end: string}; entries: readonly ManifestEntry[]}): string {
  const text = ["market-manifest.v1", `object:${input.logicalId}`, `data-base:${input.dataBase}`,
    `knowledge:${canonicalInstant(input.knowledgeAt)}`, `window:${input.window.start}..${input.window.end}`,
    ...input.entries.map((e) => `${e.period}|${e.versionId}`)].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}
