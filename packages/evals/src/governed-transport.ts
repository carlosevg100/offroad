import {createHash, randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {
  executionCanonicalText,
  governedEvaluationContractSchema,
  governedEvaluationOutcomes,
  governedEvaluationReasons,
  governedEvaluationToolId,
  type GovernedEvaluationContract,
  type GovernedEvaluationOutcome,
  type GovernedEvaluationReason,
} from "@offroad/agent-contracts";
import {modelGatewayVersion} from "@offroad/model-gateway";
import {createClient, type SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

/**
 * The evaluation scripts' only road to a model: a governed evaluation, requested through the
 * evaluator's own session and read back once the worker has committed it. The script signs in as
 * the evaluator with the publishable key; it never holds a provider key and never constructs a
 * provider adapter or a model gateway. The contract names the evaluation organization, the
 * audience (case, case version, script), each provider route as a read-only tool at the gateway
 * version the worker carries, an integer budget with an expiry, and the inputs as the snapshot
 * fingerprint plus the content hashes of its sources. The database decides the rest: whether this
 * evaluator may ask, whether each send, repair and fallback may go, and what the result is.
 *
 * A request lost in transport is sent again with the same bytes, which the database replays. A
 * request id reused with other bytes (a resumed run) names the evaluation it already created; the
 * client follows it only when that evaluation carries the same inputs for the same evaluator.
 * Refusals are never retried, and only their codes travel: no remote text leaves this module.
 */

/** The environment the client reads, and nothing else: no provider key is among these names. */
export const governedTransportEnvironmentNames = {
  supabaseUrl: "SUPABASE_URL",
  publishableKey: "SUPABASE_PUBLISHABLE_KEY",
  evaluatorEmail: "OFFROAD_EVALUATOR_EMAIL",
  evaluatorPassword: "OFFROAD_EVALUATOR_PASSWORD",
  organizationId: "OFFROAD_EVALUATION_ORGANIZATION_ID",
} as const;
export type GovernedTransportEnvironment = Record<keyof typeof governedTransportEnvironmentNames, string>;

export type GovernedTransportErrorCode =
  | "governed_transport_environment_missing"
  | "governed_transport_environment_invalid"
  | "evaluator_sign_in_failed"
  | "evaluation_contract_invalid"
  | "evaluation_input_too_large"
  | "evaluation_request_refused"
  | "evaluation_request_conflict"
  | "evaluation_read_refused"
  | "evaluation_read_mismatch"
  | "evaluation_transport_failed"
  | "evaluation_failed_without_result"
  | "evaluation_result_invalid"
  | "evaluation_result_timeout";

export type GovernedTransportErrorContext = {
  /** Environment variable names, never their values. */
  names?: readonly string[];
  /** A database refusal code or a job error code; codes only, never remote text. */
  refusal?: string;
  /** The evaluation and the request to resume or read later. */
  executionId?: string;
  requestId?: string;
};

export class GovernedTransportError extends Error {
  constructor(readonly code: GovernedTransportErrorCode, readonly context: GovernedTransportErrorContext = {}) {
    const details = [
      context.names?.length ? context.names.join(", ") : null,
      context.refusal ?? null,
      context.executionId ? `evaluation ${context.executionId}` : null,
      context.requestId ? `request ${context.requestId}` : null,
    ].filter((detail): detail is string => detail !== null);
    super(details.length ? `${code}: ${details.join("; ")}` : code);
    this.name = "GovernedTransportError";
  }
}

/** Lowercase UUID text: the only form the database's contract pattern accepts and renders. */
const identityPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads the five names above from the environment. The evaluator's credential travels only to the
 * Supabase URL, so that URL must be https, or plain http on the loopback of a disposable stack.
 */
export function readGovernedTransportEnvironment(env: Readonly<Record<string, string | undefined>> = process.env): GovernedTransportEnvironment {
  const names = governedTransportEnvironmentNames;
  const read = (name: string, trim: boolean) => {
    const value = env[name];
    return typeof value !== "string" ? "" : trim ? value.trim() : value;
  };
  const values: GovernedTransportEnvironment = {
    supabaseUrl: read(names.supabaseUrl, true),
    publishableKey: read(names.publishableKey, true),
    evaluatorEmail: read(names.evaluatorEmail, true),
    // A password is used exactly as given; only an empty one is missing.
    evaluatorPassword: read(names.evaluatorPassword, false),
    organizationId: read(names.organizationId, true).toLowerCase(),
  };
  const missing = (Object.keys(names) as Array<keyof typeof names>).filter((field) => values[field].length === 0).map((field) => names[field]);
  if (missing.length) throw new GovernedTransportError("governed_transport_environment_missing", {names: missing});
  let url: URL;
  try { url = new URL(values.supabaseUrl); } catch { throw new GovernedTransportError("governed_transport_environment_invalid", {names: [names.supabaseUrl]}); }
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname)))
    || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new GovernedTransportError("governed_transport_environment_invalid", {names: [names.supabaseUrl]});
  }
  if (!identityPattern.test(values.organizationId)) throw new GovernedTransportError("governed_transport_environment_invalid", {names: [names.organizationId]});
  return {...values, supabaseUrl: url.origin};
}

