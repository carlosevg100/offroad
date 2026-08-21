import type {LayerBlock, LayerPage, LayerTable} from "@offroad/document-intelligence";
import {parserLimits, type ParseResult, type ParserWarning} from "./types";
import {minimumOcrConfidence, type OcrEngine, type OcrLine, type OcrResult} from "./capabilities";
import {collectScaleDeclarations} from "./scale";

export const ocrLayerVersion = "ocr-1.1.0";

/**
 * A line becomes cells where the ink leaves a gap wider than the text is tall. A word space is
 * about a third of the type height; a column gap is several times it. Measuring against the
 * line's own height keeps the rule the same for a 300 dpi scan and a 72 dpi phone photo, and
 * does not depend on how many of the gaps in the line happen to be column gaps.
 */
function cellsOf(line: OcrLine): string[] {
  const words = [...line.words].sort((a, b) => a.bbox[0] - b.bbox[0]);
  if (words.length < 2) return [line.text];
  const gaps = words.slice(1).map((word, index) => word.bbox[0] - words[index]!.bbox[2]);
  const heights = words.map((w) => w.bbox[3] - w.bbox[1]);
  const height = heights.reduce((sum, h) => sum + h, 0) / heights.length;
  const threshold = height * 1.5;
  const cells: string[][] = [[words[0]!.text]];
  gaps.forEach((gap, index) => {
    if (gap > threshold) cells.push([words[index + 1]!.text]);
    else cells[cells.length - 1]!.push(words[index + 1]!.text);
  });
  return cells.map((cell) => cell.join(" "));
}

/**
 * Consecutive lines with three or more cells are a table. Aurora's scanned debt map measured
 * why this matters: without it the eight columns of a row were one sentence, no row pass ran,
 * and the numbers came back as prose with no cell to cite.
 */
export function tablesFromLines(lines: readonly OcrLine[], pageId: string): {tables: LayerTable[]; consumed: Set<OcrLine>} {
  const tables: LayerTable[] = [];
  const consumed = new Set<OcrLine>();
  const ordered = [...lines].sort((a, b) => a.bbox[1] - b.bbox[1]);
  let run: {line: OcrLine; cells: string[]}[] = [];
  const flush = () => {
    if (run.length >= 3) {
      const id = `${pageId}.t${tables.length + 1}`;
      const [first, ...rest] = run;
      const headerish = first !== undefined && first.cells.every((cell) => !/\d{2,}[.,]\d{3}/.test(cell));
      const body = headerish ? rest : run;
      const rows = body.map((entry, index) => ({
        id: `${id}.r${index + 1}`,
        cells: entry.cells.map((text, column) => ({id: `${id}.r${index + 1}.c${column + 1}`, text})),
      }));
      tables.push({
        id,
        ...(headerish && first ? {header: first.cells} : {}),
        rows,
        bbox: [
          Math.min(...run.map((e) => e.line.bbox[0])),
          Math.min(...run.map((e) => e.line.bbox[1])),
          Math.max(...run.map((e) => e.line.bbox[2])),
          Math.max(...run.map((e) => e.line.bbox[3])),
        ],
      });
      for (const entry of run) consumed.add(entry.line);
    }
    run = [];
  };
  for (const line of ordered) {
    const cells = cellsOf(line);
    if (cells.length >= 3) run.push({line, cells});
    else flush();
  }
  flush();
  return {tables, consumed};
}

/**
 * Turns OCR output into layer pages.
 *
 * The pages stay marked `scanned` even after a successful read. That is deliberate and it is
 * the whole safety property of this path: OCR turns a smudge into a plausible digit, so a
 * value read this way must never be auto-accepted (the policy requires a verified anchor from
 * a native text layer — P1 plan §7, D-014). Downstream sees `scanned: true` plus the recorded
 * engine and confidence, and routes the document to human review.
 */
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
