import {z} from "zod";
import {researchQuerySchema, researchSourceSchema, type ResearchQuery, type ResearchSource} from "./contracts";

export const publicResearchCacheRecordSchema = z.object({
  schemaVersion: z.literal("public-research-cache.v2"),
  queryId: z.string().regex(/^[a-f0-9]{64}$/),
  query: researchQuerySchema,
  sources: z.array(researchSourceSchema).max(10),
  storedAt: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  reusePolicy: z.literal("public_raw_material_only"),
});
export type PublicResearchCacheRecord = z.infer<typeof publicResearchCacheRecordSchema>;

export type PublicResearchCache = {
  load(queryIds: readonly string[]): Promise<PublicResearchCacheRecord[]>;
  store(records: readonly PublicResearchCacheRecord[]): Promise<void>;
};

export function createPublicResearchCacheRecord(input: {
  query: ResearchQuery;
  sources: ResearchSource[];
  storedAt: Date;
  ttlHours: number;
}): PublicResearchCacheRecord {
  const storedAt = new Date(input.storedAt);
  const validUntil = new Date(storedAt.getTime() + Math.max(1, Math.min(24 * 90, input.ttlHours)) * 3_600_000);
  return publicResearchCacheRecordSchema.parse({
    schemaVersion: "public-research-cache.v2",
    queryId: input.query.id,
    query: input.query,
    sources: input.sources,
    storedAt: storedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    reusePolicy: "public_raw_material_only",
  });
}

export function selectFreshPublicResearchCache(input: {
  plan: ResearchQuery[];
  records: PublicResearchCacheRecord[];
  now: Date;
}): Map<string, PublicResearchCacheRecord> {
  const expected = new Map(input.plan.map((query) => [query.id, query]));
  const fresh = new Map<string, PublicResearchCacheRecord>();
  for (const raw of input.records) {
    const record = publicResearchCacheRecordSchema.parse(raw);
    const query = expected.get(record.queryId);
    if (!query || record.query.id !== query.id || record.query.query !== query.query) continue;
    if (Date.parse(record.validUntil) <= input.now.getTime()) continue;
    fresh.set(record.queryId, record);
  }
  return fresh;
}
