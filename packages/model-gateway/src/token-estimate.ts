import {Buffer} from "node:buffer";
import {buildAnthropicParams} from "./adapters/anthropic";
import {buildOpenAIParams} from "./adapters/openai";
import type {AdapterRequest, Provider} from "./types";

/**
 * Calibrated upper bound of the input tokens a provider bills for a request, computed offline and
 * without the provider's tokenizer (no tokenizer ships with the gateway, and Anthropic publishes
 * none for its current models).
 *
 * Rule: every ASCII digit and ASCII punctuation or symbol character (0x21-0x40, 0x5B-0x60,
 * 0x7B-0x7E) counts as one token, the worst case of those dense characters; every other UTF-8 byte
 * (letters, accented letters, whitespace) counts `perOtherByte` tokens; each request adds
 * `REQUEST_OVERHEAD_TOKENS` for hidden provider framing (structured-output and thinking system
 * text, role markers). Byte-level tokenizers never emit more than one token per byte, and the
 * rule stays below that bound for any text.
 *
 * Calibration, from real usage on exact request bytes rebuilt from the repository:
 * - Anthropic (the tokenizer of Claude Opus 4.7 and later and of Claude Sonnet 5, which the
 *   providers' notes say yields about 30% more tokens than the one before it): the gc01 baseline
 *   of 4 Sep 2026 (`docs/product/gold-cases/runs/gc01/baseline/2026-09-04-23-18-46/run.json`,
 *   Claude Opus 5, 508,910 and 515,321 input tokens over 1,078,003 and 1,091,859 bytes of
 *   Portuguese financial filings, 17.3% dense) needs 0.3614 tokens per other byte; ten Claude
 *   Sonnet 5 requests of the documentary evaluation
 *   (`packages/evals/fixtures/document-work-product-live-34467680287-evidence.json`, English JSON,
 *   about 12% dense) need 0.296-0.307. The rate 0.45 is 1.25 times the largest fit: offline o200k
 *   counts of the same corpora show legal prose (indentures, board minutes) needing up to 1.19
 *   times the rate of the calibration mix, so 1.25 keeps a margin above the densest prose observed.
 * - OpenAI (o200k_base, the encoding of GPT-4o, GPT-4.1 and GPT-5.x, counted offline with
 *   js-tiktoken 1.0.21): over 365 text files of the repository's gold cases and fixtures the
 *   largest rate needed is 0.2118, so 0.25 covers every file with at least 13.7% to spare; the
 *   one real GPT-5.6 Terra request in the documentary fixture billed 2,020 tokens against an
 *   estimate of 4,554 with this rule.
 * `reservation-calibration.test.ts` checks the rule against every calibration sample.
 */
export const inputTokenRates: Record<Provider, {perDenseCharacter: number; perOtherByte: number}> = {
  anthropic: {perDenseCharacter: 1, perOtherByte: 0.45},
  openai: {perDenseCharacter: 1, perOtherByte: 0.25},
};

/** Hidden framing per request; Anthropic documents its own tool-use system prompts at 286-474 tokens. */
export const REQUEST_OVERHEAD_TOKENS = 1_024;

/** Dense characters and total UTF-8 bytes of a text, the two quantities the rule reads. */
export function textComposition(text: string): {bytes: number; dense: number} {
  let dense = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if ((code >= 0x21 && code <= 0x40) || (code >= 0x5b && code <= 0x60) || (code >= 0x7b && code <= 0x7e)) dense += 1;
  }
  return {bytes: Buffer.byteLength(text, "utf8"), dense};
}

/** Upper bound of the tokens of one text for a provider, fractional so that parts add up exactly. */
function textUnits(provider: Provider, text: string): number {
  const rate = inputTokenRates[provider];
  const {bytes, dense} = textComposition(text);
  return dense * rate.perDenseCharacter + (bytes - dense) * rate.perOtherByte;
}

/** Upper bound of the tokens one text adds to a request of this provider (no request overhead). */
export function estimateTextTokens(provider: Provider, text: string): number {
  return Math.ceil(textUnits(provider, text));
}

export type RequestTokenEstimate = {
  /** Upper bound of the input tokens the provider bills for the request, overhead included. */
  inputTokens: number;
  /** Of those, how many the provider may write to its prompt cache on this request. */
  cacheWritableInputTokens: number;
  /** Image and document parts, which the rule cannot bound; the estimate covers text only. */
  unestimatedParts: number;
};

/**
 * The estimate of the complete adapter payload: system (with prompted-JSON instructions and repair
 * guidance), every text part, and the JSON Schema the provider compiles, as each adapter builds
 * them. Cache writes follow what the adapters send: Anthropic writes the prefix up to its last
 * `cache_control` breakpoint (the system block, with the schema and hidden framing that precede
 * the messages); OpenAI's implicit caching on GPT-5.6 places its breakpoint at the end of the
 * latest user message, so the whole prompt may be written.
 */
export function estimateRequestInputTokens(provider: Provider, request: AdapterRequest): RequestTokenEstimate {
  let units = 0;
  let prefixUnits = 0;
  let unestimatedParts = 0;
  if (provider === "anthropic") {
    const params = buildAnthropicParams(request);
    const system = Array.isArray(params.system) ? params.system : params.system ? [{type: "text" as const, text: params.system}] : [];
    let lastBreakpoint = 0;
    const blocks: Array<{units: number; breakpoint: boolean}> = [];
    const breakpointOf = (block: object) => Boolean((block as {cache_control?: unknown}).cache_control);
    for (const block of system) blocks.push({units: textUnits(provider, block.text), breakpoint: breakpointOf(block)});
    const format = params.output_config?.format;
    const schemaUnits = format ? textUnits(provider, JSON.stringify(format)) : 0;
    for (const message of params.messages) {
      const content = typeof message.content === "string" ? [{type: "text" as const, text: message.content}] : message.content;
      for (const block of content) {
        if (block.type === "text") blocks.push({units: textUnits(provider, block.text), breakpoint: breakpointOf(block)});
        else {
          unestimatedParts += 1;
          blocks.push({units: 0, breakpoint: breakpointOf(block)});
        }
      }
    }
    blocks.forEach((block, index) => { if (block.breakpoint) lastBreakpoint = index + 1; });
    const total = blocks.reduce((sum, block) => sum + block.units, 0);
    const prefix = blocks.slice(0, lastBreakpoint).reduce((sum, block) => sum + block.units, 0);
    units = total + schemaUnits + REQUEST_OVERHEAD_TOKENS;
    prefixUnits = lastBreakpoint > 0 ? prefix + schemaUnits + REQUEST_OVERHEAD_TOKENS : 0;
  } else {
    const params = buildOpenAIParams(request);
    units += typeof params.instructions === "string" ? textUnits(provider, params.instructions) : 0;
    const format = params.text?.format;
    if (format && format.type === "json_schema") units += textUnits(provider, JSON.stringify(format.schema));
    for (const item of Array.isArray(params.input) ? params.input : []) {
      if (!("content" in item) || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part.type === "input_text") units += textUnits(provider, part.text);
        else unestimatedParts += 1;
      }
    }
    units += REQUEST_OVERHEAD_TOKENS;
    prefixUnits = units;
  }
  const inputTokens = Math.ceil(units);
  return {inputTokens, cacheWritableInputTokens: Math.min(inputTokens, Math.ceil(prefixUnits)), unestimatedParts};
}
