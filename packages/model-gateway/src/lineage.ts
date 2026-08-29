import {z} from "zod";

export const gatewayCallLogSchema = z.object({
  invocationId: z.uuid(),
  task: z.enum([
    "classify_document",
    "locate_fields",
    "extract_fields",
    "extract_complex",
    "map_accounts",
    "explain_exception",
    "case_brief",
    "write_output",
    "audit_evidence",
    "localize",
  ]),
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  outcome: z.enum(["ok", "refusal", "error", "invalid_output"]),
  promptFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative().optional(),
  }),
  costUsd: z.number().nonnegative(),
  // Old persisted invocations predate explicit cost quality. Treat them as measured rather
  // than making an otherwise valid historical execution unreadable after this rollout.
  costStatus: z.enum(["measured", "unknown", "cassette"]).default("measured"),
  latencyMs: z.number().nonnegative(),
  stopReason: z.enum(["end", "max_tokens", "refusal", "other"]),
  usedFallback: z.boolean(),
  fromCassette: z.boolean(),
  schemaName: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional(),
});
