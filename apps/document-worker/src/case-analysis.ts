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
import type {LanguageConductGovernance, Material} from "@offroad/case-materials";
import {
  BRIEF_SYSTEM,
  SEMANTIC_AUDIT_SYSTEM,
  buildBriefInput,
  buildCaseArtifactManifest,
  buildSemanticAuditInput,
  caseBriefSchema,
  deskEvidence,
  fingerprintJson,
  semanticAuditSchema,
  type ClaimDecision,
  type RedFlagPolicy,
  type RedFlagReview,
} from "@offroad/case-understanding";
import {caseRunReportSchema, type CaseStageEvent} from "@offroad/case-runner";
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
import {sha256} from "@offroad/governed-retrieval";
import {gatewayCallLogSchema, type GatewayCallLog, type ModelGateway} from "@offroad/model-gateway";
import {
  buildPublicResearchPlan,
  runPublicResearch,
  type PublicSearchProvider,
  type ResearchRun,
} from "@offroad/public-research";
import type {FactCandidate} from "@offroad/reconciliation";
import {receivablesCaseSchema} from "@offroad/receivables-analysis";
import {compareCaseExecutions, executionModeSchema} from "@offroad/release-governance";
import {z} from "zod";

import type {CaseAnalysisJob, QueueClient} from "./queue";

