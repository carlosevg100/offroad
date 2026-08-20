import type {SupabaseClient} from "@supabase/supabase-js";
import {reconcileCase, type FactCandidate, type ReconciliationReport} from "@offroad/reconciliation";
import type {ArchetypeId, ClassifiedDocument} from "@offroad/credit-playbook";

import type {Database, Json} from "@/types/database";

/**
 * Reconciliation, run where the facts live.
 *
 * The engine is pure arithmetic, so the only question was where to call it. Not in the worker:
 * it processes one document at a time and holds a capability token scoped to that job, while
 * reconciliation needs every candidate of the session at once — the whole point is comparing
 * what one document says against what another says. The app already reads all of them under
 * RLS, so it runs here, once, after the last document lands.
 *
 * Idempotent by construction: a re-run replaces the exceptions the pipeline itself raised and
 * leaves alone anything a human resolved or wrote. Running it twice on the same session
 * produces the same case.
 */

export type ReconcileOutcome =
  | {ok: true; report: ReconciliationReport; issuesWritten: number}
  | {ok: false; error: "session" | "processing"};

/** Every candidate of a session, in the shape the engine reads. */
async function loadCandidates(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<FactCandidate[] | null> {
  const {data, error} = await supabase
    .from("intake_field_candidates")
    .select(
      "field_path, normalized_value, value_type, source_document_id, evidence_rank, information_class, confidence, anchor_verified, period_start, period_end, entity_name, source_anchor",
    )
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);
  if (error || !data) return null;

  return data.map((row) => ({
    fieldPath: row.field_path,
    // The database keeps normalized values as JSON; the engine compares them as strings, so a
    // number and its own string form can never disagree by representation alone.
    normalizedValue: typeof row.normalized_value === "string" ? row.normalized_value : JSON.stringify(row.normalized_value),
    valueType: row.value_type as FactCandidate["valueType"],
    sourceDocument: row.source_document_id ?? "unknown",
    evidenceRank: row.evidence_rank,
    informationClass: row.information_class,
    confidence: Number(row.confidence),
    anchorVerified: row.anchor_verified,
    ...(row.period_start ? {periodStart: row.period_start} : {}),
    ...(row.period_end ? {periodEnd: row.period_end} : {}),
    ...(row.entity_name ? {entityName: row.entity_name} : {}),
    ...(row.source_anchor ? {anchor: row.source_anchor} : {}),
  }));
}

