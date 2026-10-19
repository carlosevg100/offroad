import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
vi.mock("@/app/[locale]/app/projects/[projectId]/executions/actions", () => ({confirmPremiseProposal: vi.fn()}));
import {ComparisonPremisesCard, type ComparisonPremiseProposalView} from "./comparison-premises-card";

const offer = (label: string, spread: string, fee: string, creditTax: boolean, share: string, limit: string) =>
  ({label, amount: "70000000", annualSpread: spread, feeRate: fee, creditTax, collateralShareOfLoan: share, covenantLimit: limit, origin: "document", source: `ts-${label}.pdf`});
const proposal: ComparisonPremiseProposalView = {id: "70000000-0000-4000-8000-000000000601", status: "proposed", fingerprint: "b".repeat(64), summary: {
  proposals: [offer("itau", "0.023", "0.01", true, "0.4", "3"), offer("fundo", "0.031", "0.015", false, "0", "2.75")],
  quarters: 10, existingDebt: ["Debênture 2021", "CCB Bradesco"], minimumCashPolicy: "15000000",
  premises: [{key: "creditTax", origin: "house", source: "IOF de crédito para pessoa jurídica"}, {key: "stress", origin: "house", source: "EBITDA 15% menor"}],
  cases: ["base", "bank-stress"], situationId: "seasonal-working-capital"}};
const render = (locale: "pt-BR" | "en-US", view = proposal) => renderToStaticMarkup(
  <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC"><ComparisonPremisesCard locale={locale} projectId="30000000-0000-4000-8000-000000000601" proposal={view} /></NextIntlClientProvider>);

describe("comparison premises card", () => {
  it("shows each offer's terms with its source, the company premises and the house premises, before any number", () => {
    const html = render("pt-BR");
    for (const text of ["itau: R$ 70,0 mi a CDI + 2,3%", "com IOF", "sem IOF", "garantia de 40% da operação", "covenant até 2,75x", "ts-fundo.pdf", "10 trimestres de projeção",
      "Debênture 2021, CCB Bradesco", "Caixa mínimo da política: R$ 15,0 mi", "IOF de crédito para pessoa jurídica", pt.ComparisonPremisesCard.confirm])
      expect(html).toContain(text);
    expect(html).not.toContain(proposal.fingerprint); expect(html).not.toContain("seasonal-working-capital");
  });
  it("speaks the viewer's locale", () => {
    const html = render("en-US");
    expect(html).toContain("BRL 70.0 mn at CDI + 2.3%"); expect(html).toContain(en.ComparisonPremisesCard.confirm);
  });
  it("offers no confirmation once confirmed or superseded", () => {
    expect(render("pt-BR", {...proposal, status: "confirmed"})).not.toContain("<button");
    expect(render("pt-BR", {...proposal, status: "superseded"})).toContain(pt.ComparisonPremisesCard.superseded);
  });
});
