import {createHash} from "node:crypto";

/** `market-canonical.v2`: the text a version's fingerprint is taken over, for observed objects from
 * M2 on (decision 3 of the M2 plan). Version 1 stays verifiable for the seals it signed.
 *
 * Bytes: UTF-8, lines joined by LF, no trailing LF, no BOM. Every field has a closed grammar and is
 * refused outside it, so no escaping exists. Instants are UTC with six fractional digits and `Z`;
 * dates are `YYYY-MM-DD`; decimals are in trimmed form (no exponent, no leading `+`, no leading zero
 * except `0.`, no trailing fractional zero, no `.` without digits, never `-0`). Lists are sorted as
 * stated and an empty list is a header line with nothing under it. A derived object (methodology,
 * dependency versions) has no v2 form yet and is refused. The SQL function of part 1 must reproduce
 * the vectors in `packages/market-reference/vectors/market-canonical-v2.json` byte for byte. */
export const marketCanonicalV2 = "market-canonical.v2";

export type CanonicalV2Input = {
  sourceRevisionId: string;
  seriesContract: {id: string; sha256: string};
  parser: string;
  qualityPolicy: {id: string; version: string};
  availabilityBasis: "observed_at_acquisition";
  acquisitionIds: readonly string[];
  supersedes: string | null;
  links: readonly {meeting: number; referenceDate: string; decision: "raise" | "cut" | "hold"; targetPct: string; recordSha256: string; acquisitionId: string}[];
  observations: readonly {periodStart: string | null; periodEnd: string; availableAt: string; acquiredAt: string; value: string; unit: string; scale: string}[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const slug = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const sha = /^[a-f0-9]{64}$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
const instantText = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const decimal = /^-?\d{1,24}(?:\.\d{1,20})?$/;
const units = new Set(["percent_per_year", "percent_per_month", "ratio", "index_points", "currency", "basis_points", "count"]);

class CanonicalError extends Error {}
const need = (ok: boolean, code: string) => {if (!ok) throw new CanonicalError(code);};
const realDate = (d: string) => date.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Trimmed decimal, the text `trim_scale(x)::text` gives in Postgres for the same numeric. */
export function trimDecimal(value: string): string {
  need(decimal.test(value), "canonical_decimal");
  const negative = value.startsWith("-");
  let [int, frac = ""] = (negative ? value.slice(1) : value).split(".") as [string, string?];
  int = int.replace(/^0+(?=\d)/, ""); frac = frac.replace(/0+$/, "");
  const body = frac ? `${int}.${frac}` : int;
  return negative && /[1-9]/.test(body) ? `-${body}` : body;
}

/** An instant in the canonical UTC form with microseconds. Offsets are normalised; more than six
 * fractional digits are refused rather than rounded. */
export function canonicalInstant(value: string): string {
  const m = instantText.exec(value);
  need(m !== null && realDate(m[1]!), "canonical_instant");
  const micros = (m![5] ?? "").padEnd(6, "0");
  const ms = Date.parse(`${m![1]}T${m![2]}:${m![3]}:${m![4]}${m![6]}`);
  need(!Number.isNaN(ms), "canonical_instant");
  return `${new Date(ms).toISOString().slice(0, 19)}.${micros}Z`;
}

export function canonicalTextV2(input: CanonicalV2Input): string {
  need(uuid.test(input.sourceRevisionId), "canonical_source_revision");
  need(slug.test(input.seriesContract.id) && sha.test(input.seriesContract.sha256), "canonical_series_contract");
  need(slug.test(input.parser), "canonical_parser");
  need(slug.test(input.qualityPolicy.id) && slug.test(input.qualityPolicy.version), "canonical_quality_policy");
  need(input.availabilityBasis === "observed_at_acquisition", "canonical_availability");
  need(input.acquisitionIds.length > 0 && input.acquisitionIds.every((id) => uuid.test(id)), "canonical_inputs");
  need(new Set(input.acquisitionIds).size === input.acquisitionIds.length, "canonical_inputs_repeated");
  need(input.supersedes === null || uuid.test(input.supersedes), "canonical_supersedes");
  const links = input.links.map((l) => {
    need(Number.isInteger(l.meeting) && l.meeting > 0 && realDate(l.referenceDate) && ["raise", "cut", "hold"].includes(l.decision)
      && sha.test(l.recordSha256) && uuid.test(l.acquisitionId), "canonical_link");
    return {meeting: l.meeting, line: `${l.meeting}|${l.referenceDate}|${l.decision}|${trimDecimal(l.targetPct)}|${l.recordSha256}|${l.acquisitionId}`};
  }).sort((a, b) => a.meeting - b.meeting);
  need(new Set(links.map((l) => l.meeting)).size === links.length, "canonical_link_repeated");
  const observations = input.observations.map((o) => {
    need((o.periodStart === null || realDate(o.periodStart)) && realDate(o.periodEnd) && units.has(o.unit) && /^1(?:0{1,9})?$/.test(o.scale), "canonical_observation");
    return {key: `${o.periodEnd}|${o.periodStart ?? ""}`, line: [o.periodStart ?? "", o.periodEnd, canonicalInstant(o.availableAt), canonicalInstant(o.acquiredAt), trimDecimal(o.value), o.unit, o.scale].join("|")};
  }).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  need(new Set(observations.map((o) => o.key)).size === observations.length, "canonical_period_repeated");
  return [
    marketCanonicalV2,
    `source-revision:${input.sourceRevisionId}`,
    `series-contract:${input.seriesContract.id}@${input.seriesContract.sha256}`,
    `parser:${input.parser}`,
    `quality-policy:${input.qualityPolicy.id}@${input.qualityPolicy.version}`,
    `availability:${input.availabilityBasis}`,
    `inputs:${[...input.acquisitionIds].sort().map((id) => `a:${id}`).join(",")}`,
    `supersedes:${input.supersedes ?? "null"}`,
    "links:", ...links.map((l) => l.line),
    "observations:", ...observations.map((o) => o.line),
  ].join("\n");
}

export function canonicalSha256V2(input: CanonicalV2Input): string {
  return createHash("sha256").update(canonicalTextV2(input), "utf8").digest("hex");
}

/** The fingerprint of a series contract: its closed fields in a fixed order, so the canonical text of
 * a version names exactly the contract it was parsed under. */
export function seriesContractSha256(contract: {id: string; host: string; path: string; unit: string; scale: string; convention: string; parser: string; licenseEvidence: string; homologatedFrom: string; maxWindowYears: number}): string {
  const text = ["market-series-contract.v1", `id:${contract.id}`, `host:${contract.host}`, `path:${contract.path}`, `unit:${contract.unit}`,
    `scale:${contract.scale}`, `convention:${contract.convention}`, `parser:${contract.parser}`, `license:${contract.licenseEvidence}`,
    `homologated-from:${contract.homologatedFrom}`, `max-window-years:${contract.maxWindowYears}`].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}
