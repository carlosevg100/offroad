import type {LayerBlock, LayerPage, LayerTable} from "@offroad/document-intelligence";
import {parserLimits, type ParseResult, type ParserWarning} from "./types";
import {minimumOcrConfidence, type OcrEngine, type OcrLine, type OcrResult} from "./capabilities";
import {collectScaleDeclarations} from "./scale";

export const ocrLayerVersion = "ocr-1.1.0";

type Cell = {text: string; bbox: [number, number, number, number]; line: OcrLine};

/**
 * A line becomes cells where the ink leaves a gap wider than the text is tall. A word space is
 * about a third of the type height; a column gap is several times it. Measuring against the
 * line's own height keeps the rule the same for a 300 dpi scan and a 72 dpi phone photo.
 */
function cellsOf(line: OcrLine): Cell[] {
  const words = [...line.words].sort((a, b) => a.bbox[0] - b.bbox[0]);
  if (words.length === 0) return [{text: line.text, bbox: line.bbox, line}];
  const heights = words.map((w) => w.bbox[3] - w.bbox[1]);
  const height = heights.reduce((sum, h) => sum + h, 0) / heights.length;
  const threshold = height * 1.5;
  const groups: OcrLine["words"][] = [[words[0]!]];
  for (let index = 1; index < words.length; index += 1) {
    const gap = words[index]!.bbox[0] - words[index - 1]!.bbox[2];
    if (gap > threshold) groups.push([words[index]!]);
    else groups[groups.length - 1]!.push(words[index]!);
  }
  return groups.map((group) => ({
    text: group.map((w) => w.text).join(" "),
    bbox: [Math.min(...group.map((w) => w.bbox[0])), Math.min(...group.map((w) => w.bbox[1])), Math.max(...group.map((w) => w.bbox[2])), Math.max(...group.map((w) => w.bbox[3]))],
    line,
  }));
}

/** Two cells sit on one row when their vertical extents overlap by most of the smaller one. */
function sameRow(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const smaller = Math.min(a[3] - a[1], b[3] - b[1]);
  return smaller > 0 && overlap / smaller >= 0.5;
}

/**
 * Tables rebuilt from where the ink sits.
 *
 * Tesseract reads a printed table column by column: each column is a block and each cell a
 * line, so "Banco Itaú", "Capital de giro" and "9.840.000,00" arrive as three lines in three
 * blocks with nothing but their vertical position in common. Rows are therefore rebuilt by
 * that position: cells whose vertical extents overlap are one row, ordered left to right. A
 * line that spans several columns is first cut into cells at the gaps. Three or more
 * consecutive rows with two or more cells, at least one of them with three, are a table; the
 * first row is the header when it holds no amounts. Aurora's scanned debt map measured why:
 * without this the seven instruments were fifty-six prose blocks and no row pass ran.
 */
export function tablesFromLines(lines: readonly OcrLine[], pageId: string): {tables: LayerTable[]; consumed: Set<OcrLine>} {
  const tables: LayerTable[] = [];
  const consumed = new Set<OcrLine>();
  const cells = lines.flatMap(cellsOf).sort((a, b) => (a.bbox[1] + a.bbox[3]) / 2 - (b.bbox[1] + b.bbox[3]) / 2);

  // Rows by vertical overlap, in reading order.
  const rows: {cells: Cell[]; bbox: [number, number, number, number]}[] = [];
  for (const cell of cells) {
    const current = rows[rows.length - 1];
    if (current && sameRow(current.bbox, cell.bbox)) {
      current.cells.push(cell);
      current.bbox = [Math.min(current.bbox[0], cell.bbox[0]), Math.min(current.bbox[1], cell.bbox[1]), Math.max(current.bbox[2], cell.bbox[2]), Math.max(current.bbox[3], cell.bbox[3])];
    } else {
      rows.push({cells: [cell], bbox: [...cell.bbox] as [number, number, number, number]});
    }
  }
  for (const row of rows) row.cells.sort((a, b) => a.bbox[0] - b.bbox[0]);

  let run: typeof rows = [];
  const flush = () => {
    // A two-column statement (account, amount) is a table too when the amounts say so.
    const amountRows = run.filter((row) => row.cells.some((cell) => /\d{1,3}([.,]\d{3})+/.test(cell.text))).length;
    if (run.length >= 3 && (run.some((row) => row.cells.length >= 3) || amountRows >= 3)) {
      const id = `${pageId}.t${tables.length + 1}`;
      const [first, ...rest] = run;
      const headerish = first !== undefined && first.cells.every((cell) => !/\d{1,3}([.,]\d{3})+/.test(cell.text));
      const body = headerish ? rest : run;
      tables.push({
        id,
        ...(headerish && first ? {header: first.cells.map((cell) => cell.text)} : {}),
        rows: body.map((row, index) => ({
          id: `${id}.r${index + 1}`,
          cells: row.cells.map((cell, column) => ({id: `${id}.r${index + 1}.c${column + 1}`, text: cell.text})),
        })),
        bbox: [Math.min(...run.map((r) => r.bbox[0])), Math.min(...run.map((r) => r.bbox[1])), Math.max(...run.map((r) => r.bbox[2])), Math.max(...run.map((r) => r.bbox[3]))],
      });
      for (const row of run) for (const cell of row.cells) consumed.add(cell.line);
    }
    run = [];
  };
  for (const row of rows) {
    if (row.cells.length >= 2) run.push(row);
    else flush();
  }
  flush();
  return {tables, consumed};
}

