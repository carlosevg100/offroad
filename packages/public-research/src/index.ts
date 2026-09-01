import {createHash} from "node:crypto";
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
  search(query: ResearchQuery): Promise<ResearchSource[]>;
};

export type ResearchRun = {
  status: "succeeded" | "partial" | "abstained";
  queries: ResearchQuery[];
  sources: ResearchSource[];
  failures: Array<{queryId: string; provider: string; code: string}>;
};

/**
 * Builds queries only from a deliberately public subject. Transaction context, financial values,
 * tax ids, contact data and uploaded document text are not accepted by this contract.
 */
export function buildPublicResearchPlan(raw: PublicResearchSubject): ResearchQuery[] {
  const subject = publicResearchSubjectSchema.parse(raw);
  const officialDomain = subject.website ? domainOf(subject.website) : null;
  const geography = subject.geography ? ` ${subject.geography}` : "";
  const sector = subject.sector ? ` ${subject.sector}` : "";
  const candidates: Array<Omit<ResearchQuery, "id">> = [
    {
      topic: "identity",
      query: `${subject.legalName}${geography} site oficial empresa produtos operações`,
      domainAllowlist: officialDomain ? [officialDomain] : [],
    },
    {topic: "news", query: `${subject.legalName}${geography} notícias fatos relevantes`, domainAllowlist: []},
    {topic: "sector", query: `${subject.legalName}${sector}${geography} setor mercado concorrência`, domainAllowlist: []},
    {topic: "regulation", query: `${subject.sector ?? subject.legalName}${geography} regulação riscos setoriais`, domainAllowlist: []},
    {topic: "market", query: `${subject.sector ?? subject.legalName}${geography} mercado tendências indicadores públicos`, domainAllowlist: []},
  ];
  return candidates.map((candidate) => {
    assertPublicQuerySafe(candidate.query);
    return researchQuerySchema.parse({...candidate, id: sha256(`${candidate.topic}:${candidate.query}`)});
  });
}

/**
 * Public research for a meeting/origination thesis. It is deliberately broader than the first
 * onboarding read: company identity and recent events are joined by official financial/debt
 * disclosure and observed debt transactions. The meeting brief is never interpolated here, so
 * a user cannot leak non-public context into an external search request.
 */
export function buildOriginationResearchPlan(raw: PublicResearchSubject): ResearchQuery[] {
  const subject = publicResearchSubjectSchema.parse(raw);
  const officialDomain = subject.website ? domainOf(subject.website) : null;
  const geography = subject.geography ? ` ${subject.geography}` : "";
  const sector = subject.sector ? ` ${subject.sector}` : "";
  const candidates: Array<Omit<ResearchQuery, "id">> = [
    {
      topic: "identity",
      query: `${subject.legalName}${geography} site oficial empresa produtos operações`,
      domainAllowlist: officialDomain ? [officialDomain] : [],
    },
    {
      topic: "identity",
      query: `${subject.legalName}${geography} resultados financeiros endividamento relatório anual investidores`,
      domainAllowlist: officialDomain ? [officialDomain] : [],
    },
    {topic: "news", query: `${subject.legalName}${geography} notícias fatos relevantes últimos 18 meses`, domainAllowlist: []},
    {topic: "sector", query: `${subject.legalName}${sector}${geography} setor concorrência drivers riscos`, domainAllowlist: []},
    {topic: "regulation", query: `${subject.sector ?? subject.legalName}${geography} regulação riscos setoriais`, domainAllowlist: []},
    {topic: "market", query: `${subject.legalName}${geography} dívida empréstimo debênture financiamento mercado de capitais`, domainAllowlist: []},
    {topic: "market", query: `${subject.sector ?? subject.legalName}${geography} transações comparáveis dívida debênture crédito privado`, domainAllowlist: []},
  ];
  return candidates.map((candidate) => {
    assertPublicQuerySafe(candidate.query);
    return researchQuerySchema.parse({...candidate, id: sha256(`${candidate.topic}:${candidate.query}`)});
  });
}

