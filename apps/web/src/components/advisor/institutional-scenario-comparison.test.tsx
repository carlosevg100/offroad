import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import type {InstitutionalComparison} from "@/lib/advisor/institutional-scenario-comparison";
import {InstitutionalScenarioComparison} from "./institutional-scenario-comparison";

const current: InstitutionalComparison = {id: "current", configurationId: "config", revision: 2, name: "Synthetic reviewed scenario", currency: "BRL", asOfDate: "2026-12-31", reviewedAt: "2026-09-10T00:00:00Z", compatibilityKey: "same", sourceManifestFingerprint: "a".repeat(64), periods: [], sources: [], assumptions: []};
function render(comparisons: InstitutionalComparison[], locale: "pt-BR" | "en-US" = "pt-BR") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}><InstitutionalScenarioComparison currentId="current" comparisons={comparisons}/></NextIntlClientProvider>);
}
describe("explicit reviewed scenario comparison", () => {
  it("shows an honest empty state without inventing an alternative", () => {
    const html = render([current]);
    expect(html).toContain(pt.InstitutionalScenarioComparison.empty);
    expect(html).toContain("disabled");
    expect(html).not.toContain("<table");
  });
  it.each(["pt-BR", "en-US"] as const)("requires selection and distinguishes historical references in %s", locale => {
    const html = render([current, {...current, id: "previous", revision: 1}], locale);
    expect(html).toContain((locale === "pt-BR" ? pt : en).InstitutionalScenarioComparison.boundary);
    expect(html).toContain('value="previous"');
    expect(html).not.toContain("<table");
  });
  it("does not render comparisons without a verified current result", () => {
    expect(render([{...current, id: "previous"}])).toBe("");
  });
});
