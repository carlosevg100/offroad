import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {readCovenantHeadroomPacketBlocks, readDebtTablePacketBlocks, readWeeklyCashPacketBlocks} from "@offroad/domain-contracts";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import covenantBlocks from "../../../../../packages/domain-contracts/src/fixtures/covenant-headroom-result-blocks.json";
import debtTableBlocks from "../../../../../packages/domain-contracts/src/fixtures/debt-table-result-blocks.json";
import weeklyBlocks from "../../../../../packages/domain-contracts/src/fixtures/weekly-cash-result-blocks.json";
import {CovenantHeadroomResult} from "./covenant-headroom-result";
import {DebtTableResult} from "./debt-table-result";
import {WeeklyCashResult} from "./weekly-cash-result";

type Catalog = Record<string, unknown>;
const resolve = (catalog: Catalog, key: string): unknown => key.split(".")
  .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined), catalog);

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) => {
    const catalog = resolve((locale === "en-US" ? en : pt) as Catalog, namespace) as Catalog;
    const t = (key: string, values?: Record<string, string>) => {
      const raw = resolve(catalog, key);
      if (typeof raw !== "string") throw new Error(`missing message ${namespace}.${key}`);
      return values ? raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) : raw;
    };
    t.has = (key: string) => typeof resolve(catalog, key) === "string";
    return t;
  },
}));

// The shared fixtures are synthetic calibrations in millions; production packets carry reais, which
// the screen shows in millions. Amount checks scale one value to reais to prove the display unit.
const debtTable = readDebtTablePacketBlocks(debtTableBlocks)!;
const covenant = readCovenantHeadroomPacketBlocks(covenantBlocks)!;
const weekly = readWeeklyCashPacketBlocks(weeklyBlocks)!;
const unresolved = /(columns|exclusions|components|kinds|scenarios|accelerations|categories|obligations|requests|Statuses)\./;

describe("debt table result (C10)", () => {
  it("shows each instrument with its terms, the views with the bridge, cross-default, leverage and the completeness request", async () => {
    expect(debtTable).not.toBeNull();
    const html = renderToStaticMarkup(await DebtTableResult({locale: "pt-BR", view: debtTable}));
    for (const r of debtTable.instruments) for (const text of [r.label, r.creditor, r.guarantee]) expect(html).toContain(text);
    for (const v of debtTable.views) expect(html).toContain(v.label);
    for (const text of ["CDI + 2,40%", "15/06/2028", "30/06/2026", "2,02x", "1,86x", "28,2%", "46,2%", "Fiança bancária", "Conta garantida", "arrendamentos",
      pt.App.workExecutions.debtTable.requests.external_register_of_financial_institution_operations, pt.App.workExecutions.debtTable.completenessStatuses.unproven,
      pt.App.workExecutions.debtTable.noGaps, pt.App.workExecutions.debtTable.exclusions.contract_extraction]) expect(html).toContain(text);
    expect(html).not.toMatch(unresolved);
  });
  it("shows amounts in millions of reais with one decimal", async () => {
    const view = {...debtTable, views: debtTable.views.map((v, n) => n ? v : {...v, total: "130000000", netDebt: "95400000"})};
    const html = renderToStaticMarkup(await DebtTableResult({locale: "pt-BR", view}));
    expect(html).toContain("<td>130,0</td><td>95,4</td>");
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await DebtTableResult({locale: "en-US", view: debtTable}));
    expect(html).toContain(en.App.workExecutions.debtTable.title); expect(html).toContain("06/30/2026");
  });
});

describe("covenant headroom result (C12)", () => {
  it("leads with the date, the ratio and the tightest limit, then headroom per limit, contrasts apart, consequence and gaps", async () => {
    expect(covenant).not.toBeNull();
    const html = renderToStaticMarkup(await CovenantHeadroomResult({locale: "pt-BR", view: covenant}));
    expect(html).toContain("Em 31/12/2026, dívida líquida sobre EBITDA de 2,20x; o limite mais apertado é Política do conselho: até 2,5x.");
    for (const text of [pt.App.workExecutions.covenantHeadroom.policyBindsFirst, pt.App.workExecutions.covenantHeadroom.contrasts, pt.App.workExecutions.covenantHeadroom.noBreach,
      "52,9%", "Safra na data de apuração", "0,49x", "Assembleia de debenturistas", pt.App.workExecutions.covenantHeadroom.questions.ebitda_definition_not_written,
      pt.App.workExecutions.covenantHeadroom.definitionMissing, "A ata não diz qual EBITDA a política usa", pt.App.workExecutions.covenantHeadroom.exclusions.waiver_negotiation])
      expect(html).toContain(text);
    for (const id of covenant.framing.readings!.contrasts) expect(html).toContain(covenant.measurements.find((m) => m.id === id)!.label);
    expect(html).not.toMatch(unresolved);
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await CovenantHeadroomResult({locale: "en-US", view: covenant}));
    expect(html).toContain(en.App.workExecutions.covenantHeadroom.title); expect(html).toContain("2.20x");
  });
});

describe("weekly cash result (C18)", () => {
  it("leads with the tightest week, names the weeks below the minimum, the cheapest covering action, the stated weeks and the calendar", async () => {
    expect(weekly).not.toBeNull();
    const html = renderToStaticMarkup(await WeeklyCashResult({locale: "pt-BR", view: weekly}));
    for (const text of ["Semana mais apertada: a de 21/12/2026", "14/12/2026; 21/12/2026", "Debênture 2021, amortização", pt.App.workExecutions.weeklyCash.closingHides,
      "Ação mais barata que cobre: Saque de R$ 8 mi da conta garantida por três semanas", pt.App.workExecutions.weeklyCash.cheapestOpen,
      "Antecipação de R$ 8 mi de recebíveis", "Semanas do caso informado: Com a linha da safra de R$ 17 mi em 15/out", "Safra de R$ 30 mi, com a linha de R$ 17 mi",
      "CCB Bradesco, juros trimestrais", pt.App.workExecutions.weeklyCash.obligations.thirteenth_salary, pt.App.workExecutions.weeklyCash.noGaps,
      pt.App.workExecutions.weeklyCash.exclusions.intraday_liquidity]) expect(html).toContain(text);
    expect(html.match(/<tr class="investment-base"><th scope="row">\d\d\/12\/2026/g)?.length).toBe(2);
    expect(html).not.toMatch(unresolved);
  });
  it("shows the tightest closing in millions of reais and action costs with two decimals", async () => {
    const view = {...weekly, framing: {...weekly.framing, readings: {...weekly.framing.readings!, tightestWeek: {...weekly.framing.readings!.tightestWeek, closing: "7481182.86"},
      cheapestCoveringAction: {...weekly.framing.readings!.cheapestCoveringAction!, cost: "124337.41"}}}};
    const html = renderToStaticMarkup(await WeeklyCashResult({locale: "pt-BR", view}));
    expect(html).toContain("fechando em 7,5."); expect(html).toContain("custo de 0,12 pelo tempo de uso");
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await WeeklyCashResult({locale: "en-US", view: weekly}));
    expect(html).toContain(en.App.workExecutions.weeklyCash.title);
  });
});
