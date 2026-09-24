import {z} from "zod";

/**
 * The professional gates of one execution request, exactly as the producer stores them in its
 * receipt. Closed at every level: every key is known, every string is a bounded token or an
 * enumerated state, every count a non-negative integer, and there is no free text anywhere, so a
 * finding, a label or an owner never reaches the receipt. The database refuses the same shapes
 * (`private.execution_gates_projection_v1`), accepts only the canonical text that
 * `executionCanonicalText` produces for a parsed value and computes the SHA-256 of those bytes on
 * its own; a client never supplies the fingerprint.
 */
export const EXECUTION_GATES_SCHEMA_VERSION = "execution-gates.v1";

/** Versions are tokens such as `2026.09.24-v1`: no spaces, no prose. */
const versionToken = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const count = z.number().int().nonnegative().max(999_999_999);
const distinct = (values: readonly string[]) => new Set(values).size === values.length;

export const executionGatesConventionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
  /** Null when the key is unknown to the registry or its metadata is unreadable. */
  version: versionToken.nullable(),
  status: z.enum(["required_missing", "draft", "approved", "expired"]).nullable(),
  effective: z.enum(["approved", "gap"]),
}).strict();

export const executionGatesMethodSelectionSchema = z.object({
  selectionVersion: versionToken,
  situationIds: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,79}$/)).max(32).refine(distinct, "duplicate situation"),
  methodId: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  methodVersion: versionToken,
}).strict();

export const executionGatesVoiceSchema = z.object({
  version: versionToken,
  blockCount: count,
  warnCount: count,
}).strict();

export const executionGatesSchema = z.object({
  schemaVersion: z.literal(EXECUTION_GATES_SCHEMA_VERSION),
  gatesVersion: versionToken,
  blocked: z.boolean(),
  companyRegistration: z.enum(["registered", "missing"]),
  research: z.enum(["recorded", "abstained", "missing"]),
  methodSelection: executionGatesMethodSelectionSchema,
  conventions: z.array(executionGatesConventionSchema).max(256)
    .refine((entries) => distinct(entries.map((entry) => entry.key)), "duplicate convention key"),
  voice: executionGatesVoiceSchema,
}).strict();
export type ExecutionGates = z.infer<typeof executionGatesSchema>;
export type ExecutionGatesConvention = z.infer<typeof executionGatesConventionSchema>;
