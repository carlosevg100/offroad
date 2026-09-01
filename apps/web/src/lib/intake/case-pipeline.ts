import {
  caseEngineVersion,
  executeCaseEngine,
  publicCaseRunReport,
  publicCaseState,
  type PublicCaseEngineState,
} from "@offroad/case-engine";
import {buildCaseArtifactManifest, fingerprintJson} from "@offroad/case-understanding";
import {
  requirementResponseSchema,
  type ArchetypeId,
  type ClassifiedDocument,
  type InformationAnswers,
  type RequirementResponses,
} from "@offroad/credit-playbook";
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
  fingerprint?: string;
  economicFingerprint?: string;
  locale?: "pt" | "en";
  manifestFingerprint?: string;
  receivablesVertical?: {
    version: "2026.08.28-v1";
    status: "needs_requested_amount" | "analyzed";
    fingerprint: string;
    evidenceCoverage: {delivered: number; searched: number; complete: boolean; warnings: readonly string[]};
    classification: {categoryIds: readonly string[]; cellIds: readonly string[]};
    defects: readonly {id: string; description: string; measured?: {value: string; unit: string}}[];
    questions: readonly {id: string; text: string}[];
    pipeline: null | {
      version: string;
      quality: {status: "complete_for_phase_three_evaluation" | "incomplete"; blockers: readonly string[]; warnings: readonly string[]};
      phaseOne: {
        universe: {currency: string; reportingDate: string};
        staticMetrics: {
          portfolio: {
            titleCount: {value: string | null};
            totalFaceValue: {value: string | null};
            totalOpenValue: {value: string | null};
            weightedRemainingTermDays: {value: string | null};
          };
          concentration: {
            openByEconomicGroup: {
              top_1: {value: string | null};
              top_10: {value: string | null};
            };
          };
        };
        quality: {status: string; blockers: readonly string[]; warnings: readonly string[]; limitations: readonly string[]};
      };
      routes: readonly {id: string; status: string; blockers: readonly string[]; conditions: readonly string[]}[];
      evidenceCollection: {
        currentBatch: readonly {
          id: string;
          title: string;
          priority: string;
          clientInstructions: readonly string[];
          whyItMatters: readonly string[];
          acceptedEvidence: readonly string[];
        }[];
        backlog: readonly {id: string}[];
        completedFactIds: readonly string[];
        summary: {openTasks: number; currentTasks: number; factsCompleted: number; factsOpen: number};
      };
      boundaries: {
        companyFacingRecommendationAllowed: false;
        externalDirectionAllowed: false;
        qualifiedIntroductionAllowed: false;
        creditApprovalExpressed: false;
      };
    };
  };
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

