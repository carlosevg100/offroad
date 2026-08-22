import type {EvalReport} from "./metrics";

const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

/** Markdown summary of one evaluation (the artifact CI and reviewers read). */
export function renderMarkdownReport(report: EvalReport, options: {thresholds?: Thresholds} = {}): string {
  const thresholds = options.thresholds ?? defaultThresholds;
  const verdicts = checkThresholds(report, thresholds);
  const lines: string[] = [];
  lines.push(`# Eval: ${report.caseId} · ${report.extractor.name}@${report.extractor.version}`);
  lines.push("");
  lines.push("| Metric | Value | Threshold | Status |");
  lines.push("|---|---|---|---|");
  lines.push(`| Material fields recall | ${pct(report.fields.material.recall)} (${report.fields.material.matched}/${report.fields.material.expected}) | ≥ ${pct(thresholds.materialRecall)} | ${flag(verdicts.materialRecall)} |`);
  lines.push(`| All fields recall | ${pct(report.fields.all.recall)} (${report.fields.all.matched}/${report.fields.all.expected}) | n/a | n/a |`);
  lines.push(`| Precision on comparable candidates | ${pct(report.fields.precision.value)} (${report.fields.precision.correct}/${report.fields.precision.comparable}${report.fields.precision.flagged ? `, ${report.fields.precision.flagged} flagged as contradictions` : ""}) | ≥ ${pct(thresholds.precision)} | ${flag(verdicts.precision)} |`);
  lines.push(`| Unscored candidates (fields not in gold) | ${report.fields.unscoredCandidates} | n/a | n/a |`);
  lines.push(`| Hallucination rate (auto-accepted material without verified anchor) | ${pct(report.hallucination.rate)} (${report.hallucination.withoutVerifiedAnchor}/${report.hallucination.autoAcceptedMaterial}) | = 0 | ${flag(verdicts.hallucination)} |`);
  lines.push(`| Classification accuracy | ${pct(report.classification.accuracy)} (${report.classification.correct}/${report.classification.expected}) | ≥ ${pct(thresholds.classification)} | ${report.classification.accuracy === null ? "n/a" : flag(verdicts.classification)} |`);
  lines.push(`| Exception recall | ${pct(report.exceptions.recall)} · false positives ${report.exceptions.falsePositives}/${report.exceptions.produced} rule-based · ${report.exceptions.gaps} gaps | ≥ ${pct(thresholds.exceptionRecall)} | ${report.exceptions.recall === null ? "n/a" : flag(verdicts.exceptionRecall)} |`);
  lines.push(`| Calculations matched | ${pct(report.calculations.recall)} (${report.calculations.matched}/${report.calculations.expected}) | n/a | n/a |`);
  lines.push(`| Acceptance weight (evaluated) | ${report.acceptance.passedWeight}/${report.acceptance.totalWeight} · critical failures: ${report.acceptance.criticalFailures.join(", ") || "none"} | n/a | n/a |`);
  if (report.usage) lines.push(`| Cost / calls | US$ ${report.usage.costUsd.toFixed(4)} · ${report.usage.calls} calls | n/a | n/a |`);
  lines.push("");
  lines.push("## Fields");
  lines.push("");
  lines.push("| Field | Materiality | Expected | Found | Status |");
  lines.push("|---|---|---|---|---|");
  for (const outcome of report.fields.outcomes) {
    lines.push(`| ${outcome.fieldPath}${outcome.periodEnd ? ` (${outcome.periodEnd})` : ""} | ${outcome.materiality} | ${outcome.expected} | ${outcome.found ?? "n/a"} | ${outcome.status} |`);
  }
  lines.push("");
  lines.push("## Exceptions");
  lines.push("");
  lines.push("| Id | Severity | Status | Matched by |");
  lines.push("|---|---|---|---|");
  for (const outcome of report.exceptions.outcomes) lines.push(`| ${outcome.id} | ${outcome.severity} | ${outcome.status} | ${outcome.matchedBy ?? "n/a"} |`);
  lines.push("");
  lines.push("## Acceptance criteria");
  lines.push("");
  lines.push("| Id | Weight | Critical | Status | Reasons |");
  lines.push("|---|---|---|---|---|");
  for (const outcome of report.acceptance.outcomes) lines.push(`| ${outcome.id} | ${outcome.weight} | ${outcome.critical ? "yes" : "no"} | ${outcome.status} | ${outcome.reasons.join("; ") || "n/a"} |`);
  lines.push("");
  return lines.join("\n");
}

export type Thresholds = {
  materialRecall: number;
  precision: number;
  hallucinationMax: number;
  classification: number;
  exceptionRecall: number;
};

/** P1 plan §14.2 initial thresholds (G1 material recall is stricter: 0.95). */
export const defaultThresholds: Thresholds = {materialRecall: 0.9, precision: 0.98, hallucinationMax: 0, classification: 0.95, exceptionRecall: 0.9};

export function checkThresholds(report: EvalReport, thresholds: Thresholds = defaultThresholds): {materialRecall: boolean; precision: boolean; hallucination: boolean; classification: boolean; exceptionRecall: boolean; all: boolean} {
  const materialRecall = report.fields.material.recall >= thresholds.materialRecall;
  const precision = report.fields.precision.value >= thresholds.precision;
  const hallucination = report.hallucination.rate <= thresholds.hallucinationMax;
  const classification = report.classification.accuracy === null ? false : report.classification.accuracy >= thresholds.classification;
  const exceptionRecall = report.exceptions.recall === null ? false : report.exceptions.recall >= thresholds.exceptionRecall;
  return {materialRecall, precision, hallucination, classification, exceptionRecall, all: materialRecall && precision && hallucination && classification && exceptionRecall};
}

function flag(ok: boolean): string {
  return ok ? "✅" : "❌";
}
