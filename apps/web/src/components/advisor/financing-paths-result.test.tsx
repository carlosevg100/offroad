import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {readFinancingPathsPacketBlocks} from "../../../../../packages/domain-contracts/src/lote4-financing-paths-result-blocks";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import blocks from "../../../../../packages/domain-contracts/src/fixtures/financing-paths-result-blocks.json";
import packet from "../../../../../packages/domain-contracts/src/fixtures/financing-paths-result-packet.json";
import own from "./financing-paths-result.messages.json";
import {readFinancingPathsResult} from "@/lib/execution/financing-paths-read";
import {FinancingPathsResult} from "./financing-paths-result";

type Catalog = Record<string, unknown>;
const resolve = (catalog: Catalog, key: string): unknown => key.split(".")
  .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined), catalog);
// This method's copy travels with the component until it joins App.workExecutions.financingPaths in the catalogs.
const withOwn = (catalog: Catalog, locale: "pt-BR" | "en-US") => {
  const c = structuredClone(catalog) as {App: {workExecutions: Catalog}};
  c.App.workExecutions.financingPaths = own[locale];
  return c as unknown as Catalog;
};
const catalogs = {"pt-BR": withOwn(pt as Catalog, "pt-BR"), "en-US": withOwn(en as Catalog, "en-US")};

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: "pt-BR" | "en-US"; namespace: string}) => {
    const catalog = resolve(catalogs[locale], namespace) as Catalog;
    const t = (key: string, values?: Record<string, string>) => {
      const raw = resolve(catalog, key);
      if (typeof raw !== "string") throw new Error(`missing message ${namespace}.${key}`);
      return values ? raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) : raw;
    };
    t.has = (key: string) => typeof resolve(catalog, key) === "string";
    return t;
  },
}));

const view = readFinancingPathsPacketBlocks(blocks)!;
const keysOf = (o: unknown, prefix = ""): string[] => o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keysOf(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)];
const unresolved = /(columns|roles|gates|codes|exclusions)\.[a-z]/;
const noDash = /[\u2013\u2014]/;
const f = own["pt-BR"];

describe("financing paths result (C32)", () => {
  it("leads with what happens without action, then the recommended path, the alternative, every path, cash, amortization and what would change it", async () => {
    expect(view).not.toBeNull();
    const html = renderToStaticMarkup(await FinancingPathsResult({locale: "pt-BR", view}));
    for (const text of ["a partir de 31/12/2026", "chega a -78,6 em 31/12/2027", "Em 2027, o serviço da dívida soma 89,7", "faltam 54,0",
      "Sem a linha agora: giro de R$ 17 mi e debênture de R$ 80 mi", "Caixa mínimo de 15,5 em 31/12/2026", "custo financeiro de 49,44", "dívida líquida de 79,3",
      "2,20x (31/12/2026)", "contra o limite de 3,00x", "2,37x em 31/12/2027", "política do conselho de 2,50x", "Debênture da 2ª emissão, R$ 80 mi, com alvo de 80,0",
      "dentro dos critérios é 74,4", "Amortização de 2029 a 2033", "CDI mais 3,46%", "de 3,00%", "CDI mais 3,56%", f.insideAtCondition,
      "Sondagem até 31/10/2026; decisão da rota até 15/11/2026", "vencimento de CCB Bradesco, em 15/09/2027: 304 dias", "Pré-paga: Debênture 2021, CCB Bradesco",
      "Sem a linha: giro de R$ 17 mi e alongamento bancário de R$ 70 mi", f.gates.basket_without_consent, f.roles.companion, f.insideEveryGate,
      "Amortização de 2029 a 2031", "Falta caixa a partir de 2029", "abaixo de 74,4", f.codes.facts.indenture_basket_partly_occupied,
      f.codes.recommendations.review_project_before_committing, f.process, f.exclusions.legal_opinion_on_indenture]) expect(html).toContain(text);
    expect(html.indexOf(f.withoutActionTitle)).toBeLessThan(html.indexOf(f.recommendationTitle));
    expect(html.indexOf(f.recommendationTitle)).toBeLessThan(html.indexOf(f.pathsTitle));
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("says so when no path passes every gate, and never invents one", async () => {
    const html = renderToStaticMarkup(await FinancingPathsResult({locale: "pt-BR", view: {...view, recommendation: null, alternative: null}}));
    expect(html).toContain(f.noRecommendation); expect(html).not.toContain(f.alternativeTitle);
  });
  it("speaks the viewer's locale, with the same keys in both catalogs and no dash", async () => {
    const html = renderToStaticMarkup(await FinancingPathsResult({locale: "en-US", view}));
    expect(html).toContain(own["en-US"].title); expect(html).toContain("12/31/2026"); expect(html).toContain("2.20x");
    expect(keysOf(own["en-US"]).sort()).toEqual(keysOf(own["pt-BR"]).sort());
    expect(JSON.stringify(own)).not.toMatch(noDash);
  });
  it("reads committed bytes through the published packet schema and the same blocks", () => {
    expect(readFinancingPathsResult("{")).toBeNull();
    expect(readFinancingPathsResult(JSON.stringify(packet))).toEqual(view);
    // A packet whose recommendation is not the gates' is refused by the published schema before any block.
    const forged = structuredClone(packet) as {readings: {recommendation: {pathId: string}}};
    forged.readings.recommendation.pathId = "debenture-com-linha";
    expect(readFinancingPathsResult(JSON.stringify(forged))).toBeNull();
  });
});