export async function runPublicResearch(input: {
  plan: ResearchQuery[];
  providers: PublicSearchProvider[];
  maxSourcesPerQuery?: number;
}): Promise<ResearchRun> {
  const plan = z.array(researchQuerySchema).min(1).max(12).parse(input.plan);
  const maxSources = Math.min(10, Math.max(1, input.maxSourcesPerQuery ?? 5));
  // The topics are independent. Run them concurrently so the first reading waits for the
  // slowest bounded search, not the sum of five network round trips. Provider fallback remains
  // sequential inside each topic and Promise.all preserves the plan's deterministic order.
  const queryResults = await Promise.all(plan.map(async (query) => {
    assertPublicQuerySafe(query.query);
    const failures: ResearchRun["failures"] = [];
    for (const provider of input.providers) {
      try {
        const returned = z.array(researchSourceSchema).parse(await provider.search(query));
        return {sources: returned.slice(0, maxSources), failures};
      } catch (error) {
        failures.push({queryId: query.id, provider: provider.id, code: stableErrorCode(error)});
      }
    }
    if (input.providers.length === 0) {
      failures.push({queryId: query.id, provider: "none", code: "provider_unavailable"});
    }
    return {sources: [] as ResearchSource[], failures};
  }));
  const sources = queryResults.flatMap((result) => result.sources);
  const failures = queryResults.flatMap((result) => result.failures);
  const unique = [...new Map(sources.map((source) => [`${source.topic}:${canonicalUrl(source.url)}`, source])).values()];
  return {
    status: unique.length === 0 ? "abstained" : failures.length > 0 ? "partial" : "succeeded",
    queries: plan,
    sources: unique,
    failures,
  };
}

export function createPerplexitySearchProvider(input: {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): PublicSearchProvider {
  const request = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  return {
    id: "perplexity",
    async search(query) {
      const response = await request("https://api.perplexity.ai/search", {
        method: "POST",
        headers: {Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json"},
        body: JSON.stringify({
          query: query.query,
          max_results: 5,
          max_tokens: 8_000,
          max_tokens_per_page: 1_600,
          ...(query.country ? {country: query.country} : {}),
          ...(query.domainAllowlist.length > 0 ? {search_domain_filter: query.domainAllowlist} : {}),
        }),
      });
      if (!response.ok) throw Object.assign(new Error("perplexity search failed"), {code: `perplexity_http_${response.status}`});
      const payload = perplexityResponseSchema.parse(await response.json());
      return payload.results.map((result) => source({
        provider: "perplexity",
        topic: query.topic,
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        publishedAt: result.date ?? null,
        retrievedAt: now().toISOString(),
      }));
    },
  };
}

export function createOpenAIWebSearchProvider(input: {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): PublicSearchProvider {
  const request = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  return {
    id: "openai",
    async search(query) {
      const response = await request("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json"},
        body: JSON.stringify({
          model: input.model ?? "gpt-5.6-terra",
          store: false,
          input: query.query,
          tools: [{type: "web_search", ...(query.domainAllowlist.length > 0 ? {filters: {allowed_domains: query.domainAllowlist}} : {})}],
          tool_choice: "required",
          max_tool_calls: 1,
          include: ["web_search_call.action.sources"],
        }),
      });
      if (!response.ok) throw Object.assign(new Error("openai web search failed"), {code: `openai_http_${response.status}`});
      const payload = openAIResponseSchema.parse(await response.json());
      const candidates = payload.output.flatMap((item) => [
        ...(item.type === "web_search_call" ? item.action?.sources ?? [] : []),
        ...(item.type === "message" ? item.content.flatMap((content) => content.annotations ?? []) : []),
      ]);
      return [...new Map(candidates.filter((candidate) => candidate.url).map((candidate) => [canonicalUrl(candidate.url!), candidate])).values()]
        .map((candidate) => source({
          provider: "openai",
          topic: query.topic,
          title: candidate.title ?? new URL(candidate.url!).hostname,
          url: candidate.url!,
          snippet: "",
          publishedAt: null,
          retrievedAt: now().toISOString(),
        }));
    },
  };
}

export function assertPublicQuerySafe(query: string): void {
  const blockedPatterns = [
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    /\b\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/]?\d{4}[-\s]?\d{2}\b/,
    /(?:\d[.\s-]?){11,14}/,
    /(?:R\$|US\$|BRL|USD)\s*\d/i,
    /\b(?:ebitda|receita|faturamento|d[ií]vida|alavancagem|dscr|covenant)\s*[:=]?\s*\d/i,
  ];
  if (blockedPatterns.some((pattern) => pattern.test(query))) {
    throw Object.assign(new Error("private terms are not allowed in a public query"), {code: "unsafe_public_query"});
  }
}

const perplexityResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string().min(1),
    url: z.url(),
    snippet: z.string().default(""),
    date: z.string().nullish(),
  })),
});

const webSourceSchema = z.object({title: z.string().optional(), url: z.url().optional()});
const openAIResponseSchema = z.object({
  output: z.array(z.object({
    type: z.string(),
    action: z.object({sources: z.array(webSourceSchema).default([])}).optional(),
    content: z.array(z.object({annotations: z.array(webSourceSchema).default([])})).default([]),
  }).passthrough()).default([]),
});

function source(input: Omit<ResearchSource, "contentHash">): ResearchSource {
  return researchSourceSchema.parse({...input, contentHash: sha256(`${canonicalUrl(input.url)}\n${input.snippet}`)});
}

function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function canonicalUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) if (key.startsWith("utm_") || key === "gclid") parsed.searchParams.delete(key);
  return parsed.toString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code.slice(0, 100);
  return "search_provider_failed";
}
