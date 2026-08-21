import type {SupabaseClient} from "@supabase/supabase-js";
import {assessReadiness, auditBrief, buildBriefInput, deskEvidence, BRIEF_SYSTEM, caseBriefSchema, type CaseBrief, type ReadinessReport} from "@offroad/case-understanding";
import {compileMaterials, type Material} from "@offroad/case-materials";
import {archetype, type ArchetypeId, type ClassifiedDocument} from "@offroad/credit-playbook";
import {assessCapacity, buildTermSheet, type CapacityAssessment, type IndicativeTermSheet} from "@offroad/deal-structure";
import {reconcileCase, type FactCandidate, type ReconciliationReport} from "@offroad/reconciliation";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter} from "@offroad/model-gateway";

import {dealBriefOf} from "./deal-brief";

import type {Database, Json} from "@/types/database";
import {reportServerFailure} from "@/lib/observability/report";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, questionsForCompany, type ClientQuestion, type DeskAnalysis, type Trajectory} from "@offroad/credit-analysis";

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
  /** The desk battery: deterministic findings the narrative narrates and may not renumber. */
  desk: DeskAnalysis | null;
  /** The leverage trajectory and the structure that makes the deal doable. */
  trajectory: Trajectory | null;
  /** Field paths that kept the battery from running, surfaced as questions to the company. */
  deskMissing: string[];
  /** The desk's questions to the company, generated from the findings, meeting order. */
  clientQuestions: ClientQuestion[];
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
    venture_debt: ["company.runway_months", "company.last_equity_round.amount"],
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
  desk?: DeskAnalysis | null;
  trajectory?: Trajectory | null;
  locale: "pt" | "en";
  /** Reports what the call cost, so the one spend nobody could query lands in a ledger. */
  onSpend?: (spend: {costUsd: number; calls: number}) => void;
}): Promise<{brief: CaseBrief | null; blockedBy: string[]}> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) return {brief: null, blockedBy: ["no_model_credentials"]};

  let costUsd = 0;
  let calls = 0;

  const gateway = createModelGateway({
    adapters: {
      ...(anthropicKey ? {anthropic: createAnthropicAdapter({apiKey: anthropicKey})} : {}),
      ...(openaiKey ? {openai: createOpenAIAdapter({apiKey: openaiKey})} : {}),
    },
    // One case, one budget. A loop cannot spend the next company's money.
    budget: {maxCostUsd: 3, maxCalls: 4},
    // The worker writes its spend to `processing_runs.usage`; the brief is written outside any
    // run, so before this it was the only money in the system nobody could count.
    onCall: (call) => {
      costUsd += call.costUsd ?? 0;
      calls += 1;
    },
  });

  // The battery's findings enter the prompt as computed sentences with citable ids, and enter
  // the auditor as calculations. One gate: a brief that misquotes the desk is rejected exactly
  // like a brief that misquotes a document.
  const evidence = deskEvidence(input.desk ?? null, input.trajectory ?? null);
  const auditableCalculations = [...input.reconciliation.calculations, ...evidence.calculations];

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
            calculations: auditableCalculations,
            exceptions: input.reconciliation.exceptions,
            gaps: input.reconciliation.gaps,
            locale: input.locale,
            deskLines: evidence.promptLines,
          }),
        },
      ],
      schema: caseBriefSchema,
      schemaName: "case_brief",
    });

    const audited = auditBrief({
      brief: result.output,
      facts: input.reconciliation.facts,
      calculations: auditableCalculations,
    });
    if (!audited.ok) {
      // Not shown with a caveat: the unsourced sentence is the one a committee would act on.
      return {brief: null, blockedBy: audited.audit.findings.map((finding) => `${finding.claimId}: ${finding.reason}`)};
    }
    return {brief: audited.brief, blockedBy: []};
  } catch (error) {
    reportServerFailure({step: "case.brief", error});
    return {brief: null, blockedBy: ["generation_failed"]};
  } finally {
    // `finally`, because a brief that failed the audit or threw still cost what it cost. A ledger
    // that only records successes understates spend exactly when spend is going wrong.
    if (calls > 0) input.onSpend?.({costUsd, calls});
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
    .select(
      "archetype, requested_amount, requested_term_months, requested_grace_months, sector, geography, instruments, collateral_kinds, expected_rate",
    )
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  const archetypeId = ((session?.archetype as ArchetypeId | null) ?? "other") satisfies ArchetypeId;
  // `dealBrief` is what the company asked for; `brief` further down is the written case. Two
  // very different things that both wanted the same short name.
  const dealBrief = session ? dealBriefOf(session) : ({} as ReturnType<typeof dealBriefOf>);
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

  // ---- the desk battery ---------------------------------------------------------------------
  //
  // The CDI level is a market assumption of the analysis, stated here and echoed in every cost
  // figure the battery produces. Indicative until a rates source feeds it; changing it changes
  // every comparison, which is exactly why it lives in one visible place.
  const deskInputs = buildDeskInputs(
    reconciliation.facts.map((fact) => ({fieldPath: fact.key.fieldPath, value: fact.value})),
    {
      referenceDate: new Date().toISOString().slice(0, 10),
      indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"},
      statedRequest: {
        ...(dealBrief.requestedAmount !== undefined ? {amount: dealBrief.requestedAmount} : {}),
        ...(dealBrief.requestedTermMonths !== undefined ? {termMonths: dealBrief.requestedTermMonths} : {}),
        ...(dealBrief.requestedGraceMonths !== undefined ? {graceMonths: dealBrief.requestedGraceMonths} : {}),
        ...(dealBrief.expectedRate !== undefined ? {expectedRate: dealBrief.expectedRate} : {}),
      },
    },
  );
  const desk = deskInputs.desk ? analyzeCreditPosition(deskInputs.desk) : null;
  const trajectory = deskInputs.trajectory ? projectLeverageTrajectory(deskInputs.trajectory) : null;

  // ---- size the operation -------------------------------------------------------------------
  const valueOf = (fieldPath: string) => reconciliation.facts.find((fact) => fact.key.fieldPath === fieldPath)?.value;
  const calculationOf = (id: string) => reconciliation.calculations.find((calculation) => calculation.id === id)?.value;

  const requested = dealBrief.requestedAmount ?? number(valueOf("transaction.requested_amount"));
  let capacity: CapacityAssessment | null = null;
  let termSheet: IndicativeTermSheet | null = null;

  if (requested) {
    const cfads = number(calculationOf("adjusted_ebitda"));
    // Venture debt sizes against recurring revenue and the last round, not EBITDA.
    const latestArr = reconciliation.facts
      .filter((fact) => /^(historical|interim)_financials\.\d{4}(_\d{2})?\.arr(_\d+m|_ytd|_ltm)?$/.test(fact.key.fieldPath))
      .sort((a, b) => b.key.fieldPath.localeCompare(a.key.fieldPath))[0]?.value;
    const lastRound = valueOf("company.last_equity_round.amount");
    capacity = assessCapacity({
      archetypeId,
      requested,
      ...(number(latestArr) ? {arr: latestArr!} : {}),
      ...(number(lastRound) ? {lastEquityRound: lastRound!} : {}),
      ...(cfads ? {cfads} : {}),
      ...(number(calculationOf("adjusted_ebitda")) ? {adjustedEbitda: calculationOf("adjusted_ebitda")!} : {}),
      ...(number(calculationOf("net_debt")) ? {existingNetDebt: calculationOf("net_debt")!} : {}),
      ...(number(calculationOf("collateral_capacity_total")) ? {collateralCapacity: calculationOf("collateral_capacity_total")!} : {}),
      // A SAC amortisation over the archetype's typical tenor, with interest — the shape the
      // structure menu proposes, so capacity is sized against the paper actually on offer.
      annualDebtServiceFactor: (1 / (archetype(archetypeId).structure.tenorMonths.typical[1] / 12) + 0.12).toFixed(4),
    });

    // The brief wins over anything extracted from a document. Both are the company speaking, but
    // the brief is the deliberate, current statement — a tenor read off a proposal PDF is what
    // they wanted when they wrote it, and the whole point of the brief is that they can change
    // their mind after seeing what the numbers say.
    const term = dealBrief.requestedTermMonths ?? number(valueOf("transaction.desired_term_months"));
    const grace = dealBrief.requestedGraceMonths ?? number(valueOf("transaction.desired_grace_months"));
    termSheet = buildTermSheet({
      archetypeId,
      capacity,
      ...(term ? {requestedTermMonths: Number(term)} : {}),
      ...(grace ? {requestedGraceMonths: Number(grace)} : {}),
      ...(dealBrief.expectedRate ? {expectedRate: dealBrief.expectedRate} : {}),
      blockers: readiness.blockers.map((blocker) => blocker.labels[locale]),
    });
  }

  // ---- write and compile ---------------------------------------------------------------------
  //
  // Everything above this line is arithmetic over facts already in the database and costs
  // nothing to repeat. The brief is the only expensive step, so it is the only one that needs a
  // claim: two requests arriving before the first snapshot is written would otherwise both pay,
  // and a refresh during loading would cost a second brief.
  //
  // Losing the race is not an error. The case still renders with its facts, exceptions,
  // readiness and structure, and `brief_in_progress` tells the screen to say the written part is
  // being prepared rather than showing an empty section with no reason.
  const {brief, blockedBy: briefBlockedBy} = await (async () => {
    if (input.withBrief === false) return {brief: null, blockedBy: ["not_requested"]};

    const {data: claimed} = await supabase.rpc("claim_case_brief", {
      p_organization_id: organizationId,
      p_session_id: sessionId,
    });
    if (claimed !== true) return {brief: null, blockedBy: ["brief_in_progress"]};

    return writeBrief({
      archetypeId,
      reconciliation,
      desk,
      trajectory,
      locale,
      onSpend: ({costUsd, calls}) => {
        // Fire and forget: the case must not fail to render because the ledger write did.
        void supabase
          .rpc("record_case_model_spend", {
            p_organization_id: organizationId,
            p_session_id: sessionId,
            p_cost_usd: costUsd,
            p_calls: calls,
          })
          .then(({error}) => {
            if (error) reportServerFailure({step: "case.spend_not_recorded", error});
          });
      },
    });
  })();

  let materials: Material[] = [];
  let materialsBlockedBy: string[] = [];
  if (brief) {
    const materialEvidence = deskEvidence(desk, trajectory);
    const compiled = compileMaterials({
      brief,
      facts: reconciliation.facts,
      calculations: [...reconciliation.calculations, ...materialEvidence.calculations],
      exceptions: reconciliation.exceptions,
      readiness,
      desk,
      trajectory,
      ...(termSheet ? {termSheet} : {}),
    });
    if (compiled.ok) materials = compiled.materials;
    else materialsBlockedBy = compiled.detail;
  } else {
    materialsBlockedBy = ["brief_unavailable"];
  }

  const clientQuestions = questionsForCompany(desk, trajectory, deskInputs.missing);

  return {reconciliation, readiness, capacity, desk, trajectory, deskMissing: deskInputs.missing, clientQuestions, termSheet, brief, briefBlockedBy, materials, materialsBlockedBy};
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
  await supabase.rpc("record_intake_analysis", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_patch: {
      readiness: state.readiness,
      capacity: state.capacity ?? null,
      desk: (state.desk ?? null) as unknown as Json,
      trajectory: (state.trajectory ?? null) as unknown as Json,
      client_questions: state.clientQuestions as unknown as Json,
      term_sheet: state.termSheet ?? null,
      brief: state.brief ?? null,
      brief_blocked_by: state.briefBlockedBy,
      materials: state.materials,
      materials_blocked_by: state.materialsBlockedBy,
      case_run: input.runId,
    } as unknown as Json,
  });
}

