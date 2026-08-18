import type {EvalReport} from "./metrics";
import {checkThresholds, defaultThresholds, type Thresholds} from "./report";

/**
 * Model sweep (P1 plan §15.1): the same gold case run through several model
 * configurations, compared on quality **and** cost. This is how the policy of
 * "never use a stronger model than necessary" is decided with data instead of
 * opinion — a run is only a candidate for production if it clears every
 * threshold; among those, the cheapest wins.
 */
export type SweepRun = {
  /** Human label of the configuration, e.g. `extract:gpt-5.6-terra@medium`. */
  label: string;
  provider: string;
  model: string;
  effort?: string;
  report: EvalReport;
  /** Whether the model is production-allowlisted (sweep candidates are not). */
  productionAllowed: boolean;
};

export type SweepVerdict = {
  label: string;
  passesThresholds: boolean;
  failedThresholds: string[];
  materialRecall: number;
  precision: number;
  hallucinationRate: number;
  exceptionRecall: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  productionAllowed: boolean;
};

export type SweepComparison = {
  caseId: string;
  verdicts: SweepVerdict[];
  /** Cheapest run that clears every threshold and is production-allowlisted. */
  recommended?: SweepVerdict;
  /** Cheapest run that clears every threshold but is not allowlisted yet (evidence to change policy). */
  cheapestQualified?: SweepVerdict;
};

export function compareSweep(runs: SweepRun[], thresholds: Thresholds = defaultThresholds): SweepComparison {
  if (runs.length === 0) throw new Error("compareSweep requires at least one run");
  const verdicts: SweepVerdict[] = runs.map((run) => {
    const checks = checkThresholds(run.report, thresholds);
    const failed = Object.entries(checks)
      .filter(([key, ok]) => key !== "all" && !ok)
      .map(([key]) => key);
    return {
      label: run.label,
      passesThresholds: checks.all,
      failedThresholds: failed,
      materialRecall: run.report.fields.material.recall,
      precision: run.report.fields.precision.value,
      hallucinationRate: run.report.hallucination.rate,
      exceptionRecall: run.report.exceptions.recall,
      costUsd: run.report.usage?.costUsd ?? null,
      latencyMs: run.report.usage?.latencyMs ?? null,
      productionAllowed: run.productionAllowed,
    };
  });

  const qualified = verdicts.filter((verdict) => verdict.passesThresholds);
  const byCost = [...qualified].sort((a, b) => (a.costUsd ?? Number.POSITIVE_INFINITY) - (b.costUsd ?? Number.POSITIVE_INFINITY));
  const comparison: SweepComparison = {caseId: runs[0]!.report.caseId, verdicts};
  const recommended = byCost.find((verdict) => verdict.productionAllowed);
  if (recommended) comparison.recommended = recommended;
  const cheapest = byCost[0];
  if (cheapest && cheapest !== recommended) comparison.cheapestQualified = cheapest;
  return comparison;
}

const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const money = (value: number | null): string => (value === null ? "n/a" : `US$ ${value.toFixed(3)}`);

export function renderSweepMarkdown(comparison: SweepComparison): string {
  const lines: string[] = [];
  lines.push(`# Model sweep — ${comparison.caseId}`);
  lines.push("");
  lines.push("| Configuration | Production | Material recall | Precision | Hallucination | Exceptions | Cost | Verdict |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const verdict of comparison.verdicts) {
    const status = verdict.passesThresholds ? "✅ qualifies" : `❌ ${verdict.failedThresholds.join(", ")}`;
    lines.push(
      `| ${verdict.label} | ${verdict.productionAllowed ? "allowlisted" : "sweep only"} | ${pct(verdict.materialRecall)} | ${pct(verdict.precision)} | ${pct(verdict.hallucinationRate)} | ${pct(verdict.exceptionRecall)} | ${money(verdict.costUsd)} | ${status} |`,
    );
  }
  lines.push("");
  if (comparison.recommended) {
    lines.push(`**Recommended (cheapest qualifying, already allowlisted):** ${comparison.recommended.label} — ${money(comparison.recommended.costUsd)}.`);
  } else {
    lines.push("**No allowlisted configuration cleared every threshold.** Do not promote; investigate before changing policy.");
  }
  if (comparison.cheapestQualified) {
    lines.push("");
    lines.push(
      `**Cheaper candidate outside the allowlist:** ${comparison.cheapestQualified.label} — ${money(comparison.cheapestQualified.costUsd)}. It clears the thresholds on this gold case; promoting it to production requires the same result on the other gold sets (including the adversarial one) and a founder decision, since the allowlist encodes a quality-bar decision, not a technical limit.`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
