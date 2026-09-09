import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {DocumentaryWorkNextStep, type DocumentaryWorkContext} from "./documentary-work-next-step";

function render(context: DocumentaryWorkContext, locale = "pt-BR") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}><DocumentaryWorkNextStep context={context} /></NextIntlClientProvider>);
}

describe("DocumentaryWorkNextStep", () => {
  it.each(["comparison", "meeting", "review"] as const)("identifies the bounded %s work without requesting a financing package", job => {
    const html = render({job});
    expect(html).toContain(pt.App.privateCase.documentaryWork.jobs[job]);
    expect(html).toContain(pt.App.privateCase.documentaryWork.nextStep);
    expect(html).not.toContain(pt.App.privateCase.requestTitle);
    expect(html).not.toContain("<ol>");
  });
  it("shows only questions supplied by the bound result, escaping their content", () => {
    const html = render({job: "comparison", gaps: [{text: "A proposta não informa garantias.", question: "Pode esclarecer as garantias <script>?"}]});
    expect(html).toContain("A proposta não informa garantias.");
    expect(html).toContain("Pode esclarecer as garantias &lt;script&gt;?");
    expect(html).not.toContain(pt.App.privateCase.documentaryWork.nextStep);
  });
  it("provides English scope and next-step copy", () => {
    const html = render({job: "review"}, "en-US");
    expect(html).toContain(en.App.privateCase.documentaryWork.jobs.review);
    expect(html).toContain(en.App.privateCase.documentaryWork.footer);
  });
});