export function pagesFromOcr(results: readonly {pageNumber: number; result: OcrResult}[]): {
  pages: LayerPage[];
  warnings: ParserWarning[];
} {
  const pages: LayerPage[] = [];
  const warnings: ParserWarning[] = [];

  for (const {pageNumber, result} of results) {
    const pageId = `p${pageNumber}`;
    const blocks: LayerBlock[] = [];
    // Tables first, from the lines that carry positions; the lines they consume do not also
    // become prose, and what is left is emitted block by block as before.
    const readableLines = result.blocks
      .filter((block) => block.confidence >= minimumOcrConfidence && block.lines)
      .flatMap((block) => block.lines!.filter((line) => line.confidence >= minimumOcrConfidence));
    const {tables, consumed} = tablesFromLines(readableLines, pageId);

    for (const block of result.blocks) {
      if (block.confidence < minimumOcrConfidence) continue;
      if (blocks.length >= parserLimits.maxBlocksPerPage) break;
      const remaining = block.lines ? block.lines.filter((line) => !consumed.has(line)) : null;
      const text = (remaining ? remaining.map((line) => line.text).join(" ") : block.text).replace(/\s+/g, " ").trim();
      if (!text) continue;

      const layerBlock: LayerBlock = {
        id: `${pageId}.b${blocks.length + 1}`,
        kind: "text",
        text: text.slice(0, parserLimits.maxCharactersPerBlock),
      };
      if (block.bbox) layerBlock.bbox = block.bbox;
      blocks.push(layerBlock);
    }

    const dropped = result.blocks.filter((block) => block.text.trim() && block.confidence < minimumOcrConfidence).length;
    if (dropped > 0) {
      warnings.push({
        code: "parse_error",
        message: `${dropped} OCR block(s) on this page were below the confidence floor and are not quotable`,
        where: pageId,
      });
    }
    if (blocks.length === 0) {
      warnings.push({code: "no_text", message: "OCR found no readable text on this page", where: pageId});
    }

    // `scanned` stays true: the text came from pixels, and every consumer must know it.
    pages.push({n: pageNumber, blocks, tables, scanned: true});
  }

  return {pages, warnings};
}

/**
 * Builds the layer for a document that *is* an image (a photographed balance sheet, a scan of
 * a signed contract — both routine in a data room).
 */
export async function parseImageWithOcr(
  input: {bytes: Uint8Array; documentId: string; documentVersion: number; mime: string; extension: string; mismatch: boolean},
  engine: OcrEngine | undefined,
): Promise<ParseResult> {
  const warnings: ParserWarning[] = [];
  let pages: LayerPage[] = [{n: 1, blocks: [], tables: [], scanned: true}];
  const parserVersions: Record<string, string> = {ocrLayer: ocrLayerVersion};
  let confidence: number | undefined;

  if (!engine) {
    warnings.push({code: "no_text", message: "the document is an image and no OCR engine is available", where: "p1"});
  } else {
    try {
      const result = await engine.recognizeImage({bytes: input.bytes, mime: input.mime});
      const built = pagesFromOcr([{pageNumber: 1, result}]);
      pages = built.pages;
      warnings.push(...built.warnings);
      parserVersions[engine.name] = engine.version;
      confidence = result.confidence;
    } catch (error) {
      warnings.push({code: "parse_error", message: `OCR failed: ${(error as Error).message}`, where: "p1"});
    }
  }

  const text = pages.flatMap((page) => page.blocks.map((block) => block.text)).join("\n");

  return {
    layer: {
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      kind: "image",
      pages,
      scaleDeclarations: collectScaleDeclarations([{id: "p1", text}]),
      stats: {pageCount: pages.length, estimatedTokens: Math.ceil(text.length / 4)},
    },
    parserVersions,
    warnings: confidence === undefined
      ? warnings
      : [...warnings, {code: "parse_error", message: `OCR mean confidence ${(confidence * 100).toFixed(0)}%; every value needs review`, where: "p1"}],
    detected: {kind: "image", mime: input.mime, extension: input.extension, mismatch: input.mismatch},
  };
}
