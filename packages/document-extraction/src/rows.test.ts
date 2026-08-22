import {describe, expect, it} from "vitest";
import {documentLayerSchema, indexLayer, type DocumentLayer} from "@offroad/document-intelligence";
import type {ModelGateway} from "@offroad/model-gateway";
import type {z} from "zod";

import {extractDocument} from "./extract";
import type {DocumentProfile} from "@offroad/document-intelligence";
import {tableRowPasses} from "./rows";

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
      // Every row pass answers with index 1, the way a model that was never told the number
      // would: the orchestration is what makes the index right.
      const row = /\[(sDívida\.t1\.r\d+)\]/.exec(request.input[0]!.text);
      const lender = /\[sDívida\.t1\.r\d+\]\s*([^|\n]+)/.exec(request.input[0]!.text);
      const candidates = request.input[0]!.text.includes("Esta é a linha") && row && lender
        ? [{field_path: "debt.instruments.i.lender", value_raw: lender[1]!.trim(), value_type: "text", scale: 1, information_class: "management", anchor: {kind: "table_row", id: row[1]!}, quote: lender[1]!.trim(), confidence: 0.9}]
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

describe("the extractor runs one pass per data row, with the index pre-bound", () => {
  it("gives every row the same cacheable prefix and writes the index itself", async () => {
    const prompts: string[] = [];
    const systems: string[] = [];
    const result = await extractDocument({
      layer: debtLayer,
      profile,
      fileName: "04_Mapa_Divida.xlsx",
      gateway: gatewayRecording(prompts, systems),
    });

    // One whole-document chunk plus three row passes.
    expect(result.chunks.total).toBe(4);
    const rowPrompts = prompts.filter((prompt) => prompt.includes("Esta é a linha"));
    expect(rowPrompts).toHaveLength(3);
    // The prefix the provider caches is one string for all three rows.
    const rowSystems = systems.filter((system) => system.includes("numeração das linhas"));
    expect(new Set(rowSystems).size).toBe(1);
    expect(rowSystems[0]).toContain("debt.instruments.i.lender");
    // Only the variable half names the row, and each pass shows its own row beside the header.
    expect(rowPrompts[0]).toContain("Esta é a linha 1");
    expect(rowPrompts[2]).toContain("Esta é a linha 3");
    expect(rowPrompts[0]).toContain("Banco Itaú");
    expect(rowPrompts[0]).not.toContain("Bradesco");
    // The model answered the literal `i` on every row; the numbers on the candidates are the desk's.
    expect(result.candidates.map((candidate) => candidate.field_path).filter((path) => path.endsWith(".lender")).sort()).toEqual([
      "debt.instruments.1.lender", "debt.instruments.2.lender", "debt.instruments.3.lender",
    ]);
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
