import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {readOperatingProjectionPacketBlocks, readProjectionChallengePacketBlocks, readQuarterUpdatePacketBlocks, readReceivablesFundingPacketBlocks} from "@offroad/domain-contracts";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import projectionBlocks from "../../../../../packages/domain-contracts/src/fixtures/operating-projection-result-blocks.json";
import challengeBlocks from "../../../../../packages/domain-contracts/src/fixtures/projection-challenge-result-blocks.json";
import fundingBlocks from "../../../../../packages/domain-contracts/src/fixtures/receivables-funding-result-blocks.json";
import quarterBlocks from "../../../../../packages/domain-contracts/src/fixtures/quarter-update-result-blocks.json";
import {OperatingProjectionResult} from "./operating-projection-result";
import {ProjectionChallengeResult} from "./projection-challenge-result";
import {QuarterUpdateResult} from "./quarter-update-result";
import {ReceivablesFundingResult} from "./receivables-funding-result";

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
const projection = readOperatingProjectionPacketBlocks(projectionBlocks)!;
const challenge = readProjectionChallengePacketBlocks(challengeBlocks)!;
const funding = readReceivablesFundingPacketBlocks(fundingBlocks)!;
const quarter = readQuarterUpdatePacketBlocks(quarterBlocks)!;
const w = pt.App.workExecutions;
const unresolved = /(columns|exclusions|drivers|questions|reasons|kinds|liens|balanceSheets|natures|roles|metrics|versionStatuses|recommendations|decisionCodes|dependentStatuses|dependentKinds|gapReasons|questionCodes|vehicleReadings)\.[a-z]/;
const noDash = /[–—]/;

describe("operating projection result (C24)", () => {
  it("leads with the last year rebuilt, then the base, the company's versions with their cause, sensitivities, scenarios and the ledger", async () => {
    expect(projection).not.toBeNull();
    const html = renderToStaticMarkup(await OperatingProjectionResult({locale: "pt-BR", view: projection}));
    for (const text of ["Último ano (31/12/2025)", w.operatingProjection.reproduces, w.operatingProjection.documented, "31/12/2028", "12,4%",
      "orcamento", w.operatingProjection.versionStatuses.approved, "A revisão de julho supõe repasse integral do trigo", "Prazo das redes de 50 para 60 dias",
      w.operatingProjection.columns.receivableDay, "informado pela companhia", "crescimento de volume", w.operatingProjection.ledger, w.operatingProjection.noGaps,
      w.operatingProjection.exclusions.financing_recommendation]) expect(html).toContain(text);
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("shows amounts in millions of reais with one decimal and asks only what is not informed", async () => {
    const view = {...projection, base: projection.base.map((r, n) => n ? r : {...r, ebitda: "54510000"}),
      framing: {...projection.framing, questions: ["volume", "pass_through"] as ("volume" | "pass_through")[]}};
    const html = renderToStaticMarkup(await OperatingProjectionResult({locale: "pt-BR", view}));
    expect(html).toContain("<td>54,5</td>");
    expect(html).toContain(w.operatingProjection.questions.volume); expect(html).not.toContain(w.operatingProjection.questions.receivable_days);
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await OperatingProjectionResult({locale: "en-US", view: projection}));
    expect(html).toContain(en.App.workExecutions.operatingProjection.title); expect(html).toContain("12/31/2026");
  });
});

describe("projection challenge result (C26)", () => {
  it("gives the gap, each assumption in order with its yardstick and evidence, capacity and how to present the plan", async () => {
    expect(challenge).not.toBeNull();
    const html = renderToStaticMarkup(await ProjectionChallengeResult({locale: "pt-BR", view: challenge}));
    for (const text of ["Em 2028, o plano chega a EBITDA de", w.projectionChallenge.noMarginCause, "16,2%", "Preço líquido +3,5% ao ano", "Volume +4,5% ao ano",
      "Contratos com cláusula de reajuste", w.projectionChallenge.evidenceStatuses.not_presented, "Capacidade instalada de 118,0", "Cadastro da fábrica",
      w.projectionChallenge.recommendations.present_plan_as_upside_case, w.projectionChallenge.capacityConditions.limit_quantity_to_capacity_or_add_the_investment_and_its_financing,
      w.projectionChallenge.exclusions.scenario_execution, w.projectionChallenge.exclusions.material_production]) expect(html).toContain(text);
    expect(html.indexOf("Preço líquido +3,5% ao ano")).toBeLessThan(html.indexOf("Volume +4,5% ao ano"));
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await ProjectionChallengeResult({locale: "en-US", view: challenge}));
    expect(html).toContain(en.App.workExecutions.projectionChallenge.title); expect(html).toContain(en.App.workExecutions.projectionChallenge.recommendations.present_plan_as_upside_case);
  });
});

