import type {DocumentKind} from "@offroad/credit-ontology";

import {archetype} from "./archetypes";
import type {ArchetypeId, Requirement, RequirementLevel} from "./types";

/**
 * What the desk still needs, computed rather than asked.
 *
 * A checklist a person ticks is a form. This is the same list answered by what the pipeline
 * actually read: a document is classified, and the requirements it discharges go green on
 * their own. The company sees its package fill in as it uploads, and the desk stops asking for
 * things it already has — which is most of what makes an intake feel professional instead of
 * bureaucratic.
 *
 * Two lines, not one score. **Minimum** is the refusal line: below it the case cannot be
 * opened, and saying so early is a kindness. **Ideal** is the pricing line: above it the
 * operation can be structured and defended to an investor. Collapsing both into a single
 * percentage would hide exactly the distinction that matters.
 *
 * Nothing here is a credit decision. A complete package is a package, not an approval.
 */

export type RequirementStatus = {
  requirement: Requirement;
  satisfied: boolean;
  /** Documents that discharge it, by id — so the UI can link the tick to the file. */
  satisfiedBy: string[];
};

export type SufficiencyReport = {
  archetypeId: ArchetypeId;
  minimum: {satisfied: number; total: number; complete: boolean};
  ideal: {satisfied: number; total: number; complete: boolean};
  /** Everything, in playbook order — minimum first, then ideal. */
  requirements: RequirementStatus[];
  /** Not satisfied, minimum before ideal: the list to show as "what is still missing". */
  missing: RequirementStatus[];
  /** Documents that discharged no requirement. Not a complaint — the desk reads them anyway. */
  unmatchedDocuments: string[];
};

/** A document as the pipeline knows it once classified. */
export type ClassifiedDocument = {
  id: string;
  kind: DocumentKind;
};

const levelOrder: Record<RequirementLevel, number> = {minimum: 0, ideal: 1};

/**
 * Answers the checklist from what was read.
 *
 * A requirement is discharged by any document of a kind it lists — several kinds per
 * requirement on purpose, because one company keeps a trial balance where another exports its
 * ERP and both answer the same question. A document can discharge more than one requirement:
 * audited statements carry both the history and the auditor's opinion, and pretending
 * otherwise would ask the company for a file it already sent.
 */
export function assessSufficiency(archetypeId: ArchetypeId, documents: readonly ClassifiedDocument[]): SufficiencyReport {
  const definition = archetype(archetypeId);
  const byKind = new Map<DocumentKind, string[]>();
  for (const document of documents) {
    byKind.set(document.kind, [...(byKind.get(document.kind) ?? []), document.id]);
  }

  const matched = new Set<string>();
  const requirements: RequirementStatus[] = [...definition.requirements]
    .sort((a, b) => levelOrder[a.level] - levelOrder[b.level])
    .map((requirement) => {
      const satisfiedBy = requirement.satisfiedBy.flatMap((kind) => byKind.get(kind) ?? []);
      for (const id of satisfiedBy) matched.add(id);
      return {requirement, satisfied: satisfiedBy.length > 0, satisfiedBy};
    });

  const count = (level: RequirementLevel) => {
    const scoped = requirements.filter((status) => status.requirement.level === level);
    const satisfied = scoped.filter((status) => status.satisfied).length;
    return {satisfied, total: scoped.length, complete: satisfied === scoped.length};
  };

  return {
    archetypeId,
    minimum: count("minimum"),
    ideal: count("ideal"),
    requirements,
    missing: requirements.filter((status) => !status.satisfied),
    unmatchedDocuments: documents.filter((document) => !matched.has(document.id)).map((document) => document.id),
  };
}

/**
 * What to say next, in one line.
 *
 * The company should never have to read a table to know where it stands. Below the minimum
 * the desk names the single most important gap, because a list of eleven missing items reads
 * as "come back later" while one named document reads as a next step.
 */
export function nextStep(report: SufficiencyReport, locale: "pt" | "en" = "pt"): {state: "blocked" | "openable" | "priceable"; message: string} {
  const firstMissing = report.missing[0];

  if (!report.minimum.complete && firstMissing) {
    return {
      state: "blocked",
      message:
        locale === "pt"
          ? `Faltam ${report.minimum.total - report.minimum.satisfied} de ${report.minimum.total} itens para abrir o caso. O próximo é: ${firstMissing.requirement.labels.pt}.`
          : `${report.minimum.total - report.minimum.satisfied} of ${report.minimum.total} items are still missing to open the case. Next: ${firstMissing.requirement.labels.en}.`,
    };
  }

  if (!report.ideal.complete && firstMissing) {
    return {
      state: "openable",
      message:
        locale === "pt"
          ? `O caso pode ser aberto. Para estruturar e levar ao mercado, o próximo item é: ${firstMissing.requirement.labels.pt}.`
          : `The case can be opened. To structure it and take it to market, the next item is: ${firstMissing.requirement.labels.en}.`,
    };
  }

  return {
    state: "priceable",
    message:
      locale === "pt"
        ? "Pacote completo: o desk tem o que precisa para estruturar a operação."
        : "Package complete: the desk has what it needs to structure the operation.",
  };
}
