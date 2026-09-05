import OpenAI from "openai";
import {z} from "zod";
import type {AdapterRequest, AdapterResponse, ProviderAdapter, StopReason, Usage} from "../types";
import {extractJsonText, promptedJsonInstruction, safeJsonParse} from "./anthropic";

export type OpenAIAdapterOptions = {
  /** Reads OPENAI_API_KEY when omitted. */
  apiKey?: string;
  client?: OpenAI;
};

type JsonSchema = Record<string, unknown>;

const strictUnsupportedKeywords = new Set(["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "default", "$schema", "format"]);

/**
 * OpenAI strict structured outputs require every property to be listed in
 * `required` and `additionalProperties: false`; optional properties become
 * nullable and the adapter strips only those artificial nulls before zod validation. Numeric/length
 * constraints and string formats are validated client-side by zod, so they are removed here.
 * In particular, z.url() emits `format: "uri"`, which is not part of the provider's strict
 * structured-output subset and makes an otherwise valid request fail before inference.
 */
export function toOpenAIStrictSchema(schema: JsonSchema): JsonSchema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const source = node as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (strictUnsupportedKeywords.has(key)) continue;
      output[key] = key === "properties" && value && typeof value === "object" ? value : walk(value);
    }
    if (output.type === "object" && output.properties && typeof output.properties === "object") {
      const properties = output.properties as Record<string, unknown>;
      const required = new Set(Array.isArray(source.required) ? (source.required as string[]) : []);
      const rewritten: Record<string, unknown> = {};
      for (const [name, propertySchema] of Object.entries(properties)) {
        const walked = walk(propertySchema) as JsonSchema;
        rewritten[name] = required.has(name) ? walked : nullable(walked);
      }
      output.properties = rewritten;
      output.required = Object.keys(properties);
      output.additionalProperties = false;
    }
    return output;
  };
  return walk(schema) as JsonSchema;
}

function nullable(schema: JsonSchema): JsonSchema {
  if (Array.isArray(schema.anyOf)) return {anyOf: [...(schema.anyOf as unknown[]), {type: "null"}]};
  if (typeof schema.type === "string") return {...schema, type: [schema.type, "null"]};
  return {anyOf: [schema, {type: "null"}]};
}

/**
 * Removes only the `null` values introduced by OpenAI's strict-output contract.
 *
 * Strict output requires every object property to be present. We represent an
 * originally optional property as nullable for the provider, then remove its
 * artificial `null` before validating with the original Zod schema. A required
 * nullable property is semantic data (for example, an honest `not_ready`
 * recommendation with no alternative id) and must survive unchanged.
 */
export function stripOpenAIOptionalNulls(value: unknown, originalSchema: JsonSchema): unknown {
  return stripAgainstSchema(value, originalSchema);
}

function stripAgainstSchema(value: unknown, schema: JsonSchema): unknown {
  if (Array.isArray(value)) {
    const itemSchema = schemaForValue(schema.items, value[0]);
    return value.map((entry) => itemSchema ? stripAgainstSchema(entry, itemSchema) : entry);
  }
  if (!value || typeof value !== "object") return value;

  const objectSchema = schemaForValue(schema, value) ?? schema;
  const properties = objectSchema.properties && typeof objectSchema.properties === "object"
    ? objectSchema.properties as Record<string, unknown>
    : {};
  const required = new Set(Array.isArray(objectSchema.required) ? objectSchema.required as string[] : []);
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const propertySchema = schemaForValue(properties[key], entry);
    if (entry === null && Object.hasOwn(properties, key) && !required.has(key)) continue;
    output[key] = propertySchema ? stripAgainstSchema(entry, propertySchema) : entry;
  }
  return output;
}

function schemaForValue(candidate: unknown, value: unknown): JsonSchema | undefined {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const schema = candidate as JsonSchema;
  const alternatives = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : [];
  if (alternatives.length === 0) return schema;

  return alternatives
    .map((entry) => schemaForValue(entry, value))
    .find((entry) => entry && schemaMatchesValue(entry, value));
}

function schemaMatchesValue(schema: JsonSchema, value: unknown): boolean {
  const type = schema.type;
  if (value === null) return type === "null" || (Array.isArray(type) && type.includes("null"));
  if (Array.isArray(value)) return type === "array" || (Array.isArray(type) && type.includes("array"));
  if (typeof value === "object") return type === "object" || Boolean(schema.properties) || (Array.isArray(type) && type.includes("object"));
  return type === typeof value || (Array.isArray(type) && type.includes(typeof value));
}

export function buildOpenAIParams(request: AdapterRequest): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  const schema = toOpenAIStrictSchema(z.toJSONSchema(request.schema) as JsonSchema);
  const content: OpenAI.Responses.ResponseInputContent[] = request.input.map((part) => {
    if (part.type === "text") return {type: "input_text", text: part.text};
    if (part.type === "image") return {type: "input_image", image_url: `data:${part.mediaType};base64,${part.base64}`, detail: "high"};
    return {type: "input_file", filename: part.title ?? "document.pdf", file_data: `data:application/pdf;base64,${part.base64}`};
  });
  const prompted = request.outputMode === "prompted_json";
  const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: request.model,
    instructions: prompted ? `${request.system}\n\n${promptedJsonInstruction(request)}` : request.system,
    input: [{role: "user", content}],
    reasoning: {effort: request.effort},
    // A schema too large for a strict grammar travels in the instructions; the text is parsed and validated by the gateway.
    text: prompted ? {format: {type: "text"}} : {format: {type: "json_schema", name: request.schemaName, schema, strict: true}},
    max_output_tokens: request.maxOutputTokens,
    // never keep provider-side copies of client documents
    store: false,
  };
  if (request.cacheKey) params.prompt_cache_key = request.cacheKey;
  return params;
}

export function mapOpenAIStopReason(response: Pick<OpenAI.Responses.Response, "status" | "incomplete_details" | "output">): StopReason {
  const refused = response.output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));
  if (refused) return "refusal";
  if (response.status === "completed") return "end";
  if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") return "max_tokens";
  return "other";
}

export function mapOpenAIUsage(usage: OpenAI.Responses.ResponseUsage | undefined): Usage {
  if (!usage) return {inputTokens: 0, outputTokens: 0, cachedInputTokens: 0};
  const result: Usage = {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
  };
  const reasoning = usage.output_tokens_details?.reasoning_tokens;
  if (typeof reasoning === "number") result.reasoningTokens = reasoning;
  return result;
}

export function createOpenAIAdapter(options: OpenAIAdapterOptions = {}): ProviderAdapter {
  const client = options.client ?? new OpenAI(options.apiKey ? {apiKey: options.apiKey} : {});
  return {
    provider: "openai",
    async complete(request: AdapterRequest): Promise<AdapterResponse> {
      const params = buildOpenAIParams(request);
      const response = await client.responses.create(params, {timeout: request.timeoutMs});
      const rawText = response.output_text ?? "";
      const originalSchema = z.toJSONSchema(request.schema) as JsonSchema;
      const adapterResponse: AdapterResponse = {
        output: stripOpenAIOptionalNulls(safeJsonParse(request.outputMode === "prompted_json" ? extractJsonText(rawText) : rawText), originalSchema),
        rawText,
        usage: mapOpenAIUsage(response.usage),
        model: response.model,
        stopReason: mapOpenAIStopReason(response),
      };
      const requestId = (response as {_request_id?: string | null})._request_id;
      if (requestId) adapterResponse.requestId = requestId;
      return adapterResponse;
    },
  };
}
