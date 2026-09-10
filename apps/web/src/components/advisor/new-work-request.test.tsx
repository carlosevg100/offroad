import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import type {ProjectWorkContext} from "@offroad/work-plan";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import type {ProjectWorkRequestRecord} from "@/lib/advisor/project-work-requests";
import {NewWorkRequest, type NewWorkRequestProps} from "./new-work-request";

const ready: ProjectWorkContext = {
  accessBasis: "authorized_private",
  documentaryPlanningEnabled: true,
  readyDocumentCount: 2,
  executionBriefAvailable: true,
  institutionalSetupAvailable: true,
  providerCaseFitAvailable: true,
  callerActions: {prepare: true, return: true, approve: true},
};
const surfaces = ["document-review", "institutional-setup", "provider-case-criteria", "institutional-model-result"];
function render(locale: "pt-BR" | "en-US", props: Partial<NewWorkRequestProps>) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}>
    <NewWorkRequest availableSurfaces={surfaces} context={ready} disabled={false} locale={locale} onOpenSurface={vi.fn()} onRequest={vi.fn()} requests={[]} {...props} />
  </NextIntlClientProvider>);
}
const enabledSubmit = /<button class="button button--ghost" type="submit">/;
const disabledSubmit = /<button class="button button--ghost" disabled="" type="submit">/;

describe("common new work entry", () => {
  it.each(["pt-BR", "en-US"] as const)("shows plan, data, expected result, limits and the approval gate before sending in %s", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = render(locale, {initialObjective: "Faça a comparação financeira dos cenários de refinanciamento."});
    expect(html).toContain('data-kind="dispatch"');
    expect(html).toContain('data-capability="financial_result"');
    for (const key of ["plan", "dataUsed", "expectedResult", "limits"] as const) expect(html).toContain(messages.NewWorkRequest[key]);
    expect(html).toContain(messages.NewWorkRequest.approval.institutional_configuration);
    expect(html).toContain(messages.NewWorkRequest.inputTiming.execution);
    expect(html).toMatch(enabledSubmit);
    expect(html).not.toMatch(/—/);
  });

  it("routes a documentary request that includes a calculation to the financial executor and says why", () => {
    const html = render("pt-BR", {initialObjective: "Compare estas propostas e calcule o custo efetivo."});
    expect(html).toContain('data-capability="financial_result"');
    expect(html).toContain(pt.NewWorkRequest.notes.calculation_routed_to_financial);
  });

  it("refuses a calculation inside an explicit documentary request instead of executing it", () => {
    const html = render("pt-BR", {initialObjective: "Compare estas propostas e calcule o DSCR.", initialCapability: "documentary_reading"});
    expect(html).toContain('data-kind="unsupported"');
    expect(html).toContain('data-reason="calculation_in_documentary_scope"');
    expect(html).toContain(pt.NewWorkRequest.unsupported.title);
    expect(html).toContain(pt.NewWorkRequest.nextStep.trim());
    expect(html).toContain(`Enviar como ${pt.NewWorkRequest.options.financial_result.title}`);
    expect(html).toMatch(disabledSubmit);
  });

  it("explains that documentary reading is not activated and starts nothing", () => {
    const html = render("pt-BR", {initialObjective: "Compare estas propostas de financiamento.", context: {...ready, documentaryPlanningEnabled: false}});
    expect(html).toContain('data-kind="blocked"');
    expect(html).toContain('data-reason="documentary_not_activated"');
    expect(html).toContain(pt.NewWorkRequest.blocked.documentary_not_activated);
    expect(html).toMatch(disabledSubmit);
  });

  it("lists the missing inputs and offers to record the request for later", () => {
    const html = render("pt-BR", {initialObjective: "Calcule os cenários de serviço da dívida.", context: {...ready, institutionalSetupAvailable: false}});
    expect(html).toContain('data-reason="missing_inputs"');
    expect(html).toContain(pt.NewWorkRequest.inputs.reconciled_facts);
    expect(html).toContain(pt.NewWorkRequest.record);
    expect(html).toMatch(enabledSubmit);
  });

  it("explains a missing preparer role without widening access", () => {
    const html = render("en-US", {initialObjective: "Research lenders and mandates for this case.", context: {...ready, callerActions: {prepare: false, return: false, approve: false}}});
    expect(html).toContain('data-reason="not_authorized"');
    expect(html).toContain(en.NewWorkRequest.blocked.not_authorized);
    expect(html).toMatch(disabledSubmit);
  });

  it("keeps previous requests with a way back to the originating result", () => {
    const requests: ProjectWorkRequestRecord[] = [{
      id: "10000000-0000-4000-8000-000000000001", capability: "provider_research", objective: "Pesquise financiadores para o caso.",
      status: "dispatched", surface: "provider-case-criteria", originSection: "institutional-model-result",
      requestedBy: "10000000-0000-4000-8000-000000000002", createdAt: "2026-09-10T20:00:00Z",
    }];
    const html = render("pt-BR", {requests});
    expect(html).toContain('data-testid="new-work-history"');
    expect(html).toContain("Pesquise financiadores para o caso.");
    expect(html).toContain(pt.NewWorkRequest.status.dispatched);
    expect(html).toContain(pt.NewWorkRequest.open);
    expect(html).toContain(pt.NewWorkRequest.origin);
  });

  it("disables the entry while another command runs", () => {
    const html = render("pt-BR", {disabled: true, initialObjective: "Calcule os cenários."});
    expect(html).toMatch(/<textarea disabled=""/);
    expect(html).toMatch(disabledSubmit);
  });
});
