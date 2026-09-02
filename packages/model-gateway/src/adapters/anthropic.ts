import Anthropic from "@anthropic-ai/sdk";
import {zodOutputFormat} from "@anthropic-ai/sdk/helpers/zod";
import type {AdapterRequest, AdapterResponse, ProviderAdapter, StopReason, Usage} from "../types";

export type AnthropicAdapterOptions = {
  /** Reads ANTHROPIC_API_KEY (or an `ant auth login` profile) when omitted. */
  apiKey?: string;
  client?: Anthropic;
};

/**
 * Builds the Messages API params for a gateway request. Exported so tests can
 * assert the exact shape without a network call:
 * - stable system prompt first with a cache breakpoint (prompt caching);
 * - document parts as data blocks in the user turn (never as instructions);
 * - structured output through `output_config.format` from the zod schema;
 * - adaptive thinking + effort (Fable 5 rejects an explicit `thinking` param, so it is omitted there).
 */
export function buildAnthropicParams(request: AdapterRequest): Anthropic.MessageCreateParamsNonStreaming {
  const content: Anthropic.ContentBlockParam[] = request.input.map((part) => {
    if (part.type === "text") return {type: "text", text: part.text};
    if (part.type === "image") return {type: "image", source: {type: "base64", media_type: part.mediaType, data: part.base64}};
    const document: Anthropic.DocumentBlockParam = {type: "document", source: {type: "base64", media_type: "application/pdf", data: part.base64}};
    if (part.title) document.title = part.title;
    return document;
  });
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    system: [{type: "text", text: request.system, cache_control: {type: "ephemeral"}}],
    messages: [{role: "user", content}],
    output_config: {effort: request.effort, format: zodOutputFormat(request.schema)},
  };
  if (request.thinking !== "off" && !request.model.startsWith("claude-fable") && !request.model.startsWith("claude-mythos")) {
    params.thinking = {type: "adaptive"};
  }
  if (request.metadata?.userId) params.metadata = {user_id: request.metadata.userId};
  return params;
}

export function mapAnthropicStopReason(reason: Anthropic.StopReason | null): StopReason {
  if (reason === "end_turn" || reason === "stop_sequence") return "end";
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") return "max_tokens";
  if (reason === "refusal") return "refusal";
  return "other";
}

export function mapAnthropicUsage(usage: Anthropic.Usage): Usage {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const result: Usage = {
    inputTokens: usage.input_tokens + cacheRead + cacheCreation,
    outputTokens: usage.output_tokens,
    cachedInputTokens: cacheRead,
  };
  const thinking = (usage as {output_tokens_details?: {thinking_tokens?: number} | null}).output_tokens_details?.thinking_tokens;
  if (typeof thinking === "number") result.reasoningTokens = thinking;
  return result;
}

export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): ProviderAdapter {
  const client = options.client ?? new Anthropic(options.apiKey ? {apiKey: options.apiKey} : {});
  return {
    provider: "anthropic",
    async complete(request: AdapterRequest): Promise<AdapterResponse> {
      const params = buildAnthropicParams(request);
      // Do not use messages.parse here. The SDK helper runs the Zod validator inside the
      // provider promise and throws away the otherwise valid Message (including usage and
      // request id) when a client-side constraint fails. The gateway owns validation and
      // fallback, so retain the raw structured response and validate it exactly once there.
      const message = await client.messages.create(params, {timeout: request.timeoutMs});
      const rawText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      const stopReason = mapAnthropicStopReason(message.stop_reason);
      const output = safeJsonParse(rawText);
      const response: AdapterResponse = {output, rawText, usage: mapAnthropicUsage(message.usage), model: message.model, stopReason};
      const requestId = (message as {_request_id?: string | null})._request_id;
      if (requestId) response.requestId = requestId;
      return response;
    },
  };
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