const recordSchema = z.record(z.string(), z.unknown());
const retrievalContextSchema = z.object({
  playbook_version: z.string().nullable(),
  results: z.array(z.object({
    source: z.enum(["case", "house_playbook", "mandate_note", "precedent"]),
    id: z.string().min(1),
    content: z.string().min(1).max(12_000),
    citation: z.object({
      key: z.string().min(1),
      label: z.string().min(1),
    }).passthrough(),
    score: z.coerce.number(),
  })),
  abstained: z.boolean(),
});
type RetrievalContext = z.infer<typeof retrievalContextSchema>;
const claimDecisionSchema = z.object({
  claimId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  claimFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  decidedBy: z.string().uuid(),
  decidedAt: z.string().datetime({offset: true}),
  reason: z.string().min(3).max(1000).optional(),
});
const pricingDecimalStringSchema = z.union([z.string(), z.number()]).transform((value) => String(value));
const pricingContextSchema = z.object({
  policy: z.object({
    version: z.string().min(1),
    asOf: z.iso.date(),
    regime: z.string().min(1),
    status: z.enum(["active", "invalidated"]),
    minObservations: z.coerce.number().int().min(2),
    minDistinctSources: z.coerce.number().int().min(2),
    minQuality: z.coerce.number().min(0).max(1),
    maxTenorDeltaMonths: z.coerce.number().int().nonnegative(),
    minAmountRatio: pricingDecimalStringSchema,
    maxAmountRatio: pricingDecimalStringSchema,
    minBandWidthBps: z.coerce.number().int().positive(),
    maxBandWidthBps: z.coerce.number().int().positive(),
  }),
  indexLevels: z.object({cdi: pricingDecimalStringSchema, ipca: pricingDecimalStringSchema, tlp: pricingDecimalStringSchema, tr: pricingDecimalStringSchema}),
  indexer: z.enum(["cdi", "ipca", "fixed", "other"]),
  observations: z.array(z.object({
    id: z.string().uuid(),
    sourceId: z.string().min(1),
    sourceOwner: z.string().min(1),
    sourceKind: z.enum(["public_closing", "direct_manager_confirmation", "term_sheet", "indication", "sounding", "authorized_historical"]),
    confidentiality: z.enum(["public", "aggregated_confidential", "restricted_internal"]),
    observedOn: z.iso.date(),
    validUntil: z.iso.date(),
    status: z.enum(["closed", "term", "indication", "sounding"]),
    instrument: z.enum(["ccb", "nce", "debenture_476", "debenture_160", "cra", "cri", "fidc", "venture_debt", "finame", "leasing"]),
    rating: z.enum(["strong", "adequate", "watch", "weak", "distressed"]),
    normalizedSpreadBps: z.coerce.number(),
    normalizationMethod: z.string().min(1),
    tenorMonths: z.coerce.number().int().positive(),
    securityClass: z.string().min(1),
    amortizationClass: z.string().min(1),
    sectorGroup: z.string().min(1),
    amount: pricingDecimalStringSchema,
    regime: z.string().min(1),
    quality: z.coerce.number().min(0).max(1),
    aggregateAuthorized: z.boolean(),
    economics: z.object({
      quotedSpreadBps: z.coerce.number(),
      feeBps: z.coerce.number(),
      oidBps: z.coerce.number(),
      warrantBps: z.coerce.number(),
      hedgeBps: z.coerce.number(),
    }),
  })),
});
const marketDistributionContextSchema=z.object({
  version:z.string().min(1),
  status:z.enum(["active","invalidated"]),
  mandateMaxAgeMonths:z.coerce.number().int().min(1).max(24),
  waveLimit:z.coerce.number().int().min(1).max(20),
  learningGateAnchorCount:z.coerce.number().int().min(1).max(20),
  recipients:z.array(z.object({
    fundId:z.string().min(1),
    contactId:z.string().min(1),
    rationale:z.string().min(1),
    materialKinds:z.array(z.string().min(1)),
    materialFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    mandateFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    order:z.coerce.number().int().positive(),
    anchor:z.boolean(),
  })).default([]),
  authorization:z.object({
    id:z.string().min(1),
    caseFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    materialFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    authorizedBy:z.string().min(1),
    authorizedAt:z.string().datetime({offset:true}),
    recipientIds:z.array(z.string().min(1)),
    scope:z.array(z.string().min(1)),
    revokedAt:z.string().datetime({offset:true}).nullable().default(null),
  }).nullable().default(null),
  introductions:z.array(z.object({
    id:z.string().min(1),
    fundId:z.string().min(1),
    contactId:z.string().min(1),
    materialFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    authorizationId:z.string().min(1),
    introducedBy:z.string().min(1),
    introducedAt:z.string().datetime({offset:true}),
  })).default([]),
  materialRelease:z.object({
    technicalReview:z.object({
      approved:z.boolean(),
      fingerprint:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
      reviewedBy:z.string().nullable(),
      reviewedAt:z.string().datetime({offset:true}).nullable(),
    }),
    companyAuthorization:z.object({
      authorized:z.boolean(),
      fingerprint:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
      scope:z.array(z.string()),
      recipientIds:z.array(z.string()),
    }),
  }).default({
    technicalReview:{approved:false,fingerprint:null,reviewedBy:null,reviewedAt:null},
    companyAuthorization:{authorized:false,fingerprint:null,scope:[],recipientIds:[]},
  }),
});
const conductContextSchema=z.object({
  organizationId:z.string().uuid(),
  policy:z.object({
    version:z.string().min(1),status:z.enum(["active","invalidated"]),disclaimerId:z.string().min(1),
    validFrom:z.iso.date(),validUntil:z.iso.date().nullable(),
  }).nullable().default(null),
  conflictReview:z.object({
    caseFingerprint:z.string().regex(/^[0-9a-f]{64}$/),status:z.enum(["clear","disclosed_accepted","unresolved"]),
    reviewedBy:z.string().uuid(),reviewedAt:z.string().datetime({offset:true}),
  }).nullable().default(null),
  diligenceSurprises:z.array(z.object({
    id:z.string().min(1),description:z.string().min(1),responsibleProcedureId:z.string().nullable(),correctiveActionId:z.string().nullable(),
  })).default([]),
});
const redFlagContextSchema=z.object({
  policy:z.object({
    version:z.string().min(1),
    status:z.enum(["active","invalidated"]),
    validFrom:z.iso.date(),
    validUntil:z.iso.date().nullable(),
    thresholds:z.object({
      inventoryRevenueGrowthGapPct:pricingDecimalStringSchema.optional(),
      pmrIncreaseDays:pricingDecimalStringSchema.optional(),
      stableRevenueChangePct:pricingDecimalStringSchema.optional(),
      highCashToDebtPct:pricingDecimalStringSchema.optional(),
      highDebtCostPct:pricingDecimalStringSchema.optional(),
      managementBiasPct:pricingDecimalStringSchema.optional(),
      periodEndRevenuePct:pricingDecimalStringSchema.optional(),
      changingInformationVersions:z.coerce.number().int().positive().optional(),
    }),
    materiality:recordSchema.default({}),
    responseSla:recordSchema.default({}),
  }),
  reviews:z.array(z.object({
    flagId:z.string().regex(/^RF-(0[1-9]|1\d|20)$/),
    flagFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    decision:z.enum(["confirmed","false_positive","treated","accepted_risk"]),
    rationale:z.string().min(20).max(2000),
    evidenceIds:z.array(z.string()),
    decidedBy:z.string().uuid(),
    decidedAt:z.string().datetime({offset:true}),
  })).default([]),
  mandateDecision:z.object({
    id:z.string().uuid().optional(),
    assessmentFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    decision:z.enum(["continue","continue_with_conditions","decline"]),
    reasonCodes:z.array(z.string()),
    conditions:z.array(z.string()),
    pathBack:z.string().nullable(),
    decidedBy:z.string().uuid(),
    decidedAt:z.string().datetime({offset:true}),
  }).nullable().default(null),
  declineCommunication:z.object({
    mandateDecisionFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
    channel:z.string().min(1),
    recipient:z.string().min(1),
    sentBy:z.string().uuid(),
    sentAt:z.string().datetime({offset:true}),
    messageFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
  }).nullable().default(null),
});
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
  claim_decisions: z.array(claimDecisionSchema).default([]),
  receivables_case: receivablesCaseSchema.optional(),
  pricing_context: pricingContextSchema.nullable().default(null),
  market_distribution_context:marketDistributionContextSchema.nullable().default(null),
  red_flag_context:redFlagContextSchema.nullable().default(null),
  conduct_context:conductContextSchema.nullable().default(null),
  _execution: z.object({
    id: z.uuid(),
    mode: executionModeSchema,
    baseline_execution_id: z.uuid().optional(),
    input_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    pipeline_version: z.string().min(1),
    model_policy_version: z.string().min(1),
    baseline_report: caseRunReportSchema.optional(),
  }),
});

