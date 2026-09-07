import {createHash} from "node:crypto";

import JSZip from "jszip";

import type {Cell, CellFormat, CellRole, FinancialModel} from "./model";
import {toXlsxBuffer} from "./workbook";

/**
 * The styled, inspectable workbook writer.
 *
 * The numerical model remains owned by `FinancialModel`: this layer is deliberately unable to
 * invent a number or formula. It only projects those governed cells into a professional Excel
 * package, adds navigation and print behaviour, and produces an audit receipt. Keeping those two
 * responsibilities separate is what lets us improve visual quality without changing economics.
 */

export const governedWorkbookRendererVersion = "2026.09.07-v1";

export type GovernedWorkbookMetadata = {
  title: string;
  companyName?: string;
  asOfDate: string;
  currency: string;
  scale: string;
  classification: "internal" | "confidential";
  decisionContractFingerprint?: string;
  artifactClass?: "credit_model" | "decision_workbook";
};

export type GovernedWorkbookAudit = {
  rendererVersion: string;
  formulaCount: number;
  crossSheetFormulaCount: number;
  editableInputCount: number;
  historicalCellCount: number;
  styledCellCount: number;
  populatedCellCount: number;
  hardcodeViolations: Array<{sheet: string; cell: string; reason: string}>;
  formulaCoveragePassed: boolean;
  styleCoveragePassed: boolean;
  visualInspection: "not_run";
  releaseEligible: false;
  contentSha256: string;
};

export type GovernedWorkbookResult = {bytes: Uint8Array; audit: GovernedWorkbookAudit};

type StyleKey = `${CellRole}:${CellFormat}:${"local" | "cross"}`;

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const MONEY = "#,##0;[Red](#,##0);-";
const PERCENT = "0.0%;[Red](0.0%);-";
const MULTIPLE = '0.00x;[Red](0.00x);-';
const INTEGER = "#,##0;[Red](#,##0);-";
const YEARS = '0\" a\"';

const formats: CellFormat[] = ["text", "money", "percent", "multiple", "integer", "years"];
const roles: CellRole[] = ["input", "formula", "historical", "label", "header", "total", "note"];

const fontIds = {body: 0, title: 1, header: 2, input: 3, cross: 4, note: 5, total: 6} as const;
const fillIds = {none: 0, gray125: 1, navy: 2, input: 3, note: 4} as const;
const borderIds = {none: 0, header: 1, total: 2, bottom: 3} as const;

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function numberFormatId(format: CellFormat): number {
  return {text: 49, money: 164, percent: 165, multiple: 166, integer: 167, years: 168}[format];
}

function styleComponents(role: CellRole, crossSheet: boolean) {
  if (role === "header") return {font: fontIds.header, fill: fillIds.navy, border: borderIds.header, align: 1};
  if (role === "input") return {font: fontIds.input, fill: fillIds.input, border: borderIds.bottom, align: 0};
  if (role === "note") return {font: fontIds.note, fill: fillIds.none, border: borderIds.none, align: 2};
  if (role === "total") return {font: fontIds.total, fill: fillIds.none, border: borderIds.total, align: 0};
  if (role === "formula" && crossSheet) return {font: fontIds.cross, fill: fillIds.none, border: borderIds.none, align: 0};
  return {font: fontIds.body, fill: fillIds.none, border: borderIds.none, align: 0};
}

function styleCatalogue() {
  const ids = new Map<StyleKey, number>();
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  for (const role of roles) {
    for (const format of formats) {
      for (const cross of [false, true]) {
        const key: StyleKey = `${role}:${format}:${cross ? "cross" : "local"}`;
        const c = styleComponents(role, cross);
        const alignment = c.align === 1
          ? '<alignment horizontal="center" vertical="center" wrapText="1"/>'
          : c.align === 2
            ? '<alignment horizontal="left" vertical="top" wrapText="1"/>'
            : `<alignment horizontal="${format === "text" ? "left" : "right"}" vertical="center"/>`;
        ids.set(key, xfs.length);
        xfs.push(`<xf numFmtId="${numberFormatId(format)}" fontId="${c.font}" fillId="${c.fill}" borderId="${c.border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignment}</xf>`);
      }
    }
  }
  const cover = {
    title: xfs.length,
    subtitle: xfs.length + 1,
    body: xfs.length + 2,
    section: xfs.length + 3,
  };
  xfs.push(
    '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '<xf numFmtId="49" fontId="6" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="49" fontId="6" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
  );
  return {ids, xfs, cover};
}