/** One provider route a run may take, as the model gateway names it. */
export type GovernedEvaluationRoute = {provider: string; model: string};

export type GovernedEvaluationSpec = {
  audience: {caseId: string; caseVersion: string; scriptId: string};
  /** Every route a call may take, primary first; each becomes one declared read-only tool. */
  routes: readonly GovernedEvaluationRoute[];
  /** Integer microdollars and calls, a duration and the time the budget stays open from now. */
  budget: {maxCostMicrousd: number; maxModelCalls: number; maxDurationMs: number; expiresInMs: number};
  /** The family's snapshot; its canonical bytes are what the worker receives. */
  snapshot: unknown;
  /** Content hashes of the sources the snapshot carries; never text, never a URL. */
  sourceContentHashes: readonly string[];
  /** An earlier request to resume; a new one is created when absent. */
  requestId?: string;
};

export type GovernedEvaluationIdentity = {organizationId: string; executionId: string; requestId: string; processingRunId: string};

/** The largest contract and snapshot the database stores. */
export const maximumContractBytes = 1_048_576;
export const maximumSnapshotBytes = 8_388_608;
/** requestedAt may not be later than the database clock; a small allowance absorbs clock skew. */
const clockAllowanceMs = 30_000;
/** The budget stays open at least this long after the request is composed. */
const minimumOpenBudgetMs = 60_000;

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * The contract and snapshot bytes of one request, both in the house canonical text. The contract
 * is read by the same schema the worker uses before it is sent, so anything the database would
 * refuse for its shape is refused here first, before any network call.
 */
export function composeGovernedEvaluation(spec: GovernedEvaluationSpec, identity: GovernedEvaluationIdentity, now: number): {
  contract: GovernedEvaluationContract;
  contractText: string;
  snapshotText: string;
} {
  // The database refuses a budget that has already closed when the request lands.
  if (!Number.isSafeInteger(spec.budget.expiresInMs) || spec.budget.expiresInMs < minimumOpenBudgetMs) throw new GovernedTransportError("evaluation_contract_invalid");
  let snapshotText: string;
  try { snapshotText = executionCanonicalText(spec.snapshot); } catch { throw new GovernedTransportError("evaluation_contract_invalid"); }
  // One tool per route, in the order given; the worker requires every route it may take to be declared.
  const tools = new Map<string, {id: string; version: string; effect: "read_only"}>();
  for (const route of spec.routes) {
    const id = governedEvaluationToolId(route.provider, route.model);
    if (!tools.has(id)) tools.set(id, {id, version: modelGatewayVersion, effect: "read_only"});
  }
  const parsed = governedEvaluationContractSchema.safeParse({
    schemaVersion: "governed-evaluation-contract.v1",
    executionId: identity.executionId,
    organizationId: identity.organizationId,
    requestId: identity.requestId,
    processingRunId: identity.processingRunId,
    purpose: "evaluation",
    audience: {kind: "evaluation_panel", caseId: spec.audience.caseId, caseVersion: spec.audience.caseVersion, scriptId: spec.audience.scriptId},
    tools: [...tools.values()],
    budget: {
      maxCostMicrousd: spec.budget.maxCostMicrousd,
      maxModelCalls: spec.budget.maxModelCalls,
      maxDurationMs: spec.budget.maxDurationMs,
      expiresAt: new Date(now + spec.budget.expiresInMs).toISOString(),
    },
    inputs: {fingerprint: sha256(snapshotText), sources: [...new Set(spec.sourceContentHashes)].sort().map((contentHash) => ({contentHash}))},
    requestedAt: new Date(now - clockAllowanceMs).toISOString(),
  });
  if (!parsed.success) throw new GovernedTransportError("evaluation_contract_invalid");
  const contractText = executionCanonicalText(parsed.data);
  if (Buffer.byteLength(contractText, "utf8") > maximumContractBytes || Buffer.byteLength(snapshotText, "utf8") > maximumSnapshotBytes) {
    throw new GovernedTransportError("evaluation_input_too_large");
  }
  return {contract: parsed.data, contractText, snapshotText};
}

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().regex(identityPattern);
const whole = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Timestamps exactly as the database renders them. */
const moment = z.string().min(1).max(64);
const codeText = z.string().regex(/^[a-z0-9_:.-]{1,200}$/);

