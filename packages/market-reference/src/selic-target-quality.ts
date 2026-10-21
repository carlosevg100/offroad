import {availableForDataBase, nextCivilDate} from "./market-availability";
import {selicTargetHomologatedFrom, type CopomCommunique, type SelicTargetObservation} from "./selic-target-contract";

/** Quality policy of SGS 432 (decision 5 of the M2 plan). Availability by acquisition is not
 * approval: a change of value with no linked communiqué stays in quarantine, and so does a window
 * whose first level no communiqué supports. Quality, freshness and right are three separate states;
 * this module decides quality only. */
export const selicTargetQualityPolicy = {id: "bcb-sgs-432-quality", version: "v2"} as const;

export type AcquiredObservation = SelicTargetObservation & {acquiredAt: string};
export type AcquiredCommunique = CopomCommunique & {acquiredAt: string};

export type SelicQualityFinding =
  | {code: "no_observation"}
  | {code: "value_out_of_range"; period: string}
  | {code: "calendar_gap"; period: string}
  | {code: "before_homologation"; period: string}
  | {code: "start_without_anchor"; period: string}
  | {code: "anchor_value_mismatch"; period: string; meeting: number}
  | {code: "change_without_communique"; period: string; from: string; to: string}
  | {code: "communique_value_mismatch"; period: string; meeting: number}
  | {code: "communique_direction_mismatch"; period: string; meeting: number};

export type SelicChangeLink = {period: string; from: string; to: string; meeting: number; recordSha256: string};

/** Numeric comparison of two decimals in the source's form (digits, optional point and fraction). */
export function compareDecimal(a: string, b: string): number {
  const norm = (x: string) => {
    if (!/^\d+(?:\.\d+)?$/.test(x)) throw new Error("market_decimal_invalid");
    const [i, f = ""] = x.split(".") as [string, string?];
    return [i.replace(/^0+(?=\d)/, ""), f.replace(/0+$/, "")] as const;
  };
  const [ai, af] = norm(a), [bi, bf] = norm(b);
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const w = Math.max(af.length, bf.length), x = af.padEnd(w, "0"), y = bf.padEnd(w, "0");
  return x === y ? 0 : x < y ? -1 : 1;
}

/** Evaluates the requested window for a data-base. The series and each communiqué count only when
 * acquired before the data-base limit, so the same day and the exact limit are decided by instants.
 * The window must be covered day by day from its start to the earlier of its end and D. The first
 * level is anchored to the latest communiqué whose series change date is on or before the window's
 * start, which must state that level. Each later change is linked to the communiqué whose meeting
 * ended the day before, with the same rate and direction; a communiqué inside the window whose next
 * day shows another value, or a raise or cut with no change, is a mismatch. */
export function evaluateSelicTarget(input: {
  observations: readonly AcquiredObservation[]; communiques: readonly AcquiredCommunique[];
  window: {start: string; end: string}; dataBase: string;
}) {
  const findings: SelicQualityFinding[] = [], links: SelicChangeLink[] = [];
  const last = input.window.end < input.dataBase ? input.window.end : input.dataBase;
  const obs = input.observations.filter((o) => o.period >= input.window.start && o.period <= last && availableForDataBase({acquiredAt: o.acquiredAt, availableAt: o.acquiredAt}, input.dataBase));
  const byChangeDate = new Map<string, AcquiredCommunique>();
  for (const c of input.communiques) {
    if (!availableForDataBase({acquiredAt: c.acquiredAt, availableAt: c.acquiredAt}, input.dataBase)) continue;
    if (byChangeDate.has(c.seriesChangeDate)) throw new Error("market_communique_duplicate_meeting_day");
    byChangeDate.set(c.seriesChangeDate, c);
  }
  const result = (anchor: AcquiredCommunique | null) => ({policy: selicTargetQualityPolicy, status: findings.length === 0 ? "approved" as const : obs.length === 0 ? "insufficient" as const : "quarantined" as const, findings, links, anchor: anchor === null ? null : {meeting: anchor.meeting, recordSha256: anchor.recordSha256}});
  if (input.window.start > last) {findings.push({code: "no_observation"}); return result(null);}
  if (obs.length === 0) {findings.push({code: "no_observation"}); return result(null);}

  let anchor: AcquiredCommunique | null = null;
  for (const [day, c] of byChangeDate) if (day <= input.window.start && (anchor === null || day > anchor.seriesChangeDate)) anchor = c;
  const first = obs[0]!;
  if (first.period !== input.window.start) findings.push({code: "calendar_gap", period: input.window.start});
  else if (anchor === null) findings.push({code: "start_without_anchor", period: first.period});
  else if (compareDecimal(anchor.targetPct, first.value) !== 0) findings.push({code: "anchor_value_mismatch", period: first.period, meeting: anchor.meeting});

  for (let i = 0; i < obs.length; i++) {
    const o = obs[i]!, prior = obs[i - 1];
    if (o.period < selicTargetHomologatedFrom) findings.push({code: "before_homologation", period: o.period});
    if (compareDecimal(o.value, "100") > 0) findings.push({code: "value_out_of_range", period: o.period});
    if (prior && nextCivilDate(prior.period) !== o.period) findings.push({code: "calendar_gap", period: nextCivilDate(prior.period)});
    const c = i === 0 ? undefined : byChangeDate.get(o.period);
    if (c && compareDecimal(c.targetPct, o.value) !== 0) findings.push({code: "communique_value_mismatch", period: o.period, meeting: c.meeting});
    if (!prior || nextCivilDate(prior.period) !== o.period) continue;
    const step = compareDecimal(o.value, prior.value);
    if (step === 0) {
      if (c && c.decision !== "hold") findings.push({code: "communique_direction_mismatch", period: o.period, meeting: c.meeting});
      continue;
    }
    if (!c) {findings.push({code: "change_without_communique", period: o.period, from: prior.value, to: o.value}); continue;}
    if (c.decision !== (step > 0 ? "raise" : "cut")) {findings.push({code: "communique_direction_mismatch", period: o.period, meeting: c.meeting}); continue;}
    if (compareDecimal(c.targetPct, o.value) === 0) links.push({period: o.period, from: prior.value, to: o.value, meeting: c.meeting, recordSha256: c.recordSha256});
  }
  const lastSeen = obs.at(-1)!.period;
  if (lastSeen < last) findings.push({code: "calendar_gap", period: nextCivilDate(lastSeen)});
  return result(anchor);
}
