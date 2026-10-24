import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
vi.mock("@/app/[locale]/app/projects/[projectId]/executions/actions", () => ({confirmPremiseProposal: vi.fn()}));
import {DebtMethodsPremisesCard, isDebtPremiseMethod, type DebtMethodsPremiseProposalView, type DebtPremiseMethodId} from "./debt-methods-premises-card";

const proposal: DebtMethodsPremiseProposalView = {id: "70000000-0000-4000-8000-000000000801", status: "proposed", fingerprint: "c".repeat(64), summary: {
  situationId: "refinancing", referenceDate: "2026-06-30",
  items: [
    {group: "instrument", label: "Debênture 1ª emissão", origin: "document", source: "escritura-2021.pdf"},
    {group: "instrument", label: "CCB Bradesco", origin: "informed", source: "Mensagem de 20/10"},
    {group: "credit_line", label: "Conta garantida Itaú", origin: "document", source: "contrato-itau.pdf"},
    {group: "view", label: "Dívida do banco, com arrendamentos e risco sacado", origin: "house", source: "Convenção da casa"},
    {group: "premise", label: "Juros acumulados pela taxa contratada", origin: "estimate", source: "Estimativa sobre o último extrato"},
  ]}};
const render = (locale: "pt-BR" | "en-US", view = proposal, methodId: DebtPremiseMethodId = "build-company-debt-table") => renderToStaticMarkup(
  <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC">
    <DebtMethodsPremisesCard locale={locale} projectId="30000000-0000-4000-8000-000000000801" methodId={methodId} proposal={view} /></NextIntlClientProvider>);
const card = pt.DebtMethodsPremisesCard;

describe("debt methods premises card", () => {
  it("groups each item with its origin and source, before any number", () => {
    const html = render("pt-BR");
    for (const text of [card.methods.debtTable.title, card.groups.instrument, card.groups.credit_line, card.groups.view, card.groups.premise,
      "Debênture 1ª emissão", "escritura-2021.pdf", "CCB Bradesco", card.origins.informed, card.origins.house, card.origins.estimate, "Data de referência: 30/06/2026", card.confirm])
      expect(html).toContain(text);
    expect(html).not.toContain(card.groups.limit);
    expect(html).not.toContain(proposal.fingerprint); expect(html).not.toContain("refinancing");
  });
  it("speaks each method's copy and the viewer's locale", () => {
    expect(render("pt-BR", proposal, "measure-covenant-headroom")).toContain(card.methods.covenantHeadroom.title);
    expect(render("pt-BR", proposal, "project-weekly-cash")).toContain(card.methods.weeklyCash.cases);
    const html = render("en-US");
    expect(html).toContain(en.DebtMethodsPremisesCard.methods.debtTable.title); expect(html).toContain("Reference date: 06/30/2026"); expect(html).toContain(en.DebtMethodsPremisesCard.confirm);
  });
  it("writes house labels in the viewer's language and keeps labels from the person or a document as written", () => {
    const summary = {situationId: "seasonal-working-capital", referenceDate: null, items: [
      {group: "view", label: "Com arrendamentos", labelKey: "leaseView", origin: "house", source: "Convenção da casa"},
      {group: "premise", label: "Caixa inicial", labelKey: "openingCash", origin: "document", source: "extrato.pdf"},
      {group: "case", label: "linha de R$ 25 mi", labelKey: "variantCase", origin: "house", source: "casa"},
      {group: "case", label: "antecipação de recebíveis", labelKey: "actionCase", origin: "house", source: "casa"},
      {group: "limit", label: "Vencimento antecipado não automático", labelKey: "accelerationNonAutomatic", origin: "house", source: "casa"},
      {group: "stream", label: "Folha de outubro", labelKey: null, origin: "informed", source: "Mensagem de 21/10"},
      {group: "stream", label: "Rótulo da casa sem chave conhecida", labelKey: "notInCatalog", origin: "house", source: "casa"},
      {group: "instrument", label: "CCB Bradesco", origin: "document", source: "ccb.pdf"},
    ]};
    const english = render("en-US", {...proposal, summary}, "project-weekly-cash");
    for (const text of ["Including leases", "Opening cash", "Plan with linha de R$ 25 mi", "Plan with the action: antecipação de recebíveis", "Non-automatic acceleration",
      "Folha de outubro", "Rótulo da casa sem chave conhecida", "CCB Bradesco"]) expect(english).toContain(text);
    expect(english).not.toContain("Com arrendamentos"); expect(english).not.toContain("Caixa inicial");
    const portuguese = render("pt-BR", {...proposal, summary}, "project-weekly-cash");
    for (const text of ["Com arrendamentos", "Plano com linha de R$ 25 mi", "Plano com a ação: antecipação de recebíveis", "Vencimento antecipado não automático"]) expect(portuguese).toContain(text);
  });
  it("offers no confirmation once confirmed or superseded", () => {
    expect(render("pt-BR", {...proposal, status: "confirmed"})).not.toContain("<button");
    expect(render("pt-BR", {...proposal, status: "confirmed"})).toContain(card.pendingRelease);
    expect(render("pt-BR", {...proposal, status: "superseded"})).toContain(card.superseded);
  });
  it("renders a neutral note and no confirmation for a summary it cannot read", () => {
    for (const summary of [{}, {situationId: "refinancing", referenceDate: null, items: [{group: "other", label: "x", origin: "document", source: ""}]}, {items: "x"}]) {
      const html = render("pt-BR", {...proposal, summary});
      expect(html).toContain(card.unreadable); expect(html).not.toContain("<button");
    }
  });
  it("recognizes only the three debt methods", () => {
    expect(["build-company-debt-table", "measure-covenant-headroom", "project-weekly-cash"].every(isDebtPremiseMethod)).toBe(true);
    expect(isDebtPremiseMethod("assess-debt-capacity")).toBe(false); expect(isDebtPremiseMethod(undefined)).toBe(false); expect(isDebtPremiseMethod("toString")).toBe(false);
  });
});
