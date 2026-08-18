import type {LayerBlock, LayerSlide, LayerTable} from "@offroad/document-intelligence";
import {ParserError, createBudget, parserLimits, type ParseInput, type ParseResult, type ParserWarning} from "./types";
import {childrenOf, collapse, findAll, openOoxml, readXml, textOf, type OrderedNode} from "./ooxml";
import {collectScaleDeclarations} from "./scale";

export const pptxParserVersion = "pptx-1.0.0";

/**
 * PPTX → layer (P1 plan §5.3, stage E2).
 *
 * Decks are where a company states the story that the financials must confirm, so the layer
 * keeps each shape as its own block (a claim on a slide is quotable and anchorable) and the
 * speaker notes, which frequently hold the assumption behind a projection.
 */
export async function parsePptx(input: ParseInput): Promise<ParseResult> {
  const warnings: ParserWarning[] = [];
  const budget = createBudget();

  const zip = await openOoxml(input.bytes);

  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slidePaths.length === 0) throw new ParserError("the package has no slides", "no_text");

  const slides: LayerSlide[] = [];
  const containers: {id: string; text: string}[] = [];

  for (const path of slidePaths.slice(0, parserLimits.maxPages)) {
    const number = slideNumber(path);
    const slideId = `sl${number}`;
    const root = await readXml(zip, path);
    if (!root) continue;

    const blocks: LayerBlock[] = [];
    for (const shape of findAll(root, "p:sp")) {
      const text = collapse(textOf(shape, "a:t", ["a:br", "a:p"]));
      if (!text) continue;
      const taken = budget.take(text.slice(0, parserLimits.maxCharactersPerBlock));
      if (!taken) continue;
      blocks.push({
        id: `${slideId}.b${blocks.length + 1}`,
        // The first shape of a slide is its title often enough to be worth the distinction,
        // and never load-bearing: a wrong guess costs nothing downstream.
        kind: blocks.length === 0 && taken.length <= 120 ? "heading" : "text",
        text: taken,
      });
    }

    const tables: LayerTable[] = [];
    for (const table of findAll(root, "a:tbl")) {
      const built = readTable(table, `${slideId}.t${tables.length + 1}`, budget);
      if (built) tables.push(built);
    }

    const notes = await readNotes(zip, number, budget);

    if (blocks.length === 0 && tables.length === 0 && !notes) {
      // A slide that is only images: keep the slide so page-level anchors stay contiguous.
      warnings.push({code: "scanned_page", message: "slide has no extractable text (image only)", where: slideId});
    }

    const slide: LayerSlide = {n: number, blocks, tables};
    if (notes) slide.notes = notes;
    slides.push(slide);

    containers.push({
      id: slideId,
      text: [...blocks.map((block) => block.text), ...tables.flatMap(rowsText), notes ?? ""].join("\n"),
    });
  }

  if (slides.length === 0) throw new ParserError("no slide could be read", "no_text");

  return {
    layer: {
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      kind: "pptx",
      slides,
      scaleDeclarations: collectScaleDeclarations(containers),
      stats: {slideCount: slides.length, estimatedTokens: Math.ceil(budget.used / 4)},
    },
    parserVersions: {pptx: pptxParserVersion, jszip: "3.10.1", "fast-xml-parser": "5.10.1"},
    warnings,
    detected: {
      kind: "pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      mismatch: false,
    },
  };
}

function slideNumber(path: string): number {
  const match = /slide(\d+)\.xml$/.exec(path);
  return match?.[1] ? Number(match[1]) : 0;
}

async function readNotes(
  zip: Awaited<ReturnType<typeof openOoxml>>,
  slide: number,
  budget: ReturnType<typeof createBudget>,
): Promise<string | undefined> {
  const root = await readXml(zip, `ppt/notesSlides/notesSlide${slide}.xml`);
  if (!root) return undefined;
  const text = collapse(
    findAll(root, "p:sp")
      .map((shape) => textOf(shape, "a:t", ["a:br", "a:p"]))
      .join(" "),
  );
  if (!text) return undefined;
  const taken = budget.take(text.slice(0, parserLimits.maxCharactersPerBlock));
  return taken || undefined;
}

function readTable(node: OrderedNode, tableId: string, budget: ReturnType<typeof createBudget>): LayerTable | null {
  const rows = findAll(childrenOf(node), "a:tr").slice(0, parserLimits.maxRowsPerTable);
  if (rows.length === 0) return null;

  const layerRows = rows.map((row, rowIndex) => {
    const rowId = `${tableId}.r${rowIndex + 1}`;
    const cells = findAll(childrenOf(row), "a:tc").map((cell, columnIndex) => ({
      id: `${rowId}.c${columnIndex + 1}`,
      text: budget.take(collapse(textOf(cell, "a:t", ["a:br", "a:p"])).slice(0, parserLimits.maxCharactersPerBlock)),
    }));
    return {id: rowId, cells};
  });

  if (layerRows.every((row) => row.cells.every((cell) => cell.text === ""))) return null;
  return {id: tableId, rows: layerRows};
}

function rowsText(table: LayerTable): string[] {
  return table.rows.map((row) => row.cells.map((cell) => cell.text).join(" | "));
}
