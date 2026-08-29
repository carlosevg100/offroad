import {describe, expect, it} from "vitest";
import {documentLayerSchema, indexLayer, type DocumentLayer} from "@offroad/document-intelligence";
import type {ModelGateway} from "@offroad/model-gateway";
import type {z} from "zod";

import {extractDocument} from "./extract";
import type {DocumentProfile} from "@offroad/document-intelligence";
import {tableBatchPasses, tableRowPasses} from "./rows";

/** A debt schedule the shape Aurora's arrives in: header row, seven contracts, a total. */
const debtLayer: DocumentLayer = documentLayerSchema.parse({
  documentId: "mapa-divida",
  documentVersion: 1,
  kind: "spreadsheet",
  parserVersion: "test",
  scaleDeclarations: [],
  stats: {},
  sheets: [{
    name: "Dívida",
    cells: [],
    tables: [{
      id: "sDívida.t1",
      rows: [
        {id: "sDívida.t1.r1", cells: [
          {id: "sDívida.t1.r1.c1", text: "Credor"}, {id: "sDívida.t1.r1.c2", text: "Saldo devedor (R$)"}, {id: "sDívida.t1.r1.c3", text: "Custo"}]},
        {id: "sDívida.t1.r2", cells: [
          {id: "sDívida.t1.r2.c1", text: "Banco Itaú"}, {id: "sDívida.t1.r2.c2", text: "9.840.000"}, {id: "sDívida.t1.r2.c3", text: "CDI + 4,10% a.a."}]},
        {id: "sDívida.t1.r3", cells: [
          {id: "sDívida.t1.r3.c1", text: "Banco Bradesco"}, {id: "sDívida.t1.r3.c2", text: "7.500.000"}, {id: "sDívida.t1.r3.c3", text: "CDI + 3,85% a.a."}]},
        {id: "sDívida.t1.r4", cells: [
          {id: "sDívida.t1.r4.c1", text: "Sicredi"}, {id: "sDívida.t1.r4.c2", text: "4.120.000"}, {id: "sDívida.t1.r4.c3", text: "CDI + 5,20% a.a."}]},
        {id: "sDívida.t1.r5", cells: [
          {id: "sDívida.t1.r5.c1", text: "Total"}, {id: "sDívida.t1.r5.c2", text: "21.460.000"}, {id: "sDívida.t1.r5.c3", text: ""}]},
      ],
    }],
  }],
});

describe("row passes: the orchestration enumerates, the model reads", () => {
  it("takes the headerish first row as the header and the rest as data", () => {
    const passes = tableRowPasses(indexLayer(debtLayer));
    expect(passes).toHaveLength(3);
    expect(passes.map((pass) => pass.instance)).toEqual([1, 2, 3]);
    expect(passes[0]!.evidenceText).toContain("colunas: Credor | Saldo devedor");
    expect(passes[0]!.evidenceText).toContain("[sDívida.t1.r2] Banco Itaú");
  });

  it("filters the total row: an instrument named Total is a defect, not a candidate", () => {
    const passes = tableRowPasses(indexLayer(debtLayer));
    expect(passes.some((pass) => pass.evidenceText.includes("Total"))).toBe(false);
  });

  it("leaves small tables to the whole-document pass", () => {
    const passes = tableRowPasses(indexLayer(debtLayer), {minRows: 4});
    expect(passes).toHaveLength(0);
  });
});

const profile: DocumentProfile = {
  documentId: "mapa-divida",
  kind: "debt_schedule",
  informationClass: "management",
  evidenceRank: 5,
  language: "pt",
  quality: {alerts: []},
  confidence: 1,
};

const gatewayRecording = (record: string[], systems: string[] = []) => {
  return {
    async complete<TSchema extends z.ZodType>(request: {schema: TSchema; system: string; input: Array<{text: string}>}) {
      record.push(request.input[0]!.text);
      systems.push(request.system);
      // The table call deliberately returns the same literal path for every row. The cited
      // anchor, not the model's numbering, is what binds each deterministic tuple index.
      const candidates = request.input[0]!.text.includes("Esta é a tabela")
        ? [...request.input[0]!.text.matchAll(/\[(sDívida\.t1\.r\d+)\]\s*([^|\n]+)/g)].map((match) => ({
            field_path: "debt.instruments.i.lender", value_raw: match[2]!.trim(), value_type: "text", scale: 1,
            information_class: "management", anchor: {kind: "table_row", id: match[1]!}, quote: match[2]!.trim(), confidence: 0.9,
          }))
        : [];
      const output = request.schema.parse({candidates, absent_fields: [], document_alerts: []});
      return {
        output, provider: "anthropic", model: "claude-sonnet-5", effort: "medium",
        usage: {inputTokens: 10, outputTokens: 5}, costUsd: 0.001, latencyMs: 1,
        stopReason: "stop", usedFallback: false, fromCassette: false, attempts: [],
      } as never;
    },
    spent: () => ({costUsd: 0, calls: 0}),
  } as unknown as ModelGateway;
};

