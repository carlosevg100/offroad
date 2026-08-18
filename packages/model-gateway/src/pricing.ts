import type {Usage} from "./types";

/**
 * List prices in USD per 1M tokens (P1 plan §3.2/§15). Recorded on
 * 18 Aug 2026 — Anthropic from the official model table; OpenAI GPT-5.6 tiers
 * from third-party price pages, to be confirmed against the official table when
 * the first live call is made. Cost figures produced from this table are always
 * labeled "list price" and never used for billing, only for budgets and reports.
 */
export type ModelPrice = {input: number; output: number; cachedInput: number; source: string; recordedOn: string};

export const listPrices: Record<string, ModelPrice> = {
  "claude-opus-5": {input: 5, output: 25, cachedInput: 0.5, source: "anthropic model table", recordedOn: "2026-08-18"},
  "claude-sonnet-5": {input: 3, output: 15, cachedInput: 0.3, source: "anthropic model table (promo 2/10 until 2026-08-31 not applied)", recordedOn: "2026-08-18"},
  "gpt-5.6-sol": {input: 5, output: 30, cachedInput: 0.5, source: "third-party price pages; confirm on official table", recordedOn: "2026-08-18"},
  "gpt-5.6-terra": {input: 2, output: 12, cachedInput: 0.2, source: "third-party price pages; confirm on official table", recordedOn: "2026-08-18"},
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
