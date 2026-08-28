import {
  collectReceivablesCaseMeasures,
  type ReceivablesCasePipelineReport,
} from "@offroad/case-engine";

export const receivablesPhaseThreeEvalVersion = "2026.08.27-v1";

export type ReceivablesPhaseThreeGold = {
  caseId: string;
  classification: {
    categoryIds: readonly string[];
    cellIds: readonly string[];
  };
  calculations: readonly {id: string; value: string}[];
  defectIds: readonly string[];
  compatibleProgramIds: readonly string[];
  questionIds: readonly string[];
};

export type ReceivablesPhaseThreeThresholds = {
  calculationAccuracy: number;
  classificationAccuracy: number;
  defectRecall: number;
  defectPrecision: number;
  provenanceCoverage: number;
};

export const canonicalReceivablesPhaseThreeThresholds: ReceivablesPhaseThreeThresholds = {
  calculationAccuracy: 1,
  classificationAccuracy: 0.95,
  defectRecall: 0.9,
  defectPrecision: 0.85,
  provenanceCoverage: 1,
};

export type ReceivablesPhaseThreeEvalReport = {
  version: typeof receivablesPhaseThreeEvalVersion;
  caseId: string;
  calculation: {expected: number; exact: number; accuracy: number; missing: readonly string[]; divergent: readonly string[]};
  classification: {expected: number; correct: number; accuracy: number; missing: readonly string[]; unexpected: readonly string[]};
  defects: {expected: number; detected: number; truePositive: number; falsePositive: number; recall: number; precision: number; missed: readonly string[]; unexpected: readonly string[]};
  programs: {expected: readonly string[]; actual: readonly string[]; exact: boolean; missing: readonly string[]; unexpected: readonly string[]};
  questions: {expected: number; detected: number; anchored: number; deliveredEvidenceExhausted: number; answerableFromDeliveredEvidence: number; missing: readonly string[]; unexpected: readonly string[]; valid: boolean};
  provenance: {assertions: number; covered: number; coverage: number};
  thresholds: ReceivablesPhaseThreeThresholds;
  failedGates: readonly string[];
  passed: boolean;
};

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return numerator === 0 ? 1 : 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function diff(left: readonly string[], right: readonly string[]): string[] {
  const allowed = new Set(right);
  return sorted(left.filter((value) => !allowed.has(value)));
}

/**
 * Evaluates one full receivables case against a frozen gold contract.
 *
 * The harness does not manufacture a missing model or parser output. If a defect was not found,
 * a question was answerable from delivered evidence, or no live program was confirmed, the case
 * fails visibly. That is the training signal for the next implementation cycle.
 */