export type CaseAnalysisDependencies = {
  queue: QueueClient;
  gateway: ModelGateway;
  lineage: () => GatewayCallLog[];
  researchProviders?: PublicSearchProvider[];
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
    const useShadow = raw._execution.mode === "shadow";
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
    const publicResearch = await collectPublicResearch({
      queue: dependencies.queue,
      job,
      candidates,
      session: raw.session,
      providers: dependencies.researchProviders ?? [],
    });

    // The house playbook is retrieved by an approved version before a model writes anything.
    // It may guide the analysis, but it is never evidence about this company. Case passages stay
    // out of the writer input because the brief is allowed to use only reconciled facts.
    const primaryQuery = retrievalQuery(archetypeId);
    const primaryRetrieval = await loadRetrieval(
      dependencies.queue,
      job,
      primaryQuery,
      [],
      log,
      "retrieval",
    );
    const playbookLines = primaryRetrieval.results
      .filter((entry) => entry.source === "house_playbook")
      .map((entry) => `- [${entry.citation.label}] ${entry.content}`);
    if (!primaryRetrieval.playbook_version || playbookLines.length === 0) {
      throw Object.assign(new Error("approved house playbook context was not retrieved"), {
        code: "playbook_context_unavailable",
      });
    }

    const spentBefore = dependencies.gateway.spent();
    let writerProvider: "anthropic" | "openai" | null = null;
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
      onStage: (event) => persistCaseStage(dependencies.queue, job, event),
      claimDecisions: raw.claim_decisions as ClaimDecision[],
      ...(raw.receivables_case ? {receivablesCase: raw.receivables_case} : {}),
      ...(raw.pricing_context ? {
        indexLevels: raw.pricing_context.indexLevels,
        pricing: {
          policy: raw.pricing_context.policy,
          observations: raw.pricing_context.observations,
          sectorGroup: stringOr(raw.session.sector, "unknown"),
          indexer: raw.pricing_context.indexer,
        },
      } : {}),
      externalReleaseApproved: false,
      ...(raw.market_distribution_context?{marketGovernance:{
        mandateMaxAgeMonths:raw.market_distribution_context.status==="active"?raw.market_distribution_context.mandateMaxAgeMonths:null,
        waveLimit:raw.market_distribution_context.status==="active"?raw.market_distribution_context.waveLimit:null,
        recipients:raw.market_distribution_context.recipients,
        authorization:raw.market_distribution_context.authorization,
        introductions:raw.market_distribution_context.introductions,
      }}:{}),
      ...(raw.market_distribution_context?{materialRelease:raw.market_distribution_context.materialRelease}:{}),
      ...(raw.red_flag_context?{redFlagGovernance:{
        policy:{
          version:raw.red_flag_context.policy.version,
          status:raw.red_flag_context.policy.status,
          validFrom:raw.red_flag_context.policy.validFrom,
          validUntil:raw.red_flag_context.policy.validUntil,
          thresholds:Object.fromEntries(
            Object.entries(raw.red_flag_context.policy.thresholds)
              .filter(([,value])=>value!==undefined),
          ) as RedFlagPolicy["thresholds"],
        },
        reviews:raw.red_flag_context.reviews as RedFlagReview[],
        mandateDecision:raw.red_flag_context.mandateDecision?{
          assessmentFingerprint:raw.red_flag_context.mandateDecision.assessmentFingerprint,
          decision:raw.red_flag_context.mandateDecision.decision,
          reasonCodes:raw.red_flag_context.mandateDecision.reasonCodes,
          conditions:raw.red_flag_context.mandateDecision.conditions,
          pathBack:raw.red_flag_context.mandateDecision.pathBack,
          decidedBy:raw.red_flag_context.mandateDecision.decidedBy,
          decidedAt:raw.red_flag_context.mandateDecision.decidedAt,
        }:null,
        declineCommunication:raw.red_flag_context.declineCommunication,
      }}:{}),
      ...(raw.conduct_context?{languageConductGovernance:{
        organizationId:raw.conduct_context.organizationId,
        policy:raw.conduct_context.policy,
        conflictReview:raw.conduct_context.conflictReview,
        diligenceSurprises:raw.conduct_context.diligenceSurprises.map((surprise)=>({
          id:surprise.id,description:surprise.description,
          ...(surprise.responsibleProcedureId?{responsibleProcedureId:surprise.responsibleProcedureId}:{}),
          ...(surprise.correctiveActionId?{correctiveActionId:surprise.correctiveActionId}:{}),
        })),
        ...(raw.market_distribution_context?.authorization&&raw.market_distribution_context.authorization.recipientIds[0]?{externalCommunication:{
          targetOrganizationId:raw.conduct_context.organizationId,
          targetCaseId:job.intake_session_id,
          recipientId:raw.market_distribution_context.authorization.recipientIds[0],
          recipientAuthorized:raw.market_distribution_context.authorization.revokedAt===null,
          packageFingerprint:raw.market_distribution_context.authorization.materialFingerprint,
          hasMaterialCommitment:false,
        }}:{}),
      } satisfies LanguageConductGovernance}:{}),
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
              playbookLines,
            }),
          }],
          schema: caseBriefSchema,
          schemaName: "case_brief",
          useShadow,
        });
        writerProvider = generated.provider;
        const after = dependencies.gateway.spent();
        return {
          brief: generated.output,
          blockedBy: [],
          usage: {costUsd: after.costUsd - before.costUsd, modelCalls: after.calls - before.calls},
          modelInvocations: dependencies.lineage().slice(callStart),
        };
      },
      verifyBrief: async ({brief, facts, calculations}) => {
        const callStart = dependencies.lineage().length;
        const before = dependencies.gateway.spent();
        const generated = await dependencies.gateway.complete({
          task: "audit_evidence",
          system: SEMANTIC_AUDIT_SYSTEM,
          input: [{type: "text", text: buildSemanticAuditInput({brief, facts, calculations})}],
          schema: semanticAuditSchema,
          schemaName: "semantic_claim_audit",
          // The evidence review must not be performed by the provider that wrote the case.
          model: writerProvider === "openai"
            ? {provider: "anthropic", model: "claude-opus-5", effort: "high"}
            : {provider: "openai", model: "gpt-5.6-sol", effort: "high"},
        });
        const after = dependencies.gateway.spent();
        return {
          audit: generated.output,
          usage: {costUsd: after.costUsd - before.costUsd, modelCalls: after.calls - before.calls},
          modelInvocations: dependencies.lineage().slice(callStart),
        };
      },
    });

    // Only mandates that already passed every structured criterion may unlock their open notes.
    // Semantic retrieval can add context after that decision; it cannot rescue an excluded or
    // incomplete mandate. UUID validation also prevents fixture labels or malformed ids from
    // crossing the database boundary.
    const allowedFundIds = result.state.matching.marketTruth.shortlist
      .filter((fit) => fit.verdict === "fits" && fit.eligibleForShortlist)
      .map((fit) => fit.fundId)
      .filter((fundId) => z.uuid().safeParse(fundId).success)
      .sort();
    const mandateQuery = "mandato OR ticket OR prazo OR setor OR instrumento OR garantia OR retorno";
    const mandateRetrieval = await loadRetrieval(
      dependencies.queue,
      job,
      mandateQuery,
      allowedFundIds,
      log,
      "mandate_retrieval",
    );

    const publicState = publicCaseState(result.state);
    const publicReport = publicCaseRunReport(result.report);
    const economic = economicInput(raw);
    const extractionVersion = stringOr(raw.session.extraction_version, "unknown");
    const versions = pipelineVersions({snapshot: economic, extractionVersion});
    const privateRetrievalLineage = {
      primary: retrievalLineage(primaryQuery, primaryRetrieval, 0, true),
      mandates: retrievalLineage(mandateQuery, mandateRetrieval, allowedFundIds.length, true),
    };
    const publicRetrievalLineage = {
      primary: retrievalLineage(primaryQuery, primaryRetrieval, 0, false),
      mandates: retrievalLineage(mandateQuery, mandateRetrieval, allowedFundIds.length, false),
    };
    const inputFingerprint = fingerprintJson({
      economics: economic,
      versions,
      caseEngine: caseEngineVersion,
      retrieval: privateRetrievalLineage,
    });
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
      externalResearch: publicResearch,
      modelInvocations: currentLineage,
      caseRunReport: publicReport,
      fingerprint: inputFingerprint,
      locale,
      retrieval: publicRetrievalLineage,
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
    let comparison;
    if (raw._execution.mode !== "primary") {
      if (!raw._execution.baseline_report) {
        throw Object.assign(new Error("baseline report missing"), {code: "baseline_report_missing"});
      }
      comparison = compareCaseExecutions({
        mode: raw._execution.mode,
        baseline: raw._execution.baseline_report,
        candidate: result.report,
      });
    }
    await dependencies.queue.recordControlledExecution(job, result.report, manifest, comparison);
    const manifestId = raw._execution.mode === "primary"
      ? await dependencies.queue.recordCaseSnapshot(job, manifest, stateWithManifest)
      : undefined;
    await dependencies.queue.writeStage(job, "case_analysis", "succeeded", {
      reportFingerprint: result.report.reportFingerprint,
      manifestFingerprint: manifest.manifestFingerprint,
      mandateCount: resolvedMandates.length,
      executionMode: raw._execution.mode,
      comparisonPassed: comparison?.passed,
      criticalRegressions: comparison?.criticalCount ?? 0,
      publicResearchStatus: publicResearch.status,
      publicResearchSourceCount: publicResearch.sourceCount,
    });
    await dependencies.queue.complete(job, {
      ...(manifestId ? {manifest_id: manifestId} : {}),
      report: result.report,
      match_details: result.state.matching,
      ...(comparison ? {comparison} : {}),
      spend: dependencies.gateway.spent(),
      model_lineage: currentLineage,
      retrieval_lineage: privateRetrievalLineage,
    });
    log("case.done", {
      job: job.job_id,
      manifest: manifestId,
      mandates: resolvedMandates.length,
      mode: raw._execution.mode,
      comparisonPassed: comparison?.passed,
    });
    return {status: "succeeded", ...(manifestId ? {manifestId} : {})};
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

