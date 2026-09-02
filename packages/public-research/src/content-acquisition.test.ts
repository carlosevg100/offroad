import {describe, expect, it} from "vitest";
import {createDirectPublicContentAcquirer, createFirecrawlPublicContentAcquirer} from "./content-acquisition";

const publicDns = async () => ["8.8.8.8"];

describe("public content acquisition", () => {
  it("keeps publisher authority separate from the direct acquisition mechanism", async () => {
    const acquire = createDirectPublicContentAcquirer({
      resolveHost: publicDns,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      fetch: async () => new Response("official filing", {status: 200, headers: {"content-type": "text/plain"}}),
    });
    const result = await acquire({url: "https://dados.cvm.gov.br/filing.txt"});
    expect(result.lineage).toMatchObject({
      publisherSourceId: "cvm_open_data", publisherAuthorityTier: 1, acquiredBy: "direct_https",
    });
    expect(result.lineage.contentHash).toHaveLength(64);
  });

  it("rejects a redirect to a private address before issuing the redirected request", async () => {
    let calls = 0;
    const acquire = createDirectPublicContentAcquirer({
      resolveHost: async (hostname) => hostname === "example.com" ? ["8.8.8.8"] : ["127.0.0.1"],
      fetch: async () => {
        calls += 1;
        return new Response(null, {status: 302, headers: {location: "https://internal.example/private"}});
      },
    });
    await expect(acquire({url: "https://example.com/start"})).rejects.toMatchObject({code: "public_url_private_address"});
    expect(calls).toBe(1);
  });

  it("uses Firecrawl only as zero-retention acquisition for an already public issuer URL", async () => {
    const acquire = createFirecrawlPublicContentAcquirer({
      apiKey: "fc-test-key",
      zeroDataRetention: true,
      resolveHost: publicDns,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      fetch: async (_url, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({storeInCache: false, zeroDataRetention: true});
        return new Response(JSON.stringify({
          success: true,
          data: {markdown: "# Resultado trimestral", metadata: {sourceURL: "https://ri.camil.com.br/resultados"}},
        }), {status: 200});
      },
    });
    const result = await acquire({url: "https://ri.camil.com.br/resultados", issuerDomains: ["ri.camil.com.br"]});
    expect(result.lineage).toMatchObject({publisherSourceId: "issuer_ir", acquiredBy: "firecrawl"});
    expect(result.content).toBe("# Resultado trimestral");
  });
});
