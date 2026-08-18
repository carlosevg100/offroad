import type {LayerBlock, LayerPage, LayerTable} from "@offroad/document-intelligence";
import {ParserError, createBudget, parserLimits, type ParseInput, type ParseResult, type ParserWarning} from "./types";
import {collectScaleDeclarations} from "./scale";

export const pdfParserVersion = "pdf-1.0.0";

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type Segment = {text: string; x0: number; x1: number};
type Line = {y: number; height: number; segments: Segment[]; x0: number; x1: number};

/**
 * Native-text PDF → layer (P1 plan §5.3, stage E2).
 *
 * pdfjs gives positioned text runs, not structure: a "table" in a PDF is only an alignment
 * of glyphs. So the layer is rebuilt in three deterministic steps — runs grouped into lines
 * by baseline, lines split into segments by horizontal gaps, and consecutive multi-segment
 * lines clustered into columns to form a table. Anything that does not look tabular stays
 * as a paragraph block, which is the honest representation.
 *
 * A page with no extractable text is marked `scanned` and produces no blocks: the document
 * is then in degraded mode (page-level anchor, mandatory human review) until OCR arrives in
 * F6. Nothing is guessed to fill the gap.
 */
export async function parsePdf(input: ParseInput): Promise<ParseResult> {
  const warnings: ParserWarning[] = [];
  const budget = createBudget();

  // The legacy build is the one that runs outside a browser. pdfjs 6 no longer evaluates
  // anything from the document (the `isEvalSupported` switch is gone), so what is left to
  // turn off is font installation and any fetch the renderer might attempt: this parser only
  // needs text, and a document that arrives from outside gets no network and no fonts.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: input.bytes,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    stopAtErrors: false,
  });

  let document;
  try {
    document = await loadingTask.promise;
  } catch (error) {
    const name = (error as {name?: string}).name;
    if (name === "PasswordException") {
      throw new ParserError("the PDF is password protected", "encrypted");
    }
    throw new ParserError(`the PDF could not be opened: ${(error as Error).message}`);
  }

  const pageCount = Math.min(document.numPages, parserLimits.maxPages);
  if (document.numPages > parserLimits.maxPages) {
    warnings.push({
      code: "limit_reached",
      message: `document has ${document.numPages} pages; only the first ${parserLimits.maxPages} were read`,
    });
  }

  const pages: LayerPage[] = [];
  const containers: {id: string; text: string}[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const pageId = `p${pageNumber}`;
    const page = await document.getPage(pageNumber);
    let items: TextItem[] = [];
    try {
      const content = await page.getTextContent();
      items = (content.items as unknown[]).filter(isTextItem);
    } catch (error) {
      warnings.push({code: "parse_error", message: `page text could not be read: ${(error as Error).message}`, where: pageId});
    } finally {
      page.cleanup();
    }

    const lines = buildLines(items);
    if (lines.length === 0) {
      // No text layer at all — an image-only page. Say so; do not invent content.
      pages.push({n: pageNumber, blocks: [], tables: [], scanned: true});
      warnings.push({code: "scanned_page", message: "page has no extractable text (image only)", where: pageId});
      continue;
    }

    const {tables, remaining} = extractTables(lines, pageId);
    const blocks = buildBlocks(remaining, pageId, budget);

    pages.push({n: pageNumber, blocks, tables, scanned: false});
    containers.push({
      id: pageId,
      text: [...blocks.map((block) => block.text), ...tables.flatMap(tableText)].join("\n"),
    });
  }

  if (budget.exhausted) {
    warnings.push({code: "limit_reached", message: "the text budget was reached; the tail of the document was not indexed"});
  }
  if (pages.length > 0 && pages.every((page) => page.scanned)) {
    warnings.push({code: "no_text", message: "every page is image only; the document needs OCR before extraction"});
  }

  await loadingTask.destroy();

  return {
    layer: {
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      kind: "pdf",
      pages,
      scaleDeclarations: collectScaleDeclarations(containers),
      stats: {pageCount: pages.length, estimatedTokens: Math.ceil(budget.used / 4)},
    },
    parserVersions: {pdf: pdfParserVersion, pdfjs: pdfjs.version ?? "unknown"},
    warnings,
    detected: {kind: "pdf", mime: "application/pdf", extension: "pdf", mismatch: false},
  };
}