type PublicResearchSummary = {
  status: "succeeded" | "partial" | "abstained" | "skipped";
  sourceCount: number;
  topicCounts: Record<string, number>;
  researchRunId: string | null;
};

async function collectPublicResearch(input: {
  queue: QueueClient;
  job: CaseAnalysisJob;
  candidates: FactCandidate[];
  session: Record<string, unknown>;
  providers: PublicSearchProvider[];
}): Promise<PublicResearchSummary> {
  const legalName = publicCandidate(input.candidates, "company.legal_name");
  if (!legalName || input.providers.length === 0) {
    await input.queue.writeStage(input.job, "public_research", "skipped", {
      code: legalName ? "public_research_provider_unavailable" : "public_identity_unavailable",
    });
    return {status: "skipped", sourceCount: 0, topicCounts: {}, researchRunId: null};
  }
  const website = publicCandidate(input.candidates, "company.website");
  const plan = buildPublicResearchPlan({
    legalName,
    ...(website && z.url().safeParse(website).success ? {website} : {}),
    ...(typeof input.session.sector === "string" && input.session.sector.trim() ? {sector: input.session.sector} : {}),
    ...(typeof input.session.geography === "string" && input.session.geography.trim() ? {geography: input.session.geography} : {}),
  });
  await input.queue.writeStage(input.job, "public_research", "started");
  const result = await runPublicResearch({plan, providers: input.providers, maxSourcesPerQuery: 5});
  const persisted = {
    ...result,
    providerChain: input.providers.map((provider) => provider.id),
  } satisfies ResearchRun & {providerChain: string[]};
  const researchRunId = await input.queue.recordPublicResearch(input.job, plan, persisted);
  const topicCounts = result.sources.reduce<Record<string, number>>((counts, source) => {
    counts[source.topic] = (counts[source.topic] ?? 0) + 1;
    return counts;
  }, {});
  await input.queue.writeStage(input.job, "public_research", "succeeded", {
    status: result.status,
    sourceCount: result.sources.length,
    topicCounts,
    researchRunId,
  });
  return {status: result.status, sourceCount: result.sources.length, topicCounts, researchRunId};
}

