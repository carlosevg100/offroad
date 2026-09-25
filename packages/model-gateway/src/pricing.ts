import type {Usage} from "./types";

/**
 * A whole-request tariff for long prompts. When the input tokens of one request exceed
 * `aboveInputTokens`, every input-side rate (uncached, cached and cache writes) is multiplied by
 * `inputMultiplier` and the output rate by `outputMultiplier`, for the full request.
 */
export type LongContextTariff = {aboveInputTokens: number; inputMultiplier: number; outputMultiplier: number};

/**
 * List prices in USD per 1M tokens (P1 plan §3.2/§15), each entry read on the provider's
 * official pages on the day it records. Cost figures produced from this table are always
 * labeled "list price" and never used for billing, only for budgets, reservations and reports.
 */
export type ModelPrice = {
  input: number;
  output: number;
  cachedInput: number;
  /**
   * An input token written to the provider's prompt cache: Anthropic's five-minute cache write
   * (the only TTL the adapter uses) and OpenAI's cache write from GPT-5.6 on. Equal to `input`
   * where the provider charges nothing extra for writing.
   */
  cacheWrite: number;
  /** Null where the provider prices the whole context window at the standard rates. */
  longContext: LongContextTariff | null;
  /** The official pages the figures were read from. */
  source: string;
  recordedOn: string;
  note?: string;
};

const anthropicPricing = "https://platform.claude.com/docs/en/about-claude/pricing (model pricing; long context pricing)";
const openaiPricing = "https://developers.openai.com/api/docs/pricing (standard tier, short and long context columns)";
/** OpenAI states it on each GPT-5.6 model page: "Prompts with >272K input tokens are priced at 2x input and 1.5x output for the full request." */
const gpt56LongContext: LongContextTariff = {aboveInputTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5};

export const listPrices: Record<string, ModelPrice> = {
  "claude-opus-5": {input: 5, output: 25, cachedInput: 0.5, cacheWrite: 6.25, longContext: null, recordedOn: "2026-09-24",
    source: `${anthropicPricing}; https://platform.claude.com/docs/en/models/opus-5/overview`,
    note: "Claude 4.6 and later models bill the full 1M window at the standard rates."},
  "claude-sonnet-5": {input: 2, output: 10, cachedInput: 0.2, cacheWrite: 2.5, longContext: null, recordedOn: "2026-09-24",
    source: `${anthropicPricing}; https://platform.claude.com/docs/en/release-notes/overview (2026-08-10)`,
    note: "The launch price of 2/10 became the standard price on 2026-08-10; the increase to 3/15 once scheduled for 2026-09-01 does not occur."},
  "gpt-5.6-sol": {input: 4, output: 20, cachedInput: 0.4, cacheWrite: 5, longContext: gpt56LongContext, recordedOn: "2026-09-24",
    source: `${openaiPricing}; https://developers.openai.com/api/docs/models/gpt-5.6-sol`,
    note: "Promotional pricing, available at least through 2026-11-21 per the model page: check it again before that date."},
  "gpt-5.6-terra": {input: 2, output: 12, cachedInput: 0.2, cacheWrite: 2.5, longContext: gpt56LongContext, recordedOn: "2026-09-24",
    source: `${openaiPricing}; https://developers.openai.com/api/docs/models/gpt-5.6-terra`},
  // Sweep candidates, never production paths (see policy.sweepCandidateModels).
  "gpt-5.6-luna": {input: 0.2, output: 1.2, cachedInput: 0.02, cacheWrite: 0.25, longContext: gpt56LongContext, recordedOn: "2026-09-24",
    source: `${openaiPricing}; https://developers.openai.com/api/docs/models/gpt-5.6-luna`},
  "gpt-4.1": {input: 2, output: 8, cachedInput: 0.5, cacheWrite: 2, longContext: null, recordedOn: "2026-09-24",
    source: `${openaiPricing}; https://developers.openai.com/api/docs/models/gpt-4.1`,
    note: "Models before GPT-5.6 have no cache-write charge (prompt caching guide)."},
  "gpt-4o": {input: 2.5, output: 10, cachedInput: 1.25, cacheWrite: 2.5, longContext: null, recordedOn: "2026-09-24",
    source: `${openaiPricing}; https://developers.openai.com/api/docs/models/gpt-4o`,
    note: "Models before GPT-5.6 have no cache-write charge (prompt caching guide)."},
  "claude-sonnet-4-6": {input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75, longContext: null, recordedOn: "2026-09-24",
    source: `${anthropicPricing}; https://platform.claude.com/docs/en/models/sonnet-4-6/overview`},
};

