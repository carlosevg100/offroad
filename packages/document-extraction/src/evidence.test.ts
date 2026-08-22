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
