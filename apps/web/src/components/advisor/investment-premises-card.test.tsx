import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
vi.mock("@/app/[locale]/app/projects/[projectId]/executions/actions", () => ({confirmInvestmentPremises: vi.fn()}));
import {InvestmentPremisesCard, type InvestmentPremiseProposalView} from "./investment-premises-card";

const informed = (value: unknown, source: string) => ({value, origin: "informed", source});
const document = (value: unknown, source: string) => ({value, origin: "document", source});
const house = (value: unknown, source: string) => ({value, origin: "house", source});
const proposal: InvestmentPremiseProposalView = {id: "70000000-0000-4000-8000-000000000501", status: "proposed", fingerprint: "a".repeat(64), facts: {
  capex: informed([{year: 2026, amount: "10000000"}, {year: 2027, amount: "8000000"}], "R$ 10 em novembro e dezembro e R$ 8 no começo de 2027"),
  operationStart: informed("2027-05-01", "entra em operação em maio"),
  ramp: house({stageMonths: [3], stageLoads: ["0.5"]}, "Três meses a meia carga depois da partida"),
  annualDisplacedPurchases: document("30000000", "Gerencial: embalagem comprada"),
  lostSupplierDays: document("60", "Gerencial: prazo médio do fornecedor"),
  cashTaxRate: house("0.34", "IR e CSLL de 34% no lucro real"),
  discountRate: informed("0.15", "custo de capital de 15% que usamos"),
  analysisId: "not a premise and never shown",
}};
const render = (locale: "pt-BR" | "en-US", view = proposal) => renderToStaticMarkup(
  <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC"><InvestmentPremisesCard locale={locale} projectId="30000000-0000-4000-8000-000000000501" proposal={view} /></NextIntlClientProvider>);

describe("investment premises card", () => {
  it("groups every premise by origin with its value and source, before any calculation", () => {
    const html = render("pt-BR");
    for (const text of [pt.InvestmentPremisesCard.origin.document, pt.InvestmentPremisesCard.origin.informed, pt.InvestmentPremisesCard.origin.house,
      "2026: R$ 10,0 mi; 2027: R$ 8,0 mi", "R$ 30,0 mi", "60 dias", "3 meses a 50%", "15%", "34%", "Gerencial: prazo médio do fornecedor", pt.InvestmentPremisesCard.confirm])
      expect(html).toContain(text);
    expect(html).not.toContain("never shown"); expect(html).not.toContain(proposal.fingerprint);
    expect(html.indexOf(pt.InvestmentPremisesCard.origin.document)).toBeLessThan(html.indexOf(pt.InvestmentPremisesCard.origin.house));
  });

  it("speaks the viewer's locale", () => {
    const html = render("en-US");
    expect(html).toContain("BRL 30.0 mn"); expect(html).toContain(en.InvestmentPremisesCard.confirm); expect(html).toContain("60 days");
  });

  it("offers no confirmation once confirmed or superseded", () => {
    const confirmed = render("pt-BR", {...proposal, status: "confirmed"});
    expect(confirmed).not.toContain("<button"); expect(confirmed).toContain(pt.InvestmentPremisesCard.pendingRelease);
    const superseded = render("pt-BR", {...proposal, status: "superseded"});
    expect(superseded).not.toContain("<button"); expect(superseded).toContain(pt.InvestmentPremisesCard.superseded);
  });
});
