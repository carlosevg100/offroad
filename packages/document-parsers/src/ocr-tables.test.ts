import {describe, expect, it} from "vitest";

import type {OcrLine} from "./capabilities";
import {pagesFromOcr, tablesFromLines} from "./ocr";

/** A line laid out as a scanner sees it: words at x positions, a wide gap between columns. */
const line = (top: number, columns: string[][]): OcrLine => {
  let x = 40;
  const words = columns.flatMap((column, columnIndex) => {
    if (columnIndex > 0) x += 120; // the column gap
    return column.map((text) => {
      const word = {text, confidence: 0.95, bbox: [x, top, x + text.length * 9, top + 14] as [number, number, number, number]};
      x += text.length * 9 + 8; // the space between words
      return word;
    });
  });
  return {text: words.map((w) => w.text).join(" "), confidence: 0.95, bbox: [40, top, x, top + 14], words};
};

describe("tables rebuilt from a scan", () => {
  const lines = [
    line(100, [["Credor"], ["Saldo", "devedor"], ["Custo"], ["Vencimento"]]),
    line(120, [["Banco", "Itaú"], ["9.840.000,00"], ["CDI", "+", "4,10%"], ["20/11/2027"]]),
    line(140, [["Banco", "Bradesco"], ["7.500.000,00"], ["CDI", "+", "3,85%"], ["15/04/2028"]]),
    line(160, [["Sicredi"], ["4.120.000,00"], ["CDI", "+", "5,20%"], ["30/06/2027"]]),
    line(200, [["Nota", "1.", "Saldos", "em", "31/07/2026,", "valores", "em", "reais."]]),
  ];

  it("finds the columns where the ink leaves a gap, and the header where there are no numbers", () => {
    const {tables, consumed} = tablesFromLines(lines, "p1");
    expect(tables).toHaveLength(1);
    expect(tables[0]!.header).toEqual(["Credor", "Saldo devedor", "Custo", "Vencimento"]);
    expect(tables[0]!.rows).toHaveLength(3);
    expect(tables[0]!.rows[0]!.cells.map((cell) => cell.text)).toEqual(["Banco Itaú", "9.840.000,00", "CDI + 4,10%", "20/11/2027"]);
    expect(tables[0]!.rows[0]!.cells[1]!.id).toBe("p1.t1.r1.c2");
    expect(consumed.size).toBe(4);
  });

  it("rebuilds rows from cells that arrived column by column, the way Tesseract reads a table", () => {
    // Each cell is its own line, grouped by column; only the vertical position says which row.
    const cell = (text: string, x: number, top: number): OcrLine => ({text, confidence: 0.95, bbox: [x, top, x + text.length * 9, top + 14], words: [{text, confidence: 0.95, bbox: [x, top, x + text.length * 9, top + 14]}]});
    const column = (x: number, values: string[], firstTop: number) => values.map((value, index) => cell(value, x, firstTop + index * 20));
    const lines = [
      ...column(40, ["Credor", "Banco Itaú", "Banco Bradesco", "Sicredi"], 100),
      ...column(300, ["Saldo devedor", "9.840.000,00", "7.500.000,00", "4.120.000,00"], 101),
      ...column(520, ["Vencimento", "20/11/2027", "15/04/2028", "30/06/2027"], 99),
      cell("Posição em 31/07/2026", 40, 60),
    ];
    const {tables, consumed} = tablesFromLines(lines, "p1");
    expect(tables).toHaveLength(1);
    expect(tables[0]!.header).toEqual(["Credor", "Saldo devedor", "Vencimento"]);
    expect(tables[0]!.rows.map((row) => row.cells.map((c) => c.text))).toEqual([
      ["Banco Itaú", "9.840.000,00", "20/11/2027"],
      ["Banco Bradesco", "7.500.000,00", "15/04/2028"],
      ["Sicredi", "4.120.000,00", "30/06/2027"],
    ]);
    expect(consumed.size).toBe(12);
  });

  it("keeps the note as prose beside the table on the page", () => {
    const {pages} = pagesFromOcr([{pageNumber: 1, result: {confidence: 0.95, blocks: [{text: lines.map((l) => l.text).join(" "), confidence: 0.95, bbox: [40, 100, 600, 214], lines}]}}]);
    expect(pages[0]!.tables).toHaveLength(1);
    expect(pages[0]!.blocks).toHaveLength(1);
    expect(pages[0]!.blocks[0]!.text).toContain("Nota 1.");
    expect(pages[0]!.scanned).toBe(true);
  });
});
