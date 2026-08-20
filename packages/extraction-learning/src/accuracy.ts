import Decimal from "decimal.js";

/**
 * What the extractor is actually right about, measured on this desk's own deals.
 *
 * The evaluation suite measures the extractor against a fixture whose answers we wrote. That
 * catches regressions and nothing else: it cannot tell us that this extractor reads audited
 * income statements well and asset appraisals badly, because the fixture is one data room and
 * most fields in it appear once. The feedback ledger can, because it is a record of real
 * reviewers correcting real documents, and it grows with every deal.
 *
 * Two decisions in here carry the weight:
 *
 * **A rate with no sample size is a lie.** A field proposed twice and accepted twice reads as
 * 100%, and a field proposed fifty times and accepted forty-seven reads as 94% — any policy
 * that ranks the first above the second trusts the least-evidenced field the most. Every
 * measurement carries a Wilson lower bound, and the policy reads the bound, never the rate.
 *
 * **A wrong number and a catastrophically wrong number are different failures.** An edit from
 * 71,412,000 to 71,411,986 is a rounding nit. An edit from 71,000,000 to 71,000 is a scale
 * error — the units were misread — and it is the failure that puts an impossible leverage
 * ratio in front of a credit committee. They are counted separately because they call for
 * different responses: one is noise, the other should stop a field being auto-accepted at any
 * confidence.
 *
 * `not_applicable` is excluded from the rate. A reviewer marking a field as not applying to
 * this company is usually describing the company, not the extractor — a business with no
 * receivables facility is not evidence that the receivables field is read badly. It is
 * counted separately so an extractor that floods every case with irrelevant fields is still
 * visible.
 */

export type FeedbackDecision = "accept" | "edit" | "reject" | "not_applicable";

export type FeedbackRow = {
  fieldPath: string;
  fieldGroup: string;
  valueType: string;
  documentKind: string | null;
  extractorKey: string;
  decision: FeedbackDecision;
  /** Normalised, as stored: a decimal string for numbers. */
  proposedValue: string;
  correctedValue: string | null;
  confidence: number;
  anchorVerified: boolean;
};

export type Measurement = {
  fieldPath: string;
  documentKind: string | null;
  /** Decisions that count toward the rate: accepted plus corrected plus rejected. */
  judged: number;
  accepted: number;
  edited: number;
  rejected: number;
  notApplicable: number;
  /** accepted / judged. Read `lowerBound` instead when deciding anything. */
  rate: number;
  /** Wilson score lower bound at 95%. The only number a policy is allowed to trust. */
  lowerBound: number;
  /** Corrections where the magnitude moved by a power of ten: a units or scale misread. */
  scaleErrors: number;
  /** Corrections whose relative change was under 0.5%: the extractor was essentially right. */
  roundingErrors: number;
  /** Mean confidence the extractor reported on the ones it got wrong. */
  confidenceWhenWrong: number | null;
};

/**
 * Wilson score interval, lower bound, at 95%.
 *
 * Chosen over the normal approximation because the normal interval collapses to zero width at
 * 0 and 1 — exactly where a young ledger lives — and would report certainty about a field
 * seen twice.
 */
export function wilsonLowerBound(successes: number, trials: number, z = 1.96): number {
  if (trials <= 0) return 0;
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  return Math.max(0, (centre - margin) / denominator);
}

function numeric(value: string): Decimal | null {
  const cleaned = value.replace(/^"|"$/g, "").trim();
  if (!cleaned) return null;
  try {
    const parsed = new Decimal(cleaned);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export type CorrectionKind = "scale" | "rounding" | "material" | "unknown";

/**
 * Classifies one correction by how badly the extractor was wrong.
 *
 * `scale` when the ratio between proposed and corrected sits on a power of ten — the signature
 * of thousands read as units, or a percentage read as a decimal. It is separated from
 * `material` because a scale error is a systematic misreading that will repeat on every
 * document of that shape, while a material error is usually a one-off misidentification.
 */
export function classifyCorrection(proposed: string, corrected: string): CorrectionKind {
  const a = numeric(proposed);
  const b = numeric(corrected);
  if (!a || !b) return "unknown";
  if (a.isZero()) return b.isZero() ? "rounding" : "material";

  const ratio = b.dividedBy(a);
  if (ratio.lte(0)) return "material";

  const exponent = Math.log10(ratio.abs().toNumber());
  const nearestPower = Math.round(exponent);
  if (nearestPower !== 0 && Math.abs(exponent - nearestPower) < 0.01) return "scale";

  return b.minus(a).dividedBy(a).abs().lt("0.005") ? "rounding" : "material";
}

/**
 * Groups the ledger by field and document kind.
 *
 * Both, not just the field: revenue read off an audited income statement and revenue read off
 * a management deck are the same field and completely different extraction problems, and
 * pooling them hides which one is failing.
 */
export function measureAccuracy(rows: readonly FeedbackRow[]): Measurement[] {
  const groups = new Map<string, FeedbackRow[]>();
  for (const row of rows) {
    // A tab separator, because a field path contains dots and a document kind contains
    // underscores; neither can contain a tab.
    const key = `${row.fieldPath}\t${row.documentKind ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const measurements: Measurement[] = [];
  for (const [key, group] of groups) {
    const [fieldPath = "", kind = ""] = key.split("\t");
    const accepted = group.filter((row) => row.decision === "accept").length;
    const edited = group.filter((row) => row.decision === "edit").length;
    const rejected = group.filter((row) => row.decision === "reject").length;
    const notApplicable = group.filter((row) => row.decision === "not_applicable").length;
    const judged = accepted + edited + rejected;

    let scaleErrors = 0;
    let roundingErrors = 0;
    for (const row of group) {
      if (row.decision !== "edit" || row.correctedValue === null) continue;
      const kindOfError = classifyCorrection(row.proposedValue, row.correctedValue);
      if (kindOfError === "scale") scaleErrors += 1;
      else if (kindOfError === "rounding") roundingErrors += 1;
    }

    const wrong = group.filter((row) => row.decision === "edit" || row.decision === "reject");
    const confidenceWhenWrong =
      wrong.length > 0 ? wrong.reduce((sum, row) => sum + row.confidence, 0) / wrong.length : null;

    measurements.push({
      fieldPath,
      documentKind: kind === "" ? null : kind,
      judged,
      accepted,
      edited,
      rejected,
      notApplicable,
      rate: judged > 0 ? accepted / judged : 0,
      lowerBound: wilsonLowerBound(accepted, judged),
      scaleErrors,
      roundingErrors,
      confidenceWhenWrong,
    });
  }

  // Worst first: the list exists to be acted on, and the top of it is the work.
  return measurements.sort((a, b) => a.lowerBound - b.lowerBound || b.judged - a.judged);
}
