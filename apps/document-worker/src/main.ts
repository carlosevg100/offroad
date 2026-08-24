import {createClient} from "@supabase/supabase-js";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter, type GatewayCallLog} from "@offroad/model-gateway";
import {loadConfig, describeConfig, type WorkerConfig} from "./config";
import {createQueueClient, startHeartbeat, PoisonedJobError, type ClaimedJob} from "./queue";
import {createClamdScanner} from "./scan";
import {createLibreOfficeConverter, createTesseractEngine, toolVersion} from "./tools";
import {createExtractor} from "./extract";
import {sleep} from "./sleep";
import {processDocumentJob, type PipelineDependencies} from "./pipeline";
import {createClassifier} from "@offroad/document-classification";
import {createStorageUrlGuard} from "./storage-url";
import {processCaseAnalysisJob} from "./case-analysis";

/**
 * The worker process (P1 plan §13, D-003: AWS ECS Fargate, sa-east-1).
 *
 * It owns no secrets of the tenants and no service-role key: it signs in as a dedicated
 * service account that belongs to no organization, claims one job at a time with the hashed
 * worker credential, and does everything else with the per-job capability token. Documents
 * reach it through short-lived signed URLs carried in the job payload, so it needs no Storage
 * credential either.
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

  const queue = createQueueClient(supabase, {
    workerToken: config.OFFROAD_WORKER_TOKEN,
    leaseSeconds: config.LEASE_SECONDS,
  });

  // External tools: report their versions once, so a run records exactly what read the file.
  const [sofficeVersion, tesseractVersion] = await Promise.all([
    toolVersion(config.SOFFICE_BIN),
    toolVersion(config.TESSERACT_BIN),
  ]);
  log("worker.tools", {libreoffice: sofficeVersion, tesseract: tesseractVersion});

  const scanner = config.REQUIRE_VIRUS_SCAN
    ? createClamdScanner({host: config.CLAMD_HOST, port: config.CLAMD_PORT, timeoutMs: config.CLAMD_TIMEOUT_MS})
    : null;
  if (!scanner) log("worker.scanner_disabled", {reason: "REQUIRE_VIRUS_SCAN=false"});

  // One gateway per job, not one per process.
  //
  // The gateway keeps a running total and refuses calls past its ceiling, so a single instance
  // shared across the loop would spend the whole allowance on the first few documents and then
  // refuse every document after them: a spend problem turned into an outage. A fresh instance
  // per job makes the ceiling mean "this document", which is the only unit where a number like
  // five dollars is meaningful.
  const adapters = {
    ...(config.ANTHROPIC_API_KEY ? {anthropic: createAnthropicAdapter({apiKey: config.ANTHROPIC_API_KEY})} : {}),
    ...(config.OPENAI_API_KEY ? {openai: createOpenAIAdapter({apiKey: config.OPENAI_API_KEY})} : {}),
  };
  const newGateway = () => {
    const calls: GatewayCallLog[] = [];
    const gateway = createModelGateway({
      adapters,
      budget: {maxCostUsd: config.MODEL_MAX_COST_USD_PER_JOB, maxCalls: config.MODEL_MAX_CALLS_PER_JOB},
      onCall: (call) => {
        calls.push(call);
        log("model.call", {...call});
      },
    });
    return {gateway, calls};
  };

  // The payload's URLs are input, `SUPABASE_URL` is configuration, and the two are not
  // allowed to disagree. See `storage-url.ts` for what a worker that trusted them would be.
  const guardStorageUrl = createStorageUrlGuard(config.SUPABASE_URL);

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
    download: async (url) => {
      const response = await fetch(guardStorageUrl("download_url", url));
      if (!response.ok) throw new Error(`the document could not be downloaded (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    },
    uploadLayer: async (url, body) => {
      const response = await fetch(guardStorageUrl("layer_upload_url", url), {
        method: "PUT",
        headers: {"content-type": "application/json"},
        // Node's fetch wants a BodyInit; a copy into a Buffer is the cheapest way there.
        body: Buffer.from(body),
      });
      if (!response.ok) throw new Error(`the layer could not be stored (${response.status})`);
    },
    log,
    spend: () => gateway.spent(),
    lineage: () => calls.map((call) => ({...call})),
  });

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

  while (!stopping) {
    let job: ClaimedJob | null = null;
    try {
      job = await queue.claim();
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

    const gatewayRun = newGateway();
    current = (job.kind === "case_analysis"
      ? processCaseAnalysisJob(job, {
          queue,
          gateway: gatewayRun.gateway,
          lineage: () => gatewayRun.calls.map((call) => ({...call})),
          log,
        })
      : processDocumentJob(job, dependenciesFor(gatewayRun)))
      .then((outcome) => {
        const spent = gatewayRun.gateway.spent();
        log("job.finished", {
          job: job?.job_id,
          status: outcome.status,
          ms: Date.now() - startedAt,
          stages: "stages" in outcome ? outcome.stages.length : 9,
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

  log("worker.stopped");
}


main().catch((error: Error) => {
  process.stderr.write(`${JSON.stringify({at: new Date().toISOString(), event: "worker.fatal", message: error.message})}\n`);
  process.exitCode = 1;
});
