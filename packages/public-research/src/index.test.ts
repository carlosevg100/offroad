import {describe, expect, it} from "vitest";
import {
  assertPublicQuerySafe,
  buildCompanyDebtResearchPlan,
  buildOriginationResearchPlan,
  buildPublicResearchPlan,
  createPublicResearchCacheRecord,
  createOpenAIWebSearchProvider,
  createPerplexitySearchProvider,
  runPublicResearch,
} from "./index";

describe("governed public research", () => {
  it("builds a debt-lens plan with official financial and liquidity searches", () => {
    const plan = buildCompanyDebtResearchPlan({legalName: "Companhia Exemplo S.A.", website: "https://example.com"});
    expect(plan).toHaveLength(8);
    expect(plan.filter((query) => query.domainAllowlist.includes("example.com"))).toHaveLength(3);
    expect(plan.some((query) => query.query.includes("liquidez"))).toBe(true);
    expect(plan.every((query) => query.query.length <= 400)).toBe(true);
  });

  it("builds a bounded origination plan without interpolating meeting context", () => {
    const plan = buildOriginationResearchPlan({
      legalName: "Companhia Exemplo S.A.",
      website: "https://example.com",
      sector: "logística",
      geography: "Brasil",
    });

    expect(plan).toHaveLength(7);
    expect(plan.filter((query) => query.topic === "market")).toHaveLength(2);
    expect(plan.some((query) => query.query.includes("endividamento"))).toBe(true);
    expect(plan.every((query) => query.query.length <= 400)).toBe(true);
  });

  it("builds a bounded plan from public identity fields only", () => {
    const plan = buildPublicResearchPlan({
      legalName: "Rede Horizonte S.A.",
      website: "https://redehorizonte.example.com",
      sector: "varejo alimentar",
      geography: "Brasil",
    });
    expect(plan).toHaveLength(5);
    expect(plan[0]?.domainAllowlist).toEqual(["redehorizonte.example.com"]);
    expect(plan.every((query) => query.id.length === 64)).toBe(true);
  });

  it("blocks private identifiers and financial values before a provider call", () => {
    expect(() => assertPublicQuerySafe("empresa contato cfo@empresa.com")).toThrow();
    expect(() => assertPublicQuerySafe("empresa CNPJ 12.345.678/0001-99")).toThrow();
    expect(() => assertPublicQuerySafe("empresa EBITDA R$ 42 milhões")).toThrow();
  });

  it("uses the current Perplexity Search API shape and preserves source lineage", async () => {
    const provider = createPerplexitySearchProvider({
      apiKey: "secret",
      now: () => new Date("2026-08-26T12:00:00.000Z"),
      fetch: async (_url, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({max_results: 5, max_tokens_per_page: 1600});
        return new Response(JSON.stringify({results: [{
          title: "Site institucional",
          url: "https://empresa.example.com/sobre?utm_source=test",
          snippet: "Descrição pública da companhia.",
          date: "2026-08-20",
        }]}), {status: 200});
      },
    });
    const plan = buildPublicResearchPlan({legalName: "Empresa Exemplo", website: "https://empresa.example.com"}).slice(0, 1);
    const result = await runPublicResearch({plan, providers: [provider]});
    expect(result.status).toBe("succeeded");
    expect(result.sources[0]).toMatchObject({provider: "perplexity", topic: "identity", publishedAt: "2026-08-20"});
    expect(result.sources[0]?.contentHash).toHaveLength(64);
  });

  it("keeps the cited OpenAI web-search passage instead of persisting source URLs without evidence", async () => {
    const provider = createOpenAIWebSearchProvider({
      apiKey: "secret-openai-key",
      now: () => new Date("2026-09-02T12:00:00.000Z"),
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({store: false, max_tool_calls: 1, max_output_tokens: 1_400});
        expect(String(body.input)).toContain("Prefer primary and official sources");
        return new Response(JSON.stringify({output: [
          {type: "web_search_call", action: {sources: [{title: "Release oficial", url: "https://ri.example.com/release"}]}},
          {type: "message", content: [{
            type: "output_text",
            text: "A companhia divulgou seu cronograma de amortização no release oficial.\nOutro fato público.",
            annotations: [{
              type: "url_citation", start_index: 0, end_index: 72,
              title: "Release oficial", url: "https://ri.example.com/release",
            }],
          }]},
        ]}), {status: 200});
      },
    });
    const plan = buildCompanyDebtResearchPlan({legalName: "Empresa Exemplo"}).slice(0, 1);
    const result = await runPublicResearch({plan, providers: [provider]});
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      provider: "openai",
      url: "https://ri.example.com/release",
      snippet: "A companhia divulgou seu cronograma de amortização no release oficial.",
    });
  });

  it("falls back deterministically and abstains when every provider fails", async () => {
    const plan = buildPublicResearchPlan({legalName: "Empresa Exemplo"}).slice(0, 1);
    const result = await runPublicResearch({
      plan,
      providers: [{id: "official", search: async () => { throw Object.assign(new Error("down"), {code: "official_unavailable"}); }}],
    });
    expect(result).toMatchObject({status: "abstained", sources: [], failures: [{provider: "official", code: "official_unavailable"}]});
  });

  it("keeps official evidence and continues to one complementary discovery provider", async () => {
    const plan = buildPublicResearchPlan({legalName: "Empresa Exemplo"}).slice(0, 1);
    const calls: string[] = [];
    const result = await runPublicResearch({
      plan,
      providers: [
        {
          id: "official",
          continueAfterSuccess: true,
          search: async (query) => {
            calls.push("official");
            return [{
              provider: "official", topic: query.topic, title: "Registro oficial",
              url: "https://dados.cvm.gov.br/official", snippet: "Registro público.",
              publishedAt: null, retrievedAt: "2026-09-01T12:00:00.000Z",
              contentHash: "d".repeat(64),
            }];
          },
        },
        {
          id: "perplexity",
          search: async (query) => {
            calls.push("perplexity");
            return [{
              provider: "perplexity", topic: query.topic, title: "Contexto complementar",
              url: "https://example.com/context", snippet: "Contexto público.",
              publishedAt: null, retrievedAt: "2026-09-01T12:00:00.000Z",
              contentHash: "e".repeat(64),
            }];
          },
        },
        {
          id: "openai",
          search: async () => {
            calls.push("openai");
            return [];
          },
        },
      ],
    });
    expect(calls).toEqual(["official", "perplexity"]);
    expect(result.sources.map((source) => source.provider)).toEqual(["official", "perplexity"]);
  });

  it("searches independent topics in parallel while preserving plan order", async () => {
    const plan = buildPublicResearchPlan({legalName: "Empresa Exemplo"});
    let inFlight = 0;
    let peak = 0;
    const result = await runPublicResearch({
      plan,
      providers: [{
        id: "official",
        search: async (query) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return [{
            provider: "official",
            topic: query.topic,
            title: query.topic,
            url: `https://example.com/${query.topic}`,
            snippet: "Fonte pública.",
            publishedAt: null,
            retrievedAt: "2026-08-31T12:00:00.000Z",
            contentHash: "a".repeat(64),
          }];
        },
      }],
    });
    expect(peak).toBe(plan.length);
    expect(result.sources.map((source) => source.topic)).toEqual(plan.map((query) => query.topic));
  });

  it("reuses only fresh public query results and reports the avoided provider call", async () => {
    const plan = buildPublicResearchPlan({legalName: "Empresa Exemplo"}).slice(0, 2);
    const cachedSource = {
      provider: "official" as const,
      topic: plan[0]!.topic,
      title: "Fonte oficial em cache",
      url: "https://example.com/cached",
      snippet: "Informação pública.",
      publishedAt: null,
      retrievedAt: "2026-09-01T10:00:00.000Z",
      contentHash: "b".repeat(64),
    };
    const writes: unknown[] = [];
    const result = await runPublicResearch({
      plan,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      cache: {
        load: async () => [createPublicResearchCacheRecord({
          query: plan[0]!, sources: [cachedSource],
          storedAt: new Date("2026-09-01T10:00:00.000Z"), ttlHours: 24,
        })],
        store: async (records) => { writes.push(...records); },
      },
      providers: [{
        id: "official",
        search: async (query) => [{
          ...cachedSource,
          topic: query.topic,
          title: "Nova fonte oficial",
          url: "https://example.com/new",
          contentHash: "c".repeat(64),
        }],
      }],
    });
    expect(result.metrics).toMatchObject({
      queryCount: 2, cacheHits: 1, providerCalls: 1,
      providerCallsByProvider: {official: 1}, maxCostExposureUsdByProvider: {official: 0},
      cacheWrites: 1,
    });
    expect(result.sources.map((source) => source.title)).toEqual(["Fonte oficial em cache", "Nova fonte oficial"]);
    expect(writes).toHaveLength(1);
  });
});
