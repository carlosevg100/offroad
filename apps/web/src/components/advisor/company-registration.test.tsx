import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
vi.mock("@/app/[locale]/app/projects/[projectId]/executions/actions", () => ({registerWorkCompany: vi.fn()}));
import {CompanyRegistration} from "./company-registration";

const render = (locale: "pt-BR" | "en-US") => renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC">
  <CompanyRegistration locale={locale} projectId="30000000-0000-4000-8000-000000000801" onRegistered={() => undefined} /></NextIntlClientProvider>);

describe("company registration in the premise card", () => {
  it("asks only the company's name and CNPJ, in the viewer's locale", () => {
    const html = render("pt-BR");
    for (const text of [pt.CompanyRegistration.title, pt.CompanyRegistration.name, pt.CompanyRegistration.cnpj, pt.CompanyRegistration.register]) expect(html).toContain(text);
    expect(html.match(/<input/g)).toHaveLength(2);
    expect(render("en-US")).toContain(en.CompanyRegistration.register);
  });
});