/**
 * A fingerprint of everything the case is computed from.
 *
 * Cheap to take — three counted queries — and it changes whenever a document lands, a
 * candidate is reviewed, an answer is written, or the operation type is changed. Anything
 * that would alter the case alters this string.
 */
async function caseFingerprint(supabase: SupabaseClient<Database>, organizationId: string, sessionId: string): Promise<string> {
  const [{count: candidateCount}, {count: documentCount}, {data: session}, {data: latest}, {count: answerCount}] = await Promise.all([
    supabase.from("intake_field_candidates").select("id", {count: "exact", head: true}).eq("organization_id", organizationId).eq("intake_session_id", sessionId),
    supabase.from("source_documents").select("id", {count: "exact", head: true}).eq("organization_id", organizationId).eq("intake_session_id", sessionId),
    supabase.from("document_intake_sessions").select("archetype, status").eq("organization_id", organizationId).eq("id", sessionId).maybeSingle(),
    supabase
      .from("intake_field_candidates")
      .select("updated_at")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId)
      .order("updated_at", {ascending: false})
      .limit(1)
      .maybeSingle(),
    supabase.from("intake_information_answers").select("id", {count: "exact", head: true}).eq("organization_id", organizationId).eq("intake_session_id", sessionId),
  ]);

  return [
    session?.archetype ?? "",
    session?.status ?? "",
    candidateCount ?? 0,
    documentCount ?? 0,
    answerCount ?? 0,
    latest?.updated_at ?? "",
  ].join("|");
}

