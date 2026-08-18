import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync, existsSync} from "node:fs";
import {join} from "node:path";
import {z} from "zod";
import type {AdapterRequest, AdapterResponse, Provider} from "./types";

/**
 * Cassettes make model calls deterministic in tests and CI (P1 plan §14.3):
 * `record` stores every response keyed by a hash of the request; `replay`
 * serves stored responses and fails loudly on a miss; `off` always calls the
 * provider. Cassettes never contain secrets; they do contain prompt content, so
 * only synthetic fixtures may be recorded into the repository.
 */
export type CassetteMode = "off" | "record" | "replay";

export interface CassetteStore {
  get(key: string): AdapterResponse | undefined;
  set(key: string, value: AdapterResponse, meta: {provider: Provider; model: string; schemaName: string}): void;
}

export function cassetteKey(provider: Provider, request: AdapterRequest, schemaJson: unknown): string {
  const payload = JSON.stringify({
    provider,
    model: request.model,
    effort: request.effort,
    system: request.system,
    input: request.input.map((part) => (part.type === "text" ? part : {type: part.type, sha256: sha256(part.base64)})),
    schema: schemaJson,
    schemaName: request.schemaName,
  });
  return sha256(payload);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class InMemoryCassetteStore implements CassetteStore {
  readonly entries = new Map<string, AdapterResponse>();
  get(key: string): AdapterResponse | undefined {
    return this.entries.get(key);
  }
  set(key: string, value: AdapterResponse): void {
    this.entries.set(key, value);
  }
}

const storedResponseSchema = z.object({
  provider: z.string(),
  model: z.string(),
  schemaName: z.string(),
  recordedAt: z.string(),
  response: z.object({
    output: z.unknown(),
    rawText: z.string(),
    usage: z.object({inputTokens: z.number(), outputTokens: z.number(), cachedInputTokens: z.number(), reasoningTokens: z.number().optional()}),
    model: z.string(),
    stopReason: z.enum(["end", "max_tokens", "refusal", "other"]),
    requestId: z.string().optional(),
  }),
});

/** One JSON file per cassette under `<dir>/<key>.json`. */
export class FileCassetteStore implements CassetteStore {
  constructor(private readonly directory: string) {}

  get(key: string): AdapterResponse | undefined {
    const path = join(this.directory, `${key}.json`);
    if (!existsSync(path)) return undefined;
    const parsed = storedResponseSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    const {reasoningTokens, ...usage} = parsed.response.usage;
    const response: AdapterResponse = {
      output: parsed.response.output,
      rawText: parsed.response.rawText,
      usage: reasoningTokens !== undefined ? {...usage, reasoningTokens} : usage,
      model: parsed.response.model,
      stopReason: parsed.response.stopReason,
    };
    if (parsed.response.requestId) response.requestId = parsed.response.requestId;
    return response;
  }

  set(key: string, value: AdapterResponse, meta: {provider: Provider; model: string; schemaName: string}): void {
    mkdirSync(this.directory, {recursive: true});
    const record = {provider: meta.provider, model: meta.model, schemaName: meta.schemaName, recordedAt: new Date().toISOString(), response: value};
    writeFileSync(join(this.directory, `${key}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}