/**
 * Budget reservations deliberately include a 10% margin: both providers price regional or
 * data-residency processing at 1.1x the list rates (Anthropic `inference_geo`, OpenAI regional
 * endpoints), which a configuration change could turn on without touching this table. Keep this
 * calculation shared by the gateway and evidence verifiers so an unknown-cost provider call
 * cannot later be represented as free by altering only an aggregate report field.
 */
export const COST_RESERVATION_SAFETY_FACTOR = 1.1;

/** The rates one request is billed at: the long-context tariff applies to the whole request once its input passes the threshold. */
export function effectivePrice(price: ModelPrice, inputTokens: number): Pick<ModelPrice, "input" | "output" | "cachedInput" | "cacheWrite"> {
  const tariff = price.longContext;
  if (!tariff || inputTokens <= tariff.aboveInputTokens) return {input: price.input, output: price.output, cachedInput: price.cachedInput, cacheWrite: price.cacheWrite};
  return {
    input: price.input * tariff.inputMultiplier,
    cachedInput: price.cachedInput * tariff.inputMultiplier,
    cacheWrite: price.cacheWrite * tariff.inputMultiplier,
    output: price.output * tariff.outputMultiplier,
  };
}

export function estimateCostUsd(model: string, usage: Usage, prices: Record<string, ModelPrice> = listPrices): number {
  const price = prices[model];
  if (!price) return 0;
  const rates = effectivePrice(price, usage.inputTokens);
  const cacheCreation = usage.cacheCreationInputTokens ?? 0;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens - cacheCreation);
  // Anthropic writes use only the five-minute ephemeral TTL here (no one-hour TTL):
  // https://platform.claude.com/docs/en/build-with-claude/prompt-caching
  // OpenAI reports cache writes inside input_tokens from GPT-5.6 on:
  // https://developers.openai.com/api/docs/guides/prompt-caching
  const cost = (uncached * rates.input + cacheCreation * rates.cacheWrite + usage.cachedInputTokens * rates.cachedInput + usage.outputTokens * rates.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Upper bound of one attempt at list price: every input token at its rate, the ones the provider
 * may write to its prompt cache at the cache-write rate, and the whole output the request allows,
 * all under the long-context tariff when the input passes its threshold, times the safety factor.
 */
export function reservationForTokensUsd(input: {
  model: string;
  inputTokens: number;
  /** Of `inputTokens`, how many the provider may write to its prompt cache on this request. */
  cacheWritableInputTokens?: number;
  maxOutputTokens: number;
  prices?: Record<string, ModelPrice>;
}): number {
  const prices = input.prices ?? listPrices;
  const price = prices[input.model];
  if (!price) return 0;
  const rates = effectivePrice(price, input.inputTokens);
  const writable = Math.min(input.inputTokens, Math.max(0, input.cacheWritableInputTokens ?? 0));
  const cost = ((input.inputTokens - writable) * rates.input + writable * Math.max(rates.cacheWrite, rates.input)
    + input.maxOutputTokens * rates.output) / 1_000_000;
  return (Math.round(cost * 1_000_000) / 1_000_000) * COST_RESERVATION_SAFETY_FACTOR;
}
