import {describe, expect, it, vi} from "vitest";
import {createOpenAIWebSearchProvider, createPerplexitySearchProvider} from "@offroad/public-research";
import {createProviderResearchTransport} from "./provider-research-transport";

const query = {id: "synthetic-query", topic: "identity" as const, query: "Synthetic Company official website", domainAllowlist: []};
const endpoint = "https://api.openai.com/v1/responses";
const body = {model: "gpt-5.6-terra", store: false, input: query.query, tools: [{type: "web_search"}]};

describe("research transport retention boundary", () => {
  it("checks the published OpenAI factory on every attempt and stops bytes after revocation", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({output: []})));
    const authorize = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const guarded = createProviderResearchTransport({endpoint, authorize, fetch: transport,
      openaiBinding: {accountRef: "synthetic-org", projectRef: "synthetic-project"}});
    const provider = createOpenAIWebSearchProvider({apiKey: "synthetic-only", fetch: guarded});
    await provider.search(query);
    const sent = transport.mock.calls[0]?.[1];
    expect(new Headers(sent?.headers).get("OpenAI-Organization")).toBe("synthetic-org");
    expect(new Headers(sent?.headers).get("OpenAI-Project")).toBe("synthetic-project");
    expect(sent?.redirect).toBe("error");
    authorize.mockRejectedValue(new Error("processing_resource_ineligible"));
    await expect(provider.search(query)).rejects.toThrow("processing_resource_ineligible");
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("denies an unverified Perplexity search without sending any bytes", async () => {
    const transport = vi.fn<typeof fetch>();
    const authorize = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("processing_connection_unverified"));
    const provider = createPerplexitySearchProvider({apiKey: "synthetic-only", fetch: createProviderResearchTransport({
      endpoint: "https://api.perplexity.ai/search", authorize, fetch: transport,
    })});
    await expect(provider.search(query)).rejects.toThrow("processing_connection_unverified");
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    {...body, store: true}, {...body, background: true}, {...body, previous_response_id: "stored-response"},
    {...body, model: "unreviewed-model"}, {...body, tools: [{type: "file_search"}]},
    {...body, input: "private@example.com"},
  ])("rejects a changed resource contract before transport: %j", async (payload) => {
    const transport = vi.fn<typeof fetch>();
    const authorize = vi.fn<() => Promise<void>>();
    const guarded = createProviderResearchTransport({endpoint, authorize, fetch: transport});
    await expect(guarded(endpoint, {method: "POST", body: JSON.stringify(payload)})).rejects.toThrow();
    expect(authorize).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not follow an alternate endpoint or redirect", async () => {
    const transport = vi.fn<typeof fetch>();
    const guarded = createProviderResearchTransport({endpoint, authorize: async () => {}, fetch: transport});
    await expect(guarded("https://unreviewed.example/responses", {method: "POST", body: JSON.stringify(body)})).rejects.toThrow("processing_transport_route_mismatch");
    expect(transport).not.toHaveBeenCalled();
  });
});
