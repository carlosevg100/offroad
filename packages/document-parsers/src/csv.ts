import {parse} from "csv-parse/sync";
import iconv from "iconv-lite";
import type {LayerCell} from "@offroad/document-intelligence";
import {ParserError, createBudget, parserLimits, type ParseInput, type ParseResult, type ParserWarning} from "./types";
import {collectScaleDeclarations} from "./scale";

export const csvParserVersion = "csv-1.0.0";

/**
 * CSV/TSV → layer (P1 plan §5.3, stage E2).
 *
 * A CSV becomes a single sheet so it gets the same cell-precision anchors as a workbook
 * (`sExtrato!B14`). Two things are decided from the bytes rather than assumed, because ERP
 * exports in Brazil routinely get both wrong: the delimiter (`;` is the default in
 * pt-BR Excel) and the encoding (windows-1252 is still common). Values are kept as literal
 * text — reading them as numbers is the extractor's job, against the declared scale.
 */
export async function parseCsv(input: ParseInput): Promise<ParseResult> {
  const warnings: ParserWarning[] = [];
  const budget = createBudget();

  const {text, encoding} = decode(input.bytes);
  if (encoding !== "utf-8") {
    warnings.push({code: "parse_error", message: `file is not valid UTF-8; it was read as ${encoding}`});
  }
  if (text.trim().length === 0) throw new ParserError("the file has no content", "no_text");

  const delimiter = detectDelimiter(text);

  let records: string[][];
  try {
    records = parse(text, {
      delimiter,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
      trim: false,
      to: parserLimits.maxRowsPerTable,
    }) as string[][];
  } catch (error) {
    throw new ParserError(`the file could not be read as CSV: ${(error as Error).message}`);
  }

  if (records.length === 0) throw new ParserError("the file has no rows", "no_text");
  if (records.length >= parserLimits.maxRowsPerTable) {
    warnings.push({code: "limit_reached", message: `only the first ${parserLimits.maxRowsPerTable} rows were read`});
  }

  const name = sheetNameFor(input.fileName);
  const cells: LayerCell[] = [];
  const texts: string[] = [];

  records.forEach((record, rowIndex) => {
    record.forEach((rawValue, columnIndex) => {
      if (cells.length >= parserLimits.maxCellsPerSheet) return;
      const value = rawValue.trim();
      if (value === "") return;
      const ref = `${columnLetters(columnIndex)}${rowIndex + 1}`;
      if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref)) return;
      cells.push({ref, v: value.slice(0, parserLimits.maxCharactersPerBlock), t: "s"});
      texts.push(budget.take(value));
    });
  });

  if (cells.length === 0) throw new ParserError("the file has no filled cells", "no_text");

  return {
    layer: {
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      kind: "csv",
      sheets: [{name, hidden: false, cells, tables: []}],
      scaleDeclarations: collectScaleDeclarations([{id: `s${name}`, text: texts.join("\n")}]),
      stats: {sheetCount: 1, estimatedTokens: Math.ceil(budget.used / 4)},
    },
    parserVersions: {csv: csvParserVersion, "csv-parse": "7.0.2"},
    warnings,
    detected: {kind: "csv", mime: "text/csv", extension: "csv", mismatch: false},
  };
}

/** UTF-8 when the bytes decode cleanly, windows-1252 otherwise (never a silent mojibake). */
function decode(bytes: Uint8Array): {text: string; encoding: string} {
  const utf8 = new TextDecoder("utf-8", {fatal: false}).decode(bytes);
  if (!utf8.includes("�")) return {text: utf8.replace(/^﻿/, ""), encoding: "utf-8"};
  return {text: iconv.decode(Buffer.from(bytes), "win1252"), encoding: "windows-1252"};
}

/** Picks the delimiter that yields the most consistent column count over the first rows. */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 20);
  if (sample.length === 0) return ",";

  let best = ",";
  let bestScore = -1;

  for (const candidate of [";", ",", "\t", "|"]) {
    const counts = sample.map((line) => countOutsideQuotes(line, candidate));
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total === 0) continue;
    const first = counts[0] ?? 0;
    const consistent = counts.filter((count) => count === first).length;
    const score = consistent * 100 + total;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (const character of line) {
    if (character === '"') inQuotes = !inQuotes;
    else if (character === delimiter && !inQuotes) count += 1;
  }
  return count;
}

/** `04_Mapa_Divida.csv` → `04_Mapa_Divida`, so the anchor reads like a sheet name. */
function sheetNameFor(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replaceAll("!", "_").trim();
  return base.length > 0 ? base.slice(0, 80) : "csv";
}

export function columnLetters(index: number): string {
  let value = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letters;
}
