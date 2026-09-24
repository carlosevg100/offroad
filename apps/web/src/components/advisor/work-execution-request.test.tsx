import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import {structuringSituations} from "@offroad/credit-playbook";
import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {selectClientMessages} from "@/i18n/client-messages";
import {WorkExecutionRequest} from "./work-execution-request";

vi.mock("@/app/[locale]/app/projects/[projectId]/executions/actions", () => ({requestCapitalExecution: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn(), push: vi.fn()})}));

const situations = structuringSituations.map(situation => situation.situationId);
function render(locale: "pt-BR" | "en-US") {
  const errors: unknown[] = [];
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="America/Sao_Paulo" messages={selectClientMessages(locale === "pt-BR" ? pt : en as typeof pt)} onError={error => errors.push(error)}>
    <WorkExecutionRequest locale={locale} projectId="a4210000-0000-4000-9000-000000000002" versions={[{id: "a4210000-0000-4000-9000-000000000003", revision: 2}]} selectedVersionId={null} situations={situations} />
  </NextIntlClientProvider>);
  return {html, errors};
}

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
