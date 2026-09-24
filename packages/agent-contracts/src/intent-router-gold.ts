import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

import {
  INTENT_CLASSIFIER_SYSTEM,
  canonicalizeIntentClassifierOutput,
  intentClassifierInputSchema,
  intentClassifierOutputSchema,
  type IntentClassifierOutput,
} from "./intent-classifier";
import {
  SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
  applySemanticObjectCompilation,
  compileSemanticObjects,
  semanticObjectCompilationSchema,
  semanticObjectExtractorInputSchema,
  semanticObjectExtractorOutputSchema,
  validateSemanticObjectOutput,
  type SemanticObjectCompilation,
  type SemanticObjectExtractorOutput,
} from "./semantic-object-extractor";

/**
 * The intent router gold gate as a governed evaluation family: the contract between the script
 * that assembles the gate's inputs from the canonical gold turns and scores the run, and the
 * worker that runs it under the governed evaluation transport.
 *
 * The worker receives only what a provider may see: for the provider preflight and for each of the
 * gate's observations, the classifier input and the semantic-object extractor input exactly as the
 * production contracts build them, with the ids that label the calls, and the model settings of the
 * two tasks. The answer key never leaves the script. The run proves every configured route with the
 * real prompt, input and schema, then runs the router and the independent extractor on every
 * observation and compiles the objects before canonicalization; it returns the observations, the
 * preflight rows, the complete call ledger and the gateway's spend. The script scores that run and
 * verifies its ledger offline, with the same gate and call-evidence verifiers it always used.
 */
export const intentRouterGoldTasks = ["route_intent", "extract_semantic_objects"] as const;
export type IntentRouterGoldTask = (typeof intentRouterGoldTasks)[number];

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const whole = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const providerSchema = z.enum(["anthropic", "openai"]);
const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);
const schemaNames = {route_intent: "shadow_routing_output", extract_semantic_objects: "semantic_object_extractor_output"} as const;

/** One model route of the gate, as the model gateway names it. */
export const intentRouterGoldRouteSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1).max(120),
  effort: effortSchema,
}).strict();
export type IntentRouterGoldRoute = z.infer<typeof intentRouterGoldRouteSchema>;

/** The routes a task may take and the output ceiling of each call: the whole of its model settings. */
export const intentRouterGoldTaskSettingsSchema = z.object({
  primary: intentRouterGoldRouteSchema,
  fallback: intentRouterGoldRouteSchema.nullable(),
  maxOutputTokens: z.number().int().min(1).max(128_000),
}).strict();
export type IntentRouterGoldTaskSettings = z.infer<typeof intentRouterGoldTaskSettingsSchema>;

const goldCaseIdSchema = z.enum(["gc01", "gc02", "gc03", "gc04", "gc05", "horizontal", "confusion", "adversarial"]);
const goldTurnIdSchema = z.string().regex(/^(gc0[1-5]-t\d{2}|hx\d{2}|cx\d{2}|ax\d{2})$/);

/** The classifier input exactly as the router receives it, strict at every level. */
export const intentRouterGoldClassifierInputSchema = intentClassifierInputSchema.extend({
  recentConversation: z.array(z.object({role: z.string().min(1), content: z.string()}).strict()).max(8),
}).strict();

type OperationInputs = {
  classifierInput: z.infer<typeof intentRouterGoldClassifierInputSchema>;
  objectInput: z.infer<typeof semanticObjectExtractorInputSchema>;
};
/** Both passes of one operation read the same turn: the same message, locale and conversation. */
function sameTurn(operation: OperationInputs, ctx: z.RefinementCtx): void {
  const {classifierInput, objectInput} = operation;
  if (classifierInput.latestUserMessage !== objectInput.latestUserMessage || classifierInput.locale !== objectInput.locale
    || JSON.stringify(classifierInput.recentConversation) !== JSON.stringify(objectInput.recentConversation)) {
    ctx.addIssue({code: "custom", path: ["objectInput"], message: "both passes of an operation read the same turn"});
  }
}

/** The inputs of the provider preflight: the first gold turn, proved on every configured route. */
export const intentRouterGoldPreflightInputSchema = z.object({
  caseId: goldCaseIdSchema,
  turnId: goldTurnIdSchema,
  classifierInput: intentRouterGoldClassifierInputSchema,
  objectInput: semanticObjectExtractorInputSchema,
}).strict().superRefine(sameTurn);

