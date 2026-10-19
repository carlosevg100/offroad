import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
vi.mock("@/app/[locale]/app/projects/[projectId]/executions/actions", () => ({confirmPremiseProposal: vi.fn()}));
import {CapacityPremisesCard, type CapacityPremiseProposalView} from "./capacity-premises-card";

const proposal: CapacityPremiseProposalView = {id: "70000000-0000-4000-8000-000000000701", status: "proposed", fingerprint: "c".repeat(64), summary: {
  years: 5, firstYear: "2027", lastYear: "2031", requestedAmount: "60000000",
  cases: [{id: "informed", role: "informed", label: "2S27 e 1S28, como informado", use: "60000000", origin: "conversation", source: "Mensagem de 19/10"},
    {id: "phased", role: "alternative", label: "Em três tranches", use: "60000000", origin: "house", source: "Cronograma alternativo da casa"}],
  structure: {label: "Debênture de 7 anos", finalPaymentDate: "2034-12-31", origin: "conversation", source: "Mensagem de 19/10"},
  limits: [{id: "covenant", label: "Covenant de 3,0x", origin: "document", source: "escritura-2021.pdf"}, {id: "market", label: "Alavancagem que o mercado aceita", origin: "house", source: "casa"}],
  premises: [{key: "stress", origin: "house", source: "EBITDA 15% menor"}], scenarios: ["base", "adverse"], situationId: "capex-infrastructure"}};
const render = (locale: "pt-BR" | "en-US", view = proposal) => renderToStaticMarkup(
  <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC"><CapacityPremisesCard locale={locale} projectId="30000000-0000-4000-8000-000000000701" proposal={view} /></NextIntlClientProvider>);

describe("capacity premises card", () => {
  it("shows each schedule, the structure and each limit with its origin, before any number", () => {
    const html = render("pt-BR");
    for (const text of ["2S27 e 1S28, como informado", "Uso total de R$ 60,0 mi, o plano informado", "Em três tranches", "5 anos de projeção, de 2027 a 2031",
      "Valor pedido: R$ 60,0 mi", "Debênture de 7 anos, vencimento final em 2034", "escritura-2021.pdf", pt.CapacityPremisesCard.houseLimit, "EBITDA 15% menor", pt.CapacityPremisesCard.confirm])
      expect(html).toContain(text);
    expect(html).not.toContain(proposal.fingerprint); expect(html).not.toContain("capex-infrastructure");
  });
  it("speaks the viewer's locale", () => {
    const html = render("en-US");
    expect(html).toContain("Total use of BRL 60.0 mn, the stated plan"); expect(html).toContain(en.CapacityPremisesCard.confirm);
  });
  it("offers no confirmation once confirmed or superseded", () => {
    expect(render("pt-BR", {...proposal, status: "confirmed"})).not.toContain("<button");
    expect(render("pt-BR", {...proposal, status: "superseded"})).toContain(pt.CapacityPremisesCard.superseded);
  });
});
