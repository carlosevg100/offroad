import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {documentLayerSchema} from "@offroad/document-intelligence";
import {parsePdf, pdfParserVersion} from "./pdf";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "../../testing-fixtures/assets/vertentes/raw/empresa/documentos/contabil/BALANCETE JUN26.pdf");

describe("native PDF cell geometry", () => {
  it("retains measured cell extents and empty slots in the real Vertentes trial balance", async () => {
    const parsed = await parsePdf({bytes: new Uint8Array(readFileSync(fixture)), documentId: "balance", documentVersion: 1, fileName: "balance.pdf"});
    expect(pdfParserVersion).toBe("pdf-1.1.0");
    const tables = parsed.layer.pages!.flatMap((page) => page.tables);
    expect(tables.length).toBeGreaterThan(0);
    const cells = tables.flatMap((table) => table.rows.flatMap((row) => row.cells));
    expect(cells.some((cell) => cell.text === "Saldo atual")).toBe(true);
    expect(cells.some((cell) => cell.text === "Saldo anterior")).toBe(true);
    expect(cells.some((cell) => cell.text === "" && cell.bbox === null)).toBe(true);
    for (const table of tables) {
      for (const row of table.rows) {
        for (const [index, cell] of row.cells.entries()) {
          expect(cell.id).toBe(`${row.id}.c${index + 1}`);
          if (!cell.text) {
            expect(cell.bbox).toBeNull();
            continue;
          }
          expect(cell.bbox).not.toBeNull();
          const [x0, y0, x1, y1] = cell.bbox!;
          expect(x1).toBeGreaterThanOrEqual(x0);
          expect(y1).toBeGreaterThan(y0);
          expect(x0).toBeGreaterThanOrEqual(table.bbox![0]);
          expect(x1).toBeLessThanOrEqual(table.bbox![2]);
        }
      }
    }
    const legacy = structuredClone(parsed.layer);
    for (const page of legacy.pages ?? []) for (const table of page.tables) for (const row of table.rows) for (const cell of row.cells) delete cell.bbox;
    expect(documentLayerSchema.safeParse(legacy).success).toBe(true);
    expect(documentLayerSchema.safeParse(parsed.layer).success).toBe(true);
  });
});
