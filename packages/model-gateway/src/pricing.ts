import type {Usage} from "./types";

/**
 * List prices in USD per 1M tokens (P1 plan §3.2/§15). Recorded on
 * 28 Aug 2026 from the providers' official model tables. Cost figures produced from this table are always
 * labeled "list price" and never used for billing, only for budgets and reports.
 */
export type ModelPrice = {input: number; output: number; cachedInput: number; source: string; recordedOn: string};

export const listPrices: Record<string, ModelPrice> = {
  "claude-opus-5": {input: 5, output: 25, cachedInput: 0.5, source: "anthropic model table", recordedOn: "2026-08-18"},
  "claude-sonnet-5": {input: 3, output: 15, cachedInput: 0.3, source: "anthropic model table (promo 2/10 until 2026-08-31 not applied)", recordedOn: "2026-08-18"},
  "gpt-5.6-sol": {input: 4, output: 20, cachedInput: 0.4, source: "https://developers.openai.com/api/docs/pricing", recordedOn: "2026-08-28"},
  "gpt-5.6-terra": {input: 2, output: 12, cachedInput: 0.2, source: "https://developers.openai.com/api/docs/pricing", recordedOn: "2026-08-28"},
  // sweep candidates (never production paths — see policy.sweepCandidateModels)
  "gpt-5.6-luna": {input: 0.2, output: 1.2, cachedInput: 0.02, source: "https://developers.openai.com/api/docs/pricing", recordedOn: "2026-08-28"},
  "gpt-4.1": {input: 2, output: 8, cachedInput: 0.5, source: "third-party price pages; confirm on official table", recordedOn: "2026-08-18"},
  "gpt-4o": {input: 1.25, output: 5, cachedInput: 0.625, source: "third-party price pages; confirm on official table", recordedOn: "2026-08-18"},
  "claude-sonnet-4-6": {input: 3, output: 15, cachedInput: 0.3, source: "anthropic model table", recordedOn: "2026-08-18"},
};

export function estimateCostUsd(model: string, usage: Usage, prices: Record<string, ModelPrice> = listPrices): number {
  const price = prices[model];
  if (!price) return 0;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const cost = (uncached * price.input + usage.cachedInputTokens * price.cachedInput + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Rough pre-call estimate (≈4 chars per token) used only to refuse calls that would obviously blow the budget. */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