describe("receivables funding result (C35)", () => {
  it("leads with what can be sold, why the rest cannot, each option against the bank line, the plan, when to start and the questions", async () => {
    expect(funding).not.toBeNull();
    const html = renderToStaticMarkup(await ReceivablesFundingResult({locale: "pt-BR", view: funding}));
    for (const text of ["Carteira em 15/09/2026", "(40,3%)", "Rede A (maior cliente)", w.receivablesFunding.reasons.not_assignable, w.receivablesFunding.reasons.encumbered,
      w.receivablesFunding.kinds.anchor_program, w.receivablesFunding.balanceSheets.derecognized, w.receivablesFunding.liens.not_a_guarantee_confirm_with_counsel,
      w.receivablesFunding.coversPeak, "começar até 16/09/2026", w.receivablesFunding.vehicleReadings.not_for_seasonal_need, w.receivablesFunding.process,
      "pré-pagamento da CCB do Bradesco", w.receivablesFunding.releaseUnverified, w.receivablesFunding.gapReasons.largest_debtor_not_informed,
      w.receivablesFunding.exclusions.buyer_contact]) expect(html).toContain(text);
    for (const o of funding.options) expect(html).toContain(o.label!);
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("shows the assignable part in millions of reais and option costs with two decimals", async () => {
    const view = {...funding, framing: {...funding.framing, gross: "62000000", assignable: "25000000"}, options: funding.options.map((o, n) => n ? o : {...o, cost: "1331550.18"})};
    const html = renderToStaticMarkup(await ReceivablesFundingResult({locale: "pt-BR", view}));
    expect(html).toContain("Da carteira de 62,0, 25,0 pode ser cedido hoje"); expect(html).toContain("<td>1,33</td>");
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await ReceivablesFundingResult({locale: "en-US", view: funding}));
    expect(html).toContain(en.App.workExecutions.receivablesFunding.title); expect(html).toContain("09/15/2026");
  });
});

describe("quarter update result (C54)", () => {
  it("explains the deviations by cause, carries them into the weeks and the covenant, and says what changed and what did not", async () => {
    expect(quarter).not.toBeNull();
    const html = renderToStaticMarkup(await QuarterUpdateResult({locale: "pt-BR", view: quarter}));
    for (const text of ["Trimestre de 01/07/2026 a 30/09/2026", "Prazo médio de recebimento (dias)", "3,0%", "Trigo 3% mais caro desde agosto, sem repasse ainda",
      "continua até 31/12/2026", w.quarterUpdate.calendar, "na de 21/12/2026", "Deliberação do conselho de 30/set", w.quarterUpdate.withinApproved,
      "2,20x", "2,29x", "Definição gerencial adotada pelo conselho", w.quarterUpdate.decisionCodes.third_party_material, w.quarterUpdate.dependentStatuses.stale,
      "Os 54 dias das redes são prazo negociado ou atraso?", w.quarterUpdate.kept, w.quarterUpdate.exclusions.third_party_distribution]) expect(html).toContain(text);
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("shows the tightest week in millions of reais", async () => {
    const view = {...quarter, framing: {...quarter.framing, tightestWeek: {prior: {weekStart: "2026-12-21", closing: "7481182.86"}, updated: {weekStart: "2026-12-21", closing: "4392709.74"}}}};
    const html = renderToStaticMarkup(await QuarterUpdateResult({locale: "pt-BR", view}));
    expect(html).toContain("antes 7,5 na de 21/12/2026; agora 4,4 na de 21/12/2026");
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await QuarterUpdateResult({locale: "en-US", view: quarter}));
    expect(html).toContain(en.App.workExecutions.quarterUpdate.title); expect(html).toContain("2.29x");
  });
});
