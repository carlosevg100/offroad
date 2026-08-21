import {archetype, assessSufficiency, type ArchetypeId, type ClassifiedDocument} from "@offroad/credit-playbook";
import {isMaterialFieldPath} from "@offroad/credit-ontology";

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

/** Material field paths the desk expects for an operation, beyond the document checklist. */
const expectedFields: Record<ArchetypeId, readonly string[]> = {
  growth_expansion: [
    "project.total_cost",
    "project.investments.1.amount",
    "transaction.requested_amount",
    "transaction.desired_term_months",
    "debt.total_gross",
    "collateral.total_capacity",
    "projections.minimum_dscr",
  ],
  working_capital: [
    "transaction.requested_amount",
    "debt.total_gross",
    "collateral.receivables_capacity",
    "customers.top_customers.1.share_pct",
  ],
  refinance: ["transaction.requested_amount", "debt.total_gross", "debt.instruments.1.maturity", "debt.instruments.1.rate"],
  acquisition: ["transaction.requested_amount", "debt.total_gross", "leverage.post_transaction_net_debt_ebitda"],
  equipment_finance: ["transaction.requested_amount", "project.total_cost", "collateral.assets.1.appraisal_value"],
  venture_debt: ["transaction.requested_amount", "company.runway_months", "company.net_revenue_retention", "company.last_equity_round.amount"],
  other: ["transaction.requested_amount", "debt.total_gross"],
};

export function findGaps(input: {
  archetypeId: ArchetypeId;
  documents: readonly ClassifiedDocument[];
  facts: readonly ReconciledFact[];
  locale?: "pt" | "en";
}): InformationGap[] {
  const locale = input.locale ?? "pt";
  const gaps: InformationGap[] = [];

  // 1 — documents the operation requires that nobody sent.
  const sufficiency = assessSufficiency(input.archetypeId, input.documents);
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
  const present = new Set(input.facts.map((fact) => fact.key.fieldPath));
  const definition = archetype(input.archetypeId);
  for (const path of expectedFields[input.archetypeId]) {
    if (present.has(path)) continue;
    // A field the ontology does not consider material is not worth a request.
    if (!isMaterialFieldPath(path)) continue;

    const focus = definition.focus.find((entry) => entry.evidence.some((evidence) => evidence.replace(/\{[a-z]+\}/g, "") === path.replace(/\.\d+\./g, ".")));
    gaps.push({
      id: `missing_field:${path}`,
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
      reference: path,
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
