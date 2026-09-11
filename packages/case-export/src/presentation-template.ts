/**
 * The client visual identity, as the renderers consume it.
 *
 * A template is a validated definition, not an imported file: palette, typography, an optional
 * logo and an identity with a version. Importing an arbitrary PowerPoint, master, animation or
 * proprietary layout is a different problem with its own scope and validation.
 *
 * Typography is the one place where a document format constrains the identity. Word and PowerPoint
 * carry a font by name and the reader's machine resolves it, so the client's real family is kept.
 * A PDF embeds the glyphs, and this renderer embeds a fixed set of families, so the definition
 * always carries an explicit PDF alternative chosen by a person. Nothing is ever substituted
 * silently: a family outside the set without a recorded alternative is refused.
 */

export const presentationTemplateContractVersion = "2026.09.11-client-template-v1";

/** The families the PDF renderer can embed today. */
export const pdfRenderableFonts = ["Helvetica", "Times New Roman", "Courier New"] as const;
export type PdfRenderableFont = (typeof pdfRenderableFonts)[number];

export const presentationTemplateColorKeys = ["ink", "paper", "accent", "muted", "warning", "danger"] as const;
export type PresentationTemplateColorKey = (typeof presentationTemplateColorKeys)[number];

/**
 * What every renderer consumes. `fonts` are the names Word and PowerPoint carry; `pdfFonts` are
 * the families the PDF renderer embeds, always an explicit choice and never a silent fallback.
 */
export type InstitutionalPresentationTemplate = {
  id: string;
  version: string;
  origin: "offroad_house" | "client_supplied";
  colors: Record<PresentationTemplateColorKey, string>;
  fonts: {display: string; body: string};
  pdfFonts?: {display: PdfRenderableFont; body: PdfRenderableFont};
  logo?: {data: Uint8Array; extension: "png" | "jpeg"};
  logoOnDark?: {data: Uint8Array; extension: "png" | "jpeg"};
  confidentialityLabel?: string;
  /** Identity fingerprint of the stored definition, bound into every exported file. */
  fingerprint?: string;
};

export type PresentationTemplateLogo = {
  objectPath: string;
  sha256: string;
  byteLength: number;
  contentType: "image/png" | "image/jpeg";
};

export type PresentationTemplateDefinition = {
  templateKey: string;
  templateVersion: string;
  origin: "offroad_house" | "client_supplied";
  colors: Record<PresentationTemplateColorKey, string>;
  fonts: {display: string; body: string; pdfDisplay: PdfRenderableFont; pdfBody: PdfRenderableFont};
  logo?: PresentationTemplateLogo | undefined;
  confidentialityLabel?: string | undefined;
};

