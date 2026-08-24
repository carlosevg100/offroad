import {caseEngineVersion, executeCaseEngine, type CaseEngineState} from "@offroad/case-engine";
import type {Material} from "@offroad/case-materials";
import {
  buildBriefInput,
  buildCaseArtifactManifest,
  deskEvidence,
  fingerprintJson,
  BRIEF_SYSTEM,
  caseBriefSchema,
  type CaseBrief,
} from "@offroad/case-understanding";
import type {DeskAnalysis, Trajectory} from "@offroad/credit-analysis";
import type {ArchetypeId, ClassifiedDocument} from "@offroad/credit-playbook";
import type {DataRoomDocument} from "@offroad/data-room";
import {
  createAnthropicAdapter,
  createModelGateway,
  createOpenAIAdapter,
  gatewayCallLogSchema,
  type GatewayCallLog,
} from "@offroad/model-gateway";
import type {FactCandidate, ReconciliationReport} from "@offroad/reconciliation";
import type {SupabaseClient} from "@supabase/supabase-js";

import {invocationManifest, normalizeEconomicInput, pipelineVersions, type EconomicInputSnapshot} from "./case-manifest";
import {dealBriefOf} from "./deal-brief";

import {reportServerFailure} from "@/lib/observability/report";
import type {Database, Json} from "@/types/database";

/** The web representation adds governed execution evidence to the domain state. */
export type CaseState = Omit<CaseEngineState, "modelInvocations"> & {
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

/** The model only writes prose. The engine independently audits every material claim. */
async function writeBrief(input: {
  archetypeId: ArchetypeId;
  reconciliation: ReconciliationReport;
  desk: DeskAnalysis | null;
  trajectory: Trajectory | null;
  locale: "pt" | "en";
  onSpend?: (spend: {costUsd: number; calls: number}) => void;
}): Promise<{brief: CaseBrief | null; blockedBy: string[]; modelInvocations: GatewayCallLog[]}> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) {
    return {brief: null, blockedBy: ["no_model_credentials"], modelInvocations: []};
  }

  let costUsd = 0;
  let calls = 0;
  const modelInvocations: GatewayCallLog[] = [];
  const gateway = createModelGateway({
    adapters: {
      ...(anthropicKey ? {anthropic: createAnthropicAdapter({apiKey: anthropicKey})} : {}),
      ...(openaiKey ? {openai: createOpenAIAdapter({apiKey: openaiKey})} : {}),
    },
    budget: {maxCostUsd: 3, maxCalls: 4},
    onCall: (call) => {
      costUsd += call.costUsd ?? 0;
      calls += 1;
      modelInvocations.push(call);
    },
  });
  const evidence = deskEvidence(input.desk, input.trajectory);

  try {
    const result = await gateway.complete({
      task: "case_brief",
      system: BRIEF_SYSTEM,
      input: [{
        type: "text",
        text: buildBriefInput({
          archetypeId: input.archetypeId,
          facts: input.reconciliation.facts,
          calculations: [...input.reconciliation.calculations, ...evidence.calculations],
          exceptions: input.reconciliation.exceptions,
          gaps: input.reconciliation.gaps,
          locale: input.locale,
          deskLines: evidence.promptLines,
        }),
      }],
      schema: caseBriefSchema,
      schemaName: "case_brief",
    });
    return {brief: result.output, blockedBy: [], modelInvocations};
  } catch (error) {
    reportServerFailure({step: "case.brief", error});
    return {brief: null, blockedBy: ["generation_failed"], modelInvocations};
  } finally {
    if (calls > 0) input.onSpend?.({costUsd, calls});
  }
}

