import {
  caseEngineVersion,
  executeCaseEngine,
  publicCaseRunReport,
  publicCaseState,
  type PublicCaseEngineState,
} from "@offroad/case-engine";
import {fingerprintJson} from "@offroad/case-understanding";
import type {ArchetypeId, ClassifiedDocument} from "@offroad/credit-playbook";
import type {DataRoomDocument} from "@offroad/data-room";
import {gatewayCallLogSchema, type GatewayCallLog} from "@offroad/model-gateway";
import type {FactCandidate} from "@offroad/reconciliation";
import type {SupabaseClient} from "@supabase/supabase-js";

import {normalizeEconomicInput, pipelineVersions, type EconomicInputSnapshot} from "./case-manifest";
import {dealBriefOf} from "./deal-brief";

import type {Database, Json} from "@/types/database";

/** The web representation adds governed execution evidence to the domain state. */
export type CaseState = Omit<PublicCaseEngineState, "modelInvocations"> & {
  modelInvocations: GatewayCallLog[];
  caseRunReport: Awaited<ReturnType<typeof executeCaseEngine>>["report"];
};

async function loadCandidates(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<FactCandidate[]> {
  const {data, error} = await supabase
    .from("intake_field_candidates")
    .select(
      "field_path, normalized_value, value_type, source_document_id, evidence_rank, information_class, confidence, anchor_verified, period_start, period_end, entity_name, entity_scope, source_anchor",
    )
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);
  if (error) throw error;
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
    ...(row.entity_scope ? {entityScope: row.entity_scope} : {}),
    ...(row.source_anchor ? {anchor: row.source_anchor} : {}),
  }));
}

async function loadClassified(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<ClassifiedDocument[]> {
  const {data: documents, error: documentsError} = await supabase
    .from("source_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);
  if (documentsError) throw documentsError;
  const ids = (documents ?? []).map((document) => document.id);
  if (ids.length === 0) return [];
  const {data: profiles, error} = await supabase
    .from("document_profiles")
    .select("source_document_id, document_kind")
    .eq("organization_id", organizationId)
    .in("source_document_id", ids);
  if (error) throw error;
  return (profiles ?? []).map((profile) => ({
    id: profile.source_document_id,
    kind: profile.document_kind as ClassifiedDocument["kind"],
  }));
}

async function loadRoomDocuments(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<DataRoomDocument[]> {
  const {data: documents, error: documentsError} = await supabase
    .from("source_documents")
    .select("id, original_name, sha256, sha256_verified_at, byte_size")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);
  if (documentsError) throw documentsError;
  const rows = documents ?? [];
  if (rows.length === 0) return [];
  const {data: profiles, error} = await supabase
    .from("document_profiles")
    .select("source_document_id, document_kind")
    .eq("organization_id", organizationId)
    .in("source_document_id", rows.map((document) => document.id));
  if (error) throw error;
  const kindOf = new Map(
    (profiles ?? []).map((profile) => [profile.source_document_id, profile.document_kind as DataRoomDocument["kind"]]),
  );
  return rows.map((document) => ({
    id: document.id,
    kind: kindOf.get(document.id) ?? null,
    originalName: document.original_name,
    sha256: document.sha256,
    sha256VerifiedAt: document.sha256_verified_at,
    byteSize: document.byte_size,
  }));
}

export async function buildCaseState(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale: "pt" | "en";
}): Promise<CaseState> {
  const {supabase, organizationId, sessionId, locale} = input;
  const {data: session, error} = await supabase
    .from("document_intake_sessions")
    .select(
      "archetype, capital_consequence, capital_currency, capital_objective, capital_urgency, current_run_id, requested_amount, requested_term_months, requested_grace_months, sector, geography, instruments, collateral_kinds, expected_rate",
    )
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;

  const archetypeId = ((session?.archetype as ArchetypeId | null) ?? "other") satisfies ArchetypeId;
  const dealBrief = session ? dealBriefOf(session) : {};
  const [documents, candidates, roomDocuments] = await Promise.all([
    loadClassified(supabase, organizationId, sessionId),
    loadCandidates(supabase, organizationId, sessionId),
    loadRoomDocuments(supabase, organizationId, sessionId),
  ]);
  const runId = session?.current_run_id ?? `case-state:${crypto.randomUUID()}`;

  const result = await executeCaseEngine({
    runId,
    caseId: sessionId,
    archetypeId,
    locale,
    referenceDate: new Date().toISOString().slice(0, 10),
    candidates,
    documents,
    roomDocuments,
    dealBrief,
    // Web sessions cannot inspect every provider mandate. The workload adapter supplies these.
    resolvedMandates: [],
    externalReleaseApproved: false,
  });
  const parsedInvocations = gatewayCallLogSchema.array().safeParse(result.state.modelInvocations);
  if (!parsedInvocations.success) throw new Error("invalid case model lineage");
  return {
    ...publicCaseState(result.state),
    modelInvocations: parsedInvocations.data,
    caseRunReport: publicCaseRunReport(result.report),
  };
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
  const {error} = await supabase.rpc("record_intake_analysis", {
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
      matching: state.matching,
      outcome: state.outcome,
      case_runner_report: state.caseRunReport,
      case_run: input.runId,
    } as unknown as Json,
  });
  if (error) throw error;
}

