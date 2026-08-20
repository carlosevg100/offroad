import type {SupabaseClient} from "@supabase/supabase-js";
import {assessReadiness, auditBrief, buildBriefInput, BRIEF_SYSTEM, caseBriefSchema, type CaseBrief, type ReadinessReport} from "@offroad/case-understanding";
import {compileMaterials, type Material} from "@offroad/case-materials";
import {archetype, type ArchetypeId, type ClassifiedDocument} from "@offroad/credit-playbook";
import {assessCapacity, buildTermSheet, type CapacityAssessment, type IndicativeTermSheet} from "@offroad/deal-structure";
import {reconcileCase, type FactCandidate, type ReconciliationReport} from "@offroad/reconciliation";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter} from "@offroad/model-gateway";

import type {Database, Json} from "@/types/database";

/**
 * The case, end to end: reconcile, size, structure, write, compile.
 *
 * Everything before this point produced parts — verified facts, a playbook, an engine, an
 * auditor — and this is where they become one thing a company can use. Deliberately one
 * function and one order, because the order carries meaning: nothing is sized before the
 * numbers are reconciled, nothing is written before it is sized, and nothing is compiled
 * before what was written has been audited.
 *
 * Each stage degrades honestly. If the brief cannot be written the case still has its facts,
 * exceptions, readiness and structure; if the structure cannot be sized the case still reads.
 * What never happens is a stage inventing an input it did not get.
 */

export type CaseState = {
  reconciliation: ReconciliationReport;
  readiness: ReadinessReport;
  capacity: CapacityAssessment | null;
  termSheet: IndicativeTermSheet | null;
  brief: CaseBrief | null;
  /** Why the brief is absent, when it is. */
  briefBlockedBy: string[];
  materials: Material[];
  /** Why materials are absent, when they are. */
  materialsBlockedBy: string[];
};

/** Facts the case is expected to carry, per operation — drives the material-gaps component. */
function expectedMaterialFields(archetypeId: ArchetypeId): string[] {
  const base = ["transaction.requested_amount", "debt.total_gross", "company.legal_name"];
  const perArchetype: Partial<Record<ArchetypeId, string[]>> = {
    growth_expansion: ["project.total_cost", "collateral.total_capacity"],
    working_capital: ["collateral.receivables_capacity"],
    acquisition: ["leverage.post_transaction_net_debt_ebitda"],
    equipment_finance: ["project.total_cost"],
  };
  return [...base, ...(perArchetype[archetypeId] ?? [])];
}

