import {z} from "zod";

export const researchTopics = ["identity", "news", "sector", "regulation", "market"] as const;
export const researchTopicSchema = z.enum(researchTopics);
export type ResearchTopic = z.infer<typeof researchTopicSchema>;

export const publicResearchSubjectSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  website: z.url().optional(),
  sector: z.string().trim().min(2).max(120).optional(),
  geography: z.string().trim().min(2).max(80).optional(),
});
export type PublicResearchSubject = z.infer<typeof publicResearchSubjectSchema>;

export const researchQuerySchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  topic: researchTopicSchema,
  query: z.string().trim().min(3).max(400),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  domainAllowlist: z.array(z.string().min(3).max(253)).max(20).default([]),
});
export type ResearchQuery = z.infer<typeof researchQuerySchema>;

export const researchSourceSchema = z.object({
  provider: z.enum(["perplexity", "openai", "official", "mcp"]),
  topic: researchTopicSchema,
  title: z.string().trim().min(1).max(500),
  url: z.url(),
  snippet: z.string().trim().max(8_000).default(""),
  publishedAt: z.string().nullable().default(null),
  retrievedAt: z.iso.datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ResearchSource = z.infer<typeof researchSourceSchema>;

export type PublicSearchProvider = {
  readonly id: ResearchSource["provider"];
  readonly maxCostUsdPerCall?: number;
  search(query: ResearchQuery): Promise<ResearchSource[]>;
};

export type ResearchRun = {
  status: "succeeded" | "partial" | "abstained";
  queries: ResearchQuery[];
  sources: ResearchSource[];
  failures: Array<{queryId: string; provider: string; code: string}>;
  metrics: {
    queryCount: number;
    cacheHits: number;
    providerCalls: number;
    providerCallsByProvider: Record<string, number>;
    maxCostExposureUsdByProvider: Record<string, number>;
    cacheWrites: number;
    cacheReadFailed: boolean;
    cacheWriteFailed: boolean;
  };
};
