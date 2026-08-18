import type {LayerBlock, LayerTable} from "@offroad/document-intelligence";
import {ParserError, createBudget, parserLimits, type ParseInput, type ParseResult, type ParserWarning} from "./types";
import {attributesOf, childrenOf, collapse, findAll, findFirst, openOoxml, readXml, tagOf, textOf, type OrderedNode} from "./ooxml";
import {collectScaleDeclarations} from "./scale";

export const docxParserVersion = "docx-1.0.0";

const headingStyle = /^(heading|t[ií]tulo|ttulo)/i;

/**
 * DOCX → layer (P1 plan §5.3, stage E2).
 *
 * Word carries real structure, so the layer keeps it: the document is split into sections at
 * each heading, and paragraphs and tables stay in the order they appear. That ordering is
 * what lets an anchor like `sec3.p7` mean "the seventh paragraph under the third heading"
 * for a human opening the file, which is the whole point of an anchor.
 */
export async function parseDocx(input: ParseInput): Promise<ParseResult> {
  const warnings: ParserWarning[] = [];
  const budget = createBudget();

  const zip = await openOoxml(input.bytes);
  const root = await readXml(zip, "word/document.xml");
  if (!root) throw new ParserError("the package has no word/document.xml");

  const body = findFirst(root, "w:body");
  if (!body) throw new ParserError("the document has no body");

  type Section = {id: string; heading?: string; paragraphs: LayerBlock[]; tables: LayerTable[]};
  const sections: Section[] = [];
  let current: Section = {id: "sec1", paragraphs: [], tables: []};
  sections.push(current);

  const startSection = (heading: string) => {
    // The first heading takes over the implicit opening section when it is still empty.
    if (current.paragraphs.length === 0 && current.tables.length === 0 && current.heading === undefined) {
      current.heading = heading;
      return;
    }
    current = {id: `sec${sections.length + 1}`, heading, paragraphs: [], tables: []};
    sections.push(current);
  };

  for (const node of childrenOf(body)) {
    const tag = tagOf(node);

    if (tag === "w:p") {
      const text = collapse(textOf(node, "w:t", ["w:br", "w:tab", "w:cr"]));
      if (!text) continue;

      if (isHeading(node)) {
        startSection(text.slice(0, parserLimits.maxCharactersPerBlock));
        continue;
      }

      const taken = budget.take(text.slice(0, parserLimits.maxCharactersPerBlock));
      if (!taken) continue;
      current.paragraphs.push({
        id: `${current.id}.p${current.paragraphs.length + 1}`,
        kind: "text",
        text: taken,
      });
      continue;
    }

    if (tag === "w:tbl") {
      const table = readTable(node, `${current.id}.t${current.tables.length + 1}`, budget);
      if (table) current.tables.push(table);
    }
  }

  const populated = sections.filter(
    (section) => section.heading !== undefined || section.paragraphs.length > 0 || section.tables.length > 0,
  );
  if (populated.length === 0) throw new ParserError("the document has no readable text", "no_text");

  if (budget.exhausted) {
    warnings.push({code: "limit_reached", message: "the text budget was reached; the tail of the document was not indexed"});
  }

  const containers = populated.map((section) => ({
    id: section.id,
    text: [section.heading ?? "", ...section.paragraphs.map((p) => p.text), ...section.tables.flatMap(rowsText)].join("\n"),
  }));

  return {
    layer: {
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      kind: "docx",
      sections: populated.map((section) => {
        const base: {id: string; heading?: string; paragraphs: LayerBlock[]; tables: LayerTable[]} = {
          id: section.id,
          paragraphs: section.paragraphs,
          tables: section.tables,
        };
        if (section.heading !== undefined) base.heading = section.heading;
        return base;
      }),
      scaleDeclarations: collectScaleDeclarations(containers),
      stats: {estimatedTokens: Math.ceil(budget.used / 4)},
    },
    parserVersions: {docx: docxParserVersion, jszip: "3.10.1", "fast-xml-parser": "5.10.1"},
    warnings,
    detected: {
      kind: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
      mismatch: false,
    },
  };
}

function isHeading(paragraph: OrderedNode): boolean {
  const properties = findFirst(childrenOf(paragraph), "w:pPr");
  if (!properties) return false;
  const style = findFirst(childrenOf(properties), "w:pStyle");
  if (!style) return false;
  const value = attributesOf(style)["@_w:val"];
  return typeof value === "string" && headingStyle.test(value);
}

function readTable(node: OrderedNode, tableId: string, budget: ReturnType<typeof createBudget>): LayerTable | null {
  const rows = findAll(childrenOf(node), "w:tr").slice(0, parserLimits.maxRowsPerTable);
  if (rows.length === 0) return null;

  const layerRows = rows.map((row, rowIndex) => {
    const rowId = `${tableId}.r${rowIndex + 1}`;
    const cells = findAll(childrenOf(row), "w:tc").map((cell, columnIndex) => ({
      id: `${rowId}.c${columnIndex + 1}`,
      text: budget.take(collapse(textOf(cell, "w:t", ["w:br", "w:tab", "w:cr", "w:p"])).slice(0, parserLimits.maxCharactersPerBlock)),
    }));
    return {id: rowId, cells};
  });

  if (layerRows.every((row) => row.cells.every((cell) => cell.text === ""))) return null;
  return {id: tableId, rows: layerRows};
}

function rowsText(table: LayerTable): string[] {
  return table.rows.map((row) => row.cells.map((cell) => cell.text).join(" | "));
}
