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

describe("sniffContentType", () => {
  it("trusts the file signature over a generic declared type", async () => {
    const {sniffContentType} = await import("./content-acquisition");
    const pdf = new TextEncoder().encode("%PDF-1.7 rest");
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(sniffContentType("text/html; charset=utf-8", pdf)).toBe("application/pdf");
    expect(sniffContentType("application/octet-stream", zip)).toBe("application/zip");
  });

  it("keeps a specific declared type and keeps text that is really text", async () => {
    const {sniffContentType} = await import("./content-acquisition");
    const html = new TextEncoder().encode("<!doctype html><html></html>");
    expect(sniffContentType("text/html", html)).toBe("text/html");
    expect(sniffContentType("text/csv", new TextEncoder().encode("%PDF-1.7"))).toBe("text/csv");
    expect(sniffContentType("application/pdf", html)).toBe("application/pdf");
  });

  it("recognises JSON served as html, and leaves html that merely starts with a brace alone", async () => {
    const {sniffContentType} = await import("./content-acquisition");
    const json = new TextEncoder().encode('[{"data":"01/09/2026","valor":"0.051660"}]');
    const notJson = new TextEncoder().encode("{not json at all");
    expect(sniffContentType("text/html; charset=utf-8", json)).toBe("application/json");
    expect(sniffContentType("text/html", notJson)).toBe("text/html");
  });
});
