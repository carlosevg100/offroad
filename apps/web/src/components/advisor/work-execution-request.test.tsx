import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import {structuringSituations} from "@offroad/credit-playbook";
import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {selectClientMessages} from "@/i18n/client-messages";
import type {ExecutionFollowup} from "@/lib/advisor/work-updates";
import {WorkExecutionRequest} from "./work-execution-request";

vi.mock("@/app/[locale]/app/projects/[projectId]/executions/actions", () => ({requestCapitalExecution: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn(), push: vi.fn()})}));

const situations = structuringSituations.map(situation => situation.situationId);
function render(locale: "pt-BR" | "en-US", followup: ExecutionFollowup | null = null, versions = [{id: "a4210000-0000-4000-9000-000000000003", revision: 2}]) {
  const errors: unknown[] = [];
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="America/Sao_Paulo" messages={selectClientMessages(locale === "pt-BR" ? pt : en as typeof pt)} onError={error => errors.push(error)}>
    <WorkExecutionRequest locale={locale} projectId="a4210000-0000-4000-9000-000000000002" versions={versions} selectedVersionId={null} situations={situations} followup={followup} />
  </NextIntlClientProvider>);
  return {html, errors};
}

describe("execution request started from a follow-up (5D)", () => {
  const followup: ExecutionFollowup = {state: "ready", requestId: "a4210000-0000-4000-9000-000000000094", text: "Revisar o covenant\nde alavancagem",
    objective: "Revisar o covenant de alavancagem", base: {label: "Alongamento com os bancos atuais", revision: 3}};
  it.each([["pt-BR", pt], ["en-US", en]] as const)("fills the first objective with the follow-up and shows it with its base in %s", (locale, catalogue) => {
    const {html, errors} = render(locale, followup);
    expect(errors).toEqual([]);
    expect(html).toMatch(/<textarea name="objectives" required="" maxLength="20000">Revisar o covenant de alavancagem<\/textarea>/);
    expect(html).toContain(`<blockquote>Revisar o covenant\nde alavancagem</blockquote>`);
    expect(html).toContain(catalogue.App.workExecutions.request.followup.title);
    expect(html).toContain(catalogue.App.workExecutions.request.followup.base.replace("{label}", "Alongamento com os bancos atuais").replace("{revision}", "3"));
    expect(html).toContain(catalogue.App.workExecutions.request.followup.help.replaceAll("'", "&#x27;"));
    // Nothing else is filled and the follow-up is never an identifier the form sends.
    expect(html).toContain('<input required="" maxLength="2000" name="question"/>');
    expect(html).not.toContain(followup.requestId);
    expect(html).not.toMatch(new RegExp(`[${String.fromCodePoint(0x2014)}${String.fromCodePoint(0x2013)}]`));
  });
  it("says when the follow-up no longer waits for an execution and fills nothing", () => {
    const {html} = render("pt-BR", {state: "unavailable"});
    expect(html).toContain(pt.App.workExecutions.request.followup.unavailable);
    expect(html).toMatch(/<textarea name="objectives" required="" maxLength="20000"><\/textarea>/);
  });
  it("shows the follow-up even when the work has no basis to request an execution on yet", () => {
    const {html} = render("pt-BR", followup, []);
    expect(html).toContain(pt.App.workExecutions.request.followup.title);
    expect(html).toContain(pt.App.workExecutions.request.noVersions);
    expect(html).not.toContain("<form");
  });
});

describe("execution request form", () => {
  it.each([["pt-BR", pt], ["en-US", en]] as const)("offers every R3 situation as a checkbox labelled from the catalogue and keeps every field in %s", (locale, catalogue) => {
    const {html, errors} = render(locale);
    expect(errors).toEqual([]);
    expect(html.match(/<input type="checkbox" name="situationIds"/g)).toHaveLength(situations.length);
    for (const id of situations) {
      const label = catalogue.App.workExecutions.situations[id as keyof typeof catalogue.App.workExecutions.situations];
      expect(html).toContain(`<input type="checkbox" name="situationIds" value="${id}"/>${label}</label>`);
    }
    expect(html).toContain(`<legend>${catalogue.App.workExecutions.request.situations}</legend>`);
    for (const field of ["versionId", "asOf", "question", "objectives"]) expect(html).toContain(`name="${field}"`);
    expect(html).not.toMatch(new RegExp(`[${String.fromCodePoint(0x2014)}${String.fromCodePoint(0x2013)}]`));
  });
  it("labels the pt-BR checkboxes with the literal R3 text", () => {
    const {html} = render("pt-BR");
    for (const situation of structuringSituations) expect(html).toContain(`value="${situation.situationId}"/>${situation.label}</label>`);
  });
});
