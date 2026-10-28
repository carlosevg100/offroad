import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
// Integration: import from "@offroad/domain-contracts" once its index exports lote4-received-proposal-result-blocks.
import {readReceivedProposalPacketBlocks} from "../../../../../packages/domain-contracts/src/lote4-received-proposal-result-blocks";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import proposalBlocks from "../../../../../packages/domain-contracts/src/fixtures/received-proposal-result-blocks.json";
import enProposal from "./received-proposal-result.messages.en-US.json";
import ptProposal from "./received-proposal-result.messages.pt-BR.json";
import {ReceivedProposalResult} from "./received-proposal-result";

type Catalog = Record<string, unknown>;
const resolve = (catalog: Catalog, key: string): unknown => key.split(".")
  .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined), catalog);
// The catalogs as they will be once App.workExecutions.receivedProposal is merged into messages/*.json.
const merged = (base: typeof pt, own: Catalog) => ({...base, App: {...base.App, workExecutions: {...base.App.workExecutions, receivedProposal: own}}});
const catalogs = {"pt-BR": merged(pt, ptProposal), "en-US": merged(en as typeof pt, enProposal)};

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: "pt-BR" | "en-US"; namespace: string}) => {
    const catalog = resolve(catalogs[locale] as Catalog, namespace) as Catalog;
    const t = (key: string, values?: Record<string, string>) => {
      const raw = resolve(catalog, key);
      if (typeof raw !== "string") throw new Error(`missing message ${namespace}.${key}`);
      return values ? raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) : raw;
    };
    t.has = (key: string) => typeof resolve(catalog, key) === "string";
    return t;
  },
}));

// The shared fixture is the synthetic Aurora calibration in millions; production packets carry reais, which the
// screen shows in millions. Amount checks scale one value to reais to prove the display unit.
const view = readReceivedProposalPacketBlocks(proposalBlocks)!;
const w = ptProposal;
const unresolved = /(columns|exclusions|facts|readings|recommendations|wouldChange|questions|reasons|positions|families|limits|scenarios|useReadings|netConventions|openQuestions|bases)\.[a-z]/;
const noDash = /[\u2013\u2014]/;

describe("received proposal result (C01)", () => {
  it("leads with the year that weighs most, then the term, covenant, collateral, price and the asks, fact apart from reading and recommendation", async () => {
    expect(view).not.toBeNull();
    const html = renderToStaticMarkup(await ReceivedProposalResult({locale: "pt-BR", view}));
    for (const text of ["Proposta de Itaú", "válida até 13/09/2026", w.didNotSeeIndenture, w.diligence,
      "Em 2027, o serviço da dívida existente é de",
      "encerrado em 30/09/2027", "67% do valor financia uso sazonal", w.useReadings.longer_than_use, "2,40x", "Caso do banco", w.breached,
      "A cobertura de 130% pede", "Rede A (maior cliente)", w.reasons.assignment_prohibited_without_debtor_consent,
      "já ocupados; restam", "a anuência sai até 13/09/2026", "CDI mais 2,10%", "CDI mais 4,90% bruto", "CDI mais 3,24%", w.positions.above_median_within_range,
      "CCB Bradesco de setembro de 2024", "resíduo de 20", "Carência de 12 meses e prazo de 48", "Finame para a linha de embalagem", w.notComparable,
      w.facts.indenture_consent_required, w.readings.improvement_partly_paid_in_collateral, w.recommendations.address_indenture_consent_before_signing,
      w.wouldChange.other_free_asset_for_collateral, w.questions.reciprocity_expected_by_lender, w.process, w.noGaps, w.exclusions.proposal_acceptance]) expect(html).toContain(text);
    expect(html.indexOf(w.liquidityTitle)).toBeLessThan(html.indexOf(w.priceTitle));
    expect(html.indexOf(w.factsTitle)).toBeLessThan(html.indexOf(w.recommendationsTitle));
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("shows amounts in millions of reais and asks for the indexer before any number in a framed packet", async () => {
    const scaled = {...view, liquidity: {...view.liquidity, peak: {...view.liquidity.peak!, existingService: "89679537.12"}}};
    expect(renderToStaticMarkup(await ReceivedProposalResult({locale: "pt-BR", view: scaled}))).toContain("é de 89,7 contra");
    const pledge = {...view, collateral: {...view.collateral, negativePledge: {...view.collateral.negativePledge!, remaining: "3000000"}}};
    expect(renderToStaticMarkup(await ReceivedProposalResult({locale: "pt-BR", view: pledge}))).toContain("restam 3,0");
    const framed = {...view, framing: {...view.framing, firmness: null, process: null, openQuestions: ["indexer_confirmation" as const]},
      liquidity: {peak: null, years: []}, fit: {...view.fit, uses: [], seasonalShare: null}, covenant: {...view.covenant, rows: [], missingTests: []},
      collateral: {collateral: null, reference: null, negativePledge: null}, price: {price: null, market: null, history: null}, asks: [], alternatives: [],
      assessment: {facts: [], readings: [], recommendations: [], wouldChange: [], questions: []}};
    const html = renderToStaticMarkup(await ReceivedProposalResult({locale: "pt-BR", view: framed}));
    expect(html).toContain(w.openQuestions.indexer_confirmation); expect(html).toContain(w.noReading);
    expect(html).not.toContain(w.priceTitle);
  });
  it("states the net cost only when the packet does", async () => {
    const withheld = {...view, price: {...view.price, price: {...view.price.price!, equivalentSpreadNet: null, netConvention: "life_beyond_fiscal_calendar" as const}}};
    const html = renderToStaticMarkup(await ReceivedProposalResult({locale: "pt-BR", view: withheld}));
    expect(html).toContain(w.netConventions.life_beyond_fiscal_calendar); expect(html).not.toContain("CDI mais 3,24%");
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await ReceivedProposalResult({locale: "en-US", view}));
    expect(html).toContain("Proposal from Itaú"); expect(html).toContain("09/13/2026"); expect(html).toContain(enProposal.recommendations.ask_longer_grace_and_tenor);
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
});