function isTextItem(item: unknown): item is TextItem {
  const candidate = item as TextItem;
  return typeof candidate?.str === "string" && Array.isArray(candidate.transform);
}

/**
 * Groups positioned runs into lines by baseline. `transform[4]`/`transform[5]` are the
 * translation components of the text matrix (x and y in PDF user space, y growing upwards).
 */
function buildLines(items: TextItem[]): Line[] {
  const positioned = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({
      text: item.str,
      x0: item.transform[4] ?? 0,
      x1: (item.transform[4] ?? 0) + (item.width || 0),
      y: item.transform[5] ?? 0,
      height: item.height || Math.abs(item.transform[3] ?? 10) || 10,
    }));
  if (positioned.length === 0) return [];

  positioned.sort((a, b) => (Math.abs(a.y - b.y) > 1 ? b.y - a.y : a.x0 - b.x0));

  const lines: Line[] = [];
  let current: typeof positioned = [];
  let currentY = positioned[0]?.y ?? 0;

  const flush = () => {
    if (current.length === 0) return;
    const sorted = [...current].sort((a, b) => a.x0 - b.x0);
    const height = median(sorted.map((run) => run.height)) || 10;
    lines.push({
      y: currentY,
      height,
      segments: mergeIntoSegments(sorted, height),
      x0: Math.min(...sorted.map((run) => run.x0)),
      x1: Math.max(...sorted.map((run) => run.x1)),
    });
    current = [];
  };

  for (const run of positioned) {
    const tolerance = Math.max(1.5, run.height * 0.5);
    if (current.length > 0 && Math.abs(run.y - currentY) > tolerance) {
      flush();
      currentY = run.y;
    } else if (current.length === 0) {
      currentY = run.y;
    }
    current.push(run);
  }
  flush();

  return lines;
}

/**
 * Splits a line into segments: runs separated by a horizontal gap wide enough to be a
 * column boundary rather than a word space. The threshold scales with the font height, so
 * it survives different point sizes on the same page.
 */
function mergeIntoSegments(runs: {text: string; x0: number; x1: number}[], height: number): Segment[] {
  const gapThreshold = Math.max(6, height * 0.9);
  const segments: Segment[] = [];

  for (const run of runs) {
    const last = segments[segments.length - 1];
    if (last && run.x0 - last.x1 <= gapThreshold) {
      const glue = run.x0 - last.x1 > height * 0.18 && !last.text.endsWith(" ") ? " " : "";
      last.text = `${last.text}${glue}${run.text}`;
      last.x1 = Math.max(last.x1, run.x1);
      continue;
    }
    segments.push({text: run.text, x0: run.x0, x1: run.x1});
  }

  return segments
    .map((segment) => ({...segment, text: segment.text.replace(/\s+/g, " ").trim()}))
    .filter((segment) => segment.text.length > 0);
}

/**
 * A table is a run of consecutive lines that all split into two or more segments whose
 * left edges land on the same columns. Column positions are clustered across the whole run,
 * so a right-aligned number column still lines up with its header.
 */
function extractTables(lines: Line[], pageId: string): {tables: LayerTable[]; remaining: Line[]} {
  const tables: LayerTable[] = [];
  const remaining: Line[] = [];
  let tableIndex = 0;
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line || line.segments.length < 2) {
      if (line) remaining.push(line);
      cursor += 1;
      continue;
    }

    let end = cursor;
    while (end + 1 < lines.length) {
      const next = lines[end + 1];
      if (!next || next.segments.length < 2) break;
      const gap = Math.abs((lines[end]?.y ?? 0) - next.y);
      if (gap > Math.max(next.height, line.height) * 3) break;
      end += 1;
    }

    const run = lines.slice(cursor, end + 1);
    if (run.length < 2) {
      remaining.push(line);
      cursor += 1;
      continue;
    }

    tableIndex += 1;
    tables.push(buildTable(run, `${pageId}.t${tableIndex}`));
    cursor = end + 1;
  }

  return {tables, remaining};
}