function publicCandidate(candidates: FactCandidate[], fieldPath: string): string | null {
  return candidates
    .filter((candidate) => candidate.fieldPath === fieldPath && candidate.anchorVerified)
    .sort((left, right) => left.evidenceRank - right.evidenceRank)[0]
    ?.normalizedValue.trim() || null;
}

async function persistCaseStage(
  queue: QueueClient,
  job: CaseAnalysisJob,
  event: CaseStageEvent,
): Promise<void> {
  if (event.status === "started") {
    await queue.writeStage(job, `case:${event.stage}`, "started");
    return;
  }
  await queue.writeStage(
    job,
    `case:${event.stage}`,
    event.status === "blocked" ? "failed" : event.status,
    {
      outcome: event.status,
      durationMs: event.durationMs,
      ...(event.failureKind ? {failureKind: event.failureKind} : {}),
      ...(event.code ? {code: event.code} : {}),
      ...(event.outputFingerprint ? {outputFingerprint: event.outputFingerprint} : {}),
    },
    {model_calls: event.usage.modelCalls, model_cost_usd: event.usage.costUsd},
  );
}

async function loadRetrieval(
  queue: QueueClient,
  job: CaseAnalysisJob,
  query: string,
  allowedFundIds: string[],
  log: (event: string, detail?: Record<string, unknown>) => void,
  stage: "retrieval" | "mandate_retrieval",
): Promise<RetrievalContext> {
  await queue.writeStage(job, stage, "started");
  try {
    const context = retrievalContextSchema.parse(await queue.loadRetrievalContext(job, {
      query,
      allowedFundIds,
      limit: 24,
    }));
    const counts = sourceCounts(context);
    await queue.writeStage(job, stage, "succeeded", {
      playbookVersion: context.playbook_version,
      resultCount: context.results.length,
      sourceCounts: counts,
      allowedFundCount: allowedFundIds.length,
      abstained: context.abstained,
    });
    log(`case.${stage}`, {job: job.job_id, results: context.results.length, allowedFunds: allowedFundIds.length});
    return context;
  } catch (error) {
    await queue.writeStage(job, stage, "failed", {code: errorCode(error)});
    throw error;
  }
}

