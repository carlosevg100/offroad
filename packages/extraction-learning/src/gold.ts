import {classifyCorrection, type FeedbackRow} from "./accuracy";

/**
 * Corrections become the next generation of test cases.
 *
 * The evaluation fixture is one synthetic data room with answers we wrote ourselves, which
 * means the extractor is measured against our idea of what is hard. Every correction a
 * reviewer makes is the opposite: a case the extractor got wrong on a real document, with the
 * right answer supplied by somebody who knows the company. That is the most valuable test data
 * this product can produce, and it is produced for free, as a by-product of work people were
 * doing anyway.
 *
 * What comes out of here is a candidate list, not a gold set. Two reasons it must not be
 * promoted automatically:
 *
 * A reviewer can be wrong. A correction is one person's judgement under time pressure, and a
 * case that enshrines their mistake makes the extractor worse while the suite goes green.
 *
 * And the values are a company's real financials. A gold case built from them cannot be
 * committed to a repository, shared with a model vendor, or put in CI without the company
 * agreeing to it. The export deliberately carries no company identifier and no document
 * filename, so what leaves this function is the shape of the mistake rather than the deal —
 * but the numbers themselves are still the company's, and a human decides.
 */

export type GoldCandidate = {
  fieldPath: string;
  fieldGroup: string;
  valueType: string;
  documentKind: string | null;
  /** What the extractor said. */
  proposed: string;
  /** What the reviewer said it should be. */
  expected: string;
  /** How badly it was wrong; `scale` cases are the ones worth fixing first. */
  errorKind: ReturnType<typeof classifyCorrection>;
  /** What the extractor believed when it was wrong. High confidence here is its own finding. */
  confidence: number;
  anchorVerified: boolean;
  /** How many times this exact mistake has been corrected. Repeats are systematic. */
  occurrences: number;
};

/**
 * Turns corrections into deduplicated candidates, most-repeated first.
 *
 * Deduplication is on the mistake, not the row: the same misread appearing in eleven documents
 * is one thing to fix, and eleven near-identical cases in an evaluation suite would weight the
 * score toward whichever error happened to be most common rather than most important.
 */
export function toGoldCandidates(rows: readonly FeedbackRow[]): GoldCandidate[] {
  const byMistake = new Map<string, GoldCandidate>();

  for (const row of rows) {
    if (row.decision !== "edit" || row.correctedValue === null) continue;
    // A "correction" that changed nothing is a reviewer confirming the value through the edit
    // box rather than the accept button. It is not a mistake and must not become a test case.
    if (row.correctedValue === row.proposedValue) continue;

    const key = [row.fieldPath, row.documentKind ?? "", row.proposedValue, row.correctedValue].join("\t");
    const existing = byMistake.get(key);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }

    byMistake.set(key, {
      fieldPath: row.fieldPath,
      fieldGroup: row.fieldGroup,
      documentKind: row.documentKind,
      valueType: row.valueType,
      proposed: row.proposedValue,
      expected: row.correctedValue,
      errorKind: classifyCorrection(row.proposedValue, row.correctedValue),
      confidence: row.confidence,
      anchorVerified: row.anchorVerified,
      occurrences: 1,
    });
  }

  const severity: Record<string, number> = {scale: 0, material: 1, unknown: 2, rounding: 3};
  return [...byMistake.values()].sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      (severity[a.errorKind] ?? 9) - (severity[b.errorKind] ?? 9) ||
      b.confidence - a.confidence,
  );
}

/**
 * The subset worth a human's attention first.
 *
 * A rounding difference is not a bug worth a test case; a scale error, or a mistake the
 * extractor made while reporting high confidence, is a defect in how it reads. Confident and
 * wrong is the worst combination in the ledger, because it is the one that survives every
 * confidence threshold the product can set.
 */
export function priorityCandidates(candidates: readonly GoldCandidate[], confidenceFloor = 0.9): GoldCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.errorKind !== "rounding" && (candidate.errorKind === "scale" || candidate.confidence >= confidenceFloor),
  );
}
