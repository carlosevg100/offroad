import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {offroadHousePresentationStructure} from "@offroad/case-export/presentation-structure";
import {describe, expect, it, vi} from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import enUS from "../../../messages/en-US.json";
import type {PresentationTemplateContext, StoredPresentationTemplate} from "@/lib/advisor/presentation-template";
import {PresentationTemplateSettings} from "./presentation-template-settings";

vi.mock("@/app/[locale]/app/projects/[projectId]/presentation-template-actions", () => ({savePresentationTemplate: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

const projectId = "10000000-0000-4000-8000-000000000001";
const versionId = "50000000-0000-4000-8000-000000000002";
const definition = {
  templateKey: "synthetic-client", templateVersion: "2026.09.11-v1", origin: "client_supplied" as const,
  colors: {ink: "1B2430", paper: "FFFFFF", accent: "1F4E79", muted: "6B7780", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Founders Grotesk", body: "Founders Grotesk", pdfDisplay: "Helvetica" as const, pdfBody: "Helvetica" as const},
  confidentialityLabel: "CONFIDENCIAL",
};
const storedTemplate = (overrides: Partial<StoredPresentationTemplate> = {}): StoredPresentationTemplate => ({
  templateId: "30000000-0000-4000-8000-000000000001", scope: "organization", fingerprint: "c".repeat(64), definition,
  structure: offroadHousePresentationStructure, versionId, versionNo: 2, versionCreatedAt: "2026-09-27T13:00:00Z",
  versions: [
    {versionId, versionNo: 2, createdAt: "2026-09-27T13:00:00Z", authorName: "Ana Lima", isCurrent: true},
    {versionId: "50000000-0000-4000-8000-000000000001", versionNo: 1, createdAt: "2026-09-26T13:00:00Z", authorName: null, isCurrent: false},
  ],
  ...overrides,
});
const context = (overrides: Partial<PresentationTemplateContext> = {}): PresentationTemplateContext => ({
  projectId, organizationId: "20000000-0000-4000-8000-000000000001", canManage: true,
  effective: null, organization: null, project: null, houseStructure: offroadHousePresentationStructure,
  pdfFonts: ["Helvetica", "Times New Roman", "Courier New"], ...overrides,
});
const render = (value: PresentationTemplateContext, locale: "pt-BR" | "en-US" = "pt-BR") =>
  renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="UTC" messages={locale === "pt-BR" ? ptBR : enUS}>
    <PresentationTemplateSettings context={value} locale={locale} projectId={projectId} />
  </NextIntlClientProvider>);

describe("visual identity settings", () => {
  it("states that the Offroad template is in use when nothing is recorded and offers the house structure to start from", () => {
    const html = render(context());
    expect(html).toContain(ptBR.PresentationTemplate.currentHouse);
    expect(html).toContain('name="templateKey"');
    for (const font of ["Helvetica", "Times New Roman", "Courier New"]) expect(html).toContain(`value="${font}"`);
    expect(html).toContain('data-testid="presentation-template-structure"');
    for (const section of offroadHousePresentationStructure.sections) {
      expect(html).toContain(`data-section-key="${section.key}"`);
      expect(html).toContain(section.title["pt-BR"]);
    }
    // No version and no history while nothing is recorded.
    expect(html).not.toContain('data-testid="presentation-template-version"');
    expect(html).not.toContain('data-testid="presentation-template-history"');
  });

  it("shows the recorded identity, its version number, the fingerprint written into the files and the previous versions", () => {
    const stored = storedTemplate();
    const html = render(context({effective: stored, organization: stored}));
    expect(html).toContain("synthetic-client");
    expect(html).toContain("2026.09.11-v1");
    expect(html).toContain("cccccccccccc");
    expect(html).toContain("1F4E79");
    expect(html).toContain('data-testid="presentation-template-version" data-version="2"');
    expect(html).toContain("Versão 2, gravada em");
    expect(html).toContain('data-testid="presentation-template-history"');
    expect(html).toContain(ptBR.PresentationTemplate.versionHistoryTitle);
    expect(html).toContain("Versão 1,");
    expect(html).toContain(ptBR.PresentationTemplate.authorUnknown);
    // The current version is not listed among the previous ones, and no identifier is shown.
    expect(html).not.toContain("Ana Lima");
    expect(html).not.toContain(versionId);
    expect(html).not.toContain("50000000-0000-4000-8000-000000000001");
  });

  it("lets the person mark required fields and choose audiences on the stored structure", () => {
    const stored = storedTemplate();
    const html = render(context({effective: stored, organization: stored}));
    expect(html).toContain('data-testid="presentation-template-required-decision-headline-headline-metrics" checked=""');
    expect(html).toContain('data-testid="presentation-template-required-open-gaps-gap-list"');
    expect(html).not.toContain('data-testid="presentation-template-required-open-gaps-gap-list" checked=""');
    expect(html).toContain(`aria-label="${ptBR.PresentationTemplate.moveDown.replace("{title}", "Situação e implicação")}"`);
    for (const audience of Object.values(ptBR.PresentationTemplate.audience)) expect(html).toContain(audience);
    for (const kind of Object.values(ptBR.PresentationTemplate.kinds)) expect(html).toContain(kind);
  });

  it("asks for an explicit PDF choice when the client family cannot be embedded", () => {
    const stored = storedTemplate();
    expect(render(context({effective: stored, organization: stored}))).toContain(ptBR.PresentationTemplate.fontChoiceRequired);
  });

  it("suggests an alternative when the family maps to one the renderer embeds", () => {
    const arial = {...definition, fonts: {...definition.fonts, display: "Arial", body: "Arial"}};
    const stored = storedTemplate({definition: arial});
    const html = render(context({effective: stored, organization: stored}));
    expect(html).toContain("Helvetica");
    expect(html).not.toContain(ptBR.PresentationTemplate.fontChoiceRequired);
  });

  it("does not offer the form to a member who cannot manage the organization, but still shows the versions", () => {
    const stored = storedTemplate();
    const html = render(context({canManage: false, effective: stored, organization: stored}));
    expect(html).toContain(ptBR.PresentationTemplate.readOnly);
    expect(html).not.toContain('name="templateKey"');
    expect(html).not.toContain('data-testid="presentation-template-structure"');
    expect(html).toContain('data-testid="presentation-template-history"');
  });

  it("keeps both catalogs free of em and en dashes and renders in English", () => {
    for (const catalog of [ptBR, enUS]) {
      expect(JSON.stringify(catalog.PresentationTemplate)).not.toContain("—");
      expect(JSON.stringify(catalog.PresentationTemplate)).not.toContain("–");
    }
    const stored = storedTemplate();
    const html = render(context({effective: stored, organization: stored}), "en-US");
    expect(html).toContain("Version 2, recorded on");
    expect(html).toContain(enUS.PresentationTemplate.versionHistoryTitle);
    expect(html).toContain("Situation and implication");
  });
});
