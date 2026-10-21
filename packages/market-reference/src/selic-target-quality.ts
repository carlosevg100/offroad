import {availableForDataBase, nextCivilDate} from "./market-availability";
import {selicTargetHomologatedFrom, type CopomCommunique, type SelicTargetObservation} from "./selic-target-contract";

/** Quality policy of SGS 432 (decision 5 of the M2 plan). Availability by acquisition is not
 * approval: a change of value with no linked communiqué stays in quarantine. Quality, freshness and
 * right are three separate states; this module decides quality only. */
export const selicTargetQualityPolicy = {id: "bcb-sgs-432-quality", version: "v1"} as const;

export type AcquiredObservation = SelicTargetObservation & {acquiredAt: string};
export type AcquiredCommunique = CopomCommunique & {acquiredAt: string};

export type SelicQualityFinding =
  | {code: "value_out_of_range"; period: string}
  | {code: "calendar_gap"; period: string}
  | {code: "before_homologation"; period: string}
  | {code: "change_without_communique"; period: string; from: string; to: string}
  | {code: "communique_value_mismatch"; period: string; meeting: number}
  | {code: "communique_direction_mismatch"; period: string; meeting: number};

export type SelicChangeLink = {period: string; from: string; to: string; meeting: number; recordSha256: string};

const cmp = (a: string, b: string) => {const x = Number(a), y = Number(b); return x < y ? -1 : x > y ? 1 : 0;};

/** Evaluates a window of the series for a data-base: the series and each communiqué count only when
 * acquired before the data-base limit, so the same day and the exact limit are decided by instants.
 * Changes are linked to the communiqué whose meeting ended the day before; a communiqué inside the
 * window whose next day shows another value is a mismatch, whatever the verb says. */
export function evaluateSelicTarget(input: {observations: readonly AcquiredObservation[]; communiques: readonly AcquiredCommunique[]; dataBase: string}) {
  const findings: SelicQualityFinding[] = [], links: SelicChangeLink[] = [];
  const obs = input.observations.filter((o) => o.period <= input.dataBase && availableForDataBase({acquiredAt: o.acquiredAt, availableAt: o.acquiredAt}, input.dataBase));
  const byChangeDate = new Map<string, AcquiredCommunique>();
  for (const c of input.communiques) {
    if (!availableForDataBase({acquiredAt: c.acquiredAt, availableAt: c.acquiredAt}, input.dataBase)) continue;
    if (byChangeDate.has(c.seriesChangeDate)) throw new Error("market_communique_duplicate_meeting_day");
    byChangeDate.set(c.seriesChangeDate, c);
  }
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i]!, prior = obs[i - 1];
    if (o.period < selicTargetHomologatedFrom) findings.push({code: "before_homologation", period: o.period});
    if (cmp(o.value, "0") < 0 || cmp(o.value, "100") > 0) findings.push({code: "value_out_of_range", period: o.period});
    if (prior && nextCivilDate(prior.period) !== o.period) findings.push({code: "calendar_gap", period: o.period});
    const c = byChangeDate.get(o.period);
    if (c && cmp(c.targetPct, o.value) !== 0) findings.push({code: "communique_value_mismatch", period: o.period, meeting: c.meeting});
    if (!prior || nextCivilDate(prior.period) !== o.period) continue;
    if (prior.value === o.value) {
      if (c && c.decision !== "hold") findings.push({code: "communique_direction_mismatch", period: o.period, meeting: c.meeting});
      continue;
    }
    if (!c) {findings.push({code: "change_without_communique", period: o.period, from: prior.value, to: o.value}); continue;}
    const direction = cmp(o.value, prior.value) > 0 ? "raise" : "cut";
    if (c.decision !== direction) {findings.push({code: "communique_direction_mismatch", period: o.period, meeting: c.meeting}); continue;}
    if (cmp(c.targetPct, o.value) === 0) links.push({period: o.period, from: prior.value, to: o.value, meeting: c.meeting, recordSha256: c.recordSha256});
  }
  return {policy: selicTargetQualityPolicy, status: findings.length === 0 ? "approved" as const : "quarantined" as const, findings, links};
}
