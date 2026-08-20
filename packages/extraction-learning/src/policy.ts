import type {Measurement} from "./accuracy";

/**
 * Learning that changes behaviour, rather than learning that fills a dashboard.
 *
 * A measured accuracy nobody acts on is a chart. This turns the ledger into the one decision
 * where being wrong is expensive: whether a proposed value may be accepted without a human
 * looking at it. Today that decision is a single global confidence threshold, which treats
 * every field identically — the extractor's self-reported confidence on a field it has been
 * wrong about four times out of five carries exactly the same weight as on a field it has
 * never missed.
 *
 * Three rules, in the order they fire:
 *
 * **Unproven fields are not auto-accepted.** Below `minimumEvidence` judgements there is no
 * measurement, only noise, and the honest response is to ask a human. This deliberately makes
 * a brand-new field path start locked and earn its way out — the opposite of assuming
 * competence and waiting for a complaint.
 *
 * **A scale error locks the field outright.** Any correction that moved the value by a power
 * of ten means the units were misread, and that misreading will repeat on every document of
 * the same shape. A field with a scale error in its history is never auto-acceptable, whatever
 * its rate, because the failure it produces — an impossible leverage ratio in front of a
 * credit committee — is not the kind you find by sampling.
 *
 * **A field the desk is wrong about more often than a coin flip is locked too.** Raising the
 * confidence bar only works while the extractor's confidence still means something; on a field
 * measured at 10% accuracy it plainly does not, and the bar has a ceiling — 0.99, because a
 * threshold of 1 is just auto-accept switched off while pretending otherwise. Without this
 * floor a field wrong nine times in ten still slipped through at high confidence, which is
 * exactly the case the policy exists to catch.
 *
 * **Otherwise the bar moves with the evidence.** A field whose lower bound clears the target
 * keeps the ordinary threshold; one that clears it only barely has its threshold raised toward
 * the ceiling, so the extractor has to be more certain about the things it has been wrong
 * about. The lower bound is used, never the raw rate, so three-for-three does not outrank
 * forty-seven of fifty.
 */

export type AutoAcceptOptions = {
  /** Confidence a candidate needs when nothing is known against the field. Matches today's 0.95. */
  baseThreshold?: number;
  /** Judged decisions below which a field is not auto-accepted at all. */
  minimumEvidence?: number;
  /** The accuracy the desk is aiming for. Below it, the confidence bar rises. */
  targetAccuracy?: number;
  /** Below this measured lower bound the field is locked outright, whatever the confidence. */
  lockBelowAccuracy?: number;
};

export type FieldPolicy = {
  fieldPath: string;
  documentKind: string | null;
  /** False means: always route to a human, whatever the model says. */
  autoAcceptable: boolean;
  /** Confidence required when `autoAcceptable`. Never below the base threshold. */
  requiredConfidence: number;
  /** Why, in one phrase, for the review screen and for anyone reading a log. */
  reason: "unproven" | "scale_error" | "unreliable" | "below_target" | "proven";
  measurement: Measurement;
};

export type AutoAcceptPolicy = {
  baseThreshold: number;
  /** Keyed `fieldPath\tdocumentKind`; use `decide` rather than reading this directly. */
  fields: Map<string, FieldPolicy>;
  /**
   * The decision for one candidate.
   *
   * A field with no entry falls back to the base threshold rather than being locked: the
   * ledger describes what has been reviewed, and a field nobody has ever been asked about is
   * not evidence of anything. Locking those would stop the product working on day one and
   * teach nothing.
   */
  decide(input: {fieldPath: string; documentKind: string | null; confidence: number}): {
    autoAccept: boolean;
    reason: FieldPolicy["reason"] | "no_history" | "below_confidence";
  };
};

const keyOf = (fieldPath: string, documentKind: string | null) => `${fieldPath}\t${documentKind ?? ""}`;

export function buildAutoAcceptPolicy(measurements: readonly Measurement[], options: AutoAcceptOptions = {}): AutoAcceptPolicy {
  const baseThreshold = options.baseThreshold ?? 0.95;
  const minimumEvidence = options.minimumEvidence ?? 5;
  const targetAccuracy = options.targetAccuracy ?? 0.9;
  const lockBelowAccuracy = options.lockBelowAccuracy ?? 0.5;
  const ceiling = 0.99;

  const fields = new Map<string, FieldPolicy>();
  for (const measurement of measurements) {
    let autoAcceptable = true;
    let requiredConfidence = baseThreshold;
    let reason: FieldPolicy["reason"] = "proven";

    if (measurement.scaleErrors > 0) {
      autoAcceptable = false;
      reason = "scale_error";
    } else if (measurement.judged < minimumEvidence) {
      autoAcceptable = false;
      reason = "unproven";
    } else if (measurement.lowerBound < lockBelowAccuracy) {
      // Past this point the confidence bar is the wrong instrument: the ceiling on it is lower
      // than the certainty this field would need, so raising it would let the field through
      // while looking strict.
      autoAcceptable = false;
      reason = "unreliable";
    } else if (measurement.lowerBound < targetAccuracy) {
      // Raise the bar in proportion to the shortfall, up to the ceiling.
      const shortfall = (targetAccuracy - measurement.lowerBound) / Math.max(targetAccuracy, 0.0001);
      requiredConfidence = Math.min(ceiling, baseThreshold + (1 - baseThreshold) * shortfall);
      reason = "below_target";
    }

    fields.set(keyOf(measurement.fieldPath, measurement.documentKind), {
      fieldPath: measurement.fieldPath,
      documentKind: measurement.documentKind,
      autoAcceptable,
      requiredConfidence,
      reason,
      measurement,
    });
  }

  return {
    baseThreshold,
    fields,
    decide({fieldPath, documentKind, confidence}) {
      // Exact match first, then the field measured across all document kinds: a field that has
      // been failing everywhere should not be rescued by arriving in an unseen document type.
      const policy = fields.get(keyOf(fieldPath, documentKind)) ?? fields.get(keyOf(fieldPath, null));
      if (!policy) {
        return confidence >= baseThreshold ? {autoAccept: true, reason: "no_history"} : {autoAccept: false, reason: "below_confidence"};
      }
      if (!policy.autoAcceptable) return {autoAccept: false, reason: policy.reason};
      return confidence >= policy.requiredConfidence
        ? {autoAccept: true, reason: policy.reason}
        : {autoAccept: false, reason: "below_confidence"};
    },
  };
}

/**
 * The fields the desk should fix next, worst first.
 *
 * Ordered by how much reviewer time each one costs — a field wrong 40% of the time across
 * eighty proposals is a bigger problem than one wrong every time across three, and a list
 * sorted purely by accuracy would put them the other way round.
 */
export function worstOffenders(measurements: readonly Measurement[], limit = 10): Measurement[] {
  return [...measurements]
    .filter((measurement) => measurement.judged > 0 && measurement.accepted < measurement.judged)
    .sort((a, b) => (b.edited + b.rejected) - (a.edited + a.rejected) || a.lowerBound - b.lowerBound)
    .slice(0, limit);
}