const requestAnswerSchema = z.object({executionId: identity, processingRunId: identity, requestId: identity, jobId: identity.nullable(), replayed: z.boolean()}).strict();

const receiptSchema = z.object({
  operationId: identity,
  toolId: z.string().max(200),
  toolVersion: z.string().max(120),
  route: z.record(z.string(), z.string()),
  resources: z.array(z.string().max(60)).max(11),
  decisionId: identity,
  state: z.enum(["reserved", "settled", "uncertain"]),
  reservedMicrousd: whole,
  reservedCalls: whole,
  spentMicrousd: whole.nullable(),
  spentCalls: whole.nullable(),
  createdAt: moment,
}).strict();
const decisionSchema = z.object({
  decisionId: identity,
  allowed: z.boolean(),
  purpose: z.string().max(60),
  resources: z.array(z.string().max(60)).max(11),
  reasons: z.array(z.string().max(200)).max(11),
  createdAt: moment,
}).strict();

/** read_governed_evaluation_session_v1, schema governed-evaluation-read.v1. */
export const governedEvaluationReadSchema = z.object({
  schemaVersion: z.literal("governed-evaluation-read.v1"),
  executionId: identity,
  organizationId: identity,
  requestId: identity,
  processingRunId: identity,
  requestedBy: identity,
  createdAt: moment,
  contractFingerprint: hash,
  inputFingerprint: hash,
  audience: z.object({kind: z.literal("evaluation_panel"), caseId: z.string(), caseVersion: z.string(), scriptId: z.string()}).strict(),
  budget: z.object({maxCostMicrousd: whole, maxModelCalls: whole, maxDurationMs: whole, expiresAt: moment}).strict(),
  state: z.object({job: z.string().max(40).nullable(), attempts: whole.nullable(), lastErrorCode: z.string().max(200).nullable(), run: z.string().max(40).nullable(), completedAt: moment.nullable()}).strict(),
  outcome: z.enum(governedEvaluationOutcomes).nullable(),
  reason: z.enum(governedEvaluationReasons).nullable(),
  result: z.object({resultFingerprint: hash, canonicalResult: z.string().min(1).max(maximumSnapshotBytes), committedAt: moment}).strict().nullable(),
  receipts: z.array(receiptSchema).max(10_000),
  decisions: z.array(decisionSchema).max(10_000),
  cost: z.object({spentMicrousd: whole, reservedMicrousd: whole, spentCalls: whole, reservedCalls: whole, activeDurationMs: whole, exhausted: z.boolean()}).strict(),
  totalCostMicrousd: whole,
}).strict();
export type GovernedEvaluationRead = z.infer<typeof governedEvaluationReadSchema>;

/** Created now, replayed from identical bytes, or followed from the evaluation a reused request id named. */
export type GovernedEvaluationRequestMode = "created" | "replayed" | "followed";

/** What the database committed for one evaluation, with the proof of what was asked. */
export type GovernedEvaluationReceipt = {
  executionId: string;
  requestId: string;
  processingRunId: string;
  organizationId: string;
  request: GovernedEvaluationRequestMode;
  audience: GovernedEvaluationRead["audience"];
  budget: GovernedEvaluationRead["budget"];
  contractFingerprint: string;
  inputFingerprint: string;
  outcome: GovernedEvaluationOutcome;
  reason: GovernedEvaluationReason;
  /** The committed bytes, their fingerprint and their parsed value. */
  canonicalResult: string;
  resultFingerprint: string;
  result: unknown;
  committedAt: string;
  receipts: GovernedEvaluationRead["receipts"];
  decisions: GovernedEvaluationRead["decisions"];
  cost: GovernedEvaluationRead["cost"];
  totalCostMicrousd: number;
};

