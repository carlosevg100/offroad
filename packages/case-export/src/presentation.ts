import {createHash} from "node:crypto";

import type {Material} from "@offroad/case-materials";
import type {DocxLang, DocxMeta} from "./docx";
import type {DecisionArtifactContract} from "@offroad/case-understanding";
import JSZip from "jszip";
import {chartWorkbook, nativeChartXml, nativeChartFrame} from "./presentation-chart";

export const institutionalPresentationRendererVersion = "2026.09.10-v2";

export type InstitutionalPresentationTemplate = {
  id: string;
  version: string;
  origin: "offroad_house" | "client_supplied";
  colors: {ink: string; paper: string; accent: string; muted: string; warning: string; danger: string};
  fonts: {display: string; body: string};
  logo?: {data: Uint8Array; extension: "png" | "jpeg"};
  logoOnDark?: {data: Uint8Array; extension: "png" | "jpeg"};
  confidentialityLabel?: string;
};

export type InstitutionalPresentationInput = {
  contract: DecisionArtifactContract;
  title: string;
  subtitle?: string;
  companyName?: string;
  audience?: string;
  locale: "pt-BR" | "en-US";
  template?: InstitutionalPresentationTemplate;
};

export type InstitutionalPresentationAudit = {
  rendererVersion: string;
  template: {id: string; version: string; origin: InstitutionalPresentationTemplate["origin"]};
  slideCount: number;
  renderedBlockIds: string[];
  renderedClaimIds: string[];
  renderedSeriesIds: string[];
  renderedSourceIds: string[];
  renderedAssumptionIds: string[];
  renderedGapIds: string[];
  contractFingerprint: string;
  snapshotFingerprint: string;
  fileSha256: string;
  packageInspection: {valid: boolean; missingParts: string[]};
  visualInspection: {state: "not_run" | "passed" | "failed"; reviewedPageCount: number};
  releaseEligible: boolean;
};

export type InstitutionalPresentationResult = {bytes: Uint8Array; audit: InstitutionalPresentationAudit};

const EMU_W = 12_192_000;
const EMU_H = 6_858_000;
const FIXED_ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");

export const offroadHousePresentationTemplate: InstitutionalPresentationTemplate = {
  id: "offroad-house",
  version: "2026.09.07-v1",
  origin: "offroad_house",
  colors: {ink: "151A20", paper: "F8F8F5", accent: "7D9455", muted: "69737D", warning: "A66C1F", danger: "A23B3B"},
  fonts: {display: "Georgia", body: "Arial"},
};

type PresentationView = DecisionArtifactContract["views"][number];
type PresentationBlock = PresentationView["blocks"][number];
type PresentationSeries = NonNullable<DecisionArtifactContract["series"]>[number];

type SlideSpec = {
  title: string;
  eyebrow: string;
  kind: "cover" | PresentationBlock["kind"];
  blockId: string | null;
  lines: Array<{label: string; value?: string | undefined; note?: string | undefined; tone?: "normal" | "gap" | "source" | "danger"; traceId: string}>;
  series?: PresentationSeries[];
  table?: {headers: string[]; rows: string[][]};
};

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function color(value: string): string {
  const normalized = value.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(normalized)) throw new Error(`invalid presentation color ${value}`);
  return normalized;
}

function textRun(text: string, options: {size: number; color: string; bold?: boolean; font: string}): string {
  return `<a:r><a:rPr lang="pt-BR" sz="${Math.round(options.size * 100)}" b="${options.bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${color(options.color)}"/></a:solidFill><a:latin typeface="${xml(options.font)}"/></a:rPr><a:t>${xml(text)}</a:t></a:r>`;
}

function paragraph(text: string, options: {size: number; color: string; bold?: boolean; font: string; bullet?: boolean; level?: number}): string {
  const bullet = options.bullet ? '<a:buChar char="•"/>' : "<a:buNone/>";
  const margin = options.bullet ? ' marL="285750" indent="-142875"' : "";
  return `<a:p><a:pPr lvl="${options.level ?? 0}"${margin}>${bullet}</a:pPr>${textRun(text, options)}<a:endParaRPr lang="pt-BR" sz="${Math.round(options.size * 100)}"/></a:p>`;
}

