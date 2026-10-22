import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({release: null as unknown, error: false}));
vi.mock("./odbl-release", async (original) => {
  const actual = await original<typeof import("./odbl-release")>();
  return {...actual, readOdblRelease: async () => {
    if (state.error) throw new Error("market_odbl_reader_failed");
    return state.release;
  }};
});
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));
vi.mock("@/components/public-site", () => ({PublicShell: ({children}: {children: unknown}) => children}));
vi.mock("next-intl/server", async () => {
  const {createTranslator} = await import("next-intl");
  const catalogues = {"pt-BR": (await import("../../../messages/pt-BR.json")).default, "en-US": (await import("../../../messages/en-US.json")).default};
  const translator = createTranslator as unknown as (config: {locale: string; messages: unknown; namespace: string}) => unknown;
  return {getTranslations: async ({locale, namespace}: {locale: "pt-BR" | "en-US"; namespace: string}) => translator({locale, messages: catalogues[locale], namespace})};
});

import {GET} from "@/app/dados/meta-selic.json/route";
import {SelicOdblPage} from "@/components/market/selic-odbl-page";

const payloadText = `${JSON.stringify({
  alterations: {previous: null}, attribution: "Contém dados do Banco Central do Brasil.", changes: [{decision: "cut", from: "15", meeting: "9002", period: "2025-10-08",
    recordSha256: "b".repeat(64), referenceDate: "2025-10-07", targetPct: "14.5", to: "14.5"}],
  database: "Offroad", format: "offroad.market-odbl.v1",
  license: {appliesTo: "Esta base derivada, inteira.", name: "Open Database License (ODbL) v1.0", uri: "https://opendatacommons.org/licenses/odbl/1-0/"},
  observations: [{acquisitionId: "a", normalization: "bcb-sgs-432", period: "2025-10-08", value: "14.5", versionId: "v"}], publishedAt: "2026-10-22T12:00:00.000000Z",
  reading: {dataBase: "2026-10-22", knowledgeAt: "2026-10-22T12:00:00.000000Z", window: {end: "2026-10-22", start: "2021-01-14"}}, release: "1",
  rules: {codeCommit: "c".repeat(40), contracts: "https://github.com/x/c", database: "https://github.com/x/d", parserAndRules: "https://github.com/x/p", vectors: "https://github.com/x/v"},
  series: {}, source: {attribution: "Banco Central do Brasil", evidenceIds: [], name: "Banco Central do Brasil, SGS 432", sourceLicense: "ODbL-1.0", sourceRevision: "1"},
})}\n`;
const served = {state: "served", releaseNumber: 1, publishedAt: "2026-10-22T12:00:00.000000Z", dataBase: "2026-10-22", sha256: "d".repeat(64),
  byteSize: new TextEncoder().encode(payloadText).length, payload: payloadText};

beforeEach(() => {state.release = {state: "missing"}; state.error = false;});

describe("the ODbL file", () => {
  it("serves the canonical bytes with their digest and safe headers, and no cookie", async () => {
    state.release = served;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(payloadText);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-offroad-sha256")).toBe("d".repeat(64));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("is 404 without an edition, 410 when withdrawn and 503 when the read fails", async () => {
    expect((await GET()).status).toBe(404);
    state.release = {state: "withdrawn", releaseNumber: 2};
    expect((await GET()).status).toBe(410);
    state.error = true;
    expect((await GET()).status).toBe(503);
  });
});

describe("the ODbL page", () => {
  it.each(["pt-BR", "en-US"] as const)("renders the edition, its license and its changes in %s", async (locale) => {
    state.release = served;
    const html = renderToStaticMarkup(await SelicOdblPage({locale}));
    expect(html).toContain("d".repeat(64));
    expect(html).toContain("https://opendatacommons.org/licenses/odbl/1-0/");
    expect(html).toContain("Contém dados do Banco Central do Brasil.");
    expect(html).toContain("/dados/meta-selic.json");
    expect(html).toContain(locale === "pt-BR" ? "14,50%" : "14.50%");
    expect(html).not.toMatch(/[–—]/);
    expect(html).not.toContain("MarketData.");
  });
  it("does not exist without a served edition", async () => {
    await expect(SelicOdblPage({locale: "pt-BR"})).rejects.toThrow("NEXT_NOT_FOUND");
    state.release = {state: "withdrawn", releaseNumber: 2};
    await expect(SelicOdblPage({locale: "pt-BR"})).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("the ODbL page metadata", () => {
  it.each([
    ["pt-BR", () => import("@/app/[locale]/dados/meta-selic/page")],
    ["en-US", () => import("@/app/[locale]/data/selic-target/page")],
  ] as const)("asks to be indexed in %s, overriding the locale default", async (locale, load) => {
    const {generateMetadata} = await load();
    const metadata = await generateMetadata({params: Promise.resolve({locale})});
    expect(metadata.robots).toEqual({index: true, follow: true, googleBot: {index: true, follow: true}});
  });
});
