import * as XLSX from "xlsx";
import type {LayerCell, LayerSheet} from "@offroad/document-intelligence";
import {ParserError, createBudget, parserLimits, type ParseInput, type ParseResult, type ParserWarning} from "./types";
import {collectScaleDeclarations} from "./scale";

export const legacySpreadsheetParserVersion = "legacy-spreadsheet-1.0.0";

/**
 * Legacy and exotic spreadsheets → layer: `.xls` (BIFF), `.xlsb`, `.ods`/`.fods`, `.dbf`,
 * `.prn`, SpreadsheetML 2003.
 *
 * Companies send whatever their ERP exports, and a 2003 `.xls` from a Brazilian accounting
 * system is still routine. The library is SheetJS **0.20.3 taken from the vendor's own
 * distribution**, not the 0.18.5 left on npm: the npm copy carries unfixed prototype-pollution
 * and ReDoS advisories, and the fixes were only ever published outside npm. Pinned by URL in
 * `package.json`, which means Dependabot cannot see it — the version is checked by hand when
 * SheetJS publishes (noted in the README).
 *
 * Output is identical in shape to the modern XLSX reader, so everything downstream — anchors
 * `sDRE!B14`, cached values, formulas, hidden sheets — behaves the same regardless of the age
 * of the file.
 */
export async function parseLegacySpreadsheet(input: ParseInput): Promise<ParseResult> {
  const warnings: ParserWarning[] = [];
  const budget = createBudget();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(input.bytes, {
      type: "array",
      cellFormula: true,
      cellNF: true,
      // Dates stay serial numbers so the same guard as the modern reader applies below.
      cellDates: false,
      cellHTML: false,
      // Nothing executable is read out of the file.
      bookVBA: false,
      bookDeps: false,
    });
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (/password|encrypt/i.test(message)) throw new ParserError("the spreadsheet is password protected", "encrypted");
    throw new ParserError(`the spreadsheet could not be opened: ${message}`);
  }

  const sheets: LayerSheet[] = [];
  const containers: {id: string; text: string}[] = [];
  const usedNames = new Set<string>();

  workbook.SheetNames.forEach((declaredName, index) => {
    if (sheets.length >= parserLimits.maxSheets) return;

    const sheet = workbook.Sheets[declaredName];
    if (!sheet) return;

    const name = uniqueName(declaredName, usedNames, warnings);
    const visibility = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0;
    const hidden = visibility !== 0;
    if (hidden) {
      warnings.push({code: "hidden_sheet", message: `sheet "${name}" is hidden in the workbook`, where: `s${name}`});
    }

    const merges = mergeOrigins(sheet);
    const cells: LayerCell[] = [];
    const texts: string[] = [];
    let truncated = false;

    for (const ref of Object.keys(sheet)) {
      if (ref.startsWith("!")) continue;
      if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref)) continue;
      if (cells.length >= parserLimits.maxCellsPerSheet) {
        truncated = true;
        break;
      }

      const raw = sheet[ref] as XLSX.CellObject | undefined;
      if (!raw) continue;

      const cell = readCell(ref, raw, name, warnings);
      if (!cell) continue;

      const origin = merges.get(ref);
      if (origin) cell.merged = origin;

      cells.push(cell);
      if (cell.t === "s" && typeof cell.v === "string" && cell.v.trim()) {
        texts.push(budget.take(cell.v.slice(0, parserLimits.maxCharactersPerBlock)));
      }
    }

    if (truncated) {
      warnings.push({
        code: "limit_reached",
        message: `sheet "${name}" has more than ${parserLimits.maxCellsPerSheet} filled cells; the tail was not indexed`,
        where: `s${name}`,
      });
    }

    // Object key order in a SheetJS sheet follows insertion, not the grid; sorting makes the
    // layer identical between runs, which the anchor stability test depends on.
    cells.sort(byCellReference);
    sheets.push({name, hidden, cells, tables: []});
    containers.push({id: `s${name}`, text: texts.join("\n")});
  });

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
    parserVersions: {legacySpreadsheet: legacySpreadsheetParserVersion, sheetjs: XLSX.version},
    warnings,
    detected: {kind: "spreadsheet", mime: "application/vnd.ms-excel", extension: "xls", mismatch: false},
  };
}

