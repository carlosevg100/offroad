import {
  archetype,
  assessSufficiency,
  materialFieldRequirements,
  requirementIsSatisfied,
  type ArchetypeId,
  type ClassifiedDocument,
  type InformationAnswers,
  type RequirementResponses,
} from "@offroad/credit-playbook";

import type {ReconciledFact} from "./facts";
import type {ExceptionSeverity} from "@offroad/credit-ontology";

/**
 * What is missing, said as a question rather than a silence.
 *
 * Half of what a credit desk sends back is not a correction — it is a request. "We need the
 * payoff letters", "we need proof of the equity contribution", "we need an updated appraisal".
 * Those are not failures of the extraction; they are the desk doing its job, and they are the
 * single most useful thing a company can receive early, because each one is a week saved later.
 *
 * Two sources, both deterministic:
 *
 *   1. **The playbook's checklist** — a required document nobody sent.
 *   2. **The material fields** — a fact the analysis needs that no document stated. This is
 *      what the extractor's `absent_fields` becomes once it is scoped by what the operation
 *      actually requires.
 *
 * Nothing here is invented. A gap names the document or the field, says why it matters, and
 * points at whoever can close it.
 */

export type InformationGap = {
  id: string;
  severity: ExceptionSeverity;
  title: string;
  description: string;
  /** Who closes it. Almost always the company. */
  ownerRole: "company" | "internal_analyst" | "external_advisor";
  /** The requirement or field path behind it, for traceability. */
  reference: string;
};

export function findGaps(input: {
  archetypeId: ArchetypeId;
  documents: readonly ClassifiedDocument[];
  facts: readonly ReconciledFact[];
  locale?: "pt" | "en";
  informationAnswers?: InformationAnswers;
  requirementResponses?: RequirementResponses;
  additionalAvailableFieldPaths?: readonly string[];
}): InformationGap[] {
  const locale = input.locale ?? "pt";
  const gaps: InformationGap[] = [];

  // 1 — documents the operation requires that nobody sent.
  const sufficiency = assessSufficiency(
    input.archetypeId,
    input.documents,
    input.informationAnswers,
    input.requirementResponses,
  );
  for (const status of sufficiency.missing) {
    const {requirement} = status;
    gaps.push({
      id: `missing_document:${requirement.id}`,
      severity: requirement.level === "minimum" ? "high" : "medium",
      title: requirement.labels[locale],
      description: requirement.rationale[locale],
      ownerRole: "company",
      reference: requirement.id,
    });
  }

  // 2 — material facts the analysis needs that no document stated.
  const present = new Set([
    ...input.facts.map((fact) => fact.key.fieldPath),
    ...(input.additionalAvailableFieldPaths ?? []),
  ]);
  const definition = archetype(input.archetypeId);
  for (const requirement of materialFieldRequirements(input.archetypeId)) {
    if (requirementIsSatisfied(requirement, present)) continue;
    const path = requirement.anyOf[0] ?? requirement.id;

    const focus = definition.focus.find((entry) => entry.evidence.some((evidence) => evidence.replace(/\{[a-z]+\}/g, "") === path.replace(/\.\d+\./g, ".")));
    gaps.push({
      id: `missing_field:${requirement.id}`,
      severity: "medium",
      title:
        locale === "pt"
          ? `Informação não encontrada: ${path}`
          : `Information not found: ${path}`,
      description: focus
        ? locale === "pt"
          ? `Nenhum documento enviado declara este dado, e ele é necessário para responder: ${focus.question.pt}`
          : `No document states this, and it is needed to answer: ${focus.question.en}`
        : locale === "pt"
          ? "Nenhum documento enviado declara este dado, e ele é material para a análise."
          : "No document states this, and it is material to the analysis.",
      ownerRole: "company",
      reference: requirement.id,
    });
  }

  return gaps;
}

/**
 * The archetype's known risks, raised as hypotheses to test.
 *
 * These are the questions an experienced lender asks before the numbers are even finished, and
 * they come from the playbook rather than from the data — which is the point. A desk does not
 * wait to be surprised by a ramp-up assumption; it asks about the ramp-up because it is a
 * growth deal.
 */
export function archetypeQuestions(archetypeId: ArchetypeId, locale: "pt" | "en" = "pt"): InformationGap[] {
  const definition = archetype(archetypeId);
  return definition.risks.map((risk) => ({
    id: `risk:${risk.id}`,
    severity: risk.severity === "critical" ? ("high" as const) : risk.severity,
    title: risk.labels[locale],
    description:
      locale === "pt"
        ? `Hipótese a testar neste tipo de operação. Como se verifica: ${risk.test.pt}`
        : `A hypothesis to test in this kind of operation. How it is checked: ${risk.test.en}`,
    ownerRole: "internal_analyst" as const,
    reference: risk.id,
  }));
}