export function evaluateReceivablesPhaseThree(
  pipeline: ReceivablesCasePipelineReport,
  gold: ReceivablesPhaseThreeGold,
  thresholds: ReceivablesPhaseThreeThresholds = canonicalReceivablesPhaseThreeThresholds,
): ReceivablesPhaseThreeEvalReport {
  if (pipeline.caseId !== gold.caseId) throw new RangeError("receivables Phase 3 case id does not match gold");

  const actualMeasures = new Map(collectReceivablesCaseMeasures(pipeline).map((measure) => [measure.id, measure]));
  const missingCalculations: string[] = [];
  const divergentCalculations: string[] = [];
  let exactCalculations = 0;
  for (const expected of gold.calculations) {
    const actual = actualMeasures.get(expected.id);
    if (!actual) missingCalculations.push(expected.id);
    else if (actual.value !== expected.value) divergentCalculations.push(expected.id);
    else exactCalculations += 1;
  }

  const expectedClassification = sorted([...gold.classification.categoryIds, ...gold.classification.cellIds]);
  const actualClassification = sorted([...pipeline.classification.categoryIds, ...pipeline.classification.cellIds]);
  const missingClassification = diff(expectedClassification, actualClassification);
  const unexpectedClassification = diff(actualClassification, expectedClassification);
  const classificationCorrect = expectedClassification.length - missingClassification.length;

  const expectedDefects = sorted(gold.defectIds);
  const actualDefects = sorted(pipeline.defects.map((defect) => defect.id));
  const missedDefects = diff(expectedDefects, actualDefects);
  const unexpectedDefects = diff(actualDefects, expectedDefects);
  const truePositiveDefects = expectedDefects.length - missedDefects.length;

  const expectedPrograms = sorted(gold.compatibleProgramIds);
  const actualPrograms = sorted(pipeline.internalShortlistProgramIds);
  const missingPrograms = diff(expectedPrograms, actualPrograms);
  const unexpectedPrograms = diff(actualPrograms, expectedPrograms);

  const expectedQuestions = sorted(gold.questionIds);
  const actualQuestions = sorted(pipeline.questions.map((question) => question.id));
  const missingQuestions = diff(expectedQuestions, actualQuestions);
  const unexpectedQuestions = diff(actualQuestions, expectedQuestions);

  const anchoredQuestions = pipeline.questions.filter((question) => question.trigger.kind !== "estimated").length;
  const exhaustedQuestions = pipeline.questions.filter((question) => {
    const delivered = new Set(question.evidenceSearch.deliveredEvidenceIds);
    const searched = new Set(question.evidenceSearch.searchedEvidenceIds);
    return question.evidenceSearch.status === "exhausted_without_answer"
      && delivered.size > 0
      && delivered.size === searched.size
      && [...delivered].every((id) => searched.has(id));
  }).length;
  const answerableQuestions = pipeline.questions.filter((question) => question.evidenceSearch.status === "answer_found").length;

  const measures = [...actualMeasures.values()];
  const assertionCoverage = [
    ...measures.map((measure) => measure.provenance.length > 0),
    ...pipeline.classification.evidence.map(Boolean),
    ...pipeline.defects.flatMap((defect) => defect.evidence.map(Boolean)),
    ...pipeline.questions.map((question) => Boolean(question.trigger)),
    ...pipeline.phaseTwoB.providers.flatMap((provider) => [
      ...provider.criterionResults.map((criterion) => Boolean(criterion.caseProvenance || criterion.mandateSourceId)),
      Boolean(provider.marketConfirmation.liveAppetite?.sourceId),
      Boolean(provider.marketConfirmation.availableCapacity?.sourceId),
    ]),
  ];
  const coveredAssertions = assertionCoverage.filter(Boolean).length;

  const calculationAccuracy = ratio(exactCalculations, gold.calculations.length);
  const classificationAccuracy = ratio(classificationCorrect, expectedClassification.length);
  const defectRecall = ratio(truePositiveDefects, expectedDefects.length);
  const defectPrecision = ratio(truePositiveDefects, actualDefects.length);
  const provenanceCoverage = ratio(coveredAssertions, assertionCoverage.length);
  const questionsValid = anchoredQuestions === pipeline.questions.length
    && exhaustedQuestions === pipeline.questions.length
    && answerableQuestions === 0
    && missingQuestions.length === 0
    && unexpectedQuestions.length === 0;
  const programsExact = missingPrograms.length === 0 && unexpectedPrograms.length === 0;

  const failedGates = [
    ...(pipeline.quality.status === "incomplete" ? ["pipeline_incomplete"] : []),
    ...(calculationAccuracy < thresholds.calculationAccuracy ? ["calculation_accuracy"] : []),
    ...(classificationAccuracy < thresholds.classificationAccuracy ? ["classification_accuracy"] : []),
    ...(defectRecall < thresholds.defectRecall ? ["defect_recall"] : []),
    ...(defectPrecision < thresholds.defectPrecision ? ["defect_precision"] : []),
    ...(!programsExact ? ["compatible_programs"] : []),
    ...(!questionsValid ? ["question_contract"] : []),
    ...(provenanceCoverage < thresholds.provenanceCoverage ? ["provenance_coverage"] : []),
  ];

  return {
    version: receivablesPhaseThreeEvalVersion,
    caseId: pipeline.caseId,
    calculation: {
      expected: gold.calculations.length,
      exact: exactCalculations,
      accuracy: calculationAccuracy,
      missing: sorted(missingCalculations),
      divergent: sorted(divergentCalculations),
    },
    classification: {
      expected: expectedClassification.length,
      correct: classificationCorrect,
      accuracy: classificationAccuracy,
      missing: missingClassification,
      unexpected: unexpectedClassification,
    },
    defects: {
      expected: expectedDefects.length,
      detected: actualDefects.length,
      truePositive: truePositiveDefects,
      falsePositive: unexpectedDefects.length,
      recall: defectRecall,
      precision: defectPrecision,
      missed: missedDefects,
      unexpected: unexpectedDefects,
    },
    programs: {expected: expectedPrograms, actual: actualPrograms, exact: programsExact, missing: missingPrograms, unexpected: unexpectedPrograms},
    questions: {
      expected: expectedQuestions.length,
      detected: pipeline.questions.length,
      anchored: anchoredQuestions,
      deliveredEvidenceExhausted: exhaustedQuestions,
      answerableFromDeliveredEvidence: answerableQuestions,
      missing: missingQuestions,
      unexpected: unexpectedQuestions,
      valid: questionsValid,
    },
    provenance: {assertions: assertionCoverage.length, covered: coveredAssertions, coverage: provenanceCoverage},
    thresholds,
    failedGates: sorted(failedGates),
    passed: failedGates.length === 0,
  };
}

export function renderReceivablesPhaseThreeMarkdown(report: ReceivablesPhaseThreeEvalReport): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return [
    `# Receivables Phase 3 · ${report.caseId}`,
    "",
    `Status: **${report.passed ? "PASS" : "FAIL"}**`,
    "",
    "| Gate | Result |",
    "|---|---|",
    `| Exact calculations | ${report.calculation.exact}/${report.calculation.expected} · ${pct(report.calculation.accuracy)} |`,
    `| Classification | ${report.classification.correct}/${report.classification.expected} · ${pct(report.classification.accuracy)} |`,
    `| Defect recall | ${report.defects.truePositive}/${report.defects.expected} · ${pct(report.defects.recall)} |`,
    `| Defect precision | ${report.defects.truePositive}/${report.defects.detected} · ${pct(report.defects.precision)} |`,
    `| Compatible programs | ${report.programs.exact ? "exact" : "divergent"} |`,
    `| Questions | ${report.questions.valid ? `${report.questions.detected}/${report.questions.expected} exact, anchored and evidence exhausted` : "contract failed"} |`,
    `| Provenance | ${report.provenance.covered}/${report.provenance.assertions} · ${pct(report.provenance.coverage)} |`,
    "",
    `Failed gates: ${report.failedGates.join(", ") || "none"}`,
    "",
  ].join("\n");
}