/** The house identity, used whenever an organization records nothing. */
export const offroadHouseTemplateDefinition: PresentationTemplateDefinition = {
  templateKey: "offroad-house",
  templateVersion: "2026.09.07-v1",
  origin: "offroad_house",
  colors: {ink: "151A20", paper: "F8F8F5", accent: "7D9455", muted: "69737D", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Georgia", body: "Arial", pdfDisplay: "Times New Roman", pdfBody: "Helvetica"},
};

/**
 * What a family becomes in a PDF when the person has not chosen yet. It is a suggestion for the
 * settings surface, never an automatic decision: an unknown family returns null so the person is
 * asked which alternative the PDF should carry.
 */
const pdfSuggestions: Readonly<Record<string, PdfRenderableFont>> = {
  arial: "Helvetica", helvetica: "Helvetica", "helvetica neue": "Helvetica", inter: "Helvetica",
  calibri: "Helvetica", verdana: "Helvetica", tahoma: "Helvetica", "segoe ui": "Helvetica",
  georgia: "Times New Roman", "times new roman": "Times New Roman", garamond: "Times New Roman",
  cambria: "Times New Roman", "book antiqua": "Times New Roman", newsreader: "Times New Roman",
  consolas: "Courier New", "courier new": "Courier New", menlo: "Courier New",
};

export function suggestedPdfFont(family: string): PdfRenderableFont | null {
  return pdfSuggestions[family.trim().toLowerCase()] ?? null;
}

export function isPdfRenderableFont(value: string): value is PdfRenderableFont {
  return (pdfRenderableFonts as readonly string[]).includes(value);
}

export type PresentationTemplateIssue =
  | {code: "invalid_color"; detail: string}
  | {code: "invalid_font"; detail: string}
  | {code: "unsupported_font"; detail: string}
  | {code: "invalid_identity"; detail: string}
  | {code: "invalid_logo"; detail: string};

const colorPattern = /^[0-9A-F]{6}$/;
const fontPattern = /^[A-Za-z0-9 ()+.-]{2,64}$/;
const keyPattern = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
const versionPattern = /^\d{4}\.\d{2}\.\d{2}-v\d{1,3}$/;
const hashPattern = /^[a-f0-9]{64}$/;

/**
 * The same structural rules the database enforces, available before a write so the settings
 * surface can explain the problem instead of surfacing a constraint error.
 */
export function presentationTemplateIssues(definition: PresentationTemplateDefinition): PresentationTemplateIssue[] {
  const issues: PresentationTemplateIssue[] = [];
  if (!keyPattern.test(definition.templateKey)) issues.push({code: "invalid_identity", detail: definition.templateKey});
  if (!versionPattern.test(definition.templateVersion)) issues.push({code: "invalid_identity", detail: definition.templateVersion});
  for (const key of presentationTemplateColorKeys) {
    const value = definition.colors[key];
    if (!value || !colorPattern.test(value)) issues.push({code: "invalid_color", detail: key});
  }
  for (const family of [definition.fonts.display, definition.fonts.body]) {
    if (!fontPattern.test(family)) issues.push({code: "invalid_font", detail: family});
  }
  for (const family of [definition.fonts.pdfDisplay, definition.fonts.pdfBody]) {
    if (!isPdfRenderableFont(family)) issues.push({code: "unsupported_font", detail: family});
  }
  const logo = definition.logo;
  if (logo) {
    if (!hashPattern.test(logo.sha256) || logo.byteLength < 1 || logo.byteLength > 2_097_152
      || !["image/png", "image/jpeg"].includes(logo.contentType) || logo.objectPath.trim().length === 0) {
      issues.push({code: "invalid_logo", detail: logo.objectPath});
    }
  }
  if (definition.confidentialityLabel !== undefined && definition.confidentialityLabel.length > 80) {
    issues.push({code: "invalid_identity", detail: "confidentialityLabel"});
  }
  return issues;
}

/** The database stores snake_case; the renderers read camelCase. One conversion, in one place. */
export function presentationTemplateFromStored(value: unknown): PresentationTemplateDefinition | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const colors = record.colors as Record<string, string> | undefined;
  const fonts = record.fonts as Record<string, string> | undefined;
  const logo = record.logo as Record<string, unknown> | null | undefined;
  if (!colors || !fonts) return null;
  const definition: PresentationTemplateDefinition = {
    templateKey: String(record.template_key ?? ""),
    templateVersion: String(record.template_version ?? ""),
    origin: record.origin === "client_supplied" ? "client_supplied" : "offroad_house",
    colors: Object.fromEntries(presentationTemplateColorKeys.map((key) => [key, colors[key] ?? ""])) as PresentationTemplateDefinition["colors"],
    fonts: {
      display: String(fonts.display ?? ""), body: String(fonts.body ?? ""),
      pdfDisplay: fonts.pdf_display as PdfRenderableFont, pdfBody: fonts.pdf_body as PdfRenderableFont,
    },
    ...(logo ? {logo: {
      objectPath: String(logo.object_path ?? ""), sha256: String(logo.sha256 ?? ""),
      byteLength: Number(logo.byte_length ?? 0), contentType: logo.content_type as PresentationTemplateLogo["contentType"],
    }} : {}),
    ...(typeof record.confidentiality_label === "string" ? {confidentialityLabel: record.confidentiality_label} : {}),
  };
  return presentationTemplateIssues(definition).length === 0 ? definition : null;
}

export function presentationTemplateToStored(definition: PresentationTemplateDefinition): Record<string, unknown> {
  return {
    template_key: definition.templateKey,
    template_version: definition.templateVersion,
    origin: definition.origin,
    colors: {...definition.colors},
    fonts: {display: definition.fonts.display, body: definition.fonts.body, pdf_display: definition.fonts.pdfDisplay, pdf_body: definition.fonts.pdfBody},
    logo: definition.logo
      ? {object_path: definition.logo.objectPath, sha256: definition.logo.sha256, byte_length: definition.logo.byteLength, content_type: definition.logo.contentType}
      : null,
    confidentiality_label: definition.confidentialityLabel ?? null,
  };
}

/**
 * Build what the renderers consume. The logo bytes arrive separately because the definition holds
 * only a reference and a hash; the caller that fetched the object verifies the hash first, and
 * passes nothing when it could not. A missing logo renders the delivery without a mark, which is
 * honest, instead of falling back to somebody else's.
 */
export function institutionalTemplateFromDefinition(
  definition: PresentationTemplateDefinition,
  logo?: {data: Uint8Array; extension: "png" | "jpeg"},
): InstitutionalPresentationTemplate {
  return {
    id: definition.templateKey,
    version: definition.templateVersion,
    origin: definition.origin,
    colors: {...definition.colors},
    fonts: {display: definition.fonts.display, body: definition.fonts.body},
    pdfFonts: {display: definition.fonts.pdfDisplay, body: definition.fonts.pdfBody},
    ...(logo ? {logo} : {}),
    ...(definition.confidentialityLabel ? {confidentialityLabel: definition.confidentialityLabel} : {}),
  };
}

/**
 * The identity recorded inside every exported file. It answers, from the file alone, which
 * template produced it, in which version, from which origin and under which exact definition.
 */
export function presentationTemplateManifest(
  template: InstitutionalPresentationTemplate,
  fingerprint: string,
): readonly {name: string; value: string}[] {
  return [
    {name: "OffroadTemplateId", value: template.id},
    {name: "OffroadTemplateVersion", value: template.version},
    {name: "OffroadTemplateOrigin", value: template.origin},
    {name: "OffroadTemplateFingerprint", value: fingerprint},
    {name: "OffroadTemplateFonts", value: `${template.fonts.display} / ${template.fonts.body}${template.pdfFonts ? ` (PDF: ${template.pdfFonts.display} / ${template.pdfFonts.body})` : ""}`},
    {name: "OffroadTemplateLogo", value: template.logo ? "embedded" : "none"},
  ];
}