async function loadEconomicInputSnapshot(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<EconomicInputSnapshot> {
  const sessionResult = await supabase
    .from("document_intake_sessions")
    .select("id, archetype, capital_consequence, capital_currency, capital_objective, capital_urgency, collateral_kinds, current_run_id, expected_rate, extraction_version, geography, instruments, journey, locale, opportunity_id, pipeline_version, requested_amount, requested_grace_months, requested_term_months, sector, status")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionResult.error) throw sessionResult.error;
  if (!sessionResult.data) throw new Error("case session not found");

  const [sourcesResult, candidatesResult, answersResult] = await Promise.all([
    supabase
      .from("source_documents")
      .select("id, document_version, sha256, sha256_verified_at, byte_size, mime_type, processing_status, classification, evidence_rank")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId),
    supabase
      .from("intake_field_candidates")
      .select("id, anchor_precision, anchor_verified, confidence, currency, entity_name, entity_scope, evidence_rank, extraction_method, extractor_key, field_group, field_path, information_class, is_primary, normalized_value, period_end, period_start, processing_run_id, review_state, reviewer_comment, source_anchor, source_document_id, unit, value_scale, value_type, verifier_flags")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId),
    supabase
      .from("intake_information_answers")
      .select("id, requirement_id, response, answer, note")
      .eq("organization_id", organizationId)
      .eq("intake_session_id", sessionId),
  ]);
  for (const result of [sourcesResult, candidatesResult, answersResult]) {
    if (result.error) throw result.error;
  }

  const sourceIds = (sourcesResult.data ?? []).map((source) => source.id);
  const layersResult = sourceIds.length === 0
    ? {data: [], error: null}
    : await supabase
      .from("document_layers")
      .select("source_document_id, document_version, sha256, parser_versions, processing_run_id, status")
      .eq("organization_id", organizationId)
      .in("source_document_id", sourceIds);
  if (layersResult.error) throw layersResult.error;

  let run: Record<string, Json | undefined> | null = null;
  if (sessionResult.data.current_run_id) {
    const runResult = await supabase
      .from("processing_runs")
      .select("id, pipeline_version, status, versions, model_calls")
      .eq("organization_id", organizationId)
      .eq("id", sessionResult.data.current_run_id)
      .maybeSingle();
    if (runResult.error) throw runResult.error;
    run = asJsonRecord(runResult.data);
  }
  return normalizeEconomicInput({
    session: asJsonRecord(sessionResult.data),
    sources: (sourcesResult.data ?? []).map(asJsonRecord),
    candidates: (candidatesResult.data ?? []).map(asJsonRecord),
    answers: (answersResult.data ?? []).map(asJsonRecord),
    layers: (layersResult.data ?? []).map(asJsonRecord),
    run,
  });
}

function asJsonRecord(value: unknown): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

/** Reads the workload snapshot. While the worker is running, a deterministic preview is shown. */
export async function resolveCaseState(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale: "pt" | "en";
}): Promise<CaseState> {
  const {supabase, organizationId, sessionId, locale} = input;
  const economicSnapshot = await loadEconomicInputSnapshot(supabase, organizationId, sessionId);
  const extractionVersion = typeof economicSnapshot.session.extraction_version === "string"
    ? economicSnapshot.session.extraction_version
    : "unknown";
  const versions = pipelineVersions({snapshot: economicSnapshot, extractionVersion});
  const fingerprint = fingerprintJson({economics: economicSnapshot, versions, caseEngine: caseEngineVersion});
  const {data: session, error: sessionError} = await supabase
    .from("document_intake_sessions")
    .select("result_summary")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  const summary = (session?.result_summary ?? {}) as Record<string, unknown>;
  const snapshot = summary.case_state as (CaseState & {fingerprint?: string; locale?: string}) | undefined;
  if (snapshot?.fingerprint === fingerprint && snapshot.locale === locale) return snapshot;

  return buildCaseState({supabase, organizationId, sessionId, locale});
}
