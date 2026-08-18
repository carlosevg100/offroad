import type {LayerCell, LayerSheet} from "@offroad/document-intelligence";
import {ParserError, createBudget, parserLimits, type ParseInput, type ParseResult, type ParserWarning} from "./types";
import {
  attributeOf,
  childrenNamed,
  childrenOf,
  findAll,
  findFirst,
  isTag,
  openOoxml,
  readXml,
  textOf,
  type OrderedNode,
} from "./ooxml";
import {collectScaleDeclarations} from "./scale";

export const xlsxParserVersion = "xlsx-1.0.0";

/**
 * XLSX → layer (P1 plan §5.3, stage E2).
 *
 * Read directly from the OOXML package rather than through a spreadsheet library, for one
 * reason found the hard way: the workbooks in this data room declare the SpreadsheetML
 * namespace with an `x:` prefix (`<x:worksheet>`), which is valid, which Excel and
 * LibreOffice read, and which the SAX matchers of the popular Node libraries silently miss —
 * exceljs returned an empty workbook. Matching local names instead of literal prefixes makes
 * the parser independent of whichever tool wrote the file.
 *
 * A spreadsheet already has perfect anchors, so the layer keeps every cell as it is: the
 * cached value *and* the formula that produced it, the number format, and the merge origin.
 * Nothing is evaluated and no empty cell is invented; a formula stored without a cached
 * value is reported instead of quietly becoming blank.
 */
export async function parseXlsx(input: ParseInput): Promise<ParseResult> {
  const warnings: ParserWarning[] = [];
  const budget = createBudget();
  const zip = await openOoxml(input.bytes);

  const workbookRoot = await readXml(zip, "xl/workbook.xml");
  if (!workbookRoot) throw new ParserError("the package has no xl/workbook.xml");

  const relationships = await readRelationships(zip);
  const sharedStrings = await readSharedStrings(zip);
  const dateStyles = await readDateStyles(zip);

  const workbook = findFirst(workbookRoot, "workbook");
  const sheetNodes = workbook ? findAll(childrenOf(workbook), "sheet") : [];
  if (sheetNodes.length === 0) throw new ParserError("the workbook declares no sheets", "no_text");

  const sheets: LayerSheet[] = [];
  const containers: {id: string; text: string}[] = [];
  const usedNames = new Set<string>();

  for (const [position, sheetNode] of sheetNodes.entries()) {
    if (sheets.length >= parserLimits.maxSheets) {
      warnings.push({code: "limit_reached", message: `only the first ${parserLimits.maxSheets} sheets were read`});
      break;
    }

    const declaredName = attributeOf(sheetNode, "name") ?? `Sheet${position + 1}`;
    const name = uniqueSheetName(declaredName, usedNames, warnings);

    const state = attributeOf(sheetNode, "state");
    const hidden = state === "hidden" || state === "veryHidden";
    if (hidden) {
      warnings.push({code: "hidden_sheet", message: `sheet "${name}" is hidden in the workbook`, where: `s${name}`});
    }

    const relationshipId = attributeOf(sheetNode, "id");
    const target = relationshipId ? relationships.get(relationshipId) : undefined;
    const path = resolveSheetPath(target, position);

    const sheetRoot = await readXml(zip, path);
    if (!sheetRoot) {
      warnings.push({code: "parse_error", message: `sheet "${name}" points at ${path}, which is not in the package`, where: `s${name}`});
      continue;
    }

    const {cells, texts, truncated} = readSheet(sheetRoot, sharedStrings, dateStyles, budget, name, warnings);
    if (truncated) {
      warnings.push({
        code: "limit_reached",
        message: `sheet "${name}" has more than ${parserLimits.maxCellsPerSheet} filled cells; the tail was not indexed`,
        where: `s${name}`,
      });
    }

    sheets.push({name, hidden, cells, tables: []});
    containers.push({id: `s${name}`, text: texts.join("\n")});
  }

  if (sheets.length === 0) throw new ParserError("the workbook has no readable sheets", "no_text");

  return {
    layer: {
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      kind: "spreadsheet",
      sheets,
      scaleDeclarations: collectScaleDeclarations(containers),
      stats: {sheetCount: sheets.length, estimatedTokens: Math.ceil(budget.used / 4)},
    },
    parserVersions: {xlsx: xlsxParserVersion, jszip: "3.10.1", "fast-xml-parser": "5.10.1"},
    warnings,
    detected: {
      kind: "spreadsheet",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      mismatch: false,
    },
  };
}

/**
 * `!` separates sheet from cell in an anchor id (`sDRE!B14`), and two sheets with the same
 * name would make two cells share an id. Both are made impossible here, loudly.
 */