/** One observation of the gate: a gold turn in one of its authored phrasings, with the input of each pass. */
export const intentRouterGoldObservationInputSchema = z.object({
  caseId: goldCaseIdSchema,
  turnId: goldTurnIdSchema,
  repeat: z.number().int().min(1).max(3),
  classifierInput: intentRouterGoldClassifierInputSchema,
  objectInput: semanticObjectExtractorInputSchema,
}).strict().superRefine(sameTurn);
export type IntentRouterGoldObservationInput = z.infer<typeof intentRouterGoldObservationInputSchema>;

/**
 * The evaluation snapshot of the intent router family: the audience of the gate, the model
 * settings of its two tasks, the preflight inputs and the inputs of every observation, in the
 * order the run takes them. Strict at every level, so no field reaches the worker without being read.
 */
export const intentRouterGoldSnapshotSchema = z.object({
  schemaVersion: z.literal("intent-router-gold-snapshot.v1"),
  /** The gold corpus the gate runs, versioned by the fingerprint of its observation manifest. */
  audience: z.object({caseId: z.literal("intent-router-gold"), caseVersion: z.string().regex(/^manifest-[a-f0-9]{16}$/)}).strict(),
  model: z.object({route_intent: intentRouterGoldTaskSettingsSchema, extract_semantic_objects: intentRouterGoldTaskSettingsSchema}).strict(),
  preflight: intentRouterGoldPreflightInputSchema,
  observations: z.array(intentRouterGoldObservationInputSchema).min(1).max(64),
}).strict().superRefine((snapshot, ctx) => {
  const seen = new Set<string>();
  for (const [index, observation] of snapshot.observations.entries()) {
    const key = `${observation.turnId}:${observation.repeat}`;
    if (seen.has(key)) ctx.addIssue({code: "custom", path: ["observations", index], message: "each turn and repeat is observed once"});
    seen.add(key);
  }
});
export type IntentRouterGoldSnapshot = z.infer<typeof intentRouterGoldSnapshotSchema>;

const routeKey = (route: IntentRouterGoldRoute) => `${route.provider}:${route.model}:${route.effort}`;
function uniqueRoutes(routes: readonly IntentRouterGoldRoute[]): IntentRouterGoldRoute[] {
  return routes.filter((route, index) => routes.findIndex((candidate) => routeKey(candidate) === routeKey(route)) === index);
}
const taskRoutes = (settings: IntentRouterGoldTaskSettings): IntentRouterGoldRoute[] =>
  uniqueRoutes([settings.primary, ...(settings.fallback ? [settings.fallback] : [])]);

/** Every route the gate may take, each once: the router's, primary first, then the extractor's. */
export function intentRouterGoldRoutes(snapshot: IntentRouterGoldSnapshot): IntentRouterGoldRoute[] {
  return uniqueRoutes([...taskRoutes(snapshot.model.route_intent), ...taskRoutes(snapshot.model.extract_semantic_objects)]);
}

/**
 * The content hashes the snapshot carries: none. Every input of the gate is an authored synthetic
 * turn carried whole inside the snapshot, which the contract already fingerprints; there is no
 * document or source whose bytes live elsewhere.
 */
export function intentRouterGoldSnapshotContentHashes(_snapshot: IntentRouterGoldSnapshot): string[] {
  return [];
}

/**
 * The preflight row of one configured route of one task. Task and schema are named as the gateway
 * names them; the script binds every row to a task and route of the snapshot it sent.
 */
export const intentRouterProviderPreflightSchema = z.object({
  task: z.string().min(1).max(60),
  schemaName: z.string().min(1).max(120),
  provider: providerSchema,
  configuredModel: z.string().min(1).max(120),
  resolvedModel: z.string().min(1).max(200).nullable(),
  passed: z.boolean(),
  attemptCount: whole,
  measuredCostUsd: z.number().nonnegative(),
  conservativeExposureUsd: z.number(),
  latencyMs: z.number().nonnegative(),
  error: z.string().max(160).nullable(),
}).strict();
export type IntentRouterProviderPreflight = z.infer<typeof intentRouterProviderPreflightSchema>;

/**
 * One content-free call log of the gate, exactly as the model gateway reports it: the ledger the
 * script's call-evidence verifier reads. Strict, so a field the verifier has never read cannot
 * cross unseen.
 */
