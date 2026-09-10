import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/advisor-actions", () => ({reviewAdvisorInstitutionalConfiguration: vi.fn()}));
import {displayAssumptionValue, InstitutionalConfigurationReviewWork} from "./institutional-configuration-review";
import type {InstitutionalConfigurationReview} from "@/lib/advisor/institutional-configuration-reviews";
const candidate: InstitutionalConfigurationReview = {candidateId: "candidate", revision: 2, status: "review_required", configurationFingerprint: "a".repeat(64), parentFingerprint: "b".repeat(64), label: {pt: "Crescimento", en: "Growth"}, period: "2027", unit: "percent", currency: "BRL", priorValue: "0.04", proposedValue: "0.075", canApprove: true, sourceMessageId: "source", answeredAt: "2026-09-10T00:00:00Z"};
describe("institutional premise review", () => {
  it.each(["pt-BR", "en-US"] as const)("shows the before/after and explicit approval boundary in %s", locale => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><InstitutionalConfigurationReviewWork projectId="project" reviews={[candidate]} /></NextIntlClientProvider>);
    expect(html).toContain(locale === "pt-BR" ? "7,5%" : "7.5%");
    expect(html).toContain("4%");
    expect(html).toContain(messages.InstitutionalConfigurationReview.approve);
    expect(html).toContain(messages.InstitutionalConfigurationReview.boundary);
    expect(html).not.toContain(candidate.configurationFingerprint);
  });
  it("disables approval for stale proposals while preserving rejection", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt} timeZone="UTC"><InstitutionalConfigurationReviewWork projectId="project" reviews={[{...candidate, canApprove: false}]} /></NextIntlClientProvider>);
    expect(html).toContain(pt.InstitutionalConfigurationReview.staleParent);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aprovar premissa/);
    expect(html).toMatch(/<button type="button">Rejeitar alteração/);
  });
  it("renders decided candidates without approval buttons", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={pt} timeZone="UTC"><InstitutionalConfigurationReviewWork projectId="project" reviews={[{...candidate, status: "approved"}]} /></NextIntlClientProvider>);
    expect(html).not.toContain("<button");
  });
  it("preserves precise decimal values in percent display", () => {
    expect(displayAssumptionValue("-0.00000123", true, "pt-BR")).toBe("-0,000123%");
    expect(displayAssumptionValue("123456789123456789.12", false, "en-US")).toBe("123456789123456789.12");
  });
});
