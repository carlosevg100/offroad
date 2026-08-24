import {
  caseEngineVersion,
  executeCaseEngine,
  invocationManifest,
  normalizeEconomicInput,
  pipelineVersions,
  publicCaseRunReport,
  publicCaseState,
  type EconomicInputSnapshot,
} from "@offroad/case-engine";
import type {Material} from "@offroad/case-materials";
import {
  BRIEF_SYSTEM,
  buildBriefInput,
  buildCaseArtifactManifest,
  caseBriefSchema,
  deskEvidence,
  fingerprintJson,
} from "@offroad/case-understanding";
import {archetypeIdSchema} from "@offroad/credit-playbook";
import {documentKindSchema} from "@offroad/credit-ontology";
import {
  collateralKindSchema,
  instrumentSchema,
  mandateProvenanceSchema,
  resolveMandate,
  type CollateralKind,
  type Instrument,
  type Mandate,
  type Sourced,
} from "@offroad/fund-mandate";
import {gatewayCallLogSchema, type GatewayCallLog, type ModelGateway} from "@offroad/model-gateway";
import type {FactCandidate} from "@offroad/reconciliation";
import {z} from "zod";

import type {CaseAnalysisJob, QueueClient} from "./queue";

const recordSchema = z.record(z.string(), z.unknown());
const rawCaseInputSchema = z.object({
  session: recordSchema,
  run: recordSchema,
  candidates: z.array(recordSchema),
  sources: z.array(recordSchema),
  documents: z.array(recordSchema),
  layers: z.array(recordSchema),
  answers: z.array(recordSchema),
  directory_mandates: z.array(z.object({
    fund_id: z.string(),
    fund_name: z.string(),
    observations: z.array(z.object({
      criterion: z.string(),
      value: z.unknown(),
      provenance: z.string(),
      observed_at: z.string(),
      note: z.string().nullable().optional(),
    })),
  })),
  registered_mandates: z.array(z.object({
    fund_id: z.string(),
    fund_name: z.string(),
    provider_organization_id: z.string(),
    source_kind: z.string(),
    valid_from: z.string(),
    constraints: recordSchema,
  })),
  model_lineage: z.array(z.unknown()),
  expected_model_calls: z.coerce.number().int().nonnegative(),
});

export type CaseAnalysisDependencies = {
  queue: QueueClient;
  gateway: ModelGateway;
  lineage: () => GatewayCallLog[];
  now?: () => Date;
  log?: (event: string, detail?: Record<string, unknown>) => void;
};

export type CaseAnalysisOutcome = {
  status: "succeeded" | "failed";
  manifestId?: string;
};