async function loadCandidates(supabase: SupabaseClient<Database>, organizationId: string, sessionId: string): Promise<FactCandidate[]> {
  const {data} = await supabase
    .from("intake_field_candidates")
    .select(
      "field_path, normalized_value, value_type, source_document_id, evidence_rank, information_class, confidence, anchor_verified, period_start, period_end, entity_name, source_anchor",
    )
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);

  return (data ?? []).map((row) => ({
    fieldPath: row.field_path,
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

async function loadClassified(supabase: SupabaseClient<Database>, organizationId: string, sessionId: string): Promise<ClassifiedDocument[]> {
  const {data: documents} = await supabase
    .from("source_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);

  const ids = (documents ?? []).map((document) => document.id);
  if (ids.length === 0) return [];

  const {data: profiles} = await supabase
    .from("document_profiles")
    .select("source_document_id, document_kind")
    .eq("organization_id", organizationId)
    .in("source_document_id", ids);

  return (profiles ?? []).map((profile) => ({
    id: profile.source_document_id,
    kind: profile.document_kind as ClassifiedDocument["kind"],
  }));
}

const number = (value: string | undefined) => (value && Number.isFinite(Number(value)) ? value : undefined);

/**
 * Writes the brief, or says why it could not.
 *
 * The gateway is created per call with a budget: one case is one budget, and a runaway loop
 * cannot spend another case's money. A brief that fails the evidence audit is discarded rather
 * than shown with a warning — its sentences are exactly what would be quoted.
 */
async function writeBrief(input: {
  archetypeId: ArchetypeId;
  reconciliation: ReconciliationReport;
  locale: "pt" | "en";
}): Promise<{brief: CaseBrief | null; blockedBy: string[]}> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) return {brief: null, blockedBy: ["no_model_credentials"]};

  const gateway = createModelGateway({
    adapters: {
      ...(anthropicKey ? {anthropic: createAnthropicAdapter({apiKey: anthropicKey})} : {}),
      ...(openaiKey ? {openai: createOpenAIAdapter({apiKey: openaiKey})} : {}),
    },
    // One case, one budget. A loop cannot spend the next company's money.
    budget: {maxCostUsd: 3, maxCalls: 4},
  });

  try {
    const result = await gateway.complete({
      task: "case_brief",
      system: BRIEF_SYSTEM,
      input: [
        {
          type: "text",
          text: buildBriefInput({
            archetypeId: input.archetypeId,
            facts: input.reconciliation.facts,
            calculations: input.reconciliation.calculations,
            exceptions: input.reconciliation.exceptions,
            gaps: input.reconciliation.gaps,
            locale: input.locale,
          }),
        },
      ],
      schema: caseBriefSchema,
      schemaName: "case_brief",
    });

    const audited = auditBrief({
      brief: result.output,
      facts: input.reconciliation.facts,
      calculations: input.reconciliation.calculations,
    });
    if (!audited.ok) {
      // Not shown with a caveat: the unsourced sentence is the one a committee would act on.
      return {brief: null, blockedBy: audited.audit.findings.map((finding) => `${finding.claimId}: ${finding.reason}`)};
    }
    return {brief: audited.brief, blockedBy: []};
  } catch (error) {
    console.error("case_brief_failed", {message: (error as Error).message});
    return {brief: null, blockedBy: ["generation_failed"]};
  }
}

export async function buildCaseState(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale: "pt" | "en";
  /** Skips the model call. The screen uses this on first paint, then fills the brief in. */
  withBrief?: boolean;
}): Promise<CaseState> {
  const {supabase, organizationId, sessionId, locale} = input;

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("archetype")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  const archetypeId = ((session?.archetype as ArchetypeId | null) ?? "other") satisfies ArchetypeId;
  const documents = await loadClassified(supabase, organizationId, sessionId);
  const candidates = await loadCandidates(supabase, organizationId, sessionId);

  const reconciliation = reconcileCase({archetypeId, candidates, documents, locale});

  const readiness = assessReadiness({
    archetypeId,
    documents,
    facts: reconciliation.facts,
    exceptions: reconciliation.exceptions,
    gaps: reconciliation.gaps,
    expectedMaterialFields: expectedMaterialFields(archetypeId),
  });

  // ---- size the operation -------------------------------------------------------------------
  const valueOf = (fieldPath: string) => reconciliation.facts.find((fact) => fact.key.fieldPath === fieldPath)?.value;
  const calculationOf = (id: string) => reconciliation.calculations.find((calculation) => calculation.id === id)?.value;

  const requested = number(valueOf("transaction.requested_amount"));
  let capacity: CapacityAssessment | null = null;
  let termSheet: IndicativeTermSheet | null = null;

  if (requested) {
    const cfads = number(calculationOf("adjusted_ebitda"));
    capacity = assessCapacity({
      archetypeId,
      requested,
      ...(cfads ? {cfads} : {}),
      ...(number(calculationOf("adjusted_ebitda")) ? {adjustedEbitda: calculationOf("adjusted_ebitda")!} : {}),
      ...(number(calculationOf("net_debt")) ? {existingNetDebt: calculationOf("net_debt")!} : {}),
      ...(number(calculationOf("collateral_capacity_total")) ? {collateralCapacity: calculationOf("collateral_capacity_total")!} : {}),
      // A SAC amortisation over the archetype's typical tenor, with interest — the shape the
      // structure menu proposes, so capacity is sized against the paper actually on offer.
      annualDebtServiceFactor: (1 / (archetype(archetypeId).structure.tenorMonths.typical[1] / 12) + 0.12).toFixed(4),
    });

    const term = number(valueOf("transaction.desired_term_months"));
    const grace = number(valueOf("transaction.desired_grace_months"));
    termSheet = buildTermSheet({
      archetypeId,
      capacity,
      ...(term ? {requestedTermMonths: Number(term)} : {}),
      ...(grace ? {requestedGraceMonths: Number(grace)} : {}),
      blockers: readiness.blockers.map((blocker) => blocker.labels[locale]),
    });
  }

  // ---- write and compile ---------------------------------------------------------------------
  const {brief, blockedBy: briefBlockedBy} =
    input.withBrief === false
      ? {brief: null, blockedBy: ["not_requested"]}
      : await writeBrief({archetypeId, reconciliation, locale});

  let materials: Material[] = [];
  let materialsBlockedBy: string[] = [];
  if (brief) {
    const compiled = compileMaterials({
      brief,
      facts: reconciliation.facts,
      calculations: reconciliation.calculations,
      exceptions: reconciliation.exceptions,
      readiness,
      ...(termSheet ? {termSheet} : {}),
    });
    if (compiled.ok) materials = compiled.materials;
    else materialsBlockedBy = compiled.detail;
  } else {
    materialsBlockedBy = ["brief_unavailable"];
  }

  return {reconciliation, readiness, capacity, termSheet, brief, briefBlockedBy, materials, materialsBlockedBy};
}

/** Persists what the case screen and later exports read, so a re-render costs nothing. */
export async function saveCaseState(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  state: CaseState;
  runId: string | null;
}): Promise<void> {
  const {supabase, organizationId, sessionId, state} = input;
  const {data: current} = await supabase
    .from("document_intake_sessions")
    .select("result_summary")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  await supabase
    .from("document_intake_sessions")
    .update({
      result_summary: {
        ...((current?.result_summary ?? {}) as Record<string, Json>),
        readiness: state.readiness as unknown as Json,
        capacity: (state.capacity ?? null) as unknown as Json,
        term_sheet: (state.termSheet ?? null) as unknown as Json,
        brief: (state.brief ?? null) as unknown as Json,
        brief_blocked_by: state.briefBlockedBy as unknown as Json,
        materials: state.materials as unknown as Json,
        materials_blocked_by: state.materialsBlockedBy as unknown as Json,
        case_run: input.runId,
      } as Json,
    })
    .eq("organization_id", organizationId)
    .eq("id", sessionId);
}
