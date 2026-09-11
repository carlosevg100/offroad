import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import {deliverableFormatDecisions} from "@offroad/case-export/deliverable-formats";
import ptBR from "../../../messages/pt-BR.json";
import enUS from "../../../messages/en-US.json";
import {DeliverableFormatList} from "./deliverable-format-list";

const current = {resultState: "current", accessCurrent: true, reproduction: "approved", tabularContract: true, narrativeStructure: true} as const;
const financial = ["financial_model", "financial_memo", "executive_presentation"] as const;
const render = (decisions: ReturnType<typeof deliverableFormatDecisions>, locale: "pt-BR" | "en-US" = "pt-BR") =>
  renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="UTC" messages={locale === "pt-BR" ? ptBR : enUS}>
    <DeliverableFormatList decisions={decisions} basePath="/pt-BR/app/projects/p/financial-results/r" />
  </NextIntlClientProvider>);

describe("delivery format list", () => {
  it("links exactly the formats the policy allows for this delivery", () => {
    const html = render(deliverableFormatDecisions(financial, current));
    for (const format of ["xlsx", "pptx", "docx", "pdf"]) expect(html).toContain(`href="/pt-BR/app/projects/p/financial-results/r/${format}"`);
    expect(html).toContain(ptBR.DeliverableFormats.conditions.reproduction_approved);
  });

  it("shows a blocked format with its reason instead of an unexplained missing control", () => {
    const html = render(deliverableFormatDecisions(financial, {...current, reproduction: "diverged"}));
    expect(html).not.toContain("href=");
    expect(html).toContain(ptBR.DeliverableFormats.blocked.reproduction_divergence);
    expect(html).toContain('data-available="no"');
  });

  it("never turns reading in the product into a download link", () => {
    const html = render(deliverableFormatDecisions(["market_research"], {...current, tabularContract: false}));
    expect(html).toContain(ptBR.DeliverableFormats.formats.interactive);
    expect(html).not.toContain("/interactive");
    expect(html).not.toContain("/xlsx");
    expect(html).toContain(ptBR.DeliverableFormats.blocked.no_tabular_contract);
  });

  it("renders nothing when the delivery declares no format", () => {
    expect(render([])).toBe("");
  });

  it("keeps both catalogs free of em dashes in this namespace", () => {
    for (const catalog of [ptBR, enUS]) expect(JSON.stringify(catalog.DeliverableFormats)).not.toContain("—");
    expect(render(deliverableFormatDecisions(financial, current), "en-US")).toContain(enUS.DeliverableFormats.roles.formulas);
  });
});
