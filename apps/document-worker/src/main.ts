import {createFairExecutionPoller} from "./execution-poll";
import {createExecutionQueue} from "./execution-queue";
import {processPinnedExecution} from "./process-pinned-execution";
import {verifyInstalledPreparers} from "./released-preparer";
import {verifyInstalledMethodArtifacts} from "./released-method-executor";
import {createProviderResearchTransport} from "./provider-research-transport";
import {createProviderProcessingAuthorizer} from "./provider-processing";
import {createEventOutboxConsumer} from "./event-outbox";
import {processProviderResearchJob} from "./provider-research";
import {processExecutionBriefProposalJob} from "./execution-brief-proposal";
import {readFile} from "node:fs/promises";
import {join} from "node:path";

import {createClient} from "@supabase/supabase-js";
import {offroadHousePresentationTemplate} from "@offroad/case-export";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter, type GatewayCallLog} from "@offroad/model-gateway";
import {loadConfig, describeConfig, type WorkerConfig} from "./config";
import {createQueueClient, startHeartbeat, PoisonedJobError, type ClaimedJob} from "./queue";
import {createClamdScanner} from "./scan";
import {createLibreOfficeConverter, createTesseractEngine, toolVersion} from "./tools";
import {createExtractor} from "./extract";
import {sleep} from "./sleep";
import {processDocumentJob, type PipelineDependencies} from "./pipeline";
import {createClassifier} from "@offroad/document-classification";
import {
  createCvmOpenDataEntityResolver,
  createFirecrawlPublicContentAcquirer,
  createOfficialCompanyResearchProvider,
  createOpenAIWebSearchProvider,
  createPerplexitySearchProvider,
  createSourcePackAcquirer,
  createSourcePackProvider,
  createSecEdgarEntityResolver,
  type PublicSearchProvider,
} from "@offroad/public-research";
import {rotateLegacyStorage} from "./storage-rotation";
import {createJobStorageClient} from "./job-storage";
import {processProviderCaseFitJob} from "./provider-case-fit";
import {processCaseAnalysisJob} from "./case-analysis";
import {processWorkConversationJob} from "./work-conversation";
import {processAgentOperationBriefJob} from "./agent-operation-brief";
import {processOriginationThesisJob} from "./origination-thesis";
import {processCompanyDebtViewJob} from "./company-debt-view";
import {processCapitalPlanningJob} from "./capital-planning";
import {ensureInitialAgentPlan} from "./agent-plan";
import {processIntegrationPreviewRunJob} from "./integration-preview";
import {describeJobFailure} from "./job-failure";
import {createResearchRouter} from "./research-routing";
import {loadSourcePack} from "./source-pack-runtime";
import {modelCallLogDetail, safeModelSpend} from "./model-call-log";
import {assertWorkerRuntimeSchema} from "./runtime-schema";
import {createMaterialRenderInspector, materialRenderToolsAvailable} from "./material-render-inspection";

/**
 * The worker process (P1 plan §13, D-003: AWS ECS Fargate, sa-east-1).
 *
 * It owns no secrets of the tenants and no service-role key: it signs in as a dedicated
 * service account that belongs to no organization, claims one job at a time with the hashed
 * worker credential, and uses a per-job capability token. Its authenticated Storage requests
 * are scoped to a leased job and revalidate the responsible person's current authorization.
 *
 * Logs are structured and content-free: ids, stages, durations and counts. No document text,
 * no financial value, no token ever reaches a log line (AGENTS.md §2.8).
 */
type Logger = (event: string, detail?: Record<string, unknown>) => void;