function retrievalLineage(
  query: string,
  context: RetrievalContext,
  allowedFundCount: number,
  includeResultIds: boolean,
) {
  return {
    queryHash: sha256(query),
    playbookVersion: context.playbook_version,
    sourceCounts: sourceCounts(context),
    allowedFundCount,
    abstained: context.abstained,
    ...(includeResultIds ? {resultIds: context.results.map((entry) => entry.id)} : {}),
  };
}

function sourceCounts(context: RetrievalContext): Record<string, number> {
  return context.results.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.source] = (counts[entry.source] ?? 0) + 1;
    return counts;
  }, {});
}

function retrievalQuery(archetypeId: z.infer<typeof archetypeIdSchema>): string {
  const archetypeTerms: Record<z.infer<typeof archetypeIdSchema>, string> = {
    working_capital: "capital de giro OR recebíveis OR liquidez",
    growth_expansion: "expansão OR crescimento OR capex OR ramp-up",
    acquisition: "aquisição OR M&A OR pró-forma OR integração",
    refinance: "refinanciamento OR vencimentos OR alongamento",
    equipment_finance: "equipamento OR capex OR garantia",
    venture_debt: "venture debt OR runway OR sponsor",
    other: "capacidade OR estrutura OR evidência",
  };
  return `${archetypeTerms[archetypeId]} OR capacidade OR estrutura OR evidência OR mandato`;
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
  if (kind === "credit_profile" || kind === "package" || kind === "credit_memo") return "credit_memo";
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
