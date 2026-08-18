/**
 * @offroad/model-gateway — the only door to LLM providers (P1 plan §13.3).
 *
 * Multi-provider (Anthropic Opus 5 / Sonnet 5, OpenAI GPT-5.6) behind one
 * typed interface: per-task policy (no Haiku, allowlist enforced), structured
 * outputs validated with zod, budgets, timeouts, fallback between providers,
 * refusal handling, minimization of personal identifiers, cassettes for
 * deterministic tests, and content-free call logs.
 */
export const modelGatewayVersion = "2026.08.18-v1";

export * from "./types";
export * from "./policy";
export * from "./pricing";
export * from "./redaction";
export * from "./cassette";
export * from "./gateway";
export {createAnthropicAdapter, buildAnthropicParams, mapAnthropicStopReason, mapAnthropicUsage, safeJsonParse} from "./adapters/anthropic";
export {createOpenAIAdapter, buildOpenAIParams, toOpenAIStrictSchema, stripNulls, mapOpenAIStopReason, mapOpenAIUsage} from "./adapters/openai";