async function loadInformationState(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<{informationAnswers: InformationAnswers; requirementResponses: RequirementResponses}> {
  const {data, error} = await supabase
    .from("intake_information_answers")
    .select("requirement_id, answer, response, note")
    .eq("organization_id", organizationId)
    .eq("intake_session_id", sessionId);
  if (error) throw error;

  const informationAnswers: Record<string, string | undefined> = {};
  const requirementResponses: Record<
    string,
    {response: "provided" | "partial" | "not_applicable" | "after_nda" | "unavailable"; note?: string}
  > = {};
  for (const row of data ?? []) {
    if (row.answer?.trim()) informationAnswers[row.requirement_id] = row.answer.trim();
    const response = requirementResponseSchema.safeParse(row.response);
    if (response.success) {
      requirementResponses[row.requirement_id] = {
        response: response.data,
        ...(row.note?.trim() ? {note: row.note.trim()} : {}),
      };
    }
  }
  return {informationAnswers, requirementResponses};
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
  const [documents, candidates, roomDocuments, informationState] = await Promise.all([
    loadClassified(supabase, organizationId, sessionId),
    loadCandidates(supabase, organizationId, sessionId),
    loadRoomDocuments(supabase, organizationId, sessionId),
    loadInformationState(supabase, organizationId, sessionId),
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
    informationAnswers: informationState.informationAnswers,
    requirementResponses: informationState.requirementResponses,
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

/**
 * Publishes the zero-cost local/CI analysis with the same immutable boundary as the worker.
 *
 * The deterministic fixture is allowed only while the organization's real pipeline is disabled;
 * the database repeats that check. Keeping this compiler here makes the fallback an explicit
 * implementation of the production contract, rather than a UI-only preview that the
 * confirmation command can never find.
 */
export async function materializeFallbackCaseState(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale: "pt" | "en";
}): Promise<CaseState> {
  const {supabase, organizationId, sessionId, locale} = input;
  const economicSnapshot = await loadEconomicInputSnapshot(supabase, organizationId, sessionId);
  const extractionVersion = typeof economicSnapshot.session.extraction_version === "string"
    ? economicSnapshot.session.extraction_version
    : "verified-content-hash-fixture-v1";
  const versions = pipelineVersions({snapshot: economicSnapshot, extractionVersion});
  const inputFingerprint = fingerprintJson({economics: economicSnapshot, versions, caseEngine: caseEngineVersion});
  const runId = typeof economicSnapshot.run?.id === "string"
    ? economicSnapshot.run.id
    : typeof economicSnapshot.session.current_run_id === "string"
      ? economicSnapshot.session.current_run_id
      : null;
  if (!runId) throw new Error("fallback analysis run missing");

  const built = await buildCaseState({supabase, organizationId, sessionId, locale});
  const snapshot: CaseState = {
    ...built,
    fingerprint: inputFingerprint,
    economicFingerprint: inputFingerprint,
    locale,
  };
  const sources = economicSnapshot.sources.map((source) => ({
    documentId: String(source.id ?? ""),
    versionId: String(source.document_version ?? "1"),
    sha256: typeof source.sha256 === "string" ? source.sha256 : null,
  }));
  const manifest = buildCaseArtifactManifest({
    caseId: sessionId,
    runId,
    createdAt: new Date().toISOString(),
    locale: locale === "pt" ? "pt-BR" : "en-US",
    inputFingerprint,
    capture: {
      sources: sources.length > 0 && sources.every((source) => source.sha256 !== null) ? "complete" : "partial",
      models: "not_applicable",
    },
    versions,
    models: [],
    sources,
    outputs: [{
      artifactId: `${sessionId}:case_state`,
      kind: "case_state",
      sha256: fingerprintJson(snapshot),
    }],
  });
  const stateWithManifest: CaseState = {...snapshot, manifestFingerprint: manifest.manifestFingerprint};
  const externalResearch = {
    status: "abstained",
    sourceCount: 0,
    topicCounts: {},
    researchRunId: null,
    sources: [],
    reason: "verified_content_hash_fixture",
  };
  const understandingPayload = {
    schemaVersion: "2026.08.31-v2",
    caseId: sessionId,
    locale: locale === "pt" ? "pt-BR" : "en-US",
    readiness: stateWithManifest.readiness,
    reconciliation: stateWithManifest.reconciliation,
    operationTruth: stateWithManifest.operationTruth,
    capacity: stateWithManifest.capacity,
    trajectory: stateWithManifest.trajectory,
    desk: stateWithManifest.desk,
    clientQuestions: stateWithManifest.clientQuestions,
    brief: stateWithManifest.brief,
    briefBlockedBy: stateWithManifest.briefBlockedBy,
    redFlagTruth: stateWithManifest.redFlagTruth,
    externalResearch,
    receivablesVertical: stateWithManifest.receivablesVertical ?? null,
  };
  const {error} = await supabase.rpc("record_fallback_case_snapshot", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_manifest: manifest as unknown as Json,
    p_case_state: stateWithManifest as unknown as Json,
    p_understanding_payload: understandingPayload as unknown as Json,
  });
  if (error) throw error;
  return stateWithManifest;
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
  if ((snapshot?.economicFingerprint === fingerprint || snapshot?.fingerprint === fingerprint) && snapshot.locale === locale) {
    return snapshot;
  }

  const built = await buildCaseState({supabase, organizationId, sessionId, locale});
  return {...built, fingerprint, economicFingerprint: fingerprint, locale};
}
