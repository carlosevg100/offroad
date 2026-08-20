import type {SupabaseClient} from "@supabase/supabase-js";
import {archetypeIdSchema, assessSufficiency, nextStep, type ArchetypeId, type ClassifiedDocument, type SufficiencyReport} from "@offroad/credit-playbook";
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
  label: string;
  rationale: string;
  satisfied: boolean;
  /** File names of the documents that discharged it, for the tick to be clickable. */
  satisfiedBy: string[];
};

export type IntakeChecklist = {
  archetypeId: ArchetypeId | null;
  minimum: SufficiencyReport["minimum"];
  ideal: SufficiencyReport["ideal"];
  items: ChecklistItem[];
  /** One line: what to do next, in the reader's language. */
  next: ReturnType<typeof nextStep>;
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

  const report = assessSufficiency(archetypeId, classified);
  const label = (kind: DocumentKind) => documentKindDefinition(kind).labels[locale];

  return {
    archetypeId,
    minimum: report.minimum,
    ideal: report.ideal,
    items: report.requirements.map((status) => ({
      id: status.requirement.id,
      level: status.requirement.level,
      label: status.requirement.labels[locale],
      rationale: status.requirement.rationale[locale],
      satisfied: status.satisfied,
      satisfiedBy: status.satisfiedBy.map((id) => nameById.get(id) ?? id),
    })),
    next: nextStep(report, locale),
    unmatched: report.unmatchedDocuments.map((id) => ({
      name: nameById.get(id) ?? id,
      kind: kindById.has(id) ? label(kindById.get(id)!) : "",
    })),
  };
}
