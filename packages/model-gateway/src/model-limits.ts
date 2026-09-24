import {ModelGatewayError} from "./types";

/**
 * The token limits of one model, read on the provider's official pages on the day recorded.
 * The gateway refuses a request whose estimated input exceeds `maxInputTokens`, or whose output
 * ceiling exceeds `maxOutputTokens`, before reserving or sending anything.
 */
export type ModelLimits = {
  /** Everything one request may hold, as the provider states the window. */
  contextWindowTokens: number;
  /** The largest input the provider accepts in one request. */
  maxInputTokens: number;
  /** The largest `max_tokens` / `max_output_tokens` one request may ask for (thinking and reasoning included). */
  maxOutputTokens: number;
  source: string;
  recordedOn: string;
  note: string;
};

const anthropicWindows = "https://platform.claude.com/docs/en/build-with-claude/context-windows";
/**
 * Anthropic: the input alone above the window is refused with 400 "prompt is too long"; on 4.5
 * and later models input plus max_tokens may exceed the window and generation then stops with
 * `model_context_window_exceeded`. So the input limit is the window itself.
 */
const anthropicNote = "Input alone above the window is refused; input plus max_tokens beyond it is accepted and stops at the window (context-windows page).";
/**
 * OpenAI: "The context window is the maximum number of tokens that can be used in a single
 * request. This max tokens number includes input, output, and reasoning tokens"
 * (conversation-state guide), so the input limit is the window less the output ceiling.
 */
const openaiNote = "The window counts input, output and reasoning tokens (conversation-state guide), so the input limit is the window less the output ceiling.";
const openaiWindows = "https://developers.openai.com/api/docs/guides/conversation-state";

export const modelLimits: Record<string, ModelLimits> = {
  "claude-opus-5": {contextWindowTokens: 1_000_000, maxInputTokens: 1_000_000, maxOutputTokens: 128_000, recordedOn: "2026-09-24", note: anthropicNote,
    source: `https://platform.claude.com/docs/en/models/opus-5/overview; ${anthropicWindows}`},
  "claude-sonnet-5": {contextWindowTokens: 1_000_000, maxInputTokens: 1_000_000, maxOutputTokens: 128_000, recordedOn: "2026-09-24", note: anthropicNote,
    source: `https://platform.claude.com/docs/en/models/sonnet-5/overview; ${anthropicWindows}`},
  "claude-sonnet-4-6": {contextWindowTokens: 1_000_000, maxInputTokens: 1_000_000, maxOutputTokens: 128_000, recordedOn: "2026-09-24", note: anthropicNote,
    source: `https://platform.claude.com/docs/en/models/sonnet-4-6/overview; ${anthropicWindows}`},
  "gpt-5.6-sol": {contextWindowTokens: 1_050_000, maxInputTokens: 922_000, maxOutputTokens: 128_000, recordedOn: "2026-09-24", note: openaiNote,
    source: `https://developers.openai.com/api/docs/models/gpt-5.6-sol; ${openaiWindows}`},
  "gpt-5.6-terra": {contextWindowTokens: 1_050_000, maxInputTokens: 922_000, maxOutputTokens: 128_000, recordedOn: "2026-09-24", note: openaiNote,
    source: `https://developers.openai.com/api/docs/models/gpt-5.6-terra; ${openaiWindows}`},
  "gpt-5.6-luna": {contextWindowTokens: 1_050_000, maxInputTokens: 922_000, maxOutputTokens: 128_000, recordedOn: "2026-09-24", note: openaiNote,
    source: `https://developers.openai.com/api/docs/models/gpt-5.6-luna; ${openaiWindows}`},
  "gpt-4.1": {contextWindowTokens: 1_047_576, maxInputTokens: 1_014_808, maxOutputTokens: 32_768, recordedOn: "2026-09-24", note: openaiNote,
    source: `https://developers.openai.com/api/docs/models/gpt-4.1; ${openaiWindows}`},
  "gpt-4o": {contextWindowTokens: 128_000, maxInputTokens: 111_616, maxOutputTokens: 16_384, recordedOn: "2026-09-24", note: openaiNote,
    source: `https://developers.openai.com/api/docs/models/gpt-4o; ${openaiWindows}`},
};

/**
 * Refuses, with a named error, a request the model cannot take: an estimated input above the
 * model's input limit (`input_limit_exceeded`) or an output ceiling above its maximum output
 * (`output_limit_exceeded`). A model without declared limits is not checked here; the
 * conservative reservation already refuses a model without a price.
 */
export function assertWithinModelLimits(input: {
  provider: string;
  model: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  limits?: Record<string, ModelLimits>;
}): void {
  const limits = (input.limits ?? modelLimits)[input.model];
  if (!limits) return;
  if (input.estimatedInputTokens > limits.maxInputTokens) {
    throw new ModelGatewayError(
      `estimated input of ${input.estimatedInputTokens} tokens exceeds the ${limits.maxInputTokens}-token input limit of ${input.provider}/${input.model}`,
      "input_limit_exceeded",
      {provider: input.provider, model: input.model, estimatedInputTokens: input.estimatedInputTokens, maxInputTokens: limits.maxInputTokens},
    );
  }
  if (input.maxOutputTokens > limits.maxOutputTokens) {
    throw new ModelGatewayError(
      `output ceiling of ${input.maxOutputTokens} tokens exceeds the ${limits.maxOutputTokens}-token output limit of ${input.provider}/${input.model}`,
      "output_limit_exceeded",
      {provider: input.provider, model: input.model, maxOutputTokens: input.maxOutputTokens, modelMaxOutputTokens: limits.maxOutputTokens},
    );
  }
}
