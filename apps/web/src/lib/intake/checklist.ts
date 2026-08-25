import type {SupabaseClient} from "@supabase/supabase-js";
import {
  archetypeIdSchema,
  assessSufficiency,
  planClientRequests,
  missingByPurpose,
  nextStep,
  type ArchetypeId,
  type ClassifiedDocument,
  type RequirementPurpose,
  type RequirementResponse,
  type RequirementResponses,
  type RequirementStage,
  type SufficiencyReport,
} from "@offroad/credit-playbook";
import {documentKindDefinition, type DocumentKind} from "@offroad/credit-ontology";

import type {Database} from "@/types/database";

/**
 * The checklist, answered by what the pipeline read.
 *
 * This is the difference between an upload box and a desk: the company does not tick items, it
 * sends documents, and the list fills in on its own as each one is classified. What it sees is
 * what a banker would tell it — what is still missing to open the case, what is still missing
 * to price it, and why each one matters.
 */

export type ChecklistItem = {
  id: string;
  level: "minimum" | "ideal";
  /** A file to upload, a question to answer, or something the company only needs to know about. */
  source: "document" | "information" | "notice";
  /** When it is needed: now, in diligence, or at closing. The axis the company reads first. */
  stage: RequirementStage;
  /** The period and granularity expected, when the item names one. */
  period?: string;
  /** What the company said about it, when a file was not the answer. */
  response?: RequirementResponse;
  /** Why it does not apply, or what part is still coming. */
  note?: string;
  label: string;
  rationale: string;
  satisfied: boolean;
  /** File names of the documents that discharged it, for the tick to be clickable. */
  satisfiedBy: string[];
  /** What this item unblocks: the case, the financials, the structure, the story. */
  purposes: RequirementPurpose[];
  /** Document items only: what file to actually send, named the way the company calls it. */
  accepts: string[];
  /** Information items only: the question, an example answer, and what was answered. */
  question?: string;
  example?: string;
  answer?: string;
  answerFormat?: string;
};

export type IntakeChecklist = {
  archetypeId: ArchetypeId | null;
  minimum: SufficiencyReport["minimum"];
  ideal: SufficiencyReport["ideal"];
  items: ChecklistItem[];
  /** The only open items the client should act on now, after everything received was read. */
  activeBatch: ChecklistItem[];
  /** Items the system already found or the client validly resolved. */
  resolved: ChecklistItem[];
  /** A count-only view of later stages. They are context, never current upload tasks. */
  roadmap: Record<"diligence" | "closing", {open: number; total: number}>;
  /** Open-now items held back until the current batch has been read. */
  hiddenOpenCount: number;
  /** The same items on the axis the company reads first: what is needed now, later, at closing. */
  byStage: Record<RequirementStage, ChecklistItem[]>;
  /** One line: what to do next, in the reader's language. */
  next: ReturnType<typeof nextStep>;
  /** What is still missing, grouped by what each gap unblocks. */
  missingByPurpose: Record<RequirementPurpose, string[]>;
  /** Documents that discharged nothing, with what they were recognised as. */
  unmatched: Array<{name: string; kind: string}>;
};

