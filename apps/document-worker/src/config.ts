import {z} from "zod";

/**
 * Worker configuration. Everything arrives through the environment, which the task
 * definition fills from AWS Secrets Manager at start-up (P1 plan §13, D-003).
 *
 * Two rules this file exists to enforce:
 *
 *   1. **A missing secret stops the worker at boot**, loudly, instead of producing a process
 *      that claims jobs and fails every one of them halfway through.
 *   2. **No secret is ever printed.** `describeConfig()` is what goes to the logs, and it
 *      reports presence and shape — never a value, not even truncated. A key fragment in a
 *      log is a key in a log aggregator (AGENTS.md §3, §2.8).
 */
const schema = z.object({
  SUPABASE_URL: z.url(),

  /**
   * What one document is allowed to cost in model calls before the job is stopped.
   *
   * A measured case runs about US$ 2.50 across its whole data room, so a single document
   * reaching five dollars is a loop or a pathological file, not a large company. The ceiling
   * exists to make that finite: without one, a document that keeps re-chunking bills until
   * somebody notices, and the first person to notice is the invoice.
   *
   * Deliberately per job rather than per process. A process-wide ceiling would make the worker
   * refuse every document after some arbitrary one, turning a spend problem into an outage.
   */
  MODEL_MAX_COST_USD_PER_JOB: z.coerce.number().positive().default(5),
  /** The same bound expressed in calls, which catches a loop before the cost does. */
  MODEL_MAX_CALLS_PER_JOB: z.coerce.number().int().positive().default(40),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** Dedicated service account that belongs to no organization. */
  WORKER_ACCOUNT_EMAIL: z.email(),
  WORKER_ACCOUNT_PASSWORD: z.string().min(16),
  /** Plaintext of a row in private.worker_tokens; only the hash lives in the database. */
  OFFROAD_WORKER_TOKEN: z.string().min(32),

  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),

  PIPELINE_VERSION: z.string().min(1).default("f1-2026.08.18"),
  LEASE_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  HEARTBEAT_SECONDS: z.coerce.number().int().min(15).max(600).default(120),
  IDLE_POLL_SECONDS: z.coerce.number().int().min(1).max(60).default(5),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(8).default(1),

  CLAMD_HOST: z.string().default("127.0.0.1"),
  CLAMD_PORT: z.coerce.number().int().default(3310),
  CLAMD_TIMEOUT_MS: z.coerce.number().int().default(120_000),
  /** Refusing to run without a virus scanner is the default; only a human may relax it. */
  REQUIRE_VIRUS_SCAN: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),

  SOFFICE_BIN: z.string().default("soffice"),
  TESSERACT_BIN: z.string().default("tesseract"),
  PDFTOPPM_BIN: z.string().default("pdftoppm"),
  OCR_LANGUAGES: z.string().default("por+eng"),
  CONVERT_TIMEOUT_MS: z.coerce.number().int().default(180_000),
  OCR_TIMEOUT_MS: z.coerce.number().int().default(120_000),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Only the *names* of the offending variables, never their values.
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`worker configuration is invalid or incomplete: ${missing}`);
  }
  return parsed.data;
}

/** Safe to log: says what is configured, never what it is. */
export function describeConfig(config: WorkerConfig): Record<string, string | number | boolean> {
  return {
    supabaseUrl: config.SUPABASE_URL,
    workerAccount: config.WORKER_ACCOUNT_EMAIL.replace(/^(.).*(@.*)$/, "$1***$2"),
    pipelineVersion: config.PIPELINE_VERSION,
    leaseSeconds: config.LEASE_SECONDS,
    heartbeatSeconds: config.HEARTBEAT_SECONDS,
    maxConcurrentJobs: config.MAX_CONCURRENT_JOBS,
    virusScanRequired: config.REQUIRE_VIRUS_SCAN,
    anthropicKey: config.ANTHROPIC_API_KEY ? "present" : "absent",
    openaiKey: config.OPENAI_API_KEY ? "present" : "absent",
    ocrLanguages: config.OCR_LANGUAGES,
    maxCostUsdPerJob: config.MODEL_MAX_COST_USD_PER_JOB,
    maxCallsPerJob: config.MODEL_MAX_CALLS_PER_JOB,
  };
}