function stylesXml(xfs: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}"><numFmts count="5"><numFmt numFmtId="164" formatCode="${esc(MONEY)}"/><numFmt numFmtId="165" formatCode="${esc(PERCENT)}"/><numFmt numFmtId="166" formatCode="${esc(MULTIPLE)}"/><numFmt numFmtId="167" formatCode="${esc(INTEGER)}"/><numFmt numFmtId="168" formatCode="${esc(YEARS)}"/></numFmts><fonts count="7"><font><sz val="10"/><color rgb="FF17212B"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="15"/><color rgb="FF17212B"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font><font><sz val="10"/><color rgb="FF0000FF"/><name val="Arial"/><family val="2"/></font><font><sz val="10"/><color rgb="FF008000"/><name val="Arial"/><family val="2"/></font><font><i/><sz val="9"/><color rgb="FF68737D"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FF17212B"/><name val="Arial"/><family val="2"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF101923"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFFFFFFF"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF17212B"/></top><bottom style="double"><color rgb="FF17212B"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFB7BEC5"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
}

function cellAddress(column: number, row: number): string {
  let current = column + 1;
  let letters = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return `${letters}${row + 1}`;
}

function setCellStyle(xml: string, address: string, styleId: number): string {
  const pattern = new RegExp(`<c\\s+([^>]*\\br="${address}"[^>]*)>`, "g");
  return xml.replace(pattern, (_match, attributes: string) => {
    const withoutStyle = attributes.replace(/\s+s="[^"]*"/g, "");
    return `<c ${withoutStyle} s="${styleId}">`;
  });
}

function replaceSheetView(xml: string, split: {x: number; y: number} | null): string {
  const pane = !split ? "" : `<pane${split.x ? ` xSplit="${split.x}"` : ""}${split.y ? ` ySplit="${split.y}"` : ""} topLeftCell="${cellAddress(split.x, split.y)}" activePane="bottomRight" state="frozen"/>`;
  const view = `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>`;
  if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)) return xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, view);
  return xml.replace(/(<worksheet[^>]*>)/, `$1${view}`);
}

function addSheetProperties(xml: string, color: string): string {
  const property = `<sheetPr><tabColor rgb="${color}"/><pageSetUpPr fitToPage="1"/></sheetPr>`;
  if (/<sheetPr[\s\S]*?<\/sheetPr>/.test(xml)) return xml.replace(/<sheetPr[\s\S]*?<\/sheetPr>/, property);
  return xml.replace(/(<worksheet[^>]*>)/, `$1${property}`);
}

function addPageSetup(xml: string, orientation: "portrait" | "landscape"): string {
  const margins = '<pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>';
  const setup = `<pageSetup orientation="${orientation}" paperSize="9" fitToWidth="1" fitToHeight="0"/>`;
  const before = xml.includes("</worksheet>") ? "</worksheet>" : "";
  return before ? xml.replace(before, `${margins}${setup}${before}`) : xml;
}

function setFirstColumnWidth(xml: string, width: number): string {
  if (/<col\b[^>]*\bmin="1"[^>]*\bmax="1"[^>]*\/>/.test(xml)) {
    return xml.replace(/<col\b([^>]*\bmin="1"[^>]*\bmax="1"[^>]*)\/>/, (_match, attributes: string) => {
      const withoutWidth = attributes.replace(/\s+width="[^"]*"/g, "").replace(/\s+customWidth="[^"]*"/g, "");
      return `<col ${withoutWidth} width="${width}" customWidth="1"/>`;
    });
  }
  return xml;
}

