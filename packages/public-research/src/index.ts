import {createHash} from "node:crypto";
import {z} from "zod";
import {
  publicResearchSubjectSchema,
  researchQuerySchema,
  researchSourceSchema,
  type PublicResearchSubject,
  type PublicSearchProvider,
  type ResearchQuery,
  type ResearchRun,
  type ResearchSource,
} from "./contracts";
import {
  createPublicResearchCacheRecord,
  selectFreshPublicResearchCache,
  type PublicResearchCache,
  type PublicResearchCacheRecord,
} from "./cache";

export * from "./contracts";
export * from "./cache";
export * from "./source-registry";
export * from "./entity-resolvers";
export * from "./content-acquisition";
export * from "./official-company-research";

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

/** Public research for a debt-lens diagnostic. The plan looks for official financial, liquidity
 * and debt disclosure but never interpolates the user's private context into an external query. */
export function buildCompanyDebtResearchPlan(raw: PublicResearchSubject): ResearchQuery[] {
  const subject = publicResearchSubjectSchema.parse(raw);
  const officialDomain = subject.website ? domainOf(subject.website) : null;
  const geography = subject.geography ? ` ${subject.geography}` : "";
  const sector = subject.sector ? ` ${subject.sector}` : "";
  const candidates: Array<Omit<ResearchQuery, "id">> = [
    {topic: "identity", query: `${subject.legalName}${geography} site oficial operações segmentos clientes`, domainAllowlist: officialDomain ? [officialDomain] : []},
    {topic: "identity", query: `${subject.legalName}${geography} resultados financeiros demonstrações relatório anual investidores`, domainAllowlist: officialDomain ? [officialDomain] : []},
    {topic: "identity", query: `${subject.legalName}${geography} endividamento liquidez vencimentos garantias covenants`, domainAllowlist: officialDomain ? [officialDomain] : []},
    {topic: "news", query: `${subject.legalName}${geography} notícias fatos relevantes últimos 18 meses`, domainAllowlist: []},
    {topic: "sector", query: `${subject.legalName}${sector}${geography} setor drivers margens capital de giro riscos`, domainAllowlist: []},
    {topic: "regulation", query: `${subject.sector ?? subject.legalName}${geography} regulação riscos setoriais crédito`, domainAllowlist: []},
    {topic: "market", query: `${subject.legalName}${geography} rating dívida debênture empréstimo financiamento`, domainAllowlist: []},
    {topic: "market", query: `${subject.sector ?? subject.legalName}${geography} comparáveis dívida crédito privado mercado de capitais`, domainAllowlist: []},
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
  cache?: PublicResearchCache;
  cacheTtlHours?: number;
  now?: () => Date;
}): Promise<ResearchRun> {
  const plan = z.array(researchQuerySchema).min(1).max(12).parse(input.plan);
  const maxSources = Math.min(10, Math.max(1, input.maxSourcesPerQuery ?? 5));
  const now = input.now ?? (() => new Date());
  let cacheReadFailed = false;
  let cacheWriteFailed = false;
  let cached = new Map<string, PublicResearchCacheRecord>();
  if (input.cache) {
    try {
      cached = selectFreshPublicResearchCache({
        plan,
        records: await input.cache.load(plan.map((query) => query.id)),
        now: now(),
      });
    } catch {
      cacheReadFailed = true;
    }
  }
  let providerCalls = 0;
  const providerCallsByProvider: Record<string, number> = {};
  const maxCostExposureUsdByProvider: Record<string, number> = {};
  // The topics are independent. Run them concurrently so the first reading waits for the
  // slowest bounded search, not the sum of five network round trips. Provider fallback remains
  // sequential inside each topic and Promise.all preserves the plan's deterministic order.
  const queryResults = await Promise.all(plan.map(async (query) => {
    assertPublicQuerySafe(query.query);
    const cacheHit = cached.get(query.id);
    if (cacheHit) return {sources: cacheHit.sources.slice(0, maxSources), failures: [], cacheHit: true};
    const failures: ResearchRun["failures"] = [];
    const collected: ResearchSource[] = [];
    for (const provider of input.providers) {
      try {
        providerCalls += 1;
        providerCallsByProvider[provider.id] = (providerCallsByProvider[provider.id] ?? 0) + 1;
        maxCostExposureUsdByProvider[provider.id] =
          (maxCostExposureUsdByProvider[provider.id] ?? 0) + (
            provider.maxCostUsdPerCall ?? (provider.id === "perplexity" ? 0.005 : provider.id === "openai" ? 0.02 : 0)
          );
        const returned = z.array(researchSourceSchema).parse(await provider.search(query));
        if (returned.length === 0) continue;
        collected.push(...returned);
        if (!provider.continueAfterSuccess) {
          return {sources: collected.slice(0, maxSources), failures, cacheHit: false};
        }
      } catch (error) {
        failures.push({queryId: query.id, provider: provider.id, code: stableErrorCode(error)});
      }
    }
    if (input.providers.length === 0) {
      failures.push({queryId: query.id, provider: "none", code: "provider_unavailable"});
    }
    return {sources: collected.slice(0, maxSources), failures, cacheHit: false};
  }));
  const cacheRecords = queryResults.flatMap((result, index) => {
    if (result.cacheHit || result.sources.length === 0) return [];
    return [createPublicResearchCacheRecord({
      query: plan[index]!,
      sources: result.sources,
      storedAt: now(),
      ttlHours: input.cacheTtlHours ?? 24,
    })];
  });
  if (input.cache && cacheRecords.length > 0) {
    try {
      await input.cache.store(cacheRecords);
    } catch {
      cacheWriteFailed = true;
    }
  }
  const sources = queryResults.flatMap((result) => result.sources);
  const failures = queryResults.flatMap((result) => result.failures);
  const unique = [...new Map(sources.map((source) => [`${source.topic}:${canonicalUrl(source.url)}`, source])).values()];
  return {
    status: unique.length === 0 ? "abstained" : failures.length > 0 ? "partial" : "succeeded",
    queries: plan,
    sources: unique,
    failures,
    metrics: {
      queryCount: plan.length,
      cacheHits: queryResults.filter((result) => result.cacheHit).length,
      providerCalls,
      providerCallsByProvider,
      maxCostExposureUsdByProvider,
      cacheWrites: cacheWriteFailed ? 0 : cacheRecords.length,
      cacheReadFailed,
      cacheWriteFailed,
    },
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
    maxCostUsdPerCall: 0.005,
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
    // Conservative budgeting ceiling; provider billing telemetry remains actual cost.
    maxCostUsdPerCall: 0.02,
    async search(query) {
      const response = await request("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json"},
        body: JSON.stringify({
          model: input.model ?? "gpt-5.6-terra",
          store: false,
          input: [
            "Research the public debt-intelligence query below.",
            "Return at most five concise factual findings and cite every finding inline.",
            "Prefer primary and official sources. Do not infer facts that the sources do not support.",
            `Query: ${query.query}`,
          ].join("\n"),
          tools: [{type: "web_search", ...(query.domainAllowlist.length > 0 ? {filters: {allowed_domains: query.domainAllowlist}} : {})}],
          tool_choice: "required",
          max_tool_calls: 1,
          max_output_tokens: 1_400,
          include: ["web_search_call.action.sources"],
        }),
      });
      if (!response.ok) throw Object.assign(new Error("openai web search failed"), {code: `openai_http_${response.status}`});
      const payload = openAIResponseSchema.parse(await response.json());
      const candidates = payload.output.flatMap((item) => {
        if (item.type === "web_search_call") return (item.action?.sources ?? []).map((candidate) => ({...candidate, snippet: ""}));
        if (item.type !== "message") return [];
        return item.content.flatMap((content) => content.annotations.map((annotation) => ({
          ...annotation,
          snippet: citationContext(content.text, annotation.start_index, annotation.end_index),
        })));
      });
      const byUrl = new Map<string, (typeof candidates)[number]>();
      for (const candidate of candidates) {
        if (!candidate.url) continue;
        const key = canonicalUrl(candidate.url);
        const prior = byUrl.get(key);
        // The web-search call lists every consulted URL; the message annotations identify the
        // exact sourced passage. Preserve the latter whenever both shapes name the same URL.
        if (!prior || candidate.snippet.length > prior.snippet.length) byUrl.set(key, candidate);
      }
      return [...byUrl.values()].map((candidate) => source({
          provider: "openai",
          topic: query.topic,
          title: candidate.title ?? new URL(candidate.url!).hostname,
          url: candidate.url!,
          snippet: candidate.snippet,
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

const webSourceSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  url: z.url().optional(),
  start_index: z.number().int().nonnegative().optional(),
  end_index: z.number().int().nonnegative().optional(),
});
const openAIResponseSchema = z.object({
  output: z.array(z.object({
    type: z.string(),
    action: z.object({sources: z.array(webSourceSchema).default([])}).optional(),
    content: z.array(z.object({
      text: z.string().default(""),
      annotations: z.array(webSourceSchema).default([]),
    })).default([]),
  }).passthrough()).default([]),
});

function citationContext(text: string, start: number | undefined, end: number | undefined): string {
  if (!text.trim()) return "";
  if (start === undefined || end === undefined || start > text.length || end < start) {
    return text.trim().slice(0, 2_000);
  }
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const paragraphStart = Math.max(0, text.lastIndexOf("\n", safeStart - 1) + 1);
  // Citation indices can include the rendered citation marker and therefore point one or two
  // characters past a paragraph break. Anchor the end to the paragraph that contains the
  // citation start; otherwise the next uncited paragraph would be attributed to this URL.
  const nextBreak = text.indexOf("\n", safeStart);
  const paragraphEnd = nextBreak === -1 ? text.length : nextBreak;
  return text.slice(paragraphStart, paragraphEnd).trim().slice(0, 2_000);
}

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