describe("the extractor runs one paid pass per table, with indices bound from anchors", () => {
  it("reads every eligible row in one pass and writes each index itself", async () => {
    const prompts: string[] = [];
    const systems: string[] = [];
    const result = await extractDocument({
      layer: debtLayer,
      profile,
      fileName: "04_Mapa_Divida.xlsx",
      gateway: gatewayRecording(prompts, systems),
    });

    // One whole-document chunk plus one table pass, independent of row count.
    expect(result.chunks.total).toBe(2);
    const tablePrompts = prompts.filter((prompt) => prompt.includes("Esta é a tabela"));
    expect(tablePrompts).toHaveLength(1);
    expect(tablePrompts[0]).toContain("debt.instruments.i.lender");
    expect(systems.every((system) => !system.includes("debt.instruments"))).toBe(true);
    expect(tablePrompts[0]).toContain("com 3 linhas de dados");
    expect(tablePrompts[0]).toContain("Banco Itaú");
    expect(tablePrompts[0]).toContain("Bradesco");
    // The model answered the literal `i` on every row; cited anchors determine the numbers.
    expect(result.candidates.map((candidate) => candidate.field_path).filter((path) => path.endsWith(".lender")).sort()).toEqual([
      "debt.instruments.1.lender", "debt.instruments.2.lender", "debt.instruments.3.lender",
    ]);
  });
});

describe("table batches", () => {
  it("turns any eligible row count into one pass per table", () => {
    const batches = tableBatchPasses(indexLayer(debtLayer));
    expect(batches).toHaveLength(1);
    expect(batches[0]?.rows.map((row) => row.instance)).toEqual([1, 2, 3]);
    expect(batches[0]?.evidenceText).toContain("Banco Itaú");
    expect(batches[0]?.evidenceText).toContain("Sicredi");
  });
});

describe("which tables deserve a pass per row", () => {
  it("skips a table that names none of the indexed fields' words", async () => {
    const {targetFields} = await import("./prompt");
    const {documentLayerSchema, indexLayer} = await import("@offroad/document-intelligence");
    const table = (id: string, header: string[], rows: string[][]) => ({
      id, header, rows: rows.map((cells, r) => ({id: `${id}.r${r + 1}`, cells: cells.map((text, c) => ({id: `${id}.r${r + 1}.c${c + 1}`, text}))})),
    });
    const layer = documentLayerSchema.parse({
      documentId: "d", documentVersion: 1, kind: "pdf", parserVersion: "t", scaleDeclarations: [], stats: {},
      pages: [{n: 1, scanned: false, blocks: [], tables: [
        table("p1.t1", ["Credor", "Saldo", "Vencimento"], [["Itaú", "1.000", "2027-01-01"], ["Bradesco", "2.000", "2028-01-01"], ["Santander", "3.000", "2029-01-01"]]),
        table("p1.t2", ["Alíquota", "Base", "Imposto"], [["34%", "100", "34"], ["34%", "200", "68"], ["34%", "300", "102"]]),
      ]}],
    });
    const indexed = targetFields("audited_financial_statements").filter((field) => field.pattern.includes("{i}"));
    const passes = tableRowPasses(indexLayer(layer), {fields: indexed});
    expect(new Set(passes.map((pass) => pass.tableId))).toEqual(new Set(["p1.t1"]));
    expect(tableRowPasses(indexLayer(layer)).length).toBe(6);
  });
});

describe("instrument numbers across tables", () => {
  it("keeps counting from one table into the next", async () => {
    const {documentLayerSchema, indexLayer} = await import("@offroad/document-intelligence");
    const table = (id: string, rows: string[][]) => ({
      id, header: ["Credor", "Saldo", "Vencimento"], rows: rows.map((cells, r) => ({id: `${id}.r${r + 1}`, cells: cells.map((text, c) => ({id: `${id}.r${r + 1}.c${c + 1}`, text}))})),
    });
    const layer = documentLayerSchema.parse({
      documentId: "d", documentVersion: 1, kind: "pdf", parserVersion: "t", scaleDeclarations: [], stats: {},
      pages: [{n: 1, scanned: false, blocks: [], tables: [
        table("p1.t1", [["Itaú", "1.000", "2027-01-01"], ["Bradesco", "2.000", "2028-01-01"], ["Santander", "3.000", "2029-01-01"]]),
        table("p1.t2", [["BTG", "4.000", "2027-06-01"], ["Safra", "5.000", "2028-06-01"], ["Daycoval", "6.000", "2029-06-01"]]),
      ]}],
    });
    const passes = tableRowPasses(indexLayer(layer));
    expect(passes.map((pass) => pass.instance)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