function uniqueSheetName(declared: string, used: Set<string>, warnings: ParserWarning[]): string {
  let name = declared.replaceAll("!", "_").trim() || "Sheet";
  if (name !== declared) {
    warnings.push({code: "parse_error", message: `sheet name "${declared}" contains "!" and was indexed as "${name}"`, where: `s${name}`});
  }
  if (used.has(name)) {
    let suffix = 2;
    while (used.has(`${name} (${suffix})`)) suffix += 1;
    const unique = `${name} (${suffix})`;
    warnings.push({code: "parse_error", message: `duplicate sheet name "${name}" was indexed as "${unique}"`, where: `s${unique}`});
    name = unique;
  }
  used.add(name);
  return name;
}

async function readRelationships(zip: Awaited<ReturnType<typeof openOoxml>>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const root = await readXml(zip, "xl/_rels/workbook.xml.rels");
  if (!root) return map;
  for (const relationship of findAll(root, "Relationship")) {
    const id = attributeOf(relationship, "Id");
    const target = attributeOf(relationship, "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

function resolveSheetPath(target: string | undefined, position: number): string {
  if (!target) return `xl/worksheets/sheet${position + 1}.xml`;
  const cleaned = target.replace(/^\/+/, "").replace(/^xl\//, "");
  return `xl/${cleaned}`;
}

async function readSharedStrings(zip: Awaited<ReturnType<typeof openOoxml>>): Promise<string[]> {
  const root = await readXml(zip, "xl/sharedStrings.xml");
  if (!root) return [];
  const table = findFirst(root, "sst");
  if (!table) return [];
  // `si` may hold a single `t` or a sequence of rich-text runs; both collapse to one string.
  return childrenNamed(table, "si").map((item) => textOf(item, "t"));
}

/**
 * Style index → "this is a date". Excel stores dates as numbers, so the number format is the
 * only thing that distinguishes 45,870 from 2025-07-31.
 */
async function readDateStyles(zip: Awaited<ReturnType<typeof openOoxml>>): Promise<Set<number>> {
  const dateStyles = new Set<number>();
  const root = await readXml(zip, "xl/styles.xml");
  if (!root) return dateStyles;

  const stylesheet = findFirst(root, "styleSheet");
  if (!stylesheet) return dateStyles;

  const customDateFormats = new Set<number>();
  const numberFormats = findFirst(childrenOf(stylesheet), "numFmts");
  if (numberFormats) {
    for (const format of childrenNamed(numberFormats, "numFmt")) {
      const id = Number(attributeOf(format, "numFmtId"));
      const code = attributeOf(format, "formatCode") ?? "";
      if (Number.isFinite(id) && isDateFormatCode(code)) customDateFormats.add(id);
    }
  }

  const cellFormats = findFirst(childrenOf(stylesheet), "cellXfs");
  if (!cellFormats) return dateStyles;

  childrenNamed(cellFormats, "xf").forEach((format, index) => {
    const id = Number(attributeOf(format, "numFmtId") ?? "0");
    if (!Number.isFinite(id)) return;
    if (builtinDateFormats.has(id) || customDateFormats.has(id)) dateStyles.add(index);
  });

  return dateStyles;
}

/**
 * A small integer in a date-formatted cell is almost always a count that inherited a style,
 * not a date: serial 5 renders as 05/01/1900 in Excel, and no credit document refers to
 * 1900. Reproducing Excel's rendering would be faithful but harmful — a fabricated date can
 * become a period, and period integrity is an invariant (AGENTS.md §2.3). Below 1901 the
 * number is kept as a number; the cell keeps its `fmt` so a reviewer can still see the
 * styling.
 */
const minimumDateSerial = 367;

// Built-in number-format ids that Excel reserves for dates and times.
const builtinDateFormats = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code: string): boolean {
  // Strip quoted literals and colour/condition blocks before looking for date tokens.
  const stripped = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[ymdhs]/i.test(stripped) && !/^[#0.,%\s]*$/.test(stripped);
}

function readSheet(
  root: OrderedNode[],
  sharedStrings: string[],
  dateStyles: Set<number>,
  budget: ReturnType<typeof createBudget>,
  sheetName: string,
  warnings: ParserWarning[],
): {cells: LayerCell[]; texts: string[]; truncated: boolean} {
  const worksheet = findFirst(root, "worksheet");
  const cells: LayerCell[] = [];
  const texts: string[] = [];
  if (!worksheet) return {cells, texts, truncated: false};

  const merges = readMerges(worksheet);
  const sheetData = findFirst(childrenOf(worksheet), "sheetData");
  if (!sheetData) return {cells, texts, truncated: false};

  let truncated = false;

  for (const row of childrenOf(sheetData)) {
    if (truncated) break;
    if (!isTag(row, "row")) continue;

    for (const cellNode of childrenOf(row)) {
      if (!isTag(cellNode, "c")) continue;
      if (cells.length >= parserLimits.maxCellsPerSheet) {
        truncated = true;
        break;
      }

      const ref = attributeOf(cellNode, "r") ?? "";
      if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref)) continue;

      const cell = readCell(cellNode, ref, sharedStrings, dateStyles, sheetName, warnings);
      if (!cell) continue;

      const origin = merges.get(ref);
      if (origin) cell.merged = origin;

      cells.push(cell);
      if (cell.t === "s" && typeof cell.v === "string" && cell.v.trim()) {
        texts.push(budget.take(cell.v.slice(0, parserLimits.maxCharactersPerBlock)));
      }
    }
  }

  return {cells, texts, truncated};
}

function readCell(
  node: OrderedNode,
  ref: string,
  sharedStrings: string[],
  dateStyles: Set<number>,
  sheetName: string,
  warnings: ParserWarning[],
): LayerCell | null {
  const type = attributeOf(node, "t") ?? "n";
  const styleIndex = Number(attributeOf(node, "s") ?? "-1");

  const formulaNode = childrenNamed(node, "f")[0];
  const formula = formulaNode ? textOf(formulaNode, "f") : undefined;

  const valueNode = childrenNamed(node, "v")[0];
  const rawValue = valueNode ? textOf(valueNode, "v") : undefined;

  const withFormula = (cell: LayerCell): LayerCell => {
    if (formula) cell.f = formula;
    return cell;
  };

  if (type === "inlineStr") {
    const inline = childrenNamed(node, "is")[0];
    const text = inline ? textOf(inline, "t") : "";
    return text.trim() === "" ? null : withFormula({ref, v: text, t: "s"});
  }

  if (rawValue === undefined || rawValue === "") {
    if (formula) {
      // A formula with no cached result: the workbook was written without values. Saying so
      // is the difference between "we could not read it" and "the cell is empty".
      warnings.push({
        code: "formula_without_value",
        message: `cell ${ref} holds a formula with no cached result; the workbook must be saved with values`,
        where: `s${sheetName}!${ref}`,
      });
      return withFormula({ref, v: null, t: "s"});
    }
    return null;
  }

  switch (type) {
    case "s": {
      const index = Number(rawValue);
      const text = Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
      return text.trim() === "" ? null : withFormula({ref, v: text, t: "s"});
    }
    case "str":
      return rawValue.trim() === "" ? null : withFormula({ref, v: rawValue, t: "s"});
    case "b":
      return withFormula({ref, v: rawValue === "1" || rawValue.toLowerCase() === "true", t: "b"});
    case "e":
      return withFormula({ref, v: rawValue, t: "e"});
    case "d": {
      const iso = rawValue.slice(0, 10);
      return withFormula({ref, v: iso, t: "d"});
    }
    default: {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) return withFormula({ref, v: rawValue, t: "s"});
      if (styleIndex >= 0 && dateStyles.has(styleIndex) && numeric >= minimumDateSerial) {
        const iso = excelSerialToIso(numeric);
        if (iso) return withFormula({ref, v: iso, t: "d"});
      }
      return withFormula({ref, v: numeric, t: "n"});
    }
  }
}

function readMerges(worksheet: OrderedNode): Map<string, string> {
  const merged = new Map<string, string>();
  const container = findFirst(childrenOf(worksheet), "mergeCells");
  if (!container) return merged;

  for (const merge of childrenNamed(container, "mergeCell")) {
    const range = attributeOf(merge, "ref");
    if (!range) continue;
    const [from, to] = range.split(":");
    if (!from || !to) continue;
    const start = parseRef(from);
    const end = parseRef(to);
    if (!start || !end) continue;
    if ((end.column - start.column + 1) * (end.row - start.row + 1) > 50_000) continue;

    for (let column = start.column; column <= end.column; column += 1) {
      for (let row = start.row; row <= end.row; row += 1) {
        const ref = `${columnName(column)}${row}`;
        if (ref !== from) merged.set(ref, from);
      }
    }
  }

  return merged;
}

function parseRef(ref: string): {column: number; row: number} | null {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(ref);
  if (!match?.[1] || !match[2]) return null;
  let column = 0;
  for (const character of match[1]) column = column * 26 + (character.charCodeAt(0) - 64);
  return {column, row: Number(match[2])};
}

function columnName(column: number): string {
  let value = column;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

/**
 * Excel day 1 is 1900-01-01, and the format keeps a deliberate bug: it treats 1900 as a leap
 * year, so serials from 60 onwards are shifted. Anchoring on 1899-12-30 reproduces exactly
 * what Excel displays, which is what a reader will compare the value against.
 */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2_958_465) return null;
  const days = Math.floor(serial);
  const milliseconds = Math.round((serial - days) * 86_400_000);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000 + milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
