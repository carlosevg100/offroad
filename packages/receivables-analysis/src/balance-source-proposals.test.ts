import {describe, expect, it} from "vitest";
import {balanceSourceAssessmentSchema, proposeBalanceSources} from "./balance-source-proposals";
import type {ReceivablesEvidenceDocument} from "./raw-detection";

function sheet(cells: Record<string, string | number>, id = "source"): ReceivablesEvidenceDocument {
  return {id, fileName: "Synthetic balance.csv", fileHash: "a".repeat(64), layer: {documentId: id, documentVersion: 1, sheets: [{name: "Balances", cells: Object.entries(cells).map(([ref, v]) => ({ref, v}))}]}};
}
const input = () => sheet({
  A1: "CNPJ 11.222.333/0001-44", A2: "Período: 01/01/2026 a 30/06/2026",
  A3: "Emissão: 08/07/2026", A4: "Individual; valores em reais",
  A5: "Conta", B5: "Saldo anterior", C5: "Saldo atual", D5: "Outra coluna",
  A6: "Sintética", B6: "999.999,00 C", C6: "100,00 C", D6: "800.000,00",
});

describe("source balance proposals remain observations, not financial bindings", () => {
  it("preserves competing columns, source dates and original signed text without assigning an amount", () => {
    const result = proposeBalanceSources([input()], "2026-06-30");
    const proposal = result.proposals[0]!;
    expect(proposal).toMatchObject({documentVersion: 1, reviewState: "proposed", calculationUse: "not_permitted", issues: ["review_required"]});
    expect(proposal.columns.map((column) => [column.role, column.header.id])).toEqual([
      ["opening_balance", "sBalances!B5"], ["closing_balance", "sBalances!C5"],
    ]);
    expect(proposal.context).toEqual(expect.arrayContaining([
      {kind: "period", anchor: {id: "sBalances!A2", text: "Período: 01/01/2026 a 30/06/2026"}},
      {kind: "issued_at", anchor: {id: "sBalances!A3", text: "Emissão: 08/07/2026"}},
    ]));
    expect(proposal.rows[0]!.cells.map((cell) => cell.text)).toEqual(["Sintética", "999.999,00 C", "100,00 C", "800.000,00"]);
    expect(proposal).not.toHaveProperty("amount");
    expect(proposal).not.toHaveProperty("stockAsOf");
    expect(balanceSourceAssessmentSchema.safeParse({...result, proposals: [{...proposal, reviewState: "reviewed", calculationUse: "permitted"}]}).success).toBe(false);
  });

  it("does not substitute issue date, filename, another document or another sheet for missing context", () => {
    const bank = sheet({A1: "Emissão 08/07/2026", A2: "Saldo devedor", A3: 100}, "bank");
    bank.fileName = "CNPJ 11222333000144 individual BRL base 30-06-2026.csv";
    bank.layer.sheets = [...bank.layer.sheets!, {name: "Elsewhere", cells: [{ref: "A1", v: "Base 30/06/2026 CNPJ 11.222.333/0001-44 valores em reais individual"}]}];
    const result = proposeBalanceSources([input(), bank], "2026-06-30");
    expect(result.proposals.find((proposal) => proposal.sourceId === "bank")!.issues).toEqual(expect.arrayContaining([
      "entity_not_identified", "perimeter_not_identified", "unit_not_identified", "economic_date_not_identified",
    ]));
  });

  it("keeps multiple dates and duplicate balance columns unresolved; input ordering does not select a winner", () => {
    const source = sheet({A1: "Base 30/06/2026", B1: "Base 31/07/2026", A2: "Saldo atual", B2: "Saldo atual", A3: 100, B3: 999999});
    const expected = proposeBalanceSources([source], "2026-06-30");
    expect(expected.proposals[0]!.issues).toEqual(expect.arrayContaining(["multiple_economic_date_references", "multiple_balance_columns", "review_required"]));
    source.layer.sheets = source.layer.sheets!.map((entry) => ({...entry, cells: [...entry.cells].reverse()}));
    expect(proposeBalanceSources([source], "2026-06-30")).toEqual(expected);
  });

  it("preserves legacy PDF gaps and never makes a fake source anchor", () => {
    const document: ReceivablesEvidenceDocument = {id: "pdf", fileName: "Synthetic.pdf", fileHash: "a".repeat(64), layer: {documentId: "pdf", pages: [{n: 1, blocks: [{text: "Período 01/01/2026 a 30/06/2026"}], tables: [{id: "p1.t1", rows: [{id: "p1.t1.r1", cells: [{id: "p1.t1.r1.c1", text: "Saldo atual"}]}, {id: "p1.t1.r2", cells: [{id: "p1.t1.r2.c1", text: "100,00 C"}]}]}]}]}};
    const proposal = proposeBalanceSources([document], "2026-06-30").proposals[0]!;
    expect(proposal.documentVersion).toBeNull();
    expect(proposal.context).toEqual([]);
    expect(proposal.issues).toEqual(expect.arrayContaining(["source_version_missing", "source_context_unanchored", "column_geometry_unavailable"]));
  });

  it("bounds repeated-header and long-text amplification and declares every omission", () => {
    const cells: Record<string, string> = {};
    for (let n = 1; n <= 1000; n += 1) {
      cells[`A${n * 2}`] = "Saldo atual";
      cells[`A${n * 2 + 1}`] = `Período ${"x".repeat(10000)}`;
    }
    const result = proposeBalanceSources([sheet(cells)], "2026-06-30");
    expect(result.proposals.length).toBeLessThanOrEqual(16);
    expect(result.issues).toEqual(["assessment_limit_reached"]);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(251000);
    expect(result.proposals.some((proposal) => proposal.issues.includes("source_text_truncated"))).toBe(true);
    expect(result.proposals.every((proposal) => proposal.context.length <= 32 && proposal.rows.length <= 12)).toBe(true);
  });

  it("ignores invalid spreadsheet references rather than creating Infinity row identities", () => {
    expect(proposeBalanceSources([sheet({[`A${"9".repeat(400)}`]: "Saldo atual", A0: "Saldo atual", AAAA1: "Saldo atual"})], "2026-06-30").proposals).toEqual([]);
  });
});
