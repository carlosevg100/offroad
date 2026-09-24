import {z} from "zod";

/**
 * The structured-output probe as a governed evaluation family (stage 17, increment 5).
 *
 * The probe tells whether a provider accepts the request shapes the routing tasks use (effort low
 * or medium, thinking off or adaptive, a flat schema, the nested envelope-like schema with a $ref,
 * the routing schema at its real size, and that size as prompted JSON), with a fixed synthetic
 * sentence about a fictional company: nothing in it is customer content. `probe-structured-output.ts`
 * sends this snapshot; the worker sends one request per shape through the governed gateway, with
 * no fallback, and publishes the verdict of each; the script prints them.
 */

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** One to two hundred characters with no surrounding space: what the evaluation contract accepts as a case label. */
const label = z.string().min(1).max(200).refine((value) => value.trim() === value, "no surrounding space");

const inferred = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  state: z.enum(["explicit", "inferred", "ambiguous", "unknown", "not_applicable"]),
  confidence: z.number().min(0).max(1),
  basis: z.string().max(200).optional(),
});

const flat = z.object({
  intent: z.string(),
  confidence: z.number(),
  company: z.string().nullable(),
});

const nested = z.object({
  routingCore: z.object({
    action: inferred(z.array(z.string().min(1).max(60)).min(1).max(8)),
    desiredOutcome: inferred(z.string().min(1).max(300)),
    decision: inferred(z.string().max(300).nullable()),
    depth: inferred(z.enum(["point", "preliminary", "institutional"])),
  }),
  inferableContext: z.object({
    asOfDate: inferred(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
    currency: inferred(z.string().length(3).nullable()),
    constraints: inferred(z.array(z.string().max(200)).max(20)),
  }),
  primaryWorks: z.array(z.object({work: z.enum(["understand", "analyze", "capital_strategy"]), confidence: z.number().min(0).max(1)})).min(1).max(3),
  composition: z.string().max(60).nullable(),
  firstQuestion: z.string().max(300).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(300).nullable(),
});

// The routing schema at its real size: the envelope's eight core fields and eight inferable
// context fields, each an object of four keys, plus the works and the abstention. Sixty-odd
// properties: the probe tells whether size, not shape, is what the provider rejects.
const objectKinds = ["organization", "user", "company", "project", "operation", "instrument", "document", "claim", "model", "asset_or_pool", "scenario", "alternative", "material", "market", "provider", "mandate", "process", "decision"] as const;
const works = ["find_and_organize", "extract_and_reconcile", "understand", "analyze", "model", "capital_strategy", "read_documents", "market", "capital_match"] as const;
const responsibilities = ["producer", "coordinator", "reviewer", "decision_maker", "sponsor", "recipient", "external_authorizer"] as const;
const fullSize = z.object({
  routingCore: z.object({
    action: inferred(z.array(z.string().min(1).max(60)).min(1).max(8)),
    object: inferred(z.array(z.object({kind: z.enum(objectKinds), reference: z.string().max(200).optional()})).min(1).max(12)),
    desiredOutcome: inferred(z.string().min(1).max(300)),
    decision: inferred(z.string().max(300).nullable()),
    audience: inferred(z.array(z.string().min(1).max(80)).min(1).max(6)),
    depth: inferred(z.enum(["point", "preliminary", "institutional"])),
    continuity: inferred(z.enum(["new", "refresh", "monitor", "comparison", "resume"])),
    workResponsibility: inferred(z.array(z.enum(responsibilities)).min(1).max(4)),
  }),
  inferableContext: z.object({
    jurisdiction: inferred(z.array(z.string().min(2).max(8)).max(4)),
    asOfDate: inferred(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
    currency: inferred(z.string().length(3).nullable()),
    deadline: inferred(z.string().max(80).nullable()),
    sponsorInstruction: inferred(z.string().max(500).nullable()),
    constraints: inferred(z.array(z.string().max(200)).max(20)),
    urgency: inferred(z.enum(["now", "today", "this_week", "ongoing"]).nullable()),
    availableInputs: inferred(z.array(z.string().max(120)).max(40)),
  }),
  primaryWorks: z.array(z.object({work: z.enum(works), confidence: z.number().min(0).max(1)})).min(1).max(3),
  composition: z.string().max(60).nullable(),
  firstQuestion: z.string().max(300).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(300).nullable(),
});

/** Each shape the probe sends: the schema, and whether the provider compiles it or reads it from the prompt. */
export const structuredOutputProbeShapes = {
  flat: {schema: flat, outputMode: "structured"},
  nested: {schema: nested, outputMode: "structured"},
  full: {schema: fullSize, outputMode: "structured"},
  "full-prompted": {schema: fullSize, outputMode: "prompted_json"},
} as const;
export type StructuredOutputProbeShape = keyof typeof structuredOutputProbeShapes;
const shapeNames = Object.keys(structuredOutputProbeShapes) as [StructuredOutputProbeShape, ...StructuredOutputProbeShape[]];

export const structuredOutputProbeVariantSchema = z.object({
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  /** Off sends thinking off; adaptive leaves it to the provider's default. */
  thinking: z.enum(["off", "adaptive"]),
  shape: z.enum(shapeNames),
}).strict();
export type StructuredOutputProbeVariant = z.infer<typeof structuredOutputProbeVariantSchema>;

/** The label a variant prints under, as the probe always printed it. */
export const structuredOutputProbeLabel = (variant: StructuredOutputProbeVariant): string =>
  `effort=${variant.effort} thinking=${variant.thinking} schema=${variant.shape}`;

/**
 * The evaluation snapshot of the probe family: the route, the fixed instructions and synthetic
 * input, the limits of each call and the variants to send, in order. Strict at every level.
 */
export const structuredOutputProbeSnapshotSchema = z.object({
  schemaVersion: z.literal("structured-output-probe-snapshot.v1"),
  caseId: z.literal("structured-output-probe"),
  caseVersion: label,
  route: z.object({provider: z.enum(["anthropic", "openai"]), model: z.string().min(1).max(120)}).strict(),
  system: z.string().min(1).max(2_000),
  input: z.array(z.object({type: z.literal("text"), text: z.string().min(1).max(4_000)}).strict()).min(1).max(4),
  maxOutputTokens: z.number().int().min(1).max(32_000),
  timeoutMs: z.number().int().min(1_000).max(600_000),
  variants: z.array(structuredOutputProbeVariantSchema).min(1).max(32),
}).strict().superRefine((snapshot, context) => {
  const labels = snapshot.variants.map(structuredOutputProbeLabel);
  if (new Set(labels).size !== labels.length) context.addIssue({code: "custom", path: ["variants"], message: "each variant is sent once"});
});
export type StructuredOutputProbeSnapshot = z.infer<typeof structuredOutputProbeSnapshotSchema>;

/** Every route the probe may take: its one model, at each effort a variant asks for, in first-use order. */
export function structuredOutputProbeRoutes(snapshot: StructuredOutputProbeSnapshot): Array<{provider: "anthropic" | "openai"; model: string; effort: StructuredOutputProbeVariant["effort"]}> {
  const efforts = [...new Set(snapshot.variants.map((variant) => variant.effort))];
  return efforts.map((effort) => ({...snapshot.route, effort}));
}

/** Calls each variant may make: one send, and one same-model repair when the schema travels in the prompt. */
export function structuredOutputProbeCalls(snapshot: StructuredOutputProbeSnapshot): number {
  return snapshot.variants.reduce((total, variant) => total + (structuredOutputProbeShapes[variant.shape].outputMode === "prompted_json" ? 2 : 1), 0);
}

/** One variant's request, exactly as the model gateway receives it: the snapshot's route, no fallback. */
export type StructuredOutputProbeRequest = {
  task: "route_intent";
  system: string;
  input: Array<{type: "text"; text: string}>;
  schema: z.ZodType;
  schemaName: string;
  outputMode: "structured" | "prompted_json";
  thinking?: "off";
  model: {provider: "anthropic" | "openai"; model: string; effort: StructuredOutputProbeVariant["effort"]};
  allowFallback: false;
  maxOutputTokens: number;
  timeoutMs: number;
};

const attemptOutcomes = ["ok", "refusal", "error", "invalid_output", "policy_rejected"] as const;
/** What one request came to: an accepted answer, or the gateway's failure code and each attempt's outcome. */
export type StructuredOutputProbeAttempt =
  | {accepted: true; model: string; output: unknown}
  | {accepted: false; code: string; attempts: Array<{outcome: (typeof attemptOutcomes)[number]; message?: string}>};
/**
 * What the loop needs from a model gateway. A model's own failure comes back as a verdict; a
 * refusal of the governed transport is thrown and ends the run.
 */
export type StructuredOutputProbePort = {attempt(request: StructuredOutputProbeRequest): Promise<StructuredOutputProbeAttempt>};

const accepted = z.object({
  label: z.string().min(1).max(200),
  verdict: z.literal("accepted"),
  model: z.string().min(1).max(200),
  ms: count,
  keys: z.array(z.string().min(1).max(200)).max(100),
}).strict();
const failed = z.object({
  label: z.string().min(1).max(200),
  verdict: z.literal("failed"),
  code: z.string().regex(/^[a-z_]{1,60}$/),
  attempts: z.array(z.object({outcome: z.enum(attemptOutcomes), message: z.string().max(400).optional()}).strict()).max(4),
  ms: count,
}).strict();

/**
 * What the probe family publishes when a governed evaluation succeeds: one verdict per variant,
 * in the snapshot's order. A partial evaluation publishes only its reason, never this.
 */
export const structuredOutputProbeResultSchema = z.object({
  schemaVersion: z.literal("structured-output-probe-result.v1"),
  variants: z.array(z.discriminatedUnion("verdict", [accepted, failed])).min(1).max(32),
}).strict();
export type StructuredOutputProbeResult = z.infer<typeof structuredOutputProbeResultSchema>;

/**
 * Sends every variant once, in order, through the port it is given, and publishes each verdict.
 * Pure over its arguments: the port decides where each request goes and the clock times it.
 */
export async function runStructuredOutputProbe(snapshot: StructuredOutputProbeSnapshot, port: StructuredOutputProbePort, clock: () => Date = () => new Date()): Promise<StructuredOutputProbeResult> {
  const variants: StructuredOutputProbeResult["variants"] = [];
  for (const variant of snapshot.variants) {
    const shape = structuredOutputProbeShapes[variant.shape];
    const started = clock().getTime();
    const outcome = await port.attempt({
      task: "route_intent",
      system: snapshot.system,
      input: snapshot.input.map((part) => ({...part})),
      schema: shape.schema,
      schemaName: `probe_${variant.shape}`,
      outputMode: shape.outputMode,
      ...(variant.thinking === "off" ? {thinking: "off" as const} : {}),
      model: {...snapshot.route, effort: variant.effort},
      allowFallback: false,
      maxOutputTokens: snapshot.maxOutputTokens,
      timeoutMs: snapshot.timeoutMs,
    });
    const ms = Math.max(0, clock().getTime() - started);
    const verdictLabel = structuredOutputProbeLabel(variant);
    variants.push(outcome.accepted
      ? {label: verdictLabel, verdict: "accepted", model: outcome.model, ms,
        keys: Object.keys(outcome.output !== null && typeof outcome.output === "object" ? outcome.output : {})}
      : {label: verdictLabel, verdict: "failed", code: outcome.code, attempts: outcome.attempts.slice(0, 4).map((attempt) =>
        ({outcome: attempt.outcome, ...(attempt.message === undefined ? {} : {message: attempt.message.slice(0, 400)})})), ms});
  }
  // Only what the script can read back is published.
  return structuredOutputProbeResultSchema.parse({schemaVersion: "structured-output-probe-result.v1", variants});
}

/**
 * The committed result of a governed probe, read strictly and bound to the snapshot this process
 * sent: one verdict per variant, in the order and under the labels it asked for.
 */
export function readStructuredOutputProbeResult(value: unknown, snapshot: StructuredOutputProbeSnapshot): StructuredOutputProbeResult {
  const result = structuredOutputProbeResultSchema.parse(value);
  const labels = snapshot.variants.map(structuredOutputProbeLabel);
  if (result.variants.length !== labels.length || result.variants.some((variant, index) => variant.label !== labels[index])) {
    throw new Error("structured_output_probe_result_mismatch: variants");
  }
  return result;
}