export const intentRouterGoldCallLogSchema = z.object({
  invocationId: z.string().min(1).max(100),
  previousInvocationId: z.string().min(1).max(100).optional(),
  repairGuidanceFingerprint: sha256.optional(),
  validationIssueCodeFingerprint: sha256.optional(),
  repairValidationIssueCodeFingerprint: sha256.optional(),
  task: z.enum(intentRouterGoldTasks),
  provider: providerSchema,
  configuredModel: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(200),
  effort: effortSchema,
  outcome: z.enum(["ok", "refusal", "error", "invalid_output", "policy_rejected"]),
  promptFingerprint: sha256,
  inputFingerprint: sha256,
  outputFingerprint: sha256,
  usage: z.object({
    inputTokens: whole,
    outputTokens: whole,
    cachedInputTokens: whole,
    cacheCreationInputTokens: whole.optional(),
    reasoningTokens: whole.optional(),
  }).strict(),
  costUsd: z.number().nonnegative(),
  costStatus: z.enum(["measured", "unknown", "cassette", "not_called"]),
  latencyMs: z.number(),
  stopReason: z.enum(["end", "max_tokens", "refusal", "other"]),
  usedFallback: z.boolean(),
  retryOrdinal: whole.optional(),
  isSameModelRepair: z.boolean().optional(),
  usedProviderFallback: z.boolean().optional(),
  fromCassette: z.boolean(),
  schemaName: z.enum([schemaNames.route_intent, schemaNames.extract_semantic_objects]),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
  providerPolicyVersion: z.string().min(1).max(120).optional(),
  metadata: z.record(z.string().max(80), z.string().max(200)).optional(),
  providerError: z.object({
    name: z.string().max(200),
    status: z.number().int().optional(),
    code: z.string().max(80).optional(),
    type: z.string().max(80).optional(),
  }).strict().optional(),
  validationIssues: z.array(z.object({
    path: z.string().max(400),
    code: z.string().max(200),
    message: z.string().max(400),
    allowedValues: z.array(z.union([z.string().max(200), z.number(), z.boolean()])).max(20).optional(),
  }).strict()).max(12).optional(),
  validationSource: z.enum(["schema", "deterministic"]).optional(),
}).strict();
export type IntentRouterGoldCallLog = z.infer<typeof intentRouterGoldCallLogSchema>;

/**
 * One observation as the governed run produces it: both raw outputs, the compiled objects, the
 * canonical output, the fingerprints of what was sent and received, and the attempts, cost and
 * latency of each pass from the call ledger. The answer key, the scoring and the routing
 * fingerprint are added by the script, which holds the gold.
 */
export const intentRouterGoldObservationSchema = z.object({
  caseId: goldCaseIdSchema,
  turnId: goldTurnIdSchema,
  repeat: z.number().int().min(1).max(3),
  classifierInputFingerprint: sha256,
  objectInputFingerprint: sha256,
  rawActual: intentClassifierOutputSchema.nullable(),
  rawActualFingerprint: sha256.nullable(),
  rawObjectActual: semanticObjectExtractorOutputSchema.nullable(),
  rawObjectActualFingerprint: sha256.nullable(),
  objectCompilation: semanticObjectCompilationSchema.nullable(),
  actual: intentClassifierOutputSchema.nullable(),
  actualFingerprint: sha256.nullable(),
  error: z.string().max(800).nullable(),
  provider: z.string().min(1).max(200).nullable(),
  model: z.string().min(1).max(200).nullable(),
  routeAttemptCount: whole,
  routeCostUsd: z.number().nonnegative(),
  routeLatencyMs: z.number(),
  objectProvider: z.string().min(1).max(200).nullable(),
  objectModel: z.string().min(1).max(200).nullable(),
  objectAttemptCount: whole,
  objectCostUsd: z.number().nonnegative(),
  objectLatencyMs: z.number(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
}).strict();
export type IntentRouterGoldObservation = z.infer<typeof intentRouterGoldObservationSchema>;

const gatewaySpentSchema = z.object({
  costUsd: z.number().nonnegative(),
  calls: whole,
  unknownCostCalls: whole,
  budgetExposureUsd: z.number(),
}).strict();
/** Four preflight operations of at most two attempts, then two operations of at most three per observation. */
const maximumCalls = 8 + 64 * 2 * 3;

/**
 * What the intent router family publishes when a governed evaluation succeeds: either the gate
 * stopped at the provider preflight, as the script always did when a configured route failed its
 * contract, or it observed every operation of the snapshot. Both carry the preflight rows, the
 * complete call ledger and the gateway's spend. A partial evaluation publishes only its reason.
 */
export const intentRouterGoldResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    schemaVersion: z.literal("intent-router-gold-result.v1"),
    outcome: z.literal("preflight_failed"),
    providerPreflight: z.array(intentRouterProviderPreflightSchema).min(1).max(8),
    calls: z.array(intentRouterGoldCallLogSchema).max(maximumCalls),
    gatewaySpent: gatewaySpentSchema,
  }).strict(),
  z.object({
    schemaVersion: z.literal("intent-router-gold-result.v1"),
    outcome: z.literal("observed"),
    providerPreflight: z.array(intentRouterProviderPreflightSchema).min(1).max(8),
    observations: z.array(intentRouterGoldObservationSchema).min(1).max(64),
    calls: z.array(intentRouterGoldCallLogSchema).max(maximumCalls),
    gatewaySpent: gatewaySpentSchema,
  }).strict(),
]);
export type IntentRouterGoldResult = z.infer<typeof intentRouterGoldResultSchema>;

