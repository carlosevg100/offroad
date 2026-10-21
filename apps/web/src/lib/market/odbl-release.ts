import {createClient as createSupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import {getSupabasePublicConfig} from "@/lib/supabase/config";

/**
 * The ODbL edition of the derived SGS 432 database (ADR 0023, M2 part 3), read through the one function
 * the anonymous role reaches. The client carries no session and no cookie, so the database sees `anon`
 * whoever is browsing. The payload is the canonical text, served byte for byte; its digest travels apart.
 */
const served = z.object({releaseNumber: z.number().int().positive(), state: z.literal("served"), publishedAt: z.string(),
  dataBase: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().positive(),
  payload: z.string().min(2)}).strict();
const withdrawn = z.object({releaseNumber: z.number().int().positive(), state: z.literal("withdrawn")}).strict();

export type OdblRelease =
  | {state: "missing"}
  | {state: "withdrawn"; releaseNumber: number}
  | ({state: "served"} & Omit<z.infer<typeof served>, "state">);

export type OdblRpc = (name: "market_odbl_release_v1", args: {p_release: number | null}) => PromiseLike<{data: unknown; error: unknown}>;

export function publicOdblRpc(): OdblRpc | null {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  const client = createSupabaseClient(config.url, config.publishableKey, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {fetch: (input, init) => fetch(input, {...init, cache: "no-store"})},
  });
  return (name, args) => client.rpc(name, args);
}

/** Reads the latest edition. A transport or shape failure is an error, never an empty answer. */
export async function readOdblRelease(rpc: OdblRpc | null = publicOdblRpc()): Promise<OdblRelease> {
  if (!rpc) throw new Error("market_odbl_reader_unconfigured");
  const {data, error} = await rpc("market_odbl_release_v1", {p_release: null});
  if (error) throw new Error("market_odbl_reader_failed");
  if (data === null) return {state: "missing"};
  const asServed = served.safeParse(data);
  if (asServed.success) {
    const encoder = new TextEncoder();
    if (encoder.encode(asServed.data.payload).length !== asServed.data.byteSize || !asServed.data.payload.endsWith("\n")) throw new Error("market_odbl_payload_invalid");
    return asServed.data;
  }
  const asWithdrawn = withdrawn.safeParse(data);
  if (asWithdrawn.success) return {state: "withdrawn", releaseNumber: asWithdrawn.data.releaseNumber};
  throw new Error("market_odbl_reader_shape");
}

const observation = z.object({period: z.string(), value: z.string(), versionId: z.string(), acquisitionId: z.string()}).strict();
const change = z.object({period: z.string(), from: z.string(), to: z.string(), meeting: z.string().nullable(), referenceDate: z.string().nullable(),
  decision: z.string().nullable(), targetPct: z.string().nullable(), recordSha256: z.string().nullable()}).strict();

/** The fields the page shows, read from the canonical payload. */
export const odblPayloadSchema = z.object({
  release: z.string(), publishedAt: z.string(), database: z.string(), attribution: z.string(),
  license: z.object({name: z.string(), uri: z.string(), appliesTo: z.string()}).strict(),
  source: z.object({name: z.string(), attribution: z.string(), sourceLicense: z.string(), evidenceIds: z.array(z.string()), sourceRevision: z.string()}).strict(),
  reading: z.object({dataBase: z.string(), knowledgeAt: z.string(), window: z.object({start: z.string(), end: z.string()}).strict()}).strict(),
  rules: z.object({codeCommit: z.string(), parserAndRules: z.string(), vectors: z.string(), database: z.string(), contracts: z.string()}).strict(),
  observations: z.array(observation), changes: z.array(change),
  alterations: z.object({previous: z.object({release: z.string(), sha256: z.string()}).strict().nullable()}).passthrough(),
}).passthrough();
