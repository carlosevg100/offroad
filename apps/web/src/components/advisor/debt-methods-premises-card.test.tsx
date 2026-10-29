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
  it("speaks each lote 4 method's copy, its own group names and the folder's groups", () => {
    const lote4 = {situationId: "refinancing", referenceDate: "2026-09-01", items: [
      {group: "file", label: "dfs-2025.pdf", origin: "document", source: "Pasta enviada"},
      {group: "option", label: "Alongar o Bradesco", origin: "informed", source: "Mensagem de 20/10"},
      {group: "premise", label: "organize", labelKey: "documentFolderMode.organize", origin: "house", source: "Pedido da pessoa"},
      {group: "premise", label: "IOF", labelKey: "creditTax", origin: "house", source: "Decreto 6.306/2007"},
    ]};
    const view = {...proposal, summary: lote4};
    const folder = render("pt-BR", view, "organize-document-folder");
    for (const text of [card.methods.documentFolder.title, card.groups.file, "dfs-2025.pdf", card.houseLabels.documentFolderMode.organize]) expect(folder).toContain(text);
    const paths = render("pt-BR", view, "evaluate-financing-paths");
    expect(paths).toContain(card.methods.financingPaths.groups.option); expect(paths).not.toContain(card.groups.option);
    expect(render("en-US", view, "evaluate-received-proposal")).toContain(en.DebtMethodsPremisesCard.houseLabels.creditTax);
    expect(render("pt-BR", view, "prepare-board-capital-discussion")).toContain(card.methods.boardMaterial.title);
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
  it("shows the lote 3 groups, house labels and the market origin", () => {
    const summary = {situationId: "seasonal-working-capital", referenceDate: "2026-09-15", items: [
      {group: "item", label: "Rede A (maior cliente)", labelKey: null, origin: "document", source: "carteira.xlsx"},
      {group: "option", label: "FIDC multicedente com coobrigação", labelKey: null, origin: "market", source: "Faixa de mercado do módulo de recebíveis"},
      {group: "premise", label: "Pico da necessidade", labelKey: "needPeak", origin: "informed", source: "Mensagem"},
    ]};
    const html = render("pt-BR", {...proposal, summary}, "monetize-receivables-for-working-capital");
    for (const text of [card.methods.receivablesFunding.title, card.groups.item, card.groups.option, card.origins.market, card.houseLabels.needPeak, "Rede A (maior cliente)"]) expect(html).toContain(text);
    const projection = {situationId: "stable-business-high-conversion", referenceDate: null, items: [
      {group: "driver", label: "Volume", labelKey: "driverVolume", origin: "estimate", source: "Calibrado no histórico"},
      {group: "scenario", label: "Prazo das redes de 50 para 60 dias", labelKey: null, origin: "informed", source: "Mensagem"},
      {group: "version", label: "Orçamento 2026 aprovado", labelKey: null, origin: "document", source: "orcamento.xlsx"},
    ]};
    const english = render("en-US", {...proposal, summary: projection}, "build-operating-projection");
    for (const text of [en.DebtMethodsPremisesCard.methods.operatingProjection.title, en.DebtMethodsPremisesCard.groups.driver, en.DebtMethodsPremisesCard.houseLabels.driverVolume,
      en.DebtMethodsPremisesCard.groups.scenario, en.DebtMethodsPremisesCard.groups.version]) expect(english).toContain(text);
    const challenge = {situationId: "stable-business-high-conversion", referenceDate: null, items: [
      {group: "case", label: "Plano", labelKey: "planCase", origin: "document", source: "plano.xlsx"},
      {group: "assumption", label: "Preço líquido +3,5% ao ano", labelKey: null, origin: "document", source: "plano.xlsx"},
    ]};
    const read = render("pt-BR", {...proposal, summary: challenge}, "challenge-financial-projection");
    for (const text of [card.methods.projectionChallenge.title, card.groups.assumption, card.houseLabels.planCase]) expect(read).toContain(text);
  });
  it("shows the quarter close's lines, causes, facilities and dependents with the prior versions it updates", () => {
    const summary = {situationId: "near-covenant", referenceDate: "2026-09-30", items: [
      {group: "line", label: "Caixa em 30/set", labelKey: null, origin: "document", source: "balancete-set26.xlsx"},
      {group: "cause", label: "Redes pagando em 54 dias", labelKey: null, origin: "informed", source: "Mensagem"},
      {group: "facility", label: "Conta garantida", labelKey: null, origin: "document", source: "contrato"},
      {group: "dependent", label: "Material da sondagem", labelKey: null, origin: "house", source: "casa"},
      {group: "premise", label: "Caixa semanal anterior", labelKey: "priorWeeklyCash", origin: "document", source: "Resultado registrado"},
    ]};
    const html = render("pt-BR", {...proposal, summary}, "update-after-quarter-close");
    for (const text of [card.methods.quarterUpdate.title, card.groups.line, card.groups.cause, card.groups.facility, card.groups.dependent, card.houseLabels.priorWeeklyCash])
      expect(html).toContain(text);
    expect(render("en-US", {...proposal, summary}, "update-after-quarter-close")).toContain(en.DebtMethodsPremisesCard.houseLabels.priorWeeklyCash);
  });
  it("recognizes only the lote 2 and lote 3 premise methods", () => {
    expect(["build-company-debt-table", "measure-covenant-headroom", "project-weekly-cash", "build-operating-projection", "challenge-financial-projection",
      "monetize-receivables-for-working-capital", "update-after-quarter-close", "organize-document-folder", "evaluate-received-proposal", "evaluate-financing-paths",
      "prepare-board-capital-discussion"].every(isDebtPremiseMethod)).toBe(true);
    expect(isDebtPremiseMethod("assess-debt-capacity")).toBe(false); expect(isDebtPremiseMethod(undefined)).toBe(false); expect(isDebtPremiseMethod("toString")).toBe(false);
  });
});