/** One structured call of the gate, exactly as the model gateway receives it. */
export type IntentRouterGoldRequest<TSchema extends z.ZodType> = {
  task: IntentRouterGoldTask;
  system: string;
  input: Array<{type: "text"; text: string}>;
  schema: TSchema;
  schemaName: string;
  outputMode: "prompted_json";
  thinking: "off";
  metadata?: Record<string, string>;
  validateOutput?: (output: z.infer<TSchema>) =>
    | {accepted: true}
    | {accepted: false; issues: Array<{path: string; code: string; message: string}>};
  model?: IntentRouterGoldRoute;
  allowFallback?: boolean;
};
export type IntentRouterGoldSpent = z.infer<typeof gatewaySpentSchema>;
/** What the gate needs from a model gateway; `createModelGateway` satisfies it. */
export type IntentRouterGoldModelPort = {
  complete<TSchema extends z.ZodType>(request: IntentRouterGoldRequest<TSchema>): Promise<{output: z.infer<TSchema>; provider: string; model: string}>;
  spent(): IntentRouterGoldSpent;
};
/** The run's gateway: the model port and the ledger of every call log it has reported so far. */
export type IntentRouterGoldGateway = IntentRouterGoldModelPort & {calls(): readonly IntentRouterGoldCallLog[]};

type PreflightRequest<TSchema extends z.ZodType> = Omit<IntentRouterGoldRequest<TSchema>, "model" | "allowFallback">;

export class IntentRouterProviderPreflightError extends Error {
  constructor(readonly results: IntentRouterProviderPreflight[]) {
    const failed = results.find(({passed}) => !passed);
    super(`intent_router_provider_preflight_failed:${failed?.provider ?? "unknown"}`);
    this.name = "IntentRouterProviderPreflightError";
  }
}

/**
 * Proves every configured route with the exact route_intent prompt/input/schema/output mode before
 * the paid 52-observation run starts. Fallback is disabled so one healthy provider cannot conceal
 * another provider's outage or contract rejection.
 */
export async function preflightIntentRouterProviders<TSchema extends z.ZodType>(
  gateway: IntentRouterGoldModelPort,
  providers: readonly IntentRouterGoldRoute[],
  request: PreflightRequest<TSchema>,
  now: () => number = Date.now,
): Promise<IntentRouterProviderPreflight[]> {
  const results: IntentRouterProviderPreflight[] = [];

  for (const ref of uniqueRoutes(providers)) {
    const before = gateway.spent();
    const startedAt = now();
    try {
      const result = await gateway.complete({
        ...request,
        model: ref,
        allowFallback: false,
        metadata: {...request.metadata, surface: "intent_router_provider_preflight", provider: ref.provider, configuredModel: ref.model},
      });
      const after = gateway.spent();
      results.push({
        task: request.task,
        schemaName: request.schemaName,
        provider: ref.provider,
        configuredModel: ref.model,
        resolvedModel: result.model,
        passed: result.provider === ref.provider,
        attemptCount: after.calls - before.calls,
        measuredCostUsd: after.costUsd - before.costUsd,
        conservativeExposureUsd: after.budgetExposureUsd - before.budgetExposureUsd,
        latencyMs: Math.max(0, now() - startedAt),
        error: result.provider === ref.provider ? null : "provider_route_mismatch",
      });
    } catch (cause) {
      const after = gateway.spent();
      results.push({
        task: request.task,
        schemaName: request.schemaName,
        provider: ref.provider,
        configuredModel: ref.model,
        resolvedModel: null,
        passed: false,
        attemptCount: after.calls - before.calls,
        measuredCostUsd: after.costUsd - before.costUsd,
        conservativeExposureUsd: after.budgetExposureUsd - before.budgetExposureUsd,
        latencyMs: Math.max(0, now() - startedAt),
        error: safeError(cause),
      });
    }
  }

  if (results.some(({passed}) => !passed)) throw new IntentRouterProviderPreflightError(results);
  return results;
}