export async function processCaseAnalysisJob(
  job: CaseAnalysisJob,
  dependencies: CaseAnalysisDependencies,
): Promise<CaseAnalysisOutcome> {
  const log = dependencies.log ?? (() => {});
  await dependencies.queue.writeStage(job, "case_analysis", "started");
  try {
    const raw = rawCaseInputSchema.parse(await dependencies.queue.loadCaseInput(job));
    const locale = raw.session.locale === "en-US" ? "en" : "pt";
    const archetypeId = archetypeIdSchema.catch("other").parse(raw.session.archetype);
    const candidates = raw.candidates.map(toCandidate);
    const documents = raw.documents.flatMap((document) => {
      const kind = documentKindSchema.safeParse(document.document_kind);
      return kind.success ? [{id: String(document.id), kind: kind.data}] : [];
    });
    const roomDocuments = raw.documents.map((document) => {
      const kind = documentKindSchema.safeParse(document.document_kind);
      return {
        id: String(document.id),
        kind: kind.success ? kind.data : null,
        originalName: String(document.original_name ?? "document"),
        sha256: typeof document.sha256 === "string" ? document.sha256 : null,
        sha256VerifiedAt: typeof document.sha256_verified_at === "string" ? document.sha256_verified_at : null,
        byteSize: numberOr(document.byte_size, 0),
      };
    });
    const resolvedMandates = [
      ...raw.directory_mandates.map(directoryMandate),
      ...raw.registered_mandates.map(registeredMandate),
    ].map((mandate) => resolveMandate(mandate, {asOf: referenceDate(dependencies.now)}));

    const spentBefore = dependencies.gateway.spent();
    const result = await executeCaseEngine({
      runId: job.processing_run_id,
      caseId: job.intake_session_id,
      archetypeId,
      locale,
      referenceDate: referenceDate(dependencies.now),
      candidates,
      documents,
      roomDocuments,
      dealBrief: dealBrief(raw.session),
      resolvedMandates,
      externalReleaseApproved: false,
      writeBrief: async ({reconciliation, desk, trajectory}) => {
        const evidence = deskEvidence(desk, trajectory);
        const callStart = dependencies.lineage().length;
        const before = dependencies.gateway.spent();
        const generated = await dependencies.gateway.complete({
          task: "case_brief",
          system: BRIEF_SYSTEM,
          input: [{
            type: "text",
            text: buildBriefInput({
              archetypeId,
              facts: reconciliation.facts,
              calculations: [...reconciliation.calculations, ...evidence.calculations],
              exceptions: reconciliation.exceptions,
              gaps: reconciliation.gaps,
              locale,
              deskLines: evidence.promptLines,
            }),
          }],
          schema: caseBriefSchema,
          schemaName: "case_brief",
        });
        const after = dependencies.gateway.spent();
        return {
          brief: generated.output,
          blockedBy: [],
          usage: {costUsd: after.costUsd - before.costUsd, modelCalls: after.calls - before.calls},
          modelInvocations: dependencies.lineage().slice(callStart),
        };
      },
    });

    const publicState = publicCaseState(result.state);
    const publicReport = publicCaseRunReport(result.report);
    const economic = economicInput(raw);
    const extractionVersion = stringOr(raw.session.extraction_version, "unknown");
    const versions = pipelineVersions({snapshot: economic, extractionVersion});
    const inputFingerprint = fingerprintJson({economics: economic, versions, caseEngine: caseEngineVersion});
    const priorLineage = gatewayCallLogSchema.array().safeParse(raw.model_lineage);
    const currentLineage = dependencies.lineage();
    const allLineage = [...(priorLineage.success ? priorLineage.data : []), ...currentLineage];
    const expectedCalls = raw.expected_model_calls + (dependencies.gateway.spent().calls - spentBefore.calls);
    const sources = raw.sources.map((source) => ({
      documentId: String(source.id ?? ""),
      versionId: String(source.document_version ?? "1"),
      sha256: typeof source.sha256 === "string" ? source.sha256 : null,
    }));
    const snapshot = {
      ...publicState,
      modelInvocations: currentLineage,
      caseRunReport: publicReport,
      fingerprint: inputFingerprint,
      locale,
    };
    const manifest = buildCaseArtifactManifest({
      caseId: job.intake_session_id,
      runId: job.processing_run_id,
      createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
      locale: locale === "pt" ? "pt-BR" : "en-US",
      inputFingerprint,
      capture: {
        sources: sources.length > 0 && sources.every((source) => source.sha256 !== null) ? "complete" : "partial",
        models: allLineage.length === expectedCalls
          ? allLineage.length > 0 ? "complete" : "not_applicable"
          : "partial",
      },
      versions,
      models: allLineage.map((call) => invocationManifest(call as GatewayCallLog)),
      sources,
      outputs: [
        {artifactId: `${job.intake_session_id}:case_state`, kind: "case_state", sha256: fingerprintJson(snapshot)},
        {artifactId: `${job.intake_session_id}:mandate_screen`, kind: "mandate_screen", sha256: fingerprintJson(result.state.matching)},
        ...publicState.materials.map((material, index) => ({
          artifactId: `${job.intake_session_id}:${material.kind}:${index + 1}`,
          kind: artifactKind(material.kind),
          sha256: fingerprintJson(material),
        })),
      ],
    });
    const stateWithManifest = {...snapshot, manifestFingerprint: manifest.manifestFingerprint};
    const manifestId = await dependencies.queue.recordCaseSnapshot(job, manifest, stateWithManifest);
    await dependencies.queue.writeStage(job, "case_analysis", "succeeded", {
      reportFingerprint: result.report.reportFingerprint,
      manifestFingerprint: manifest.manifestFingerprint,
      mandateCount: resolvedMandates.length,
    });
    await dependencies.queue.complete(job, {
      manifest_id: manifestId,
      report: result.report,
      match_details: result.state.matching,
      spend: dependencies.gateway.spent(),
      model_lineage: currentLineage,
    });
    log("case.done", {job: job.job_id, manifest: manifestId, mandates: resolvedMandates.length});
    return {status: "succeeded", manifestId};
  } catch (error) {
    await dependencies.queue.writeStage(job, "case_analysis", "failed", {code: errorCode(error)});
    await dependencies.queue.fail(job, {
      reason: "case_analysis_failed",
      code: errorCode(error),
      spend: dependencies.gateway.spent(),
      model_lineage: dependencies.lineage(),
    }, {retryable: retryable(error), retryInSeconds: 60});
    log("case.failed", {job: job.job_id, code: errorCode(error)});
    return {status: "failed"};
  }
}