function createLogger(level: WorkerConfig["LOG_LEVEL"]): Logger {
  const ranking = {debug: 10, info: 20, warn: 30, error: 40} as const;
  const floor = ranking[level];
  return (event, detail) => {
    const severity = event.endsWith(".failed") || event.endsWith(".error") ? "error" : "info";
    if (ranking[severity] < floor) return;
    process.stdout.write(`${JSON.stringify({at: new Date().toISOString(), event, ...detail})}\n`);
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);
  log("worker.boot", describeConfig(config));

  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: {persistSession: false, autoRefreshToken: true},
  });

  const {error: signInError} = await supabase.auth.signInWithPassword({
    email: config.WORKER_ACCOUNT_EMAIL,
    password: config.WORKER_ACCOUNT_PASSWORD,
  });
  if (signInError) throw new Error(`the worker could not sign in: ${signInError.message}`);
  log("worker.signed_in");

  const runtimeSchema = await assertWorkerRuntimeSchema(supabase);
  log("worker.schema_contract_verified", {
    schemaVersion: runtimeSchema.schemaVersion,
    capabilities: runtimeSchema.capabilities.length,
  });

  log("worker.pinned_executors_verified", {artifacts: verifyInstalledMethodArtifacts()});
  log("worker.pinned_preparers_verified", {artifacts: verifyInstalledPreparers()});

  await rotateLegacyStorage(supabase, config.OFFROAD_WORKER_TOKEN, () => log("worker.storage_rotation_completed"));

  const queue = createQueueClient(supabase, {
    workerToken: config.OFFROAD_WORKER_TOKEN,
    leaseSeconds: config.LEASE_SECONDS,
  });

  const eventOutbox = createEventOutboxConsumer(supabase, config.OFFROAD_WORKER_TOKEN, log);

  // External tools: report their versions once, so a run records exactly what read the file.
  const [sofficeVersion, tesseractVersion, pdfinfoVersion, pdftoppmVersion] = await Promise.all([
    toolVersion(config.SOFFICE_BIN),
    toolVersion(config.TESSERACT_BIN),
    toolVersion(config.PDFINFO_BIN),
    toolVersion(config.PDFTOPPM_BIN),
  ]);
  log("worker.tools", {libreoffice: sofficeVersion, tesseract: tesseractVersion, pdfinfo: pdfinfoVersion, pdftoppm: pdftoppmVersion});

  // Materials use the current circular Offroad mark from the same immutable assets as the web
  // application. A missing asset is a broken build and stops boot; silently generating a deck
  // with stale or invented branding would be worse than refusing the job.
  const [brandLogo, brandLogoOnDark] = await Promise.all([
    readFile(join(config.BRAND_ASSETS_DIR, "offroad-symbol.png")),
    readFile(join(config.BRAND_ASSETS_DIR, "offroad-symbol-inverted.png")),
  ]);
  const presentationTemplate = {
    ...offroadHousePresentationTemplate,
    logo: {data: new Uint8Array(brandLogo), extension: "png" as const},
    logoOnDark: {data: new Uint8Array(brandLogoOnDark), extension: "png" as const},
  };
  const materialInspector = materialRenderToolsAvailable({sofficeVersion, pdftoppmVersion, pdfinfoVersion})
    ? createMaterialRenderInspector({
        sofficeBin: config.SOFFICE_BIN,
        pdftoppmBin: config.PDFTOPPM_BIN,
        pdfinfoBin: config.PDFINFO_BIN,
        timeoutMs: config.CONVERT_TIMEOUT_MS,
        libreOfficeVersion: sofficeVersion,
      })
    : null;
  if (!materialInspector) {
    log("worker.material_renderer_disabled", {
      reason: "office_render_toolchain_unavailable",
      libreoffice: sofficeVersion,
      pdfinfo: pdfinfoVersion,
      pdftoppm: pdftoppmVersion,
    });
  }

  const scanner = config.REQUIRE_VIRUS_SCAN
    ? createClamdScanner({host: config.CLAMD_HOST, port: config.CLAMD_PORT, timeoutMs: config.CLAMD_TIMEOUT_MS})
    : null;
  if (!scanner) log("worker.scanner_disabled", {reason: "REQUIRE_VIRUS_SCAN=false"});

  // One gateway per job, not one per process.
  //
  // The gateway keeps a running total and refuses calls past its ceiling, so a single instance
  // shared across the loop would spend the whole allowance on the first few documents and then
  // refuse every document after them: a spend problem turned into an outage. A fresh instance
  // per job makes the ceiling mean "this document" or "this case analysis". The database then
  // allocates those job ceilings so their possible sum cannot cross the case-wide limit.
  const adapters = {
    ...(config.ANTHROPIC_API_KEY ? {anthropic: createAnthropicAdapter({apiKey: config.ANTHROPIC_API_KEY})} : {}),
    ...(config.OPENAI_API_KEY ? {openai: createOpenAIAdapter({apiKey: config.OPENAI_API_KEY, ...(config.PROVIDER_CONNECTIONS_JSON.openai ? {organization: config.PROVIDER_CONNECTIONS_JSON.openai.accountRef, project: config.PROVIDER_CONNECTIONS_JSON.openai.projectRef} : {})})} : {}),
  };
  // Discovery is complementary to zero-cost official sources. Reserve the conservative maximum
  // of every configured fallback per query before giving the remainder to the writer. This stays
  // correct if OpenAI Web Search is explicitly enabled next to Perplexity; the old fixed reserve
  // understated the fallback chain.
  const officialEntityResolvers = [
    createCvmOpenDataEntityResolver(),
    createSecEdgarEntityResolver({userAgent: config.OFFROAD_RESEARCH_USER_AGENT}),
  ];
  const officialResearchProviderFactory = ({jurisdiction, subject}: {
    jurisdiction: "BR" | "US";
    subject: Parameters<typeof createOfficialCompanyResearchProvider>[0]["subject"];
  }) => createOfficialCompanyResearchProvider({
    jurisdiction,
    subject,
    resolvers: officialEntityResolvers,
    userAgent: config.OFFROAD_RESEARCH_USER_AGENT,
  });
  const liveResearchFor = (job: ClaimedJob) => {
    const authorize = createProviderProcessingAuthorizer(supabase, job, config.PROVIDER_CONNECTIONS_JSON);
    const requireEligible = async (provider: "openai" | "perplexity" | "firecrawl", model: string) => {
      const decision = await authorize({provider, model, resources: provider === "openai" ? ["external_search", "inference", "prompt_cache"] : ["external_search"], purpose: "public_research"});
      if (!decision.allowed) throw Object.assign(new Error("processing_resource_ineligible"), {code: "processing_resource_ineligible"});
    };
    return {
      providers: [
        ...(config.PERPLEXITY_API_KEY && config.PROVIDER_CONNECTIONS_JSON.perplexity ? [createPerplexitySearchProvider({apiKey: config.PERPLEXITY_API_KEY, fetch: createProviderResearchTransport({endpoint: "https://api.perplexity.ai/search", authorize: () => requireEligible("perplexity", "search-api")})})] : []),
        ...(config.ENABLE_OPENAI_WEB_SEARCH && config.OPENAI_API_KEY && config.PROVIDER_CONNECTIONS_JSON.openai ? [createOpenAIWebSearchProvider({apiKey: config.OPENAI_API_KEY, fetch: createProviderResearchTransport({endpoint: "https://api.openai.com/v1/responses", authorize: () => requireEligible("openai", "gpt-5.6-terra"), ...(config.PROVIDER_CONNECTIONS_JSON.openai ? {openaiBinding: config.PROVIDER_CONNECTIONS_JSON.openai} : {})})})] : []),
      ] as PublicSearchProvider[],
      contentAcquirer: config.ENABLE_FIRECRAWL && config.FIRECRAWL_API_KEY && config.PROVIDER_CONNECTIONS_JSON.firecrawl
        ? createFirecrawlPublicContentAcquirer({apiKey: config.FIRECRAWL_API_KEY, zeroDataRetention: config.FIRECRAWL_ZERO_DATA_RETENTION,
            fetch: createProviderResearchTransport({endpoint: "https://api.firecrawl.dev/v2/scrape", authorize: () => requireEligible("firecrawl", "scrape-v2")})}) : undefined,
    };
  };
  // Frozen research: a gold case runs against its source pack and nothing else. Discovery,
  // official lookups and content acquisition all read the pack.
  const sourcePack = config.PUBLIC_RESEARCH_MODE === "frozen" ? await loadSourcePack(config.SOURCE_PACK_PATH!) : null;
  const effectiveResearchProviders: PublicSearchProvider[] = sourcePack ? [createSourcePackProvider(sourcePack.pack)] : [];
  const effectiveOfficialResearchProviderFactory = sourcePack ? undefined : officialResearchProviderFactory;
  const effectiveContentAcquirer = sourcePack ? createSourcePackAcquirer(sourcePack.pack, sourcePack.read) : undefined;
  if (sourcePack) log("research.frozen", {caseId: sourcePack.pack.caseId, entries: sourcePack.pack.entries.length});
  // A job whose project is bound to a frozen pack reads that pack and nothing else, on this same
  // worker; everyone else keeps the live set above.
  const researchFor = createResearchRouter({
    live: {
      providers: effectiveResearchProviders,
      officialResearchProviderFactory: effectiveOfficialResearchProviderFactory,
      contentAcquirer: effectiveContentAcquirer,
      frozenCaseId: sourcePack?.pack.caseId ?? null,
    },
    packsDir: config.SOURCE_PACKS_DIR,
    contentAcquirerFromPack: (loaded) => createSourcePackAcquirer(loaded.pack, loaded.read),
  });
  const newGateway = (job: ClaimedJob, research: Awaited<ReturnType<typeof researchFor>>) => {
    const calls: GatewayCallLog[] = [];
    const requestedBudget = "model_budget" in job.payload ? job.payload.model_budget : undefined;
    const configuredMax = Math.min(
      config.MODEL_MAX_COST_USD_PER_JOB,
      requestedBudget?.max_cost_usd ?? config.MODEL_MAX_COST_USD_PER_JOB,
    );
    const maximumDiscoveryCostPerQuery = research.providers.reduce(
      (total, provider) => total + (provider.maxCostUsdPerCall ?? 0),
      0,
    );
    const researchQueryCount = job.kind === "capital_project_analysis" && job.payload.analysis_scope !== "provider_research" && job.payload.analysis_scope !== "provider_case_fit" && !job.payload.revision_of_artifact_id
      ? job.payload.analysis_scope === "origination_thesis" ? 12 : 8
      : job.kind === "case_analysis" || job.kind === "preliminary_analysis" ? 5 : 0;
    const requestedResearchReserve = researchQueryCount * maximumDiscoveryCostPerQuery;
    const researchReserveUsd = research.providers.length > 0
      ? Math.min(requestedResearchReserve, Math.max(0, configuredMax - 0.01))
      : 0;
    const gateway = createModelGateway({
      adapters,
      processingEligibility: async ({provider, model, resources, context}) => {
        // Older executors predate request-level handling metadata. Their purpose comes
        // from the authorized job; classification and source rights always come from SQL.
        const purpose = context?.purpose ?? (job.kind === "document_pipeline" ? "document_processing" : "case_analysis");
        return createProviderProcessingAuthorizer(supabase, job, config.PROVIDER_CONNECTIONS_JSON)({provider, model, resources, purpose});
      },
      budget: {
        maxCostUsd: configuredMax - researchReserveUsd,
        maxCalls: Math.min(config.MODEL_MAX_CALLS_PER_JOB, requestedBudget?.max_calls ?? config.MODEL_MAX_CALLS_PER_JOB),
      },
      onCall: (call) => {
        calls.push(call);
        log("model.call", modelCallLogDetail(job.job_id, call));
      },
    });
    return {gateway, calls, researchReserveUsd};
  };

  // Storage paths come from the authorized database command, never a payload URL.
  const jobStorage = createJobStorageClient(supabase);

  const dependenciesFor = ({gateway, calls}: ReturnType<typeof newGateway>): PipelineDependencies => ({
    queue,
    scanner,
    classify: createClassifier(gateway),
    extract: createExtractor(gateway),
    converter: createLibreOfficeConverter({bin: config.SOFFICE_BIN, timeoutMs: config.CONVERT_TIMEOUT_MS, version: sofficeVersion}),
    ocr: createTesseractEngine({
      bin: config.TESSERACT_BIN,
      pdftoppmBin: config.PDFTOPPM_BIN,
      languages: config.OCR_LANGUAGES,
      timeoutMs: config.OCR_TIMEOUT_MS,
      version: tesseractVersion,
    }),
    download: jobStorage.download,
    uploadLayer: jobStorage.uploadLayer,
    log,
    spend: () => gateway.spent(),
    lineage: () => calls.map((call) => ({...call})),
  });

  const executionQueue = createExecutionQueue(supabase, config.OFFROAD_WORKER_TOKEN);
  const claimNext = createFairExecutionPoller(() => queue.claim(), () => executionQueue.claim(),
    () => log("execution.poll_failed", {reason: "execution_transport_failed"}));
  let stopping = false;
  let current: Promise<unknown> | null = null;
  const shuttingDown = new AbortController();

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    // Finish the job in hand; its lease is what protects it from being claimed twice.
    // Aborting only cuts the idle wait short, so a stop does not sit out the poll interval.
    shuttingDown.abort();
    log("worker.stopping", {signal});
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // A long document job cannot delay revocation propagation or its health signal.
  const outboxLoop = (async () => {
    while (!stopping) {
      try {
        for (let batch = 0; batch < 10 && !stopping; batch++) {
          if (!await eventOutbox.poll()) break;
        }
      } catch { log("outbox.poll.failed", {reason: "transport_failed"}); }
      await sleep(2000, shuttingDown.signal);
    }
  })();

  try {
  while (!stopping) {
    let job: ClaimedJob | null = null;
    try {
      const choice = await claimNext();
      if (choice?.kind === "execution") {
        const execution = choice.claim;
        current = processPinnedExecution(execution, executionQueue, shuttingDown.signal)
          .then(result => log("execution.finished", {job: execution.jobId, status: result.status}))
          .catch(() => log("execution.interrupted", {job: execution.jobId, reason: "current_execution_failed"}));
        await current; current = null;
        continue;
      }
      job = choice?.kind === "legacy" ? choice.job : null;
    } catch (error) {
      if (error instanceof PoisonedJobError) {
        log("job.poisoned", {job: error.jobId});
        continue;
      }
      log("queue.error", {message: (error as Error).message});
      await sleep(config.IDLE_POLL_SECONDS * 1000, shuttingDown.signal);
      continue;
    }

    if (!job) {
      await sleep(config.IDLE_POLL_SECONDS * 1000, shuttingDown.signal);
      continue;
    }

    const startedAt = Date.now();
    log("job.claimed", {job: job.job_id, attempt: job.attempt, run: job.processing_run_id});

    const stopHeartbeat = startHeartbeat(queue, job, config.HEARTBEAT_SECONDS * 1000, (error) =>
      log("job.heartbeat_failed", {job: job?.job_id, message: error.message}),
    );

    if (job.kind === "execution_brief_proposal") {
      current = processExecutionBriefProposalJob(job, queue, {documentaryWorkEnabled:config.DOCUMENTARY_WORK_PLANNING_ENABLED})
        .then((outcome) => { log("job.finished", {job: job.job_id, status: outcome.status, ms: Date.now() - startedAt, modelCalls: 0, costUsd: 0}); })
        .catch(() => { log("job.unreported_failure", {job: job.job_id}); })
        .finally(() => stopHeartbeat());
      await current;
      current = null;
      continue;
    }
    let research: Awaited<ReturnType<typeof researchFor>>;
    try {
      research = await researchFor(job);
      if (!research.frozenCaseId && !research.sourcePackId) research = {...research, ...liveResearchFor(job)};
    } catch (error) {
      // A bound project without its pack must not run live. Fail the job with a cause a reviewer
      // can read; the binding or the image is what needs fixing.
      const failure = describeJobFailure(error, {code: "source_pack_unavailable", stage: "claim", retryable: false});
      await queue.fail(job, failure).catch((reportError: Error) => log("job.unreported_failure", {job: job.job_id, message: reportError.message}));
      stopHeartbeat();
      continue;
    }
    if (research.sourcePackId) log("research.frozen_job", {job: job.job_id, sourcePackId: research.sourcePackId, caseId: research.frozenCaseId});
    const gatewayRun = newGateway(job, research);
    const prepareAgentPlan = job.kind === "capital_project_analysis"
      || job.kind === "case_analysis"
      || job.kind === "preliminary_analysis"
      ? ensureInitialAgentPlan(job, queue)
      : Promise.resolve(null);

    current = prepareAgentPlan.then(() => (job.kind === "case_analysis" || job.kind === "preliminary_analysis"
      ? processCaseAnalysisJob(job, {
          queue,
          gateway: gatewayRun.gateway,
          lineage: () => gatewayRun.calls.map((call) => ({...call})),
          researchProviders: gatewayRun.researchReserveUsd > 0 ? research.providers : [],
          ...(research.officialResearchProviderFactory ? {officialResearchProviderFactory: research.officialResearchProviderFactory} : {}),
          securityEvidence: {
            providerPolicyEnforced: true,
            externalToolsAllowlisted: true,
          },
          log,
        })
      : job.kind === "capital_project_analysis"
        ? job.payload.analysis_scope === "provider_case_fit"
          ? processProviderCaseFitJob(job, {queue})
          : job.payload.analysis_scope === "provider_research"
          ? processProviderResearchJob(job, {queue})
          : job.payload.analysis_scope === "integration_preview"
          // Internal validation: the Case 01 methods run on the frozen evidence, with the grant carried by the claim.
          ? (job.integration_preview === true
              ? processIntegrationPreviewRunJob(job, {
                  queue,
                  log,
                  gateway: gatewayRun.gateway,
                  ...(materialInspector ? {materialInspector} : {}),
                  presentationTemplate,
                })
              : queue.fail(job, describeJobFailure(new Error("integration_preview run claimed without the grant"), {code: "integration_preview_not_granted", stage: "integration_preview", retryable: false}), {retryable: false}).then(() => ({status: "failed" as const})))
          : job.payload.analysis_scope === "company_debt_view"
          ? processCompanyDebtViewJob(job, {
              queue,
              gateway: gatewayRun.gateway,
              lineage: () => gatewayRun.calls.map((call) => ({...call})),
              researchProviders: gatewayRun.researchReserveUsd > 0 ? research.providers : [],
              ...(research.officialResearchProviderFactory ? {officialResearchProviderFactory: research.officialResearchProviderFactory} : {}),
              log,
            })
          : job.payload.analysis_scope === "origination_thesis"
            ? processOriginationThesisJob(job, {
              queue,
              gateway: gatewayRun.gateway,
              lineage: () => gatewayRun.calls.map((call) => ({...call})),
              researchProviders: gatewayRun.researchReserveUsd > 0 ? research.providers : [],
              ...(research.officialResearchProviderFactory ? {officialResearchProviderFactory: research.officialResearchProviderFactory} : {}),
              ...(research.contentAcquirer ? {contentAcquirer: research.contentAcquirer} : {}),
              log,
            })
            : processCapitalPlanningJob(job, {
                queue,
                gateway: gatewayRun.gateway,
                lineage: () => gatewayRun.calls.map((call) => ({...call})),
                researchProviders: gatewayRun.researchReserveUsd > 0 ? research.providers : [],
                ...(research.officialResearchProviderFactory ? {officialResearchProviderFactory: research.officialResearchProviderFactory} : {}),
                log,
              })
      : job.kind === "work_conversation"
        ? processWorkConversationJob(job, {queue, gateway: gatewayRun.gateway, log})
      : job.kind === "agent_operation_brief"
        ? processAgentOperationBriefJob(job, {
            queue,
            gateway: gatewayRun.gateway,
            modelLineage: () => gatewayRun.calls.map((call) => ({...call})),
            log,
            research: {providers: research.providers},
          })
      : processDocumentJob(job, dependenciesFor(gatewayRun))))
      .then((outcome) => {
        const spent = safeModelSpend(gatewayRun.gateway.spent());
        log("job.finished", {
          job: job?.job_id,
          status: outcome.status,
          ms: Date.now() - startedAt,
          stages: "stages" in outcome && Array.isArray(outcome.stages) ? outcome.stages.length : 10,
          costUsd: spent.costUsd,
          modelCalls: spent.calls,
        });
      })
      .catch((error: Error) => {
        // processDocumentJob reports its own failures; reaching here means the reporting
        // itself failed, and the lease expiring is what recovers the job.
        log("job.unreported_failure", {job: job?.job_id, message: error.message});
      })
      .finally(() => stopHeartbeat());

    await current;
    current = null;
  }
  } finally {
    stopping = true;
    shuttingDown.abort();
    await outboxLoop;
  }
  log("worker.stopped");
}


main().catch((error: Error) => {
  process.stderr.write(`${JSON.stringify({at: new Date().toISOString(), event: "worker.fatal", message: error.message})}\n`);
  process.exitCode = 1;
});