/**
 * The case, computed once per state of the data room.
 *
 * Without this, every render of the review screen re-ran the whole line — including the model
 * call that writes the brief. A company that refreshes the page four times while reading pays
 * four times for the same paragraphs, and the paragraphs come back subtly different each
 * time, which is worse than the cost: a credit memo that changes wording on reload is not a
 * document anybody can quote.
 *
 * The snapshot is invalidated by the fingerprint, never by age. A case whose data room has
 * not moved has no reason to be recomputed, and one whose data room moved by a single
 * reviewed candidate has every reason to be.
 */
export async function resolveCaseState(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale: "pt" | "en";
}): Promise<CaseState> {
  const {supabase, organizationId, sessionId, locale} = input;
  const fingerprint = await caseFingerprint(supabase, organizationId, sessionId);

  const {data: session} = await supabase
    .from("document_intake_sessions")
    .select("result_summary")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  const summary = (session?.result_summary ?? {}) as Record<string, unknown>;
  const snapshot = summary.case_state as (CaseState & {fingerprint?: string; locale?: string}) | undefined;
  if (snapshot?.fingerprint === fingerprint && snapshot.locale === locale) return snapshot;

  const state = await buildCaseState({supabase, organizationId, sessionId, locale});
  await supabase.rpc("record_intake_analysis", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_patch: {case_state: {...state, fingerprint, locale}} as unknown as Json,
  });

  return state;
}
