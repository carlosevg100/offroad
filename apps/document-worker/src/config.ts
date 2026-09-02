import {z} from "zod";
import {providerDataAssuranceSchema} from "@offroad/model-gateway";

const providerAssuranceJsonSchema = z.string().transform((value, context) => {
  try {
    return providerDataAssuranceSchema.parse(JSON.parse(value));
  } catch {
    context.addIssue({code: "custom", message: "must be a valid provider assurance record"});
    return z.NEVER;
  }
});

/**
 * Secrets Manager can store a provider key either as plaintext or as the single value in
 * the key/value object produced by its console. ECS injects the whole SecretString here.
 * Normalising both representations at the process boundary keeps the task definition
 * independent of a console-created JSON property name and never exposes the value.
 */
const providerApiKeySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith('"')) return trimmed;
  try {
    const decoded: unknown = JSON.parse(trimmed);
    if (typeof decoded === "string") return decoded.trim();
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      const entries = Object.entries(decoded);
      const entry = entries.length === 1 ? entries[0] : undefined;
      if (entry) {
        const [property, value] = entry;
        // The normal console representation is {label: secret}. If the secret was
        // accidentally pasted into the left-hand "key" box, preserve it as well when
        // the right-hand value is clearly not an API key. Nothing is logged either way.
        if (typeof value === "string" && value.trim().length >= 20) return value.trim();
        if (property.trim().length >= 20) return property.trim();
      }
    }
    return null;
  } catch {
    return trimmed;
  }
}, z.string().min(20).optional());

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
   * The database allocates a share of the case-wide ceiling to each paid document. This
   * environment value is a second, independent stop and defaults to one dollar; the worker
   * always enforces the smaller number. Without both, a re-chunking loop can bill until the
   * first person to notice is reading the provider invoice.
   *
   * Deliberately per job rather than per process. A process-wide ceiling would make the worker
   * refuse every document after some arbitrary one, turning a spend problem into an outage.
   */
  MODEL_MAX_COST_USD_PER_JOB: z.coerce.number().positive().default(1),
  /** The same bound expressed in calls, which catches a loop before the cost does. */
  MODEL_MAX_CALLS_PER_JOB: z.coerce.number().int().positive().default(8),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** Dedicated service account that belongs to no organization. */
  WORKER_ACCOUNT_EMAIL: z.email(),
  WORKER_ACCOUNT_PASSWORD: z.string().min(16),
  /** Plaintext of a row in private.worker_tokens; only the hash lives in the database. */
  OFFROAD_WORKER_TOKEN: z.string().min(32),

  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  PERPLEXITY_API_KEY: providerApiKeySchema,
  FIRECRAWL_API_KEY: providerApiKeySchema,
  ENABLE_OPENAI_WEB_SEARCH: z.string().default("false").transform((value) => value === "true"),
  ENABLE_FIRECRAWL: z.string().default("false").transform((value) => value === "true"),
  FIRECRAWL_ZERO_DATA_RETENTION: z.string().default("false").transform((value) => value === "true"),
  OFFROAD_RESEARCH_USER_AGENT: z.string().min(10).max(300)
    .default("Offroad Capital research@offroad.capital"),
  ENFORCE_PROVIDER_DATA_POLICY: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  ANTHROPIC_DATA_ASSURANCE_JSON: providerAssuranceJsonSchema.optional(),
  OPENAI_DATA_ASSURANCE_JSON: providerAssuranceJsonSchema.optional(),

  PIPELINE_VERSION: z.string().min(1).default("f2-2026.08.24"),
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
}).superRefine((config, context) => {
  if (config.ENABLE_OPENAI_WEB_SEARCH && !config.OPENAI_API_KEY) {
    context.addIssue({code: "custom", path: ["OPENAI_API_KEY"], message: "required when OpenAI web search is enabled"});
  }
  if (config.ENABLE_FIRECRAWL && !config.FIRECRAWL_API_KEY) {
    context.addIssue({code: "custom", path: ["FIRECRAWL_API_KEY"], message: "required when Firecrawl is enabled"});
  }
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Only the *names* of the offending variables, never their values.
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`worker configuration is invalid or incomplete: ${missing}`);
  }
  if (parsed.data.ENFORCE_PROVIDER_DATA_POLICY) {
    if (parsed.data.ANTHROPIC_API_KEY && !parsed.data.ANTHROPIC_DATA_ASSURANCE_JSON) {
      throw new Error("worker configuration is invalid or incomplete: ANTHROPIC_DATA_ASSURANCE_JSON");
    }
    if (parsed.data.OPENAI_API_KEY && !parsed.data.OPENAI_DATA_ASSURANCE_JSON) {
      throw new Error("worker configuration is invalid or incomplete: OPENAI_DATA_ASSURANCE_JSON");
    }
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
    perplexityKey: config.PERPLEXITY_API_KEY ? "present" : "absent",
    openaiWebSearchEnabled: config.ENABLE_OPENAI_WEB_SEARCH,
    firecrawlKey: config.FIRECRAWL_API_KEY ? "present" : "absent",
    firecrawlEnabled: config.ENABLE_FIRECRAWL,
    firecrawlZeroDataRetention: config.FIRECRAWL_ZERO_DATA_RETENTION,
    providerDataPolicyEnforced: config.ENFORCE_PROVIDER_DATA_POLICY,
    anthropicDataAssurance: config.ANTHROPIC_DATA_ASSURANCE_JSON ? "present" : "absent",
    openaiDataAssurance: config.OPENAI_DATA_ASSURANCE_JSON ? "present" : "absent",
    ocrLanguages: config.OCR_LANGUAGES,
    maxCostUsdPerJob: config.MODEL_MAX_COST_USD_PER_JOB,
    maxCallsPerJob: config.MODEL_MAX_CALLS_PER_JOB,
  };
}
