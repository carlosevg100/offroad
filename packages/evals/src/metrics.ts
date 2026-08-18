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

export function evaluateSnapshot(gold: GoldCase, snapshot: ExtractionSnapshot): EvalReport {
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