export function parseArchetype(value: string | null | undefined): ArchetypeId | null {
  const parsed = archetypeIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Builds the checklist for a session.
 *
 * Returns null when the operation has not been stated: a checklist for an unknown operation
 * would be a guess dressed as a requirement, and the honest screen asks the question instead.
 */
export async function loadIntakeChecklist(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale: "pt" | "en";
}): Promise<IntakeChecklist | null> {
  const {supabase, organizationId, sessionId, locale} = input;

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("archetype")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  const archetypeId = parseArchetype(session?.archetype);
  if (!archetypeId) return null;

  const {data: documents} = await supabase
    .from("source_documents")
    .select("id, original_name")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId)
    .order("created_at");

  const ids = (documents ?? []).map((document) => document.id);
  const {data: profiles} = ids.length
    ? await supabase.from("document_profiles").select("source_document_id, document_kind").eq("organization_id", organizationId).in("source_document_id", ids)
    : {data: []};

  const kindById = new Map((profiles ?? []).map((profile) => [profile.source_document_id, profile.document_kind as DocumentKind]));
  const nameById = new Map((documents ?? []).map((document) => [document.id, document.original_name]));

  // Only classified documents can discharge a requirement — an unread file proves nothing.
  const classified: ClassifiedDocument[] = ids
    .filter((id) => kindById.has(id))
    .map((id) => ({id, kind: kindById.get(id)!}));

  const {data: answerRows} = await supabase
    .from("intake_information_answers")
    .select("requirement_id, answer, response, note")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);

  const answers = Object.fromEntries((answerRows ?? []).map((row) => [row.requirement_id, row.answer ?? ""]));
  const responses: RequirementResponses = Object.fromEntries(
    (answerRows ?? []).map((row) => [
      row.requirement_id,
      {response: row.response as RequirementResponse, ...(row.note ? {note: row.note} : {})},
    ]),
  );

  const report = assessSufficiency(archetypeId, classified, answers, responses);
  const clientPlan = planClientRequests(report);
  const label = (kind: DocumentKind) => documentKindDefinition(kind).labels[locale];
  const grouped = missingByPurpose(report);

  const items: ChecklistItem[] = report.requirements.map((status) => ({
    id: status.requirement.id,
    level: status.requirement.level,
    source: status.requirement.source ?? ("document" as const),
    stage: status.stage,
    label: status.requirement.labels[locale],
    rationale: status.requirement.rationale[locale],
    satisfied: status.satisfied,
    satisfiedBy: status.satisfiedBy.map((id) => nameById.get(id) ?? id),
    purposes: [...status.requirement.purposes],
    accepts: (status.requirement.accepts ?? []).map((entry) => entry[locale]),
    ...(status.requirement.period ? {period: status.requirement.period[locale]} : {}),
    ...(status.requirement.question ? {question: status.requirement.question[locale]} : {}),
    ...(status.requirement.example ? {example: status.requirement.example[locale]} : {}),
    ...(status.answer ? {answer: status.answer} : {}),
    ...(status.response ? {response: status.response} : {}),
    ...(status.note ? {note: status.note} : {}),
    ...(status.requirement.answerFormat ? {answerFormat: status.requirement.answerFormat} : {}),
  }));
  const itemById = new Map(items.map((item) => [item.id, item]));

  return {
    archetypeId,
    minimum: report.minimum,
    ideal: report.ideal,
    items,
    activeBatch: clientPlan.current.flatMap(({status}) => {
      const item = itemById.get(status.requirement.id);
      return item ? [item] : [];
    }),
    resolved: clientPlan.resolved.flatMap((status) => {
      const item = itemById.get(status.requirement.id);
      return item ? [item] : [];
    }),
    roadmap: clientPlan.roadmap,
    hiddenOpenCount: clientPlan.hiddenOpenCount,
    byStage: {
      now: items.filter((item) => item.stage === "now"),
      structuring: items.filter((item) => item.stage === "structuring"),
      diligence: items.filter((item) => item.stage === "diligence"),
      closing: items.filter((item) => item.stage === "closing"),
    },
    next: nextStep(report, locale),
    missingByPurpose: {
      investor_case: grouped.investor_case.map((status) => status.requirement.labels[locale]),
      financials: grouped.financials.map((status) => status.requirement.labels[locale]),
      structure: grouped.structure.map((status) => status.requirement.labels[locale]),
      storytelling: grouped.storytelling.map((status) => status.requirement.labels[locale]),
    },
    unmatched: report.unmatchedDocuments.map((id) => ({
      name: nameById.get(id) ?? id,
      kind: kindById.has(id) ? label(kindById.get(id)!) : "",
    })),
  };
}