export async function buildCaseState(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  locale: "pt" | "en";
  withBrief?: boolean;
}): Promise<CaseState> {
  const {supabase, organizationId, sessionId, locale} = input;
  const {data: session, error} = await supabase
    .from("document_intake_sessions")
    .select(
      "archetype, current_run_id, requested_amount, requested_term_months, requested_grace_months, sector, geography, instruments, collateral_kinds, expected_rate",
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
    writeBrief: async (writerInput) => {
      if (input.withBrief === false) {
        return {brief: null, blockedBy: ["not_requested"], usage: {costUsd: 0, modelCalls: 0}, modelInvocations: []};
      }
      const {data: claimed, error: claimError} = await supabase.rpc("claim_case_brief", {
        p_organization_id: organizationId,
        p_session_id: sessionId,
      });
      if (claimError) throw claimError;
      if (claimed !== true) {
        return {brief: null, blockedBy: ["brief_in_progress"], usage: {costUsd: 0, modelCalls: 0}, modelInvocations: []};
      }
      const written = await writeBrief({
        ...writerInput,
        onSpend: ({costUsd, calls}) => {
          void supabase
            .rpc("record_case_model_spend", {
              p_organization_id: organizationId,
              p_session_id: sessionId,
              p_cost_usd: costUsd,
              p_calls: calls,
            })
            .then(({error: spendError}) => {
              if (spendError) reportServerFailure({step: "case.spend_not_recorded", error: spendError});
            });
        },
      });
      return {
        ...written,
        usage: {
          costUsd: written.modelInvocations.reduce((sum, call) => sum + call.costUsd, 0),
          modelCalls: written.modelInvocations.length,
        },
      };
    },
  });
  const parsedInvocations = gatewayCallLogSchema.array().safeParse(result.state.modelInvocations);
  if (!parsedInvocations.success) throw new Error("invalid case model lineage");
  return {...result.state, modelInvocations: parsedInvocations.data, caseRunReport: result.report};
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
    .select("id, archetype, collateral_kinds, current_run_id, expected_rate, extraction_version, geography, instruments, journey, locale, opportunity_id, pipeline_version, requested_amount, requested_grace_months, requested_term_months, sector, status")
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

async function loadWorkerLineage(input: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sessionId: string;
  runId: string | null;
}): Promise<{calls: GatewayCallLog[]; expected: number; complete: boolean}> {
  if (!input.runId) return {calls: [], expected: 0, complete: true};
  const {data, error} = await input.supabase.rpc("read_processing_model_lineage", {
    p_organization_id: input.organizationId,
    p_session_id: input.sessionId,
    p_processing_run_id: input.runId,
  });
  if (error) throw error;
  const record = asJsonRecord(data);
  const parsed = gatewayCallLogSchema.array().safeParse(record.calls ?? []);
  const expected = typeof record.expected_calls === "number" ? record.expected_calls : Number(record.expected_calls ?? 0);
  return {calls: parsed.success ? parsed.data : [], expected, complete: parsed.success && parsed.data.length === expected};
}

function artifactKind(kind: Material["kind"]): "teaser" | "credit_memo" | "term_sheet" | "diligence_qa" | "data_room_index" | "other" {
  if (kind === "teaser") return "teaser";
  if (kind === "term_sheet") return "term_sheet";
  if (kind === "diligence_qa") return "diligence_qa";
  if (kind === "data_room_index") return "data_room_index";
  if (kind === "credit_profile" || kind === "package" || kind === "investment_memo") return "credit_memo";
  return "other";
}

/** Computes once per economic fingerprint and persists an immutable artifact manifest. */
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

  const state = await buildCaseState({supabase, organizationId, sessionId, locale});
  const currentRunId = typeof economicSnapshot.session.current_run_id === "string"
    ? economicSnapshot.session.current_run_id
    : null;
  const workerLineage = await loadWorkerLineage({supabase, organizationId, sessionId, runId: currentRunId});
  const modelCalls = [...workerLineage.calls, ...state.modelInvocations];
  const sources = economicSnapshot.sources.map((source) => ({
    documentId: String(source.id ?? ""),
    versionId: String(source.document_version ?? "1"),
    sha256: typeof source.sha256 === "string" ? source.sha256 : null,
  }));
  const sourceCapture = sources.length > 0 && sources.every((source) => source.sha256 !== null) ? "complete" as const : "partial" as const;
  const modelCapture = workerLineage.complete
    ? modelCalls.length > 0 ? "complete" as const : "not_applicable" as const
    : "partial" as const;
  const manifest = buildCaseArtifactManifest({
    caseId: sessionId,
    runId: currentRunId ?? state.caseRunReport.runId,
    createdAt: new Date().toISOString(),
    locale: locale === "pt" ? "pt-BR" : "en-US",
    inputFingerprint: fingerprint,
    capture: {sources: sourceCapture, models: modelCapture},
    versions,
    models: modelCalls.map(invocationManifest),
    sources,
    outputs: [
      {artifactId: `${sessionId}:case_state`, kind: "case_state", sha256: fingerprintJson(state)},
      ...state.materials.map((material, index) => ({
        artifactId: `${sessionId}:${material.kind}:${index + 1}`,
        kind: artifactKind(material.kind),
        sha256: fingerprintJson(material),
      })),
    ],
  });
  const snapshotToPersist = {...state, fingerprint, locale, manifestFingerprint: manifest.manifestFingerprint};
  const {error} = await supabase.rpc("record_case_snapshot", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_processing_run_id: currentRunId,
    p_manifest: manifest as unknown as Json,
    p_case_state: snapshotToPersist as unknown as Json,
  });
  if (error) throw error;
  return state;
}