export type GovernedTransportProgress =
  | {phase: "signed_in"}
  | {phase: "requested"; executionId: string; requestId: string; request: GovernedEvaluationRequestMode}
  | {phase: "waiting"; executionId: string; job: string | null; run: string | null; attempts: number | null};

export type GovernedTransportOptions = {
  environment: GovernedTransportEnvironment;
  /** Builds the Supabase client; tests pass a stub. */
  connect?: (supabaseUrl: string, publishableKey: string) => SupabaseClient;
  pollIntervalMs?: number;
  /** How long to wait for the committed result; by default until the budget expires, plus a grace period. */
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
  onProgress?: (progress: GovernedTransportProgress) => void;
};

/** After the budget expires, a worker still holding the lease commits the partial reason. */
const resultGraceMs = 300_000;
const defaultPollIntervalMs = 5_000;
/** A request lost in transport is sent at most this many times, always with the same bytes. */
const requestAttempts = 3;
/** The pause before the second attempt; the third waits twice as long. */
const requestRetryDelayMs = 1_000;
/** Refusals whose code may travel; anything else is reported as a transport failure. */
const databaseRefusals = new Set([
  "evaluator_session_required",
  "evaluation_contract_denied",
  "evaluation_organization_required",
  "evaluation_access_denied",
  "platform_principal_required",
]);

/** The session client of the evaluator. The token refreshes itself for a long wait; nothing is persisted. */
export function connectEvaluator(supabaseUrl: string, publishableKey: string): SupabaseClient {
  return createClient(supabaseUrl, publishableKey, {auth: {persistSession: false, autoRefreshToken: true, detectSessionInUrl: false}});
}

/**
 * Signs in as the evaluator, requests the evaluation through the session wrapper and polls the
 * session read until the database holds its result, then returns the committed bytes, receipts
 * and cost. A partial result is returned like a successful one, with its reason: the caller
 * decides what a partial evaluation means for its outputs.
 */
export async function requestGovernedEvaluation(spec: GovernedEvaluationSpec, options: GovernedTransportOptions): Promise<GovernedEvaluationReceipt> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => delay(ms));
  const newId = options.newId ?? randomUUID;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? defaultPollIntervalMs);
  const {environment} = options;
  const requestId = spec.requestId ?? newId();
  if (!identityPattern.test(requestId)) throw new GovernedTransportError("evaluation_contract_invalid");
  const composed = composeGovernedEvaluation(spec,
    {organizationId: environment.organizationId, executionId: newId(), requestId, processingRunId: newId()}, now());

  const client = (options.connect ?? connectEvaluator)(environment.supabaseUrl, environment.publishableKey);
  const evaluator = await signIn(client, environment);
  options.onProgress?.({phase: "signed_in"});

  const requested = await submit(client, composed, sleep);
  options.onProgress?.({phase: "requested", executionId: requested.executionId, requestId, request: requested.mode});
  const context = {executionId: requested.executionId, requestId};
  const deadline = now() + (options.timeoutMs ?? Math.max(0, Date.parse(composed.contract.budget.expiresAt) - now()) + resultGraceMs);

  let observed: string | null = null;
  for (;;) {
    const answer = await call(client, "read_governed_evaluation_session_v1", {p_execution_id: requested.executionId}, maximumSnapshotBytes);
    if (answer.ok) {
      const parsed = governedEvaluationReadSchema.safeParse(answer.data);
      if (!parsed.success) throw new GovernedTransportError("evaluation_read_mismatch", context);
      const read = parsed.data;
      verifyRead(read, composed, requested, evaluator, context);
      if (read.result) return receiptOf(read, requested.mode, context);
      const state = `${read.state.job}/${read.state.run}/${read.state.attempts}`;
      if (state !== observed) {
        observed = state;
        options.onProgress?.({phase: "waiting", executionId: read.executionId, job: read.state.job, run: read.state.run, attempts: read.state.attempts});
      }
      // A job that ended without a result (attempts exhausted, cancelled) never commits one.
      if (read.state.job !== null && !["queued", "leased", "succeeded"].includes(read.state.job)) {
        const code = codeText.safeParse(read.state.lastErrorCode ?? read.state.job);
        throw new GovernedTransportError("evaluation_failed_without_result", {...context, ...(code.success ? {refusal: code.data} : {})});
      }
    } else {
      const {failure} = answer;
      if (databaseRefusals.has(failure.message)) throw new GovernedTransportError("evaluation_read_refused", {...context, refusal: failure.message});
      if (!transient(failure)) throw new GovernedTransportError("evaluation_transport_failed", {...context, ...safeCode(failure)});
    }
    const remaining = deadline - now();
    if (remaining <= 0) throw new GovernedTransportError("evaluation_result_timeout", context);
    await sleep(Math.min(pollIntervalMs, remaining));
  }
}

