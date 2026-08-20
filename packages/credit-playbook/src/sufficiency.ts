import type {DocumentKind} from "@offroad/credit-ontology";

import {archetype} from "./archetypes";
import type {
  ArchetypeId,
  Requirement,
  RequirementLevel,
  RequirementPurpose,
  RequirementResponse,
  RequirementStage,
} from "./types";

/**
 * Which declared responses close an item.
 *
 * A reasoned "does not apply" closes it: the desk asked for something this company does not
 * have, and leaving that permanently red teaches people to ignore the list. Without a reason
 * it closes nothing — an investor reading "not applicable" with no explanation learns only
 * that somebody wanted the red mark gone.
 *
 * "Partial" and "after the NDA" deliberately close nothing. They are the company telling us
 * where it stands, which is worth recording and is not the same as the item being met.
 */
const resolvedBy = (declared: {response: RequirementResponse; note?: string} | undefined): boolean =>
  declared?.response === "not_applicable" && Boolean(declared.note?.trim());

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
  /** For information items: the answer the company gave, when it gave one. */
  answer?: string;
  /** When it is needed. Derived from `level` unless the requirement says otherwise. */
  stage: RequirementStage;
  /** What the company said about it, when a file was not the answer. */
  response?: RequirementResponse;
  /** Why it does not apply, or what part is still coming. Required for `not_applicable`. */
  note?: string;
};

/**
 * What the company said about an item it did not simply upload.
 *
 * Keyed by requirement id, the same key the answers use.
 */
export type RequirementResponses = Readonly<Record<string, {response: RequirementResponse; note?: string} | undefined>>;

/** An answer the company typed, keyed by requirement id. */
export type InformationAnswers = Readonly<Record<string, string | undefined>>;

export type SufficiencyReport = {
  archetypeId: ArchetypeId;
  minimum: {satisfied: number; total: number; complete: boolean};
  ideal: {satisfied: number; total: number; complete: boolean};
  /** Grouped by when they are needed — the axis the company reads first. */
  byStage: Record<RequirementStage, RequirementStatus[]>;
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
 * When an item is needed, defaulting from how much it matters.
 *
 * The two axes usually agree — what the desk cannot open a case without is what it needs now —
 * so the default carries almost every item and only `closing` is ever set by hand.
 */
export const stageOf = (requirement: Requirement): RequirementStage =>
  requirement.stage ?? (requirement.level === "minimum" ? "now" : "diligence");

/**
 * Answers the checklist from what was read.
 *
 * A requirement is discharged by any document of a kind it lists — several kinds per
 * requirement on purpose, because one company keeps a trial balance where another exports its
 * ERP and both answer the same question. A document can discharge more than one requirement:
 * audited statements carry both the history and the auditor's opinion, and pretending
 * otherwise would ask the company for a file it already sent.
 */
export function assessSufficiency(
  archetypeId: ArchetypeId,
  documents: readonly ClassifiedDocument[],
  answers: InformationAnswers = {},
  responses: RequirementResponses = {},
): SufficiencyReport {
  const definition = archetype(archetypeId);
  const byKind = new Map<DocumentKind, string[]>();
  for (const document of documents) {
    byKind.set(document.kind, [...(byKind.get(document.kind) ?? []), document.id]);
  }

  const matched = new Set<string>();
  const requirements: RequirementStatus[] = [...definition.requirements]
    .sort((a, b) => levelOrder[a.level] - levelOrder[b.level])
    .map((requirement) => {
      const stage = stageOf(requirement);
      const declared = responses[requirement.id];

      // An information item is discharged by the company answering, not by a file. A blank or
      // whitespace answer is not an answer: the item stays open rather than looking closed.
      if (requirement.source === "information") {
        const answer = answers[requirement.id]?.trim();
        return {
          requirement,
          stage,
          satisfied: Boolean(answer) || resolvedBy(declared),
          satisfiedBy: [],
          ...(answer ? {answer} : {}),
          ...(declared ? {response: declared.response, ...(declared.note ? {note: declared.note} : {})} : {}),
        };
      }

      const satisfiedBy = requirement.satisfiedBy.flatMap((kind) => byKind.get(kind) ?? []);
      for (const id of satisfiedBy) matched.add(id);
      return {
        requirement,
        stage,
        // A file closes it; so does a reasoned "does not apply". "Partial" and "after the NDA"
        // do not — they are the company telling us where it stands, not the item being met.
        satisfied: satisfiedBy.length > 0 || resolvedBy(declared),
        satisfiedBy,
        ...(declared ? {response: declared.response, ...(declared.note ? {note: declared.note} : {})} : {}),
      };
    });

  // Closing items are shown and never scored. The day one of them counts is the day this
  // request becomes the data room it promised not to be.
  const scored = requirements.filter((status) => status.stage !== "closing");

  const count = (level: RequirementLevel) => {
    const scoped = scored.filter((status) => status.requirement.level === level);
    const satisfied = scoped.filter((status) => status.satisfied).length;
    return {satisfied, total: scoped.length, complete: satisfied === scoped.length};
  };

  return {
    archetypeId,
    minimum: count("minimum"),
    ideal: count("ideal"),
    requirements,
    byStage: {
      now: requirements.filter((status) => status.stage === "now"),
      diligence: requirements.filter((status) => status.stage === "diligence"),
      closing: requirements.filter((status) => status.stage === "closing"),
    },
    missing: scored.filter((status) => !status.satisfied),
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
/**
 * What is still missing, grouped by what it unblocks.
 *
 * A flat list of gaps tells a company how much work is left. This tells it what the work is
 * *for* — the numbers cannot be built without these, the investor will ask for those, the story
 * has no shape without the others. People close gaps far faster when they can see which part of
 * the outcome each one buys.
 */
export function missingByPurpose(report: SufficiencyReport): Record<RequirementPurpose, RequirementStatus[]> {
  const grouped: Record<RequirementPurpose, RequirementStatus[]> = {
    investor_case: [],
    financials: [],
    structure: [],
    storytelling: [],
  };
  for (const status of report.missing) {
    for (const purpose of status.requirement.purposes) grouped[purpose].push(status);
  }
  return grouped;
}

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
