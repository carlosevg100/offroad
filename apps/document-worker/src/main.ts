import {createClient} from "@supabase/supabase-js";
import {createAnthropicAdapter, createModelGateway, createOpenAIAdapter} from "@offroad/model-gateway";
import {loadConfig, describeConfig, type WorkerConfig} from "./config";
import {createQueueClient, startHeartbeat, PoisonedJobError, type ClaimedJob} from "./queue";
import {createClamdScanner} from "./scan";
import {createLibreOfficeConverter, createTesseractEngine, toolVersion} from "./tools";
import {createClassifier} from "./classifier";
import {processDocumentJob, type PipelineDependencies} from "./pipeline";

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

  const gateway = createModelGateway({
    adapters: {
      ...(config.ANTHROPIC_API_KEY ? {anthropic: createAnthropicAdapter({apiKey: config.ANTHROPIC_API_KEY})} : {}),
      ...(config.OPENAI_API_KEY ? {openai: createOpenAIAdapter({apiKey: config.OPENAI_API_KEY})} : {}),
    },
    onCall: (call) => log("model.call", {...call}),
  });

  const dependencies: PipelineDependencies = {
    queue,
    scanner,
    classify: createClassifier(gateway),
    converter: createLibreOfficeConverter({bin: config.SOFFICE_BIN, timeoutMs: config.CONVERT_TIMEOUT_MS, version: sofficeVersion}),
    ocr: createTesseractEngine({
      bin: config.TESSERACT_BIN,
      pdftoppmBin: config.PDFTOPPM_BIN,
      languages: config.OCR_LANGUAGES,
      timeoutMs: config.OCR_TIMEOUT_MS,
      version: tesseractVersion,
    }),
    download: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`the document could not be downloaded (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    },
    uploadLayer: async (url, body) => {
      const response = await fetch(url, {
        method: "PUT",
        headers: {"content-type": "application/json"},
        // Node's fetch wants a BodyInit; a copy into a Buffer is the cheapest way there.
        body: Buffer.from(body),
      });
      if (!response.ok) throw new Error(`the layer could not be stored (${response.status})`);
    },
    log,
  };

  let stopping = false;
  let current: Promise<unknown> | null = null;

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    // Finish the job in hand; its lease is what protects it from being claimed twice.
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
      await sleep(config.IDLE_POLL_SECONDS * 1000);
      continue;
    }

    if (!job) {
      await sleep(config.IDLE_POLL_SECONDS * 1000);
      continue;
    }

    const startedAt = Date.now();
    log("job.claimed", {job: job.job_id, attempt: job.attempt, run: job.processing_run_id});

    const stopHeartbeat = startHeartbeat(queue, job, config.HEARTBEAT_SECONDS * 1000, (error) =>
      log("job.heartbeat_failed", {job: job?.job_id, message: error.message}),
    );

    current = processDocumentJob(job, dependencies)
      .then((outcome) => {
        log("job.finished", {job: job?.job_id, status: outcome.status, ms: Date.now() - startedAt, stages: outcome.stages.length});
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

main().catch((error: Error) => {
  process.stderr.write(`${JSON.stringify({at: new Date().toISOString(), event: "worker.fatal", message: error.message})}\n`);
  process.exitCode = 1;
});