async function signIn(client: SupabaseClient, environment: GovernedTransportEnvironment): Promise<string> {
  let answer: {data: {user: {id?: unknown} | null} | null; error: unknown};
  try {
    answer = await client.auth.signInWithPassword({email: environment.evaluatorEmail, password: environment.evaluatorPassword});
  } catch {
    throw new GovernedTransportError("evaluator_sign_in_failed");
  }
  const userId = answer.data?.user?.id;
  if (answer.error || typeof userId !== "string" || !identityPattern.test(userId)) throw new GovernedTransportError("evaluator_sign_in_failed");
  return userId;
}

type Composed = ReturnType<typeof composeGovernedEvaluation>;
type Requested = {executionId: string; mode: GovernedEvaluationRequestMode};

async function submit(client: SupabaseClient, composed: Composed, sleep: (ms: number) => Promise<void>): Promise<Requested> {
  const {contract} = composed;
  const bytes = Buffer.byteLength(composed.contractText, "utf8") + Buffer.byteLength(composed.snapshotText, "utf8");
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) await sleep((attempt - 1) * requestRetryDelayMs);
    const answer = await call(client, "request_governed_evaluation_session_v1", {p_contract_text: composed.contractText, p_snapshot_text: composed.snapshotText}, bytes);
    if (answer.ok) {
      // Identical bytes are replayed with the identities they carry; anything else is not this request.
      const parsed = requestAnswerSchema.safeParse(answer.data);
      if (!parsed.success || parsed.data.executionId !== contract.executionId || parsed.data.requestId !== contract.requestId
        || parsed.data.processingRunId !== contract.processingRunId) {
        throw new GovernedTransportError("evaluation_read_mismatch", {requestId: contract.requestId});
      }
      return {executionId: parsed.data.executionId, mode: parsed.data.replayed ? "replayed" : "created"};
    }
    const {failure} = answer;
    if (failure.message === "execution_request_conflict") {
      // The request id already produced an evaluation of this evaluator, with other bytes: the
      // database names it, and the read below accepts it only if it carries the same inputs.
      if (!identityPattern.test(failure.details)) throw new GovernedTransportError("evaluation_request_conflict", {requestId: contract.requestId});
      return {executionId: failure.details, mode: "followed"};
    }
    if (databaseRefusals.has(failure.message)) throw new GovernedTransportError("evaluation_request_refused", {requestId: contract.requestId, refusal: failure.message});
    if (!transient(failure) || attempt >= requestAttempts) throw new GovernedTransportError("evaluation_transport_failed", {requestId: contract.requestId, ...safeCode(failure)});
  }
}

/**
 * The evaluation read must be the one requested: same identity, same requester, same audience and
 * the same input bytes. A followed evaluation carries its own contract (its own request time and
 * budget), so only its inputs are compared; a mismatch there means the request id names another
 * evaluation, and nothing of it is returned.
 */
function verifyRead(read: GovernedEvaluationRead, composed: Composed, requested: Requested, evaluator: string, context: {executionId: string; requestId: string}): void {
  const {contract} = composed;
  const same = read.executionId === requested.executionId && read.organizationId === contract.organizationId && read.requestId === contract.requestId
    && read.requestedBy === evaluator && read.inputFingerprint === contract.inputs.fingerprint
    && read.audience.kind === contract.audience.kind && read.audience.caseId === contract.audience.caseId
    && read.audience.caseVersion === contract.audience.caseVersion && read.audience.scriptId === contract.audience.scriptId;
  if (requested.mode === "followed") {
    if (!same) throw new GovernedTransportError("evaluation_request_conflict", context);
    return;
  }
  if (!same || read.contractFingerprint !== sha256(composed.contractText) || read.processingRunId !== contract.processingRunId) {
    throw new GovernedTransportError("evaluation_read_mismatch", context);
  }
}

