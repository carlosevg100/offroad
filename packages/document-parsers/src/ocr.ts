import type {LayerBlock, LayerPage} from "@offroad/document-intelligence";
import {parserLimits, type ParseResult, type ParserWarning} from "./types";
import {minimumOcrConfidence, type OcrEngine, type OcrResult} from "./capabilities";
import {collectScaleDeclarations} from "./scale";

export const ocrLayerVersion = "ocr-1.0.0";

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

    for (const block of result.blocks) {
      const text = block.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (block.confidence < minimumOcrConfidence) continue;
      if (blocks.length >= parserLimits.maxBlocksPerPage) break;

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
    pages.push({n: pageNumber, blocks, tables: [], scanned: true});
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
