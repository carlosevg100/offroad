import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import enUS from "../../../messages/en-US.json";
import type {PresentationTemplateContext} from "@/lib/advisor/presentation-template";
import {PresentationTemplateSettings} from "./presentation-template-settings";

vi.mock("@/app/[locale]/app/projects/[projectId]/presentation-template-actions", () => ({savePresentationTemplate: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

const projectId = "10000000-0000-4000-8000-000000000001";
const definition = {
  templateKey: "synthetic-client", templateVersion: "2026.09.11-v1", origin: "client_supplied" as const,
  colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "6B7780", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Founders Grotesk", body: "Founders Grotesk", pdfDisplay: "Helvetica" as const, pdfBody: "Helvetica" as const},
  confidentialityLabel: "CONFIDENCIAL",
};
const context = (overrides: Partial<PresentationTemplateContext> = {}): PresentationTemplateContext => ({
  projectId, organizationId: "20000000-0000-4000-8000-000000000001", canManage: true,
  effective: null, organization: null, project: null, pdfFonts: ["Helvetica", "Times New Roman", "Courier New"], ...overrides,
});
const render = (value: PresentationTemplateContext, locale: "pt-BR" | "en-US" = "pt-BR") =>
  renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="UTC" messages={locale === "pt-BR" ? ptBR : enUS}>
    <PresentationTemplateSettings context={value} locale={locale} projectId={projectId} />
  </NextIntlClientProvider>);

describe("visual identity settings", () => {
  it("states that the Offroad template is in use when nothing is recorded", () => {
    const html = render(context());
    expect(html).toContain(ptBR.PresentationTemplate.currentHouse);
    expect(html).toContain('name="templateKey"');
    for (const font of ["Helvetica", "Times New Roman", "Courier New"]) expect(html).toContain(`value="${font}"`);
  });

  it("shows the recorded identity, its scope and the fingerprint written into the files", () => {
    const stored = {templateId: "30000000-0000-4000-8000-000000000001", scope: "organization" as const, fingerprint: "c".repeat(64), definition};
    const html = render(context({effective: stored, organization: stored}));
    expect(html).toContain("synthetic-client");
    expect(html).toContain("2026.09.11-v1");
    expect(html).toContain("cccccccccccc");
    expect(html).toContain("1F4E79");
  });

  it("asks for an explicit PDF choice when the client family cannot be embedded", () => {
    const stored = {templateId: "30000000-0000-4000-8000-000000000001", scope: "organization" as const, fingerprint: "c".repeat(64), definition};
    expect(render(context({effective: stored, organization: stored}))).toContain(ptBR.PresentationTemplate.fontChoiceRequired);
  });

  it("suggests an alternative when the family maps to one the renderer embeds", () => {
    const arial = {...definition, fonts: {...definition.fonts, display: "Arial", body: "Arial"}};
    const stored = {templateId: "30000000-0000-4000-8000-000000000001", scope: "organization" as const, fingerprint: "c".repeat(64), definition: arial};
    const html = render(context({effective: stored, organization: stored}));
    expect(html).toContain("Helvetica");
    expect(html).not.toContain(ptBR.PresentationTemplate.fontChoiceRequired);
  });

  it("does not offer the form to a member who cannot manage the organization", () => {
    const html = render(context({canManage: false}));
    expect(html).toContain(ptBR.PresentationTemplate.readOnly);
    expect(html).not.toContain('name="templateKey"');
  });

  it("keeps both catalogs free of em dashes and renders in English", () => {
    for (const catalog of [ptBR, enUS]) expect(JSON.stringify(catalog.PresentationTemplate)).not.toContain("—");
    expect(render(context(), "en-US")).toContain(enUS.PresentationTemplate.currentHouse);
  });
});
