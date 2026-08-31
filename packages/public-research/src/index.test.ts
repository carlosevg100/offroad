import {describe, expect, it} from "vitest";
import {
  assertPublicQuerySafe,
  buildPublicResearchPlan,
  createPerplexitySearchProvider,
  runPublicResearch,
} from "./index";

describe("governed public research", () => {
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

  it("falls back deterministically and abstains when every provider fails", async () => {
    const plan = buildPublicResearchPlan({legalName: "Empresa Exemplo"}).slice(0, 1);
    const result = await runPublicResearch({
      plan,
      providers: [{id: "official", search: async () => { throw Object.assign(new Error("down"), {code: "official_unavailable"}); }}],
    });
    expect(result).toMatchObject({status: "abstained", sources: [], failures: [{provider: "official", code: "official_unavailable"}]});
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
});
