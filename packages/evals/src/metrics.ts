import Decimal from "decimal.js";
import {normalizeText} from "@offroad/document-intelligence";
import type {GoldCase, GoldField, Tolerance} from "./gold";
import type {ExtractionSnapshot, SnapshotCandidate} from "./snapshot";

export type FieldOutcome = {
  fieldPath: string;
  materiality: "material" | "supporting";
  expected: string;
  found?: string;
  status: "matched" | "wrong_value" | "missing";
  periodEnd?: string;
};

export type ExceptionOutcome = {id: string; severity: string; status: "detected" | "missed"; matchedBy?: string};

export type AcceptanceOutcome = {id: string; critical: boolean; weight: number; status: "pass" | "fail" | "not_evaluated"; reasons: string[]};

export type EvalReport = {
  caseId: string;
  extractor: ExtractionSnapshot["extractor"];
  fields: {
    outcomes: FieldOutcome[];
    material: {expected: number; matched: number; recall: number};
    all: {expected: number; matched: number; recall: number};
    /** Among produced candidates whose field is in the gold set: correct / comparable. */
    precision: {comparable: number; correct: number; value: number};
    unscoredCandidates: number;
  };
  hallucination: {autoAcceptedMaterial: number; withoutVerifiedAnchor: number; rate: number};
  classification: {expected: number; correct: number; accuracy: number | null};
  exceptions: {outcomes: ExceptionOutcome[]; recall: number | null; falsePositives: number; produced: number};
  calculations: {expected: number; matched: number; recall: number | null};
  acceptance: {outcomes: AcceptanceOutcome[]; passedWeight: number; totalWeight: number; criticalFailures: string[]};
  usage?: ExtractionSnapshot["usage"];
};