/** The gateway's error class and code, never its message; read by name so no gateway import is needed. */
function safeError(cause: unknown): string {
  const code = cause instanceof Error ? (cause as {code?: unknown}).code : undefined;
  if (cause instanceof Error && cause.name === "ModelGatewayError" && typeof code === "string") return `${cause.name}:${code}`;
  if (cause instanceof Error) return `${cause.name}:unknown`.slice(0, 160);
  return "UnknownError:unknown";
}

type Settled<T> = {status: "fulfilled"; value: T} | {status: "rejected"; reason: unknown};
const settle = <T>(work: Promise<T>): Promise<Settled<T>> =>
  work.then((value) => ({status: "fulfilled" as const, value}), (reason: unknown) => ({status: "rejected" as const, reason}));

/**
 * One observation: the production router and the independent attributable-span extractor on the
 * same turn, then the semantic objects compiled before canonicalization. The two passes run one
 * after the other, the router first, because the governed gateway reserves, sends and settles one
 * attempt at a time; a failure of either pass is recorded exactly as the concurrent script did.
 */
async function observe(operation: IntentRouterGoldObservationInput, gateway: IntentRouterGoldGateway, now: () => number): Promise<IntentRouterGoldObservation> {
  const {caseId, turnId, repeat, classifierInput, objectInput} = operation;
  const startedAt = now();
  const spentBefore = gateway.spent();
  let actual: IntentClassifierOutput | null = null;
  let rawActual: IntentClassifierOutput | null = null;
  let rawObjectActual: SemanticObjectExtractorOutput | null = null;
  let objectCompilation: SemanticObjectCompilation | null = null;
  let error: string | null = null;
  let provider: string | null = null;
  let model: string | null = null;
  let objectProvider: string | null = null;
  let objectModel: string | null = null;
  try {
    const routeResult = await settle(gateway.complete({
      task: "route_intent",
      system: INTENT_CLASSIFIER_SYSTEM,
      input: [{type: "text", text: JSON.stringify(classifierInput)}],
      schema: intentClassifierOutputSchema,
      schemaName: schemaNames.route_intent,
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {surface: "intent_router_gold", caseId, turnId, repeat: String(repeat)},
    }));
    const objectResult = await settle(gateway.complete({
      task: "extract_semantic_objects",
      system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
      input: [{type: "text", text: JSON.stringify(objectInput)}],
      schema: semanticObjectExtractorOutputSchema,
      schemaName: schemaNames.extract_semantic_objects,
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {surface: "intent_object_gold", caseId, turnId, repeat: String(repeat)},
      validateOutput: (output) => validateSemanticObjectOutput(objectInput, output),
    }));
    if (routeResult.status === "fulfilled") {
      rawActual = routeResult.value.output;
      provider = routeResult.value.provider;
      model = routeResult.value.model;
    }
    if (objectResult.status === "fulfilled") {
      rawObjectActual = objectResult.value.output;
      objectProvider = objectResult.value.provider;
      objectModel = objectResult.value.model;
    }
    if (routeResult.status === "rejected" || objectResult.status === "rejected") {
      const failures = [routeResult, objectResult]
        .filter((result): result is {status: "rejected"; reason: unknown} => result.status === "rejected")
        .map(({reason}) => reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason));
      throw new Error(failures.join(" | "));
    }
    objectCompilation = compileSemanticObjects(objectInput, objectResult.value.output);
    actual = canonicalizeIntentClassifierOutput(
      applySemanticObjectCompilation(routeResult.value.output, objectCompilation),
      classifierInput,
    );
  } catch (cause) {
    error = (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)).slice(0, 800);
  }
  const spentAfter = gateway.spent();
  const attempts = (surface: "intent_router_gold" | "intent_object_gold") => gateway.calls().filter((call) => call.metadata?.surface === surface
    && call.metadata.turnId === turnId && call.metadata.repeat === String(repeat) && call.costStatus !== "not_called");
  const routeAttempts = attempts("intent_router_gold");
  const objectAttempts = attempts("intent_object_gold");
  return {
    caseId,
    turnId,
    repeat,
    classifierInputFingerprint: fingerprintJson(classifierInput),
    objectInputFingerprint: fingerprintJson(objectInput),
    rawActual,
    rawActualFingerprint: rawActual ? fingerprintJson(rawActual) : null,
    rawObjectActual,
    rawObjectActualFingerprint: rawObjectActual ? fingerprintJson(rawObjectActual) : null,
    objectCompilation,
    actual,
    actualFingerprint: actual ? fingerprintJson(actual) : null,
    error,
    provider,
    model,
    routeAttemptCount: routeAttempts.length,
    routeCostUsd: routeAttempts.reduce((sum, call) => sum + call.costUsd, 0),
    routeLatencyMs: routeAttempts.reduce((sum, call) => sum + call.latencyMs, 0),
    objectProvider,
    objectModel,
    objectAttemptCount: objectAttempts.length,
    objectCostUsd: objectAttempts.reduce((sum, call) => sum + call.costUsd, 0),
    objectLatencyMs: objectAttempts.reduce((sum, call) => sum + call.latencyMs, 0),
    costUsd: spentAfter.costUsd - spentBefore.costUsd,
    latencyMs: Math.max(0, now() - startedAt),
  };
}