function customPropertiesXml(metadata: GovernedWorkbookMetadata): string {
  const values = [
    ["Offroad renderer", governedWorkbookRendererVersion],
    ["Title", metadata.title],
    ["Company", metadata.companyName ?? "not supplied"],
    ["As of", metadata.asOfDate],
    ["Currency", metadata.currency],
    ["Scale", metadata.scale],
    ["Classification", metadata.classification],
    ["Decision contract", metadata.decisionContractFingerprint ?? "not bound"],
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${values.map(([name, value], index) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${esc(name!)}"><vt:lpwstr>${esc(value!)}</vt:lpwstr></property>`).join("")}</Properties>`;
}

async function addCustomProperties(zip: JSZip, metadata: GovernedWorkbookMetadata): Promise<void> {
  const fixedDate = new Date("1980-01-01T00:00:00.000Z");
  zip.file("docProps/custom.xml", customPropertiesXml(metadata), {date: fixedDate});
  const contentTypePath = "[Content_Types].xml";
  const contentTypes = await zip.file(contentTypePath)?.async("string");
  if (!contentTypes) throw new Error("generated workbook is missing [Content_Types].xml");
  const customType = '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>';
  zip.file(contentTypePath, contentTypes.includes("/docProps/custom.xml") ? contentTypes : contentTypes.replace("</Types>", `${customType}</Types>`), {date: fixedDate});
  const relationshipsPath = "_rels/.rels";
  const relationships = await zip.file(relationshipsPath)?.async("string");
  if (!relationships) throw new Error("generated workbook is missing root relationships");
  const customRelationship = '<Relationship Id="rIdOffroadCustom" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>';
  zip.file(relationshipsPath, relationships.includes("custom-properties") ? relationships : relationships.replace("</Relationships>", `${customRelationship}</Relationships>`), {date: fixedDate});
}

function auditModel(model: FinancialModel) {
  let formulaCount = 0;
  let crossSheetFormulaCount = 0;
  let editableInputCount = 0;
  let historicalCellCount = 0;
  let populatedCellCount = 0;
  const hardcodeViolations: Array<{sheet: string; cell: string; reason: string}> = [];
  for (const sheet of model.sheets) {
    sheet.rows.forEach((row, rowIndex) => row.cells.forEach((cell, columnIndex) => {
      if (cell.value !== undefined && cell.value !== "" || cell.formula) populatedCellCount += 1;
      if (cell.formula) {
        formulaCount += 1;
        if (cell.formula.includes("!")) crossSheetFormulaCount += 1;
      }
      if (cell.role === "input") {
        editableInputCount += 1;
        if (sheet.key !== "assumptions") hardcodeViolations.push({sheet: sheet.name.pt, cell: cellAddress(columnIndex, rowIndex), reason: "editable input outside the assumptions sheet"});
      }
      if (cell.role === "historical") historicalCellCount += 1;
      if ((cell.role === "formula" || cell.role === "total") && !cell.formula) {
        hardcodeViolations.push({sheet: sheet.name.pt, cell: cellAddress(columnIndex, rowIndex), reason: "calculation role without a formula"});
      }
    }));
  }
  return {formulaCount, crossSheetFormulaCount, editableInputCount, historicalCellCount, populatedCellCount, hardcodeViolations};
}

/**
 * Build the exact XLSX bytes plus the machine-readable audit that must accompany them.
 * Visual inspection deliberately remains `not_run`; a worker must render every sheet with
 * LibreOffice before the material can ever become externally releasable.
 */
export async function toGovernedXlsxBuffer(
  model: FinancialModel,
  lang: "pt" | "en",
  metadata: GovernedWorkbookMetadata,
): Promise<GovernedWorkbookResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.asOfDate)) throw new RangeError("workbook as-of date must use YYYY-MM-DD");
  const decisionWorkbook = metadata.artifactClass === "decision_workbook";
  const basic = toXlsxBuffer(model, lang, decisionWorkbook ? {
    title: lang === "pt" ? "Workbook de decisão, interno" : "Decision workbook, internal",
    description: lang === "pt"
      ? "Este arquivo projeta claims, premissas, séries, fontes e lacunas de um Decision Artifact governado por fingerprint. Não é um modelo financeiro integrado e não cria projeções ausentes."
      : "This file projects claims, assumptions, series, sources and gaps from a fingerprint-governed Decision Artifact. It is not an integrated financial model and does not create missing projections.",
    controls: lang === "pt"
      ? "As células editáveis estão na aba Premissas. A aba Controle liga os indicadores às linhas governadas de Claims; nenhuma alteração no arquivo modifica o objeto governado que o originou."
      : "Editable cells are on the Assumptions sheet. The Control sheet links indicators to governed Claim rows; editing this file does not change its governed source object.",
    sources: lang === "pt"
      ? "Claims, séries e premissas mantêm os identificadores de fontes, objetos e lacunas do contrato na própria linha."
      : "Claims, series and assumptions retain the contract's source, object and gap identifiers on the same row.",
    assumptionHeading: lang === "pt" ? "Premissas editáveis declaradas no Decision Artifact" : "Editable assumptions declared in the Decision Artifact",
    disclaimer: lang === "pt"
      ? "Uso interno. Este workbook não constitui proposta, aprovação, diligência final, opinião jurídica, distribuição ou recomendação executável."
      : "Internal use. This workbook is not an offer, approval, final diligence, legal opinion, distribution or executable recommendation.",
  } : undefined);
  const zip = await JSZip.loadAsync(basic);
  const catalogue = styleCatalogue();
  zip.file("xl/styles.xml", stylesXml(catalogue.xfs), {date: new Date("1980-01-01T00:00:00.000Z")});

  const coverPath = "xl/worksheets/sheet1.xml";
  const cover = await zip.file(coverPath)?.async("string");
  if (!cover) throw new Error("generated workbook is missing its cover sheet");
  let styledCover = replaceSheetView(cover, null);
  styledCover = addSheetProperties(styledCover, "FF7D9455");
  styledCover = addPageSetup(styledCover, "portrait");
  styledCover = setFirstColumnWidth(styledCover, 86);
  for (let row = 1; row <= 40; row += 1) styledCover = setCellStyle(styledCover, `A${row}`, catalogue.cover.body);
  styledCover = setCellStyle(styledCover, "A1", catalogue.cover.title);
  styledCover = setCellStyle(styledCover, "A2", catalogue.cover.subtitle);
  styledCover = setCellStyle(styledCover, "A8", catalogue.cover.section);
  zip.file(coverPath, styledCover, {date: new Date("1980-01-01T00:00:00.000Z")});

  let styledCellCount = 2;
  for (const [sheetIndex, sheet] of model.sheets.entries()) {
    const path = `xl/worksheets/sheet${sheetIndex + 2}.xml`;
    const source = await zip.file(path)?.async("string");
    if (!source) throw new Error(`generated workbook is missing ${sheet.name[lang]}`);
    const split = sheet.key === "projection" || sheet.key === "debt" || sheet.key === "covenants" ? {x: 1, y: 2} : {x: 0, y: 2};
    let xml = addPageSetup(addSheetProperties(replaceSheetView(source, split), sheet.key === "sources" ? "FF8A939B" : sheet.key === "assumptions" ? "FF7D9455" : "FF101923"), sheet.widths.length > 4 ? "landscape" : "portrait");
    sheet.rows.forEach((row, rowIndex) => row.cells.forEach((cell, columnIndex) => {
      if (cell.value === undefined && !cell.formula) return;
      const cross = Boolean(cell.formula?.includes("!"));
      const format = cell.format ?? "text";
      const styleId = catalogue.ids.get(`${cell.role}:${format}:${cross ? "cross" : "local"}`)!;
      xml = setCellStyle(xml, cellAddress(columnIndex, rowIndex), styleId);
      styledCellCount += 1;
    }));
    zip.file(path, xml, {date: new Date("1980-01-01T00:00:00.000Z")});
  }

  const workbookPath = "xl/workbook.xml";
  const workbookXml = await zip.file(workbookPath)?.async("string");
  if (!workbookXml) throw new Error("generated workbook is missing workbook.xml");
  const calc = '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
  const withCalc = /<calcPr[^>]*\/>/.test(workbookXml)
    ? workbookXml.replace(/<calcPr[^>]*\/>/, calc)
    : workbookXml.replace("</workbook>", `${calc}</workbook>`);
  zip.file(workbookPath, withCalc, {date: new Date("1980-01-01T00:00:00.000Z")});

  const corePath = "docProps/core.xml";
  const core = await zip.file(corePath)?.async("string");
  if (core) {
    const titled = core.replace(/<dc:title>[\s\S]*?<\/dc:title>/, `<dc:title>${esc(metadata.title)}</dc:title>`);
    zip.file(corePath, titled, {date: new Date("1980-01-01T00:00:00.000Z")});
  }
  await addCustomProperties(zip, metadata);
  for (const file of Object.values(zip.files)) file.date = new Date("1980-01-01T00:00:00.000Z");
  const bytes = await zip.generateAsync({type: "uint8array", compression: "DEFLATE", compressionOptions: {level: 9}, platform: "UNIX"});
  const modelAudit = auditModel(model);
  return {
    bytes,
    audit: {
      rendererVersion: governedWorkbookRendererVersion,
      ...modelAudit,
      styledCellCount,
      formulaCoveragePassed: modelAudit.formulaCount > 0 && modelAudit.hardcodeViolations.length === 0,
      styleCoveragePassed: styledCellCount >= modelAudit.populatedCellCount,
      visualInspection: "not_run",
      releaseEligible: false,
      contentSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