function uniqueName(declared: string, used: Set<string>, warnings: ParserWarning[]): string {
  let name = declared.replaceAll("!", "_").trim() || "Sheet";
  if (name !== declared) {
    warnings.push({code: "parse_error", message: `sheet name "${declared}" contains "!" and was indexed as "${name}"`, where: `s${name}`});
  }
  if (used.has(name)) {
    let suffix = 2;
    while (used.has(`${name} (${suffix})`)) suffix += 1;
    name = `${name} (${suffix})`;
  }
  used.add(name);
  return name;
}

function readCell(ref: string, raw: XLSX.CellObject, sheetName: string, warnings: ParserWarning[]): LayerCell | null {
  const formula = typeof raw.f === "string" && raw.f.trim() ? raw.f : undefined;
  const format = typeof raw.z === "string" ? raw.z : undefined;

  const decorate = (cell: LayerCell): LayerCell => {
    if (formula) cell.f = formula;
    if (format) cell.fmt = format;
    return cell;
  };

  if (raw.v === undefined || raw.v === null) {
    if (formula) {
      warnings.push({
        code: "formula_without_value",
        message: `cell ${ref} holds a formula with no cached result; the workbook must be saved with values`,
        where: `s${sheetName}!${ref}`,
      });
      return decorate({ref, v: null, t: "s"});
    }
    return null;
  }

  switch (raw.t) {
    case "s": {
      // SheetJS normalises every string kind (shared, inline, formula result) to `s`.
      const text = String(raw.v);
      return text.trim() === "" ? null : decorate({ref, v: text, t: "s"});
    }
    case "b":
      return decorate({ref, v: Boolean(raw.v), t: "b"});
    case "e":
      return decorate({ref, v: String(raw.w ?? raw.v), t: "e"});
    case "d": {
      const date = raw.v instanceof Date ? raw.v : new Date(String(raw.v));
      if (Number.isNaN(date.getTime())) return decorate({ref, v: String(raw.v), t: "s"});
      return decorate({ref, v: date.toISOString().slice(0, 10), t: "d"});
    }
    case "n": {
      const numeric = Number(raw.v);
      if (!Number.isFinite(numeric)) return null;
      // Same rule as the modern reader: a small count in a date-formatted cell is a styling
      // artefact, not a date, and a fabricated date can become a period.
      if (format && isDateFormat(format) && numeric >= 367) {
        const iso = serialToIso(numeric);
        if (iso) return decorate({ref, v: iso, t: "d"});
      }
      return decorate({ref, v: numeric, t: "n"});
    }
    default:
      return null;
  }
}

function mergeOrigins(sheet: XLSX.WorkSheet): Map<string, string> {
  const origins = new Map<string, string>();
  const merges = sheet["!merges"];
  if (!Array.isArray(merges)) return origins;

  for (const range of merges) {
    if (!range?.s || !range?.e) continue;
    const cells = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (cells > 50_000) continue;
    const origin = XLSX.utils.encode_cell({r: range.s.r, c: range.s.c});
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const ref = XLSX.utils.encode_cell({r: row, c: column});
        if (ref !== origin) origins.set(ref, origin);
      }
    }
  }

  return origins;
}

function isDateFormat(code: string): boolean {
  const stripped = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[ymdhs]/i.test(stripped) && !/^[#0.,%\s]*$/.test(stripped);
}

function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2_958_465) return null;
  const days = Math.floor(serial);
  const milliseconds = Math.round((serial - days) * 86_400_000);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000 + milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function byCellReference(a: LayerCell, b: LayerCell): number {
  const left = XLSX.utils.decode_cell(a.ref);
  const right = XLSX.utils.decode_cell(b.ref);
  return left.r === right.r ? left.c - right.c : left.r - right.r;
}
