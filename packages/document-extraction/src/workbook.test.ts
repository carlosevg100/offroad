import {describe, expect, it} from "vitest";

import {documentLayerSchema, indexLayer} from "@offroad/document-intelligence";

import {renderEvidence} from "./evidence";

describe("a workbook with several sheets", () => {
  it("gives each sheet its own window when asked, and packs them otherwise", () => {
    const workbook = documentLayerSchema.parse({
      documentId: "wb", documentVersion: 1, kind: "spreadsheet", parserVersion: "test", scaleDeclarations: [], stats: {},
      sheets: [
        {name: "MRR", cells: [{ref: "A1", v: "Cliente", t: "s"}, {ref: "B1", v: "2026-07", t: "s"}, {ref: "A2", v: "Banco", t: "s"}, {ref: "B2", v: 1000, t: "n"}]},
        {name: "Resumo", cells: [{ref: "A1", v: "ARR (R$)", t: "s"}, {ref: "B1", v: 37326000, t: "n"}]},
      ],
    });
    const packed = renderEvidence(indexLayer(workbook), {});
    const split = renderEvidence(indexLayer(workbook), {oneContainerPerChunk: true});
    expect(packed).toHaveLength(1);
    expect(split).toHaveLength(2);
    expect(split[1]!.text).toContain("ARR");
  });
});

describe("a dense document", () => {
  it("is read in windows of at most two hundred lines", () => {
    const layer = documentLayerSchema.parse({
      documentId: "dense", documentVersion: 1, kind: "pdf", parserVersion: "t", scaleDeclarations: [], stats: {},
      pages: [{n: 1, scanned: false, tables: [], blocks: Array.from({length: 450}, (_, i) => ({id: `p1.b${i + 1}`, kind: "text", text: `Linha ${i + 1} de um release denso com um número ${i * 7}.`}))}],
    });
    const chunks = renderEvidence(indexLayer(layer), {});
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...chunks.map((chunk) => chunk.anchorIds.length))).toBeLessThanOrEqual(200);
  });
});
