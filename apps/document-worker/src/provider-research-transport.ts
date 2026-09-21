import {assertPublicQuerySafe} from "@offroad/public-research";

/** Guards the transport of the already-published research library without rewriting its
 * pinned source closure. Every POST, including a provider fallback, asks live authority. */
export function createProviderResearchTransport(input: {
  endpoint: string;
  authorize: () => Promise<void>;
  openaiBinding?: {accountRef: string; projectRef: string};
  fetch?: typeof fetch;
}): typeof fetch {
  const transport = input.fetch ?? fetch;
  return async (url, init) => {
    if (typeof url !== "string" || url !== input.endpoint || init?.method !== "POST" || typeof init.body !== "string")
      throw new Error("processing_transport_route_mismatch");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (url === "https://api.perplexity.ai/search") {
      if (typeof body.query !== "string") throw new Error("processing_public_query_required");
      assertPublicQuerySafe(body.query);
    } else if (url === "https://api.openai.com/v1/responses") {
      if (body.model !== "gpt-5.6-terra" || body.store !== false || body.background || body.previous_response_id ||
        typeof body.input !== "string" || !Array.isArray(body.tools) || body.tools.length !== 1 ||
        (body.tools[0] as {type?: string}).type !== "web_search") throw new Error("processing_transport_resource_mismatch");
      assertPublicQuerySafe(body.input);
    } else if (url === "https://api.firecrawl.dev/v2/scrape") {
      if (typeof body.url !== "string" || body.storeInCache !== false) throw new Error("processing_transport_resource_mismatch");
      const target = new URL(body.url);
      if (target.protocol !== "https:" || target.username || target.password || target.hash) throw new Error("processing_public_url_required");
    } else throw new Error("processing_transport_route_unknown");
    const headers = new Headers(init.headers);
    if (input.openaiBinding) {
      headers.set("OpenAI-Organization", input.openaiBinding.accountRef);
      headers.set("OpenAI-Project", input.openaiBinding.projectRef);
    }
    await input.authorize();
    return transport(url, {...init, headers, redirect: "error"});
  };
}