function shape(input: {id: number; name: string; x: number; y: number; w: number; h: number; fill?: string; line?: string; paragraphs?: string; margin?: number}): string {
  const fill = input.fill ? `<a:solidFill><a:srgbClr val="${color(input.fill)}"/></a:solidFill>` : "<a:noFill/>";
  const line = input.line ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${color(input.line)}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>";
  const body = input.paragraphs === undefined ? "" : `<p:txBody><a:bodyPr wrap="square" lIns="${input.margin ?? 0}" rIns="${input.margin ?? 0}" tIns="${input.margin ?? 0}" bIns="${input.margin ?? 0}" anchor="t"/><a:lstStyle/>${input.paragraphs}</p:txBody>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${input.id}" name="${xml(input.name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${input.x}" y="${input.y}"/><a:ext cx="${input.w}" cy="${input.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>${body}</p:sp>`;
}

function picture(id: number, extension: "png" | "jpeg", x: number, y: number, w: number, h: number): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Offroad mark.${extension}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function formatValue(value: string | number | boolean | null, unit: string | null, locale: InstitutionalPresentationInput["locale"]): string {
  if (value === null) return locale === "pt-BR" ? "Não calculável" : "Not computable";
  if (typeof value === "string" && unit?.startsWith("decimais") && value.split(",").every((item) => Number.isFinite(Number(item)))) {
    return value.split(",").map((item) => `${new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(Number(item) * 100)}%`).join(" · ");
  }
  if (typeof value === "number" && unit?.startsWith("decimal")) {
    return `${new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(value * 100)}%${unit.includes("a.a.") ? " a.a." : ""}`;
  }
  const rendered = typeof value === "number" ? new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(value) : typeof value === "boolean" ? (value ? (locale === "pt-BR" ? "Sim" : "Yes") : (locale === "pt-BR" ? "Não" : "No")) : value;
  if (unit === "x") return `${rendered}x`;
  if (unit?.startsWith("R$ ")) return `R$ ${rendered} ${unit.slice(3)}`;
  return unit ? `${rendered} ${unit}` : rendered;
}

function evidenceLabel(state: DecisionArtifactContract["claims"][number]["evidenceState"], locale: InstitutionalPresentationInput["locale"]): string {
  const labels = locale === "pt-BR"
    ? {observed_public: "Público", observed_private: "Privado", calculated: "Calculado", assumption: "Premissa", mixed: "Evidência mista", not_computable: "Não calculável"}
    : {observed_public: "Public", observed_private: "Private", calculated: "Calculated", assumption: "Assumption", mixed: "Mixed evidence", not_computable: "Not computable"};
  return labels[state];
}