/**
 * The run of the gate. Every configured route of each task is proved first with the preflight
 * turn; if any fails, the run stops there, as the script always did, and publishes the preflight
 * rows. Otherwise every observation of the snapshot runs in order. Pure over its arguments: the
 * gateway decides where each call goes and what it may cost, and the clock measures latency.
 */
export async function runIntentRouterGold(snapshot: IntentRouterGoldSnapshot, gateway: IntentRouterGoldGateway,
  clock: () => Date = () => new Date()): Promise<IntentRouterGoldResult> {
  const now = () => clock().getTime();
  const {preflight} = snapshot;
  const providerPreflight: IntentRouterProviderPreflight[] = [];
  let preflightFailed = false;
  try {
    providerPreflight.push(...await preflightIntentRouterProviders(gateway, taskRoutes(snapshot.model.route_intent), {
      task: "route_intent",
      system: INTENT_CLASSIFIER_SYSTEM,
      input: [{type: "text", text: JSON.stringify(preflight.classifierInput)}],
      schema: intentClassifierOutputSchema,
      schemaName: schemaNames.route_intent,
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {caseId: preflight.caseId, turnId: preflight.turnId},
    }, now));
  } catch (cause) {
    if (cause instanceof IntentRouterProviderPreflightError) providerPreflight.push(...cause.results);
    preflightFailed = true;
  }
  try {
    providerPreflight.push(...await preflightIntentRouterProviders(gateway, taskRoutes(snapshot.model.extract_semantic_objects), {
      task: "extract_semantic_objects",
      system: SEMANTIC_OBJECT_EXTRACTOR_SYSTEM,
      input: [{type: "text", text: JSON.stringify(preflight.objectInput)}],
      schema: semanticObjectExtractorOutputSchema,
      schemaName: schemaNames.extract_semantic_objects,
      outputMode: "prompted_json",
      thinking: "off",
      metadata: {caseId: preflight.caseId, turnId: preflight.turnId},
      validateOutput: (output) => validateSemanticObjectOutput(preflight.objectInput, output),
    }, now));
  } catch (cause) {
    if (cause instanceof IntentRouterProviderPreflightError) providerPreflight.push(...cause.results);
    preflightFailed = true;
  }
  const ledger = () => ({calls: [...gateway.calls()], gatewaySpent: gateway.spent()});
  if (preflightFailed) return {schemaVersion: "intent-router-gold-result.v1", outcome: "preflight_failed", providerPreflight, ...ledger()};

  const observations: IntentRouterGoldObservation[] = [];
  for (const operation of snapshot.observations) observations.push(await observe(operation, gateway, now));
  return {schemaVersion: "intent-router-gold-result.v1", outcome: "observed", providerPreflight, observations, ...ledger()};
}