/** Documents with what the classifier decided they are. */
async function loadClassified(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<ClassifiedDocument[]> {
  const {data} = await supabase
    .from("document_profiles")
    .select("source_document_id, document_kind")
    .eq("organization_id", organizationId)
    .in(
      "source_document_id",
      (
        await supabase
          .from("source_documents")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("intake_session_id", sessionId)
      ).data?.map((row) => row.id) ?? [],
    );

  return (data ?? []).map((row) => ({id: row.source_document_id, kind: row.document_kind as ClassifiedDocument["kind"]}));
}

/**
 * The three vocabularies `intake_issues` actually accepts.
 *
 * Every insert this file made violated the schema in three separate places, so no exception and
 * no gap the reconciler has ever produced reached a reviewer. The whole batch goes in one
 * statement, so a single bad row discarded all of them, which is why the table is empty rather
 * than partially wrong.
 *
 * What makes it worth reading rather than just fixing: the review screen was already written
 * against the correct vocabulary. `priorityLabel` in intake-review.tsx tests for exactly
 * critical, analysis, diligence and complementary, and all four translation keys exist. The
 * reader was right and the writer was wrong, which is the failure mode a check constraint exists
 * to catch and did.
 */

/**
 * Coarse classification, for the reader who is triaging.
 *
 * `conflict` is two sources disagreeing, `missing` is an absence, and everything else is a
 * statement that does not hold up under arithmetic, period, entity or plausibility. Collapsing
 * seven ontology types into `validation` loses nothing, because the precise type travels
 * alongside in `exception_type`.
 */
export const ISSUE_TYPE: Readonly<Record<string, "conflict" | "missing" | "validation">> = {
  source_conflict: "conflict",
  missing: "missing",
  arithmetic: "validation",
  period: "validation",
  entity: "validation",
  plausibility: "validation",
  quality: "validation",
  adjustment: "validation",
  validation: "validation",
};

/**
 * Severity is about how wrong; priority is about when somebody has to deal with it.
 *
 * Critical holds the case. High is needed to finish the analysis. Medium waits for diligence.
 * Low is worth having and never worth blocking on.
 */
export const PRIORITY: Readonly<Record<string, "critical" | "analysis" | "diligence" | "complementary">> = {
  critical: "critical",
  high: "analysis",
  medium: "diligence",
  low: "complementary",
};

/**
 * Evidence is stored as an object because the column requires one, and the shape carries the
 * count so a reader knows how many sides a disagreement had without parsing the array.
 */
const evidenceOf = (items: readonly unknown[]): Json =>
  ({items, count: items.length} as unknown as Json);

/**
 * Runs the desk's checks over a finished session and records what it found.
 *
 * Exceptions and gaps both land in `intake_issues` because to the person reading them they are
 * the same thing — something to resolve before this goes to market — and they differ only in
 * who resolves it. Calculations land in `calculation_runs` with their trace, so a number in a
 * later document can always be walked back to the pages it came from.
 */
export async function reconcileIntakeSession(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale?: "pt" | "en";
}): Promise<ReconcileOutcome> {
  const {supabase, organizationId, sessionId} = input;
  const locale = input.locale ?? "pt";

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("archetype, current_run_id")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return {ok: false, error: "session"};

  const candidates = await loadCandidates(supabase, organizationId, sessionId);
  if (!candidates) return {ok: false, error: "processing"};

  const report = reconcileCase({
    // Not stated is not guessed: the generic archetype frames the operation instead of
    // pretending to know what the money is for.
    archetypeId: (session.archetype as ArchetypeId | null) ?? "other",
    candidates,
    documents: await loadClassified(supabase, organizationId, sessionId),
    locale,
  });


  // Replace what the pipeline said last time; never touch a human's decision.
  await supabase
    .from("intake_issues")
    .delete()
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId)
    .eq("status", "open")
    .not("rule_id", "is", null);

  const issues = [
    ...report.exceptions.map((exception) => ({
      organization_id: organizationId,
      intake_session_id: sessionId,
      processing_run_id: session.current_run_id,
      issue_type: ISSUE_TYPE[exception.type] ?? "validation",
      priority: PRIORITY[exception.severity] ?? "diligence",
      rule_id: exception.ruleId,
      severity: exception.severity,
      exception_type: exception.type,
      owner_role: exception.ownerRole,
      title: exception.title,
      description: exception.description,
      evidence: evidenceOf(exception.evidence),
      blocks_external_outputs: exception.blocksExternalOutputs,
      candidate_ids: [],
    })),
    ...[...report.gaps, ...report.questions].map((gap) => ({
      organization_id: organizationId,
      intake_session_id: sessionId,
      processing_run_id: session.current_run_id,
      issue_type: "missing" as const,
      priority: PRIORITY[gap.severity] ?? "diligence",
      rule_id: gap.id,
      severity: gap.severity,
      exception_type: "missing",
      owner_role: gap.ownerRole,
      title: gap.title,
      description: gap.description,
      evidence: evidenceOf([{label: "referência", value: gap.reference}]),
      blocks_external_outputs: false,
      candidate_ids: [],
    })),
  ];

  if (issues.length > 0) {
    const {error} = await supabase.from("intake_issues").insert(issues);
    if (error) return {ok: false, error: "processing"};
  }

  // Calculations live on the session while the case is still an intake. `calculation_runs` is
  // keyed by opportunity and belongs to the confirmed case; writing there now would mean
  // inventing an opportunity that does not exist yet. The trace travels either way — it is the
  // product here, the thing that lets a number be walked back to a page.
  if (report.calculations.length > 0) {
    const {data: current} = await supabase
      .from("document_intake_sessions")
      .select("result_summary")
      .eq("organization_id", organizationId)
      .eq("id", sessionId)
      .maybeSingle();

    const summary = (current?.result_summary ?? {}) as Record<string, Json>;
    await supabase
      .from("document_intake_sessions")
      .update({
        result_summary: {
          ...summary,
          calculations: report.calculations as unknown as Json,
          reconciled_facts: report.facts.length,
          disputed_facts: report.facts.filter((fact) => fact.disputed).length,
        } as Json,
      })
      .eq("organization_id", organizationId)
      .eq("id", sessionId);
  }

  return {ok: true, report, issuesWritten: issues.length};
}