function buildSlides(input: InstitutionalPresentationInput, view: PresentationView): SlideSpec[] {
  const claims = new Map(input.contract.claims.map((item) => [item.id, item]));
  const sources = new Map(input.contract.sources.map((item) => [item.id, item]));
  const assumptions = new Map(input.contract.assumptions.map((item) => [item.id, item]));
  const gaps = new Map(input.contract.gaps.map((item) => [item.id, item]));
  const series = new Map((input.contract.series ?? []).map((item) => [item.id, item]));
  const sourceNumbers = new Map(input.contract.sources.map((source, index) => [source.id, index + 1]));
  const cover: SlideSpec = {
    title: input.title,
    eyebrow: input.companyName ?? (input.locale === "pt-BR" ? "ANÁLISE DE CRÉDITO" : "CREDIT ANALYSIS"),
    kind: "cover",
    blockId: null,
    lines: [
      ...(input.subtitle ? [{label: input.subtitle, traceId: "cover-subtitle"}] : []),
      {label: `${input.locale === "pt-BR" ? "Data-base" : "As of"}: ${input.contract.asOf}`, traceId: "cover-as-of"},
      ...(input.audience ? [{label: `${input.locale === "pt-BR" ? "Audiência" : "Audience"}: ${input.audience}`, traceId: "cover-audience"}] : []),
    ],
  };

  const slides = view.blocks.flatMap((block): SlideSpec[] => {
    const lines: SlideSpec["lines"] = [];
    for (const claimId of block.claimIds) {
      const claim = claims.get(claimId);
      if (!claim) continue;
      const references = claim.sourceIds.map((sourceId) => sourceNumbers.get(sourceId)).filter(Boolean).join(", ");
      lines.push({
        label: claim.label,
        value: formatValue(claim.value, claim.unit, input.locale),
        note: `${evidenceLabel(claim.evidenceState, input.locale)}${references ? ` · ${input.locale === "pt-BR" ? "fontes" : "sources"} ${references}` : ""}`,
        tone: typeof claim.value === "number" && claim.value < 0 ? "danger" : "normal",
        traceId: claim.id,
      });
    }
    for (const assumptionId of block.assumptionIds) {
      const assumption = assumptions.get(assumptionId);
      if (!assumption) continue;
      lines.push({label: assumption.label, value: formatValue(assumption.value, assumption.unit, input.locale), note: `${assumption.basis} · ${assumption.editable ? (input.locale === "pt-BR" ? "editável" : "editable") : (input.locale === "pt-BR" ? "fixa" : "fixed")}`, traceId: assumption.id});
    }
    for (const gapId of block.gapIds) {
      const gap = gaps.get(gapId);
      if (!gap) continue;
      lines.push({label: gap.label, value: gap.requestedInput, note: `${gap.materiality.toUpperCase()} · ${gap.impact}`, tone: "gap", traceId: gap.id});
    }
    for (const sourceId of block.sourceIds) {
      const source = sources.get(sourceId);
      if (!source) continue;
      lines.push({label: `[${sourceNumbers.get(source.id)}] ${source.title}`, value: source.asOf, note: `${source.classification.toUpperCase()} · ${source.locator}`, tone: "source", traceId: source.id});
    }
    const blockSeries = (block.seriesIds ?? []).map((seriesId) => series.get(seriesId)!).filter(Boolean);
    if (lines.length === 0 && blockSeries.length === 0) throw new Error(`presentation block ${block.id} has no renderable governed content`);
    if (blockSeries.length > 1) throw new Error(`presentation block ${block.id} exceeds the one-series institutional chart limit`);
    if (blockSeries.length === 1) {
      if (blockSeries[0]!.points.length > 12) throw new Error(`presentation series ${blockSeries[0]!.id} exceeds the 12-point institutional chart limit`);
      const chartSlide: SlideSpec = {title: block.title, eyebrow: sectionLabel(block.kind, input.locale), kind: block.kind, blockId: block.id, lines: [], series: blockSeries};
      return [chartSlide, ...paginateLines(lines).map((chunk): SlideSpec => ({title: block.title, eyebrow: sectionLabel(block.kind, input.locale), kind: block.kind, blockId: block.id, lines: chunk}))];
    }
    // Real institutional appendices often carry more than 32 governed sources or open points.
    // Preserve them and paginate; the 40-slide package ceiling remains the hard bound against
    // an accidental unbounded deck.
    if (lines.length > 120) throw new Error(`presentation block ${block.id} exceeds the 120-item governed block safety limit`);
    const chunks = paginateLines(lines);
    return chunks.map((chunk, index) => ({
      title: block.title,
      eyebrow: `${sectionLabel(block.kind, input.locale)}${chunks.length > 1 ? ` · ${index + 1}/${chunks.length}` : ""}`,
      kind: block.kind,
      blockId: block.id,
      lines: chunk,
    }));
  });
  return [cover, ...slides];
}