function toCandidate(candidate: Record<string, unknown>): FactCandidate {
  return {
    fieldPath: String(candidate.field_path),
    normalizedValue: typeof candidate.normalized_value === "string"
      ? candidate.normalized_value
      : JSON.stringify(candidate.normalized_value),
    valueType: valueType(candidate.value_type),
    sourceDocument: typeof candidate.source_document_id === "string" ? candidate.source_document_id : "user-entry",
    evidenceRank: numberOr(candidate.evidence_rank, 7),
    informationClass: String(candidate.information_class) as FactCandidate["informationClass"],
    confidence: numberOr(candidate.confidence, 0),
    anchorVerified: candidate.anchor_verified === true,
    ...(typeof candidate.period_start === "string" ? {periodStart: candidate.period_start} : {}),
    ...(typeof candidate.period_end === "string" ? {periodEnd: candidate.period_end} : {}),
    ...(typeof candidate.entity_name === "string" ? {entityName: candidate.entity_name} : {}),
    ...(typeof candidate.entity_scope === "string" ? {entityScope: candidate.entity_scope} : {}),
    anchor: candidate.source_anchor ?? {},
  };
}

function directoryMandate(raw: z.infer<typeof rawCaseInputSchema>["directory_mandates"][number]): Mandate {
  const observations = <T>(criterion: string, schema: z.ZodType<T>): Sourced<T>[] => raw.observations
    .filter((entry) => entry.criterion === criterion)
    .flatMap((entry) => {
      const value = schema.safeParse(entry.value);
      const provenance = mandateProvenanceSchema.safeParse(entry.provenance);
      if (!value.success || !provenance.success) return [];
      return [{
        value: value.data,
        provenance: provenance.data,
        observedAt: entry.observed_at,
        ...(entry.note ? {note: entry.note} : {}),
      }];
    });
  return {
    fundId: raw.fund_id,
    fundName: raw.fund_name,
    ticket: observations("ticket", moneyRangeSchema),
    termMonths: observations("term_months", monthRangeSchema),
    sectors: observations("sectors", z.array(z.string())),
    instruments: observations("instruments", z.array(instrumentSchema)),
    collateral: observations("collateral", z.array(collateralKindSchema)),
    geographies: observations("geographies", z.array(z.string())),
    leverageCeiling: observations("leverage_ceiling", decimalStringSchema),
    minimumDscr: observations("minimum_dscr", decimalStringSchema),
    active: observations("active", z.boolean()),
  };
}

