import {describe, expect, it} from "vitest";

import {documentLayerSchema, indexLayer} from "@offroad/document-intelligence";

import {renderEvidence} from "./evidence";
describe("a window carries the tail of the one before it", () => {
  const manyLines = (count: number) =>
    indexLayer(documentLayerSchema.parse({
      documentId: "proposta", documentVersion: 1, kind: "pdf", parserVersion: "test", scaleDeclarations: [], stats: {},
      pages: Array.from({length: count}, (_, page) => ({
        n: page + 1,
        blocks: [{id: `p${page + 1}.b1`, kind: "text", text: `Página ${page + 1}: as debêntures da ${page + 11}ª emissão foram emitidas em 2024.`}],
        tables: [],
      })),
    }));

  it("repeats the last lines as context, and they are not the new window's own content", () => {
    const chunks = renderEvidence(manyLines(6), {maxLines: 2});
    expect(chunks.length).toBeGreaterThan(1);
    const second = chunks[1]!;
    expect(second.text).toContain("contexto do trecho anterior");
    // The sentence that names the issuance travels with the sentence that depends on it.
    expect(second.text).toContain("11ª emissão");
    expect(second.text).toContain("13ª emissão");
  });

  it("does not carry context between sheets of a workbook", () => {
    const workbook = indexLayer(documentLayerSchema.parse({
      documentId: "planilha", documentVersion: 1, kind: "spreadsheet", parserVersion: "test", scaleDeclarations: [], stats: {},
      sheets: [
        {name: "Clientes", cells: [{ref: "A1", v: "Cliente A", t: "s"}], tables: []},
        {name: "Resumo", cells: [{ref: "A1", v: "ARR", t: "s"}], tables: []},
      ],
    }));
    const chunks = renderEvidence(workbook, {oneContainerPerChunk: true});
    expect(chunks.every((chunk) => !chunk.text.includes("contexto do trecho anterior"))).toBe(true);
  });
});

describe("dense comparative statement windows", () => {
  it("splits a long statement without losing the period header or a row", () => {
    const dense = indexLayer(documentLayerSchema.parse({documentId: "dense", documentVersion: 1, kind: "pdf", parserVersion: "synthetic", scaleDeclarations: [], stats: {},
      pages: [{n: 1, scanned: false, blocks: [], tables: [{id: "p1.t1", header: ["Account", "2028 (R$ mil)", "2027 (R$ mil)"],
        rows: Array.from({length: 75}, (_, index) => ({id: `p1.t1.r${index + 1}`, cells: [
          {id: `p1.t1.r${index + 1}.c1`, text: `Account ${index + 1}`},
          {id: `p1.t1.r${index + 1}.c2`, text: "100"}, {id: `p1.t1.r${index + 1}.c3`, text: "90"},
        ]})),
      }]}]}));
    const windows = renderEvidence(dense);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((window) => window.text.includes("2028 (R$ mil)"))).toBe(true);
    const own = windows.flatMap((window) => window.anchorIds);
    for (let row = 1; row <= 75; row++) expect(own.filter((id) => id === `p1.t1.r${row}`)).toHaveLength(1);
  });
});

it("keeps sparse cell exports at a larger bound than comparative rows", () => {
  const sparse = indexLayer(documentLayerSchema.parse({documentId: "cells", documentVersion: 1, kind: "spreadsheet", parserVersion: "synthetic", scaleDeclarations: [], stats: {},
    sheets: [{name: "Summary", tables: [], cells: Array.from({length: 40}, (_, i) => ({ref: `A${i + 1}`, t: "s", v: `Label ${i + 1}`}))}],
  }));
  expect(renderEvidence(sparse)).toHaveLength(1);
});