export function valuesMatch(expected: string, found: string, valueType: GoldField["valueType"], tolerance: Tolerance): boolean {
  if (valueType === "number") {
    let a: Decimal;
    let b: Decimal;
    try {
      a = new Decimal(expected);
      b = new Decimal(found);
    } catch {
      return false;
    }
    if (tolerance.kind === "exact") return a.equals(b);
    const diff = a.minus(b).abs();
    if (tolerance.kind === "absolute") return diff.lessThanOrEqualTo(new Decimal(tolerance.value));
    if (a.isZero()) return diff.isZero();
    return diff.dividedBy(a.abs()).lessThanOrEqualTo(new Decimal(tolerance.value));
  }
  if (valueType === "list") {
    try {
      const left = (JSON.parse(expected) as string[]).map(normalizeText).sort();
      const right = (JSON.parse(found) as string[]).map(normalizeText).sort();
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return normalizeText(expected) === normalizeText(found);
}

function candidateMatchesField(candidate: SnapshotCandidate, field: GoldField): boolean {
  if (candidate.fieldPath !== field.fieldPath) return false;
  if (field.periodEnd && candidate.periodEnd && field.periodEnd !== candidate.periodEnd) return false;
  return true;
}

/** `transaction.sources_and_uses.3.amount` → group `transaction.sources_and_uses`, index `3`, key `amount`. */
// One to three digits: an {i} index, never a year such as historical_financials.2025.
const indexedPath = /^(.*)\.(\d{1,3})\.([a-z0-9_]+)$/;

/**
 * Re-indexes {i}-grouped candidates so tuples are matched by content, not by position.
 *
 * The index in `sources_and_uses.{i}` is presentation order, and presentation order is not a
 * fact: a document that lists uses before sources states the same six facts as the answer key
 * that lists sources first. Comparing by index scores a correct extraction as six wrong
 * values — which is noise, and noise in the gate hides real defects. So, per group, gold
 * tuples and extracted tuples are paired greedily by how many of their fields agree, and the
 * candidates are rewritten to the gold tuple's index. Genuinely wrong tuples still fail:
 * pairing maximizes agreement, it does not invent any.
 */
export function alignIndexedGroups(goldFields: GoldField[], candidates: SnapshotCandidate[]): SnapshotCandidate[] {
  type Tuple = Map<string, GoldField[]>;
  const goldGroups = new Map<string, Map<string, Tuple>>();
  for (const field of goldFields) {
    const match = indexedPath.exec(field.fieldPath);
    if (!match) continue;
    const [, group, index, key] = match as unknown as [string, string, string, string];
    const tuples = goldGroups.get(group) ?? new Map<string, Tuple>();
    const tuple = tuples.get(index) ?? new Map<string, GoldField[]>();
    tuple.set(key, [...(tuple.get(key) ?? []), field]);
    tuples.set(index, tuple);
    goldGroups.set(group, tuples);
  }
  if (goldGroups.size === 0) return candidates;

  const output: SnapshotCandidate[] = [];
  const candidateGroups = new Map<string, Map<string, SnapshotCandidate[]>>();
  for (const candidate of candidates) {
    const match = indexedPath.exec(candidate.fieldPath);
    const group = match ? (match[1] as string) : null;
    if (!group || !goldGroups.has(group)) {
      output.push(candidate);
      continue;
    }
    // One tuple is one row of one document. Camil measured the alternative: instrument 5 of the
    // ITR's debenture table and instrument 5 of the swap table became one tuple with two
    // lenders and two rates, and neither matched anything.
    const index = `${candidate.sourceDocument ?? ""}#${match![2] as string}`;
    const tuples = candidateGroups.get(group) ?? new Map<string, SnapshotCandidate[]>();
    tuples.set(index, [...(tuples.get(index) ?? []), candidate]);
    candidateGroups.set(group, tuples);
  }

  for (const [group, candidateTuples] of candidateGroups) {
    const goldTuples = [...(goldGroups.get(group) ?? new Map<string, Tuple>()).entries()];
    const remaining = new Set(goldTuples.map(([index]) => index));

    // Score every (candidate tuple, gold tuple) pair by agreeing fields, assign greedily.
    const scored: {candidateIndex: string; goldIndex: string; score: number}[] = [];
    for (const [candidateIndex, tupleCandidates] of candidateTuples) {
      for (const [goldIndex, tuple] of goldTuples) {
        let score = 0;
        for (const candidate of tupleCandidates) {
          const key = indexedPath.exec(candidate.fieldPath)?.[3] ?? "";
          for (const field of tuple.get(key) ?? []) {
            if (valuesMatch(field.value, candidate.normalizedValue, field.valueType, field.tolerance)) score += 1;
          }
        }
        scored.push({candidateIndex, goldIndex, score});
      }
    }
    scored.sort((a, b) => b.score - a.score);

    const assignment = new Map<string, string>();
    const taken = new Set<string>();
    for (const {candidateIndex, goldIndex, score} of scored) {
      if (score === 0 || assignment.has(candidateIndex) || taken.has(goldIndex) || !remaining.has(goldIndex)) continue;
      assignment.set(candidateIndex, goldIndex);
      taken.add(goldIndex);
    }

    for (const [candidateIndex, tupleCandidates] of candidateTuples) {
      const original = candidateIndex.slice(candidateIndex.indexOf("#") + 1);
      const target = assignment.get(candidateIndex) ?? original;
      for (const candidate of tupleCandidates) {
        output.push(target === original ? candidate : {...candidate, fieldPath: candidate.fieldPath.replace(`.${original}.`, `.${target}.`)});
      }
    }
  }
  return output;
}

export function evaluateSnapshot(gold: GoldCase, rawSnapshot: ExtractionSnapshot): EvalReport {
  const snapshot: ExtractionSnapshot = {...rawSnapshot, candidates: alignIndexedGroups(gold.fields, rawSnapshot.candidates)};
  const fieldOutcomes: FieldOutcome[] = gold.fields.map((field) => {
    const candidates = snapshot.candidates.filter((candidate) => candidateMatchesField(candidate, field));
    const outcome: FieldOutcome = {fieldPath: field.fieldPath, materiality: field.materiality, expected: field.value, status: "missing"};
    if (field.periodEnd) outcome.periodEnd = field.periodEnd;
    if (candidates.length === 0) return outcome;
    const matched = candidates.find((candidate) => valuesMatch(field.value, candidate.normalizedValue, field.valueType, field.tolerance));
    if (matched) {
      outcome.status = "matched";
      outcome.found = matched.normalizedValue;
    } else {
      outcome.status = "wrong_value";
      const first = candidates[0];
      if (first) outcome.found = first.normalizedValue;
    }
    return outcome;
  });

  const material = fieldOutcomes.filter((o) => o.materiality === "material");
  const matchedMaterial = material.filter((o) => o.status === "matched").length;
  const matchedAll = fieldOutcomes.filter((o) => o.status === "matched").length;

  const goldByPath = new Map<string, GoldField[]>();
  for (const field of gold.fields) goldByPath.set(field.fieldPath, [...(goldByPath.get(field.fieldPath) ?? []), field]);
  let comparable = 0;
  let correct = 0;
  let unscored = 0;
  for (const candidate of snapshot.candidates) {
    const fields = (goldByPath.get(candidate.fieldPath) ?? []).filter((field) => candidateMatchesField(candidate, field));
    if (fields.length === 0) {
      unscored += 1;
      continue;
    }
    comparable += 1;
    if (fields.some((field) => valuesMatch(field.value, candidate.normalizedValue, field.valueType, field.tolerance))) correct += 1;
  }

  const autoAcceptedMaterial = snapshot.candidates.filter((c) => c.autoAccepted && (goldByPath.get(c.fieldPath)?.[0]?.materiality ?? "material") === "material");
  const withoutVerifiedAnchor = autoAcceptedMaterial.filter((c) => !c.anchorVerified).length;

  const profileByDocument = new Map(snapshot.profiles.map((p) => [p.document, p]));
  const classificationCorrect = gold.profiles.filter((expected) => profileByDocument.get(expected.document)?.kind === expected.kind).length;

  const exceptionOutcomes: ExceptionOutcome[] = gold.exceptions.map((expected) => {
    const matched = snapshot.exceptions.find((produced) => {
      if (expected.ruleId && produced.ruleId && expected.ruleId === produced.ruleId) return true;
      const haystack = normalizeText(`${produced.title} ${produced.description}`);
      return expected.keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
    });
    const outcome: ExceptionOutcome = {id: expected.id, severity: expected.severity, status: matched ? "detected" : "missed"};
    if (matched) outcome.matchedBy = matched.title;
    return outcome;
  });
  const producedMatched = new Set(exceptionOutcomes.filter((o) => o.matchedBy).map((o) => o.matchedBy));
  const falsePositives = snapshot.exceptions.filter((produced) => !producedMatched.has(produced.title)).length;

  const calculationsMatched = gold.calculations.filter((expected) => {
    const produced = snapshot.calculations.find((c) => c.id === expected.id);
    return produced ? valuesMatch(expected.value, produced.value, "number", expected.tolerance) : false;
  }).length;

  const matchedFieldPaths = new Set(fieldOutcomes.filter((o) => o.status === "matched").map((o) => o.fieldPath));
  const detectedExceptions = new Set(exceptionOutcomes.filter((o) => o.status === "detected").map((o) => o.id));
  const matchedCalculationIds = new Set(gold.calculations.filter((expected) => snapshot.calculations.some((c) => c.id === expected.id && valuesMatch(expected.value, c.value, "number", expected.tolerance))).map((c) => c.id));
  const informationClasses = new Set(snapshot.candidates.map((c) => c.informationClass));

  const acceptanceOutcomes: AcceptanceOutcome[] = gold.acceptance.map((criterion) => {
    const reasons: string[] = [];
    const evaluable = criterion.fieldPaths.length > 0 || criterion.calculationIds.length > 0 || criterion.exceptionIds.length > 0 || criterion.minInformationClasses !== undefined;
    if (!evaluable) return {id: criterion.id, critical: criterion.critical, weight: criterion.weight, status: "not_evaluated", reasons: ["no automatic check defined yet"]};
    for (const path of criterion.fieldPaths) if (!matchedFieldPaths.has(path)) reasons.push(`field ${path} not matched`);
    for (const id of criterion.calculationIds) if (!matchedCalculationIds.has(id)) reasons.push(`calculation ${id} not matched`);
    for (const id of criterion.exceptionIds) if (!detectedExceptions.has(id)) reasons.push(`exception ${id} not detected`);
    if (criterion.minInformationClasses !== undefined && informationClasses.size < criterion.minInformationClasses) reasons.push(`only ${informationClasses.size} information classes present`);
    return {id: criterion.id, critical: criterion.critical, weight: criterion.weight, status: reasons.length === 0 ? "pass" : "fail", reasons};
  });
  const evaluated = acceptanceOutcomes.filter((o) => o.status !== "not_evaluated");

  const report: EvalReport = {
    caseId: gold.manifest.caseId,
    extractor: snapshot.extractor,
    fields: {
      outcomes: fieldOutcomes,
      material: {expected: material.length, matched: matchedMaterial, recall: ratio(matchedMaterial, material.length)},
      all: {expected: fieldOutcomes.length, matched: matchedAll, recall: ratio(matchedAll, fieldOutcomes.length)},
      precision: {comparable, correct, value: ratio(correct, comparable)},
      unscoredCandidates: unscored,
    },
    hallucination: {autoAcceptedMaterial: autoAcceptedMaterial.length, withoutVerifiedAnchor, rate: autoAcceptedMaterial.length === 0 ? 0 : ratio(withoutVerifiedAnchor, autoAcceptedMaterial.length)},
    classification: {expected: gold.profiles.length, correct: classificationCorrect, accuracy: snapshot.profiles.length === 0 ? null : ratio(classificationCorrect, gold.profiles.length)},
    exceptions: {outcomes: exceptionOutcomes, recall: gold.exceptions.length === 0 ? null : ratio(exceptionOutcomes.filter((o) => o.status === "detected").length, gold.exceptions.length), falsePositives, produced: snapshot.exceptions.length},
    calculations: {expected: gold.calculations.length, matched: calculationsMatched, recall: gold.calculations.length === 0 ? null : ratio(calculationsMatched, gold.calculations.length)},
    acceptance: {
      outcomes: acceptanceOutcomes,
      passedWeight: evaluated.filter((o) => o.status === "pass").reduce((sum, o) => sum + o.weight, 0),
      totalWeight: evaluated.reduce((sum, o) => sum + o.weight, 0),
      criticalFailures: evaluated.filter((o) => o.critical && o.status === "fail").map((o) => o.id),
    },
  };
  if (snapshot.usage) report.usage = snapshot.usage;
  return report;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return numerator === 0 ? 1 : 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}
