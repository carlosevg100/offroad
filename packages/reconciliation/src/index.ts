/**
 * @offroad/reconciliation — from many documents saying things, to one set of facts the desk
 * stands behind, the exceptions worth raising, and the numbers, each showing its work.
 *
 * Deterministic end to end: no model call anywhere in this package. Precedence between
 * conflicting sources comes from evidence rank, arithmetic comes from `financial-core` in
 * Decimal, and every output carries the documents it came from. An exception is a question
 * with both sides attached, never a verdict; a calculation is a value with a trace, never a
 * claim.
 */
export const reconciliationVersion = "2026.08.20-v1";

export * from "./facts";
export * from "./rules";
export * from "./calculations";
export * from "./gaps";

import {buildContext, runRules, type ReconciliationException} from "./rules";
import {computeCalculations, type CalculationSet} from "./calculations";
import {archetypeQuestions, findGaps, type InformationGap} from "./gaps";
import {mergeInstrumentsByIdentity, reconcileFacts, renumberIndexedGroups, type FactCandidate, type ReconciledFact} from "./facts";
import type {
  ArchetypeId,
  ClassifiedDocument,
  InformationAnswers,
  RequirementResponses,
} from "@offroad/credit-playbook";

export type ReconciliationReport = {
  facts: ReconciledFact[];
  exceptions: ReconciliationException[];
  calculations: CalculationSet["calculations"];
  /** Everything the desk still needs: missing documents, missing facts, uncomputable numbers. */
  gaps: InformationGap[];
  /** What this kind of operation is always asked, from the playbook's risks. */
  questions: InformationGap[];
};

/**
 * One pass over a case: reconcile, check, compute, and say what is missing.
 *
 * Ordered deliberately — facts first, because everything else reads them; exceptions before
 * calculations, because a number computed from a disputed fact should be read alongside the
 * dispute.
 */
export function reconcileCase(input: {
  archetypeId: ArchetypeId;
  candidates: readonly FactCandidate[];
  documents: readonly ClassifiedDocument[];
  locale?: "pt" | "en";
  informationAnswers?: InformationAnswers;
  requirementResponses?: RequirementResponses;
  additionalAvailableFieldPaths?: readonly string[];
}): ReconciliationReport {
  const locale = input.locale ?? "pt";
  const facts = mergeInstrumentsByIdentity(renumberIndexedGroups(reconcileFacts(input.candidates)));
  const context = buildContext(facts, locale);
  const {calculations, gaps: calculationGaps} = computeCalculations(context);

  const gaps = findGaps({
    archetypeId: input.archetypeId,
    documents: input.documents,
    facts,
    locale,
    ...(input.informationAnswers ? {informationAnswers: input.informationAnswers} : {}),
    ...(input.requirementResponses ? {requirementResponses: input.requirementResponses} : {}),
    ...(input.additionalAvailableFieldPaths ? {additionalAvailableFieldPaths: input.additionalAvailableFieldPaths} : {}),
  });
  for (const gap of calculationGaps) {
    gaps.push({
      id: `missing_calculation:${gap.id}`,
      severity: "medium",
      title: locale === "pt" ? `Cálculo não realizado: ${gap.labels.pt}` : `Calculation not performed: ${gap.labels.en}`,
      description:
        locale === "pt"
          ? `Faltam insumos: ${gap.missing.join(", ")}. O número não é estimado. A lacuna é reportada.`
          : `Missing inputs: ${gap.missing.join(", ")}. The number is not estimated; the gap is reported instead.`,
      ownerRole: "company",
      reference: gap.id,
    });
  }

  return {
    facts,
    exceptions: runRules(context),
    calculations,
    gaps,
    questions: archetypeQuestions(input.archetypeId, locale),
  };
}