function lineWeight(line: SlideSpec["lines"][number]): number {
  return Math.max(1, Math.ceil(line.label.length / (line.value || line.note ? 110 : 220)), Math.ceil(((line.value?.length ?? 0) + (line.note?.length ?? 0)) / 130));
}
function textChunks(value: string, maximum = 350): string[] {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maximum) {
    const space = remaining.lastIndexOf(" ", maximum);
    const at = space > maximum / 2 ? space : maximum;
    chunks.push(remaining.slice(0, at));
    remaining = remaining.slice(at).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
function paginateLines(lines: SlideSpec["lines"]): SlideSpec["lines"][] {
  const expanded = lines.flatMap((line) => {
    const labels = textChunks(line.label), values = textChunks(line.value ?? ""), notes = textChunks(line.note ?? "");
    return Array.from({length: Math.max(labels.length, values.length, notes.length, 1)}, (_, index) => ({...line, label: labels[index] ?? "", value: values[index], note: notes[index]}));
  });
  const pages: SlideSpec["lines"][] = [];
  let page: SlideSpec["lines"] = [], weight = 0;
  for (const line of expanded) {
    const next = lineWeight(line);
    if (page.length && weight + next > 6) {pages.push(page); page = []; weight = 0;}
    page.push(line); weight += next;
  }
  if (page.length) pages.push(page);
  return pages;
}

function sectionLabel(kind: PresentationBlock["kind"], locale: InstitutionalPresentationInput["locale"]): string {
  const labels = locale === "pt-BR"
    ? {headline: "SÍNTESE", metric: "LEITURA FINANCEIRA", table: "ANÁLISE", chart: "CENÁRIO", narrative: "CONTEXTO", decision: "ALTERNATIVAS", gap: "PONTOS EM ABERTO", source_register: "FONTES"}
    : {headline: "SUMMARY", metric: "FINANCIAL VIEW", table: "ANALYSIS", chart: "SCENARIO", narrative: "CONTEXT", decision: "ALTERNATIVES", gap: "OPEN ITEMS", source_register: "SOURCES"};
  return labels[kind];
}

function slideXml(spec: SlideSpec, index: number, total: number, input: {locale: InstitutionalPresentationInput["locale"]; contract: {asOf: string}}, template: InstitutionalPresentationTemplate): string {
  const c = template.colors;
  const isCover = spec.kind === "cover";
  const background = isCover ? c.ink : c.paper;
  const foreground = isCover ? c.paper : c.ink;
  const muted = isCover ? "C4C9CE" : c.muted;
  const shapes: string[] = [];
  shapes.push(shape({id: 2, name: "Background", x: 0, y: 0, w: EMU_W, h: EMU_H, fill: background}));
  shapes.push(shape({id: 3, name: "Accent", x: 610_000, y: isCover ? 680_000 : 420_000, w: isCover ? 1_070_000 : 650_000, h: 58_000, fill: c.accent}));
  shapes.push(shape({id: 4, name: "Eyebrow", x: 610_000, y: isCover ? 820_000 : 300_000, w: 8_400_000, h: 310_000, paragraphs: paragraph(spec.eyebrow, {size: 10, color: isCover ? c.accent : c.muted, bold: true, font: template.fonts.body})}));

  if (isCover) {
    shapes.push(shape({id: 5, name: "Title", x: 610_000, y: 1_400_000, w: 9_200_000, h: 2_100_000, paragraphs: paragraph(spec.title, {size: spec.title.length > 70 ? 28 : 36, color: foreground, bold: false, font: template.fonts.display})}));
    const detail = spec.lines.map((line) => paragraph(line.label, {size: 13, color: muted, font: template.fonts.body})).join("");
    shapes.push(shape({id: 6, name: "Cover details", x: 610_000, y: 4_150_000, w: 7_500_000, h: 1_300_000, paragraphs: detail}));
  } else {
    shapes.push(shape({id: 5, name: "Title", x: 610_000, y: 760_000, w: 10_600_000, h: 840_000, paragraphs: paragraph(spec.title, {size: spec.title.length > 55 ? 24 : 29, color: foreground, font: template.fonts.display})}));
    if (spec.table) {
      shapes.push(tableShape(spec.table, template));
    } else if (spec.series?.length) {
      shapes.push(shape({id: 12, name: "Chart measure and units", x: 610_000, y: 1_500_000, w: 10_600_000, h: 240_000, paragraphs: paragraph(`${spec.series[0]!.label}${spec.series[0]!.unit ? ` · ${spec.series[0]!.unit}` : ""}`, {size: 11, color: c.muted, font: template.fonts.body})}));
      shapes.push(nativeChartFrame);
    } else {
    const availableHeight = 4_500_000;
    const weights = spec.lines.map(lineWeight);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    let usedHeight = 0;
    spec.lines.forEach((line, lineIndex) => {
      const rowHeight = Math.floor(availableHeight * weights[lineIndex]! / weightSum);
      const y = 1_720_000 + usedHeight;
      usedHeight += rowHeight;
      const toneColor = line.tone === "gap" ? c.warning : line.tone === "source" ? c.accent : line.tone === "danger" ? c.danger : c.ink;
      shapes.push(shape({id: 10 + lineIndex * 3, name: `Governed row · ${line.traceId}`, x: 610_000, y, w: 10_950_000, h: Math.max(410_000, rowHeight - 55_000), fill: lineIndex % 2 === 0 ? "FFFFFF" : c.paper, line: "DDE1E4"}));
      shapes.push(shape({id: 11 + lineIndex * 3, name: `Label · ${line.traceId}`, x: 820_000, y: y + 85_000, w: line.value || line.note ? 4_850_000 : 10_300_000, h: Math.max(260_000, rowHeight - 150_000), paragraphs: paragraph(line.label, {size: spec.lines.length > 5 ? 13 : 15, color: toneColor, bold: true, font: template.fonts.body})}));
      const right = [line.value ? paragraph(line.value, {size: (line.value?.length ?? 0) > 70 ? 12 : spec.lines.length > 5 ? 14 : spec.lines.length <= 2 ? 24 : 16, color: line.tone === "danger" ? c.danger : c.ink, bold: true, font: template.fonts.body}) : "", line.note ? paragraph(line.note, {size: 10, color: c.muted, font: template.fonts.body}) : ""].join("");
      shapes.push(shape({id: 12 + lineIndex * 3, name: `Value · ${line.traceId}`, x: 5_900_000, y: y + 75_000, w: 5_350_000, h: Math.max(280_000, rowHeight - 130_000), paragraphs: right}));
    });
    }
  }

  const selectedLogo = isCover ? template.logoOnDark ?? template.logo : template.logo;
  if (selectedLogo) shapes.push(picture(90, selectedLogo.extension, 10_790_000, isCover ? 520_000 : 270_000, 710_000, 710_000));
  const confidentiality = template.confidentialityLabel ?? (input.locale === "pt-BR" ? "CONFIDENCIAL · MATERIAL DE TRABALHO" : "CONFIDENTIAL · WORKING MATERIAL");
  const footer = `${confidentiality} · ${input.locale === "pt-BR" ? "Data-base" : "As of"} ${input.contract.asOf} · ${index}/${total}`;
  shapes.push(shape({id: 91, name: "Footer", x: 610_000, y: 6_480_000, w: 10_900_000, h: 190_000, paragraphs: paragraph(footer, {size: 7.5, color: muted, font: template.fonts.body})}));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function tableShape(table: NonNullable<SlideSpec["table"]>, template: InstitutionalPresentationTemplate): string {
  const cols = table.headers.length, columnWidth = Math.floor(10_950_000 / cols);
  const rows = [table.headers, ...table.rows];
  const heights = rows.map(row => Math.max(350_000, ...row.map(cell => (Math.ceil(cell.length / (120 / cols)) * 180_000) + 160_000)));
  const height = heights.reduce((a, b) => a + b, 0);
  const contents = rows.map((row, index) => `<a:tr h="${heights[index]}">${row.map(cell => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraph(cell, {size: 12, color: index === 0 ? "FFFFFF" : template.colors.ink, font: template.fonts.body, bold: index === 0})}</a:txBody><a:tcPr marL="110000" marR="110000" marT="80000" marB="80000"><a:solidFill><a:srgbClr val="${index === 0 ? template.colors.ink : index % 2 === 0 ? "EEF0ED" : "FFFFFF"}"/></a:solidFill></a:tcPr></a:tc>`).join("")}</a:tr>`).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="10" name="Editable approved table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="610000" y="1720000"/><a:ext cx="10950000" cy="${height}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${Array.from({length: cols}, () => `<a:gridCol w="${columnWidth}"/>`).join("")}</a:tblGrid>${contents}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`;

function contentTypes(slideCount: number, logos: Array<InstitutionalPresentationTemplate["logo"]>): string {
  const slides = Array.from({length: slideCount}, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const extensions = [...new Set(logos.filter(Boolean).map((logo) => logo!.extension))];
  const logoDefault = extensions.map((extension) => `<Default Extension="${extension === "jpeg" ? "jpeg" : "png"}" ContentType="image/${extension}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logoDefault}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`;
}

function presentationXml(slideCount: number): string {
  const slideIds = Array.from({length: slideCount}, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${EMU_W}" cy="${EMU_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="pt-BR"/></a:defPPr></p:defaultTextStyle></p:presentation>`;
}

function presentationRelationships(slideCount: number): string {
  const slides = Array.from({length: slideCount}, (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}</Relationships>`;
}

const slideMaster = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Offroad blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`;
const slideMasterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
const slideLayout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const slideLayoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Offroad"><a:themeElements><a:clrScheme name="Offroad"><a:dk1><a:srgbClr val="151A20"/></a:dk1><a:lt1><a:srgbClr val="F8F8F5"/></a:lt1><a:dk2><a:srgbClr val="333A42"/></a:dk2><a:lt2><a:srgbClr val="EEF0ED"/></a:lt2><a:accent1><a:srgbClr val="7D9455"/></a:accent1><a:accent2><a:srgbClr val="69737D"/></a:accent2><a:accent3><a:srgbClr val="A66C1F"/></a:accent3><a:accent4><a:srgbClr val="A23B3B"/></a:accent4><a:accent5><a:srgbClr val="9BAA82"/></a:accent5><a:accent6><a:srgbClr val="DDE1E4"/></a:accent6><a:hlink><a:srgbClr val="4A6D8C"/></a:hlink><a:folHlink><a:srgbClr val="72557A"/></a:folHlink></a:clrScheme><a:fontScheme name="Offroad"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Offroad"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

function coreProperties(input: {title: string; contract: {asOf: string}}): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(input.title)}</dc:title><dc:creator>Offroad Capital</dc:creator><cp:lastModifiedBy>Offroad governed renderer</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${input.contract.asOf}T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${input.contract.asOf}T00:00:00Z</dcterms:modified></cp:coreProperties>`;
}

function appProperties(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Offroad Capital</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><Company>Offroad Capital</Company><AppVersion>1.0</AppVersion></Properties>`;
}

function customProperties(input: InstitutionalPresentationInput, template: InstitutionalPresentationTemplate): string {
  const values: Array<readonly [string, string]> = [
    ["OffroadContractFingerprint", input.contract.contractFingerprint],
    ["OffroadSnapshotFingerprint", input.contract.snapshotFingerprint],
    ["OffroadCaseId", input.contract.caseId],
    ["OffroadRendererVersion", institutionalPresentationRendererVersion],
    ["OffroadTemplate", `${template.id}@${template.version}`],
    ["OffroadReleaseState", input.contract.release.state],
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${values.map(([name, value], index) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${name}"><vt:lpwstr>${xml(value)}</vt:lpwstr></property>`).join("")}</Properties>`;
}

function slideRelationships(logoPath?: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${logoPath ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${logoPath}"/>` : ""}</Relationships>`;
}

async function addFile(zip: JSZip, path: string, data: string | Uint8Array): Promise<void> {
  // ZIP directory entries are not required. Letting JSZip create them implicitly stamps those
  // entries with the current time, so identical governed inputs occasionally produced different
  // package bytes across the second boundary even though every real file had a fixed date.
  zip.file(path, data, {date: FIXED_ZIP_DATE, createFolders: false});
}

async function packageSlides(slides: SlideSpec[], input: {title: string; locale: InstitutionalPresentationInput["locale"]; contract: {asOf: string}}, template: InstitutionalPresentationTemplate, customXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  await addFile(zip, "[Content_Types].xml", contentTypes(slides.length, [template.logo, template.logoOnDark]).replace("</Types>", `<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>${slides.map((slide,index)=>slide.series?.length ? `<Override PartName="/ppt/charts/chart${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` : "").join("")}</Types>`));
  await addFile(zip, "_rels/.rels", rootRelationships);
  await addFile(zip, "ppt/presentation.xml", presentationXml(slides.length));
  await addFile(zip, "ppt/_rels/presentation.xml.rels", presentationRelationships(slides.length));
  await addFile(zip, "ppt/slideMasters/slideMaster1.xml", slideMaster);
  await addFile(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels", slideMasterRels);
  await addFile(zip, "ppt/slideLayouts/slideLayout1.xml", slideLayout);
  await addFile(zip, "ppt/slideLayouts/_rels/slideLayout1.xml.rels", slideLayoutRels);
  await addFile(zip, "ppt/theme/theme1.xml", theme);
  await addFile(zip, "docProps/core.xml", coreProperties(input));
  await addFile(zip, "docProps/app.xml", appProperties(slides.length));
  await addFile(zip, "docProps/custom.xml", customXml);
  if (template.logo) await addFile(zip, `ppt/media/offroad-mark.${template.logo.extension}`, template.logo.data);
  if (template.logoOnDark) await addFile(zip, `ppt/media/offroad-mark-dark.${template.logoOnDark.extension}`, template.logoOnDark.data);
  for (const [index, slide] of slides.entries()) {
    await addFile(zip, `ppt/slides/slide${index + 1}.xml`, slideXml(slide, index + 1, slides.length, input, template));
    const selectedLogo = slide.kind === "cover" ? template.logoOnDark ?? template.logo : template.logo;
    const logoPath = selectedLogo ? `${slide.kind === "cover" && template.logoOnDark ? "offroad-mark-dark" : "offroad-mark"}.${selectedLogo.extension}` : undefined;
    await addFile(zip, `ppt/slides/_rels/slide${index + 1}.xml.rels`, slideRelationships(logoPath).replace("</Relationships>", slide.series?.length ? `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${index+1}.xml"/></Relationships>` : "</Relationships>"));
    if (slide.series?.length) {
      await addFile(zip, `ppt/charts/chart${index+1}.xml`, nativeChartXml(slide.series[0]!));
      await addFile(zip, `ppt/embeddings/chart${index+1}.xlsx`, chartWorkbook(slide.series[0]!));
      await addFile(zip, `ppt/charts/_rels/chart${index+1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/chart${index+1}.xlsx"/></Relationships>`);
    }
  }
  const bytes = await zip.generateAsync({type: "uint8array", compression: "DEFLATE", compressionOptions: {level: 9}, platform: "DOS"});
  return bytes;
}

export async function renderInstitutionalPresentation(input: InstitutionalPresentationInput): Promise<InstitutionalPresentationResult> {
  const template = input.template ?? offroadHousePresentationTemplate;
  for (const value of Object.values(template.colors)) color(value);
  const view = input.contract.views.find((candidate) => candidate.surface === "presentation");
  if (!view) throw new Error("decision artifact has no governed presentation view");
  if (view.artifactKind !== "pptx") throw new Error("presentation view is not a pptx surface");
  const slides = buildSlides(input, view);
  if (slides.length > 40) throw new Error("institutional presentation exceeds the 40-slide safety limit");

  const bytes = await packageSlides(slides, input, template, customProperties(input, template));
  const requiredParts = ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/slideMasters/slideMaster1.xml", "ppt/slideLayouts/slideLayout1.xml", "ppt/theme/theme1.xml", ...slides.map((_, index) => `ppt/slides/slide${index + 1}.xml`)];
  const archive = await JSZip.loadAsync(bytes);
  const missingParts = requiredParts.filter((part) => !archive.file(part));
  const renderedClaimIds = [...new Set(view.blocks.flatMap((block) => block.claimIds))].sort();
  const renderedSeriesIds = [...new Set(view.blocks.flatMap((block) => block.seriesIds ?? []))].sort();
  const renderedSeries = (input.contract.series ?? []).filter((series) => renderedSeriesIds.includes(series.id));
  const renderedClaims = input.contract.claims.filter((claim) => renderedClaimIds.includes(claim.id));
  const directAssumptionIds = view.blocks.flatMap((block) => block.assumptionIds);
  const renderedAssumptionIds = [...new Set([...directAssumptionIds, ...renderedClaims.flatMap((claim) => claim.assumptionIds)])].sort();
  const renderedAssumptions = input.contract.assumptions.filter((assumption) => renderedAssumptionIds.includes(assumption.id));
  const renderedSourceIds = [...new Set([...view.blocks.flatMap((block) => block.sourceIds), ...renderedClaims.flatMap((claim) => claim.sourceIds), ...renderedAssumptions.flatMap((assumption) => assumption.sourceIds), ...renderedSeries.flatMap((series) => series.points.flatMap((point) => point.sourceIds))])].sort();
  const renderedGapIds = [...new Set([...view.blocks.flatMap((block) => block.gapIds), ...renderedClaims.flatMap((claim) => claim.gapIds), ...renderedSeries.flatMap((series) => series.points.flatMap((point) => point.gapIds))])].sort();
  return {
    bytes,
    audit: {
      rendererVersion: institutionalPresentationRendererVersion,
      template: {id: template.id, version: template.version, origin: template.origin},
      slideCount: slides.length,
      renderedBlockIds: view.blocks.map((block) => block.id),
      renderedClaimIds,
      renderedSeriesIds,
      renderedSourceIds,
      renderedAssumptionIds,
      renderedGapIds,
      contractFingerprint: input.contract.contractFingerprint,
      snapshotFingerprint: input.contract.snapshotFingerprint,
      fileSha256: createHash("sha256").update(bytes).digest("hex"),
      packageInspection: {valid: missingParts.length === 0, missingParts},
      visualInspection: {state: "not_run", reviewedPageCount: 0},
      releaseEligible: false,
    },
  };
}

/** A faithful editable presentation of the immutable approved material, with no generated claims. */
export async function materialToPptx(input: {material: Material; lang: DocxLang; meta: DocxMeta}): Promise<Uint8Array> {
  const {material, lang, meta} = input;
  const title = material.title[lang];
  const slides: SlideSpec[] = [{title, eyebrow: meta.companyName ?? "OFFROAD", kind: "cover", blockId: null, lines: [{label: `${lang === "pt" ? "Emitido em" : "Issued on"}: ${meta.issuedOn}`, traceId: "issued"}]}];
  let section = title;
  material.blocks.forEach((block, index) => {
    if (block.type === "heading") {section = block.text[lang]; return;}
    let lines: SlideSpec["lines"] = [];
    const traceId = `material-block-${index}`;
    if (block.type === "table" && block.head.length <= 6 && block.rows.every(row => row.length === block.head.length && row.every(cell => cell.length <= 200))) {
      const rowCost = (row: string[]) => Math.max(350_000, ...row.map(cell => Math.ceil(cell.length / (120 / block.head.length)) * 180_000 + 160_000));
      let rows: string[][] = [], cost = 0;
      const flush = () => {if (rows.length) slides.push({title: block.caption[lang], eyebrow: lang === "pt" ? "ANÁLISE" : "ANALYSIS", kind: "table", blockId: traceId, lines: [], table: {headers: block.head.map(head => head[lang]), rows}}); rows = []; cost = 0;};
      block.rows.forEach(row => {const weight = rowCost(row); if (rows.length && cost + weight + rowCost(block.head.map(head => head[lang])) > 4_400_000) flush(); rows.push(row); cost += weight;});
      flush(); return;
    }
    switch (block.type) {
      case "paragraph": case "disclaimer": lines = [{label: block.text[lang], traceId}]; break;
      case "list": lines = block.items.map((item) => ({label: item[lang], traceId})); break;
      case "metrics": lines = block.items.map((item) => ({label: item.label[lang], value: item.formatted[lang], traceId})); break;
      case "kv": section = block.caption?.[lang] ?? section; lines = block.rows.map((row) => row.value[lang].length > 200 ? ({label: `${row.label[lang]}: ${row.value[lang]}${row.note ? ` ${row.note[lang]}` : ""}`, traceId}) : ({label: row.label[lang], value: row.value[lang], note: row.note?.[lang], traceId})); break;
      case "callout": section = block.title[lang]; lines = block.items.map((item) => ({label: item.label[lang], value: item.value[lang], traceId})); break;
      case "table": section = block.caption[lang]; lines = block.rows.flatMap((row, rowIndex) => row.map((value, column) => ({label: `${rowIndex + 1} · ${block.head[column]?.[lang] ?? ""}`, value, traceId}))); break;
    }
    paginateLines(lines).forEach((page) => slides.push({title: section, eyebrow: lang === "pt" ? "ANÁLISE" : "ANALYSIS", kind: "narrative", blockId: traceId, lines: page}));
  });
  if (slides.length > 120) throw new Error("material presentation exceeds the 120-slide safety limit");
  const metadata = `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="OffroadMaterialFingerprint"><vt:lpwstr>${xml(material.artifactFingerprint ?? createHash("sha256").update(JSON.stringify(material)).digest("hex"))}</vt:lpwstr></property></Properties>`;
  return packageSlides(slides, {title, locale: lang === "pt" ? "pt-BR" : "en-US", contract: {asOf: meta.issuedOn.slice(0, 10)}}, offroadHousePresentationTemplate, metadata);
}