function buildTable(run: Line[], tableId: string): LayerTable {
  const columns = clusterColumns(run);
  const rows = run.slice(0, parserLimits.maxRowsPerTable).map((line, rowIndex) => {
    const rowId = `${tableId}.r${rowIndex + 1}`;
    const texts = new Array<string>(columns.length).fill("");
    for (const segment of line.segments) {
      const columnIndex = nearestColumn(columns, segment.x0);
      texts[columnIndex] = texts[columnIndex] ? `${texts[columnIndex]} ${segment.text}` : segment.text;
    }
    return {
      id: rowId,
      cells: texts.map((text, columnIndex) => ({id: `${rowId}.c${columnIndex + 1}`, text})),
    };
  });

  const bbox: [number, number, number, number] = [
    Math.min(...run.map((line) => line.x0)),
    Math.min(...run.map((line) => line.y)),
    Math.max(...run.map((line) => line.x1)),
    Math.max(...run.map((line) => line.y + line.height)),
  ];

  return {id: tableId, rows, bbox};
}

function clusterColumns(run: Line[]): number[] {
  const starts = run.flatMap((line) => line.segments.map((segment) => segment.x0)).sort((a, b) => a - b);
  const tolerance = 12;
  const columns: number[] = [];
  let bucket: number[] = [];

  for (const start of starts) {
    const last = bucket[bucket.length - 1];
    if (last !== undefined && start - last > tolerance) {
      columns.push(median(bucket));
      bucket = [];
    }
    bucket.push(start);
  }
  if (bucket.length > 0) columns.push(median(bucket));

  return columns;
}

function nearestColumn(columns: number[], x: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < columns.length; index += 1) {
    const distance = Math.abs((columns[index] ?? 0) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** Consecutive non-tabular lines with a small vertical gap become one paragraph block. */
function buildBlocks(lines: Line[], pageId: string, budget: ReturnType<typeof createBudget>): LayerBlock[] {
  const blocks: LayerBlock[] = [];
  let group: Line[] = [];

  const flush = () => {
    if (group.length === 0) return;
    if (blocks.length >= parserLimits.maxBlocksPerPage) {
      group = [];
      return;
    }
    const text = budget.take(
      group
        .map((line) => line.segments.map((segment) => segment.text).join(" "))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, parserLimits.maxCharactersPerBlock),
    );
    if (text.length > 0) {
      const index = blocks.length + 1;
      blocks.push({
        id: `${pageId}.b${index}`,
        kind: classifyBlock(text, group),
        text,
        bbox: [
          Math.min(...group.map((line) => line.x0)),
          Math.min(...group.map((line) => line.y)),
          Math.max(...group.map((line) => line.x1)),
          Math.max(...group.map((line) => line.y + line.height)),
        ],
      });
    }
    group = [];
  };

  for (const line of lines) {
    const previous = group[group.length - 1];
    if (previous) {
      const gap = Math.abs(previous.y - line.y);
      const sameParagraph = gap < previous.height * 2.2 && Math.abs(previous.x0 - line.x0) < 36;
      if (!sameParagraph) flush();
    }
    group.push(line);
  }
  flush();

  return blocks;
}

function classifyBlock(text: string, group: Line[]): LayerBlock["kind"] {
  const height = median(group.map((line) => line.height));
  if (group.length === 1 && text.length <= 120 && height >= 12) return "heading";
  if (group.length === 1 && text.length <= 90 && /^[A-ZÀ-Ý0-9\s.,:;()/-]+$/.test(text)) return "heading";
  return "text";
}

function tableText(table: LayerTable): string[] {
  return table.rows.map((row) => row.cells.map((cell) => cell.text).join(" | "));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
