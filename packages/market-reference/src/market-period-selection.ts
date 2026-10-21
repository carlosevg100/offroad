import {createHash} from "node:crypto";
import {availableForDataBase} from "./market-availability";

/** Per-period selection among versions of one logical object (decision 4 of the M2 plan).
 *
 * Two clocks: the data-base D (what the source had given the Offroad before the limit of D) and the
 * knowledge instant K (what the Offroad had recorded by then: versions, reprocessings, revocations).
 * A reprocessing creates a version of the same acquisition with a later `recordedAt`; it supersedes
 * the earlier parse from K on and never rewrites a manifest fixed with an earlier K.
 *
 * Between acquisitions the most recent `acquiredAt` wins per period, ties broken by the greater
 * version id. A newer answer that omits a period does not withdraw it: a version covers only the
 * periods it carries. An official withdrawal exists only as a revocation with evidence; it removes
 * the period from the acquisition it was evidenced in on, and a later acquisition that carries the
 * period again brings it back. Rights are a filter before the choice. */
export const marketSelectionVersion = "2026.10.21-v1";

export type SelectableVersion = {
  id: string; acquisitionId: string; acquiredAt: string; recordedAt: string;
  /** The version of the same acquisition this one reprocesses, or null. */
  supersedes: string | null; periods: readonly string[];
};
export type PeriodRevocation = {period: string; acquiredAt: string; recordedAt: string; evidenceSha256: string};
export type ManifestEntry = {period: string; versionId: string};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const instant = (s: string) => {const t = Date.parse(s); if (Number.isNaN(t)) throw new Error("market_instant_invalid"); return t;};

export function selectPeriods(input: {
  versions: readonly SelectableVersion[]; revocations: readonly PeriodRevocation[];
  dataBase: string; knowledgeAt: string; window: {start: string; end: string};
  allowed: (version: SelectableVersion) => boolean;
}): ManifestEntry[] {
  const k = instant(input.knowledgeAt);
  const known = input.versions.filter((v) => {
    if (!uuid.test(v.id) || !uuid.test(v.acquisitionId)) throw new Error("market_version_id_not_canonical");
    return instant(v.recordedAt) <= k;
  });
  const byId = new Map(known.map((v) => [v.id, v]));
  for (const v of known) {
    const previous = v.supersedes === null ? undefined : byId.get(v.supersedes);
    if (previous && previous.acquisitionId !== v.acquisitionId) throw new Error("market_reprocess_other_acquisition");
  }
  const superseded = new Set(known.flatMap((v) => v.supersedes === null ? [] : [v.supersedes]));
  const perAcquisition = new Map<string, SelectableVersion>();
  for (const v of known) {
    if (superseded.has(v.id)) continue;
    if (perAcquisition.has(v.acquisitionId)) throw new Error("market_acquisition_two_current_versions");
    perAcquisition.set(v.acquisitionId, v);
  }
  const eligible = [...perAcquisition.values()].filter((v) => availableForDataBase({acquiredAt: v.acquiredAt, availableAt: v.acquiredAt}, input.dataBase) && input.allowed(v));
  const revoked = input.revocations.filter((r) => instant(r.recordedAt) <= k && availableForDataBase({acquiredAt: r.acquiredAt, availableAt: r.acquiredAt}, input.dataBase));
  const best = new Map<string, SelectableVersion>();
  for (const v of eligible) for (const p of v.periods) {
    if (p > input.dataBase || p < input.window.start || p > input.window.end) continue;
    const cur = best.get(p);
    if (!cur || instant(v.acquiredAt) > instant(cur.acquiredAt) || (instant(v.acquiredAt) === instant(cur.acquiredAt) && v.id > cur.id)) best.set(p, v);
  }
  const out: ManifestEntry[] = [];
  for (const [period, v] of [...best.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (revoked.some((r) => r.period === period && instant(r.acquiredAt) >= instant(v.acquiredAt))) continue;
    out.push({period, versionId: v.id});
  }
  return out;
}

/** The fingerprint a reading fixes: data-base, knowledge instant, window and every (period, version). */
export function manifestSha256(input: {logicalId: string; dataBase: string; knowledgeAt: string; window: {start: string; end: string}; entries: readonly ManifestEntry[]}): string {
  const text = ["market-manifest.v1", `object:${input.logicalId}`, `data-base:${input.dataBase}`,
    `knowledge:${new Date(instant(input.knowledgeAt)).toISOString()}`, `window:${input.window.start}..${input.window.end}`,
    ...input.entries.map((e) => `${e.period}|${e.versionId}`)].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}