function receiptOf(read: GovernedEvaluationRead, mode: GovernedEvaluationRequestMode, context: {executionId: string; requestId: string}): GovernedEvaluationReceipt {
  const committed = read.result;
  if (!committed || read.outcome === null || read.reason === null || (read.outcome === "succeeded") !== (read.reason === "evaluated")
    || sha256(committed.canonicalResult) !== committed.resultFingerprint) {
    throw new GovernedTransportError("evaluation_result_invalid", context);
  }
  let result: unknown;
  try {
    result = JSON.parse(committed.canonicalResult);
    if (executionCanonicalText(result) !== committed.canonicalResult) throw new Error("not canonical");
  } catch {
    throw new GovernedTransportError("evaluation_result_invalid", context);
  }
  return {
    executionId: read.executionId,
    requestId: read.requestId,
    processingRunId: read.processingRunId,
    organizationId: read.organizationId,
    request: mode,
    audience: read.audience,
    budget: read.budget,
    contractFingerprint: read.contractFingerprint,
    inputFingerprint: read.inputFingerprint,
    outcome: read.outcome,
    reason: read.reason,
    canonicalResult: committed.canonicalResult,
    resultFingerprint: committed.resultFingerprint,
    result,
    committedAt: committed.committedAt,
    receipts: read.receipts,
    decisions: read.decisions,
    cost: read.cost,
    totalCostMicrousd: read.totalCostMicrousd,
  };
}

/**
 * What a script keeps beside its outputs: the identity, fingerprints, outcome, reservations and
 * cost of the evaluation. Route account identifiers stay in the database; the tool id names the route.
 */
export function governedEvaluationEvidence(receipt: GovernedEvaluationReceipt) {
  return {
    schemaVersion: "governed-evaluation-evidence.v1" as const,
    executionId: receipt.executionId,
    requestId: receipt.requestId,
    processingRunId: receipt.processingRunId,
    organizationId: receipt.organizationId,
    request: receipt.request,
    audience: receipt.audience,
    budget: receipt.budget,
    contractFingerprint: receipt.contractFingerprint,
    inputFingerprint: receipt.inputFingerprint,
    outcome: receipt.outcome,
    reason: receipt.reason,
    resultFingerprint: receipt.resultFingerprint,
    committedAt: receipt.committedAt,
    cost: receipt.cost,
    totalCostMicrousd: receipt.totalCostMicrousd,
    receipts: receipt.receipts.map(({route: _route, ...operation}) => operation),
    decisions: receipt.decisions,
  };
}

type Failure = {thrown: boolean; message: string; code: string; details: string};
type Answer = {ok: true; data: unknown} | {ok: false; failure: Failure};

/** A bounded wait that grows with the bytes carried, like the worker's own transport. */
function transportTimeoutMs(bytes: number): number {
  return Math.min(60_000, 10_000 + Math.ceil(Math.max(0, bytes) / 1_048_576) * 3_000);
}

async function call(client: SupabaseClient, name: string, args: Record<string, unknown>, bytes: number): Promise<Answer> {
  let response: {data: unknown; error: {message?: unknown; code?: unknown; details?: unknown} | null};
  try {
    response = await client.rpc(name, args).abortSignal(AbortSignal.timeout(transportTimeoutMs(bytes)));
  } catch {
    return {ok: false, failure: {thrown: true, message: "", code: "", details: ""}};
  }
  if (!response.error) return {ok: true, data: response.data};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {ok: false, failure: {thrown: false, message: text(response.error.message), code: text(response.error.code), details: text(response.error.details)}};
}

/**
 * Worth another attempt: a lost connection, a timeout, a schema cache still loading, or a database
 * class that says the same statement may succeed later. Every refusal is final.
 */
function transient(failure: Failure): boolean {
  return failure.thrown || failure.code === "" || /^PGRST00[0-3]$/.test(failure.code) || /^(08|40|53|57)[0-9A-Z]{3}$/.test(failure.code);
}

/** A SQLSTATE or PostgREST code may travel; free text never does. */
function safeCode(failure: Failure): {refusal?: string} {
  return /^([0-9A-Z]{5}|PGRST[0-9]{3})$/.test(failure.code) ? {refusal: failure.code} : {};
}