function registeredMandate(raw: z.infer<typeof rawCaseInputSchema>["registered_mandates"][number]): Mandate {
  const sourced = <T>(value: T | undefined): Sourced<T>[] => value === undefined ? [] : [{
    value,
    provenance: "declared",
    observedAt: raw.valid_from,
    note: "self_declared_onboarding",
  }];
  const constraints = raw.constraints;
  const ticket = moneyRangeSchema.safeParse(constraints.ticket);
  const term = monthRangeSchema.safeParse(constraints.term_months);
  return {
    fundId: raw.fund_id,
    fundName: raw.fund_name,
    ticket: sourced(ticket.success ? ticket.data : undefined),
    termMonths: sourced(term.success ? term.data : undefined),
    sectors: sourced(stringList(constraints.sectors)),
    instruments: sourced(enumList(constraints.structure_types, instrumentSchema)),
    collateral: sourced(enumList(constraints.collateral, collateralKindSchema)),
    geographies: sourced(stringList(constraints.geographies)),
    leverageCeiling: [],
    minimumDscr: [],
    active: sourced(true),
  };
}

function economicInput(raw: z.infer<typeof rawCaseInputSchema>): EconomicInputSnapshot {
  return normalizeEconomicInput({
    session: raw.session,
    sources: raw.sources,
    candidates: raw.candidates,
    answers: raw.answers,
    layers: raw.layers,
    run: raw.run,
  });
}

function dealBrief(session: Record<string, unknown>) {
  const requestedAmount = numericString(session.requested_amount);
  const instruments = enumList<Instrument>(session.instruments, instrumentSchema);
  const collateralKinds = enumList<CollateralKind>(session.collateral_kinds, collateralKindSchema);
  const expectedRate = numericString(session.expected_rate);
  return {
    ...(requestedAmount ? {requestedAmount} : {}),
    ...(Number.isInteger(session.requested_term_months) ? {requestedTermMonths: Number(session.requested_term_months)} : {}),
    ...(Number.isInteger(session.requested_grace_months) ? {requestedGraceMonths: Number(session.requested_grace_months)} : {}),
    ...(typeof session.sector === "string" ? {sector: session.sector} : {}),
    ...(typeof session.geography === "string" ? {geography: session.geography} : {}),
    ...(instruments ? {instruments} : {}),
    ...(collateralKinds ? {collateralKinds} : {}),
    ...(expectedRate ? {expectedRate} : {}),
  };
}

const decimalStringSchema = z.union([z.string(), z.number()]).transform(String);
const moneyRangeSchema = z.object({min: decimalStringSchema, max: decimalStringSchema});
const monthRangeSchema = z.object({min: z.coerce.number().int(), max: z.coerce.number().int()});

function enumList<T extends string>(value: unknown, schema: z.ZodType<T>): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.flatMap((entry) => {
    const result = schema.safeParse(normalizeInstrument(String(entry)));
    return result.success ? [result.data] : [];
  });
  return parsed.length > 0 ? parsed : undefined;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function normalizeInstrument(value: string): string {
  return value.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^debenture_restrita$/, "debenture")
    .replace(/^venture_debt$/, "equity_kicker_debt");
}

function numericString(value: unknown): string | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(value) : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function valueType(value: unknown): FactCandidate["valueType"] {
  return value === "text" || value === "date" || value === "boolean" || value === "list" ? value : "number";
}

function referenceDate(now?: () => Date): string {
  return (now?.() ?? new Date()).toISOString().slice(0, 10);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function artifactKind(kind: Material["kind"]): "teaser" | "credit_memo" | "term_sheet" | "diligence_qa" | "data_room_index" | "other" {
  if (kind === "teaser") return "teaser";
  if (kind === "term_sheet") return "term_sheet";
  if (kind === "diligence_qa") return "diligence_qa";
  if (kind === "data_room_index") return "data_room_index";
  if (kind === "credit_profile" || kind === "package" || kind === "investment_memo") return "credit_memo";
  return "other";
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 100);
  }
  return error instanceof z.ZodError ? "invalid_case_input" : "case_analysis_failed";
}

function retryable(error: unknown): boolean {
  if (error instanceof z.ZodError) return false;
  return /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|rate.?limit|429|5\d\d/i.test(
    error instanceof Error ? error.message : String(error),
  );
}
