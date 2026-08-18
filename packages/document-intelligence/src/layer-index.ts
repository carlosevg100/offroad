import type {AnchorPrecision} from "@offroad/credit-ontology";
import type {DocumentLayer, LayerTable} from "./schemas";

export type IndexedAnchor = {
  id: string;
  precision: AnchorPrecision;
  text: string;
  page?: number;
  sheet?: string;
  /** Text of the enclosing page/sheet/section/slide — used for scale/period cues. */
  containerId?: string;
};

export type LayerIndex = {
  byId: Map<string, IndexedAnchor>;
  documentId: string;
  documentVersion: number;
};

/**
 * Builds the id → text/precision index used by the verifier. Ids are stable per
 * document version and follow the conventions of P1 plan §5.3.
 */
export function indexLayer(layer: DocumentLayer): LayerIndex {
  const byId = new Map<string, IndexedAnchor>();
  const put = (anchor: IndexedAnchor) => {
    if (byId.has(anchor.id)) throw new Error(`duplicate layer id: ${anchor.id}`);
    byId.set(anchor.id, anchor);
  };

  for (const page of layer.pages ?? []) {
    const pageId = `p${page.n}`;
    const blockTexts: string[] = [];
    for (const block of page.blocks) {
      put({id: block.id, precision: "block", text: block.text, page: page.n, containerId: pageId});
      blockTexts.push(block.text);
    }
    for (const table of page.tables) blockTexts.push(...indexTable(table, put, {page: page.n, containerId: pageId}));
    put({id: pageId, precision: "page", text: blockTexts.join("\n"), page: page.n});
  }

  for (const sheet of layer.sheets ?? []) {
    const sheetId = `s${sheet.name}`;
    const texts: string[] = [];
    for (const cell of sheet.cells) {
      const text = cell.v === null ? "" : String(cell.v);
      put({id: `${sheetId}!${cell.ref}`, precision: "cell", text, sheet: sheet.name, containerId: sheetId});
      if (text) texts.push(text);
    }
    for (const table of sheet.tables) texts.push(...indexTable(table, put, {sheet: sheet.name, containerId: sheetId}));
    put({id: sheetId, precision: "page", text: texts.join("\n"), sheet: sheet.name});
  }

  for (const section of layer.sections ?? []) {
    const texts: string[] = [];
    if (section.heading) texts.push(section.heading);
    for (const paragraph of section.paragraphs) {
      put({id: paragraph.id, precision: "block", text: paragraph.text, containerId: section.id});
      texts.push(paragraph.text);
    }
    for (const table of section.tables) texts.push(...indexTable(table, put, {containerId: section.id}));
    put({id: section.id, precision: "page", text: texts.join("\n")});
  }

  for (const slide of layer.slides ?? []) {
    const slideId = `sl${slide.n}`;
    const texts: string[] = [];
    for (const block of slide.blocks) {
      put({id: block.id, precision: "block", text: block.text, containerId: slideId});
      texts.push(block.text);
    }
    for (const table of slide.tables) texts.push(...indexTable(table, put, {containerId: slideId}));
    if (slide.notes) texts.push(slide.notes);
    put({id: slideId, precision: "page", text: texts.join("\n")});
  }

  const everything = [...byId.values()].filter((a) => a.precision === "page").map((a) => a.text);
  put({id: "document", precision: "document", text: everything.join("\n")});

  return {byId, documentId: layer.documentId, documentVersion: layer.documentVersion};
}

function indexTable(table: LayerTable, put: (anchor: IndexedAnchor) => void, context: {page?: number; sheet?: string; containerId?: string}): string[] {
  const rowTexts: string[] = [];
  for (const row of table.rows) {
    const cellTexts: string[] = [];
    for (const cell of row.cells) {
      put({id: cell.id, precision: "cell", text: cell.text, ...context});
      cellTexts.push(cell.text);
    }
    const rowText = cellTexts.join(" | ");
    put({id: row.id, precision: "row", text: rowText, ...context});
    rowTexts.push(rowText);
  }
  const header = table.header ? [table.header.join(" | ")] : [];
  put({id: table.id, precision: "block", text: [...header, ...rowTexts].join("\n"), ...context});
  return [...header, ...rowTexts];
}

export function lookupAnchor(index: LayerIndex, id: string): IndexedAnchor | undefined {
  return index.byId.get(id);
}
