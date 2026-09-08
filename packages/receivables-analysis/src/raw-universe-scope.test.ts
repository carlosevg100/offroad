import {describe, expect, it} from "vitest";
import {buildReceivablesRawUniverse, detectReceivablesRawEvidence, identifyReceivablesTapes, type ReceivablesEvidenceDocument} from "./raw-detection";

const headers = ["NUM TITULO", "CNPJ SACADO", "DT EMISSAO", "DT VENCIMENTO", "VLR TITULO", "SITUACAO"];
function cells(values: readonly string[], row: number) {
  return values.map((v, index) => ({ref: `${String.fromCharCode(65 + index)}${row}`, v}));
}
function document(id: string, sheets = ["Titles"]): ReceivablesEvidenceDocument {
  return {id, fileName: `synthetic-${id}.xlsx`, fileHash: "a".repeat(64), layer: {documentId: id,
    sheets: sheets.map((name) => ({name, cells: [...cells(headers, 1),
      ...cells(["T-1", "12345678000190", "2026-01-01", "2026-02-01", "100", "aberto"], 2)]})),
  }};
}
const build = (documents: ReceivablesEvidenceDocument[]) => buildReceivablesRawUniverse({
  universeId: "synthetic-scope", datasetHash: "b".repeat(64), reportingDate: "2026-02-01", documents,
});

describe("raw receivables universe scope", () => {
  it("discovers all document, sheet and header matches independently of input order", () => {
    const first = document("a", ["Zulu", "Alpha"]);
    const second = document("b");
    const repeated = {...second, layer: {...second.layer, sheets: [{name: "Titles", cells: [
      ...second.layer.sheets![0]!.cells, ...cells(headers, 5),
    ]}]}};
    const expected = [
      {documentId: "a", fileName: first.fileName, sheet: "Alpha", headerRow: 1},
      {documentId: "a", fileName: first.fileName, sheet: "Zulu", headerRow: 1},
      {documentId: "b", fileName: second.fileName, sheet: "Titles", headerRow: 1},
      {documentId: "b", fileName: second.fileName, sheet: "Titles", headerRow: 5},
    ];
    expect(identifyReceivablesTapes([first, repeated])).toEqual(expected);
    expect(identifyReceivablesTapes([repeated, {...first, layer: {...first.layer, sheets: [...first.layer.sheets!].reverse()}}])).toEqual(expected);
  });

  it.each([
    [document("a"), document("b")],
    [document("a", ["Current", "Prior"])],
  ])("does not silently select a tape from multiple documents or sheets", (...documents) => {
    expect(build(documents)).toMatchObject({phaseOne: null, warnings: ["multiple_receivables_tapes"]});
  });

  it("rejects repeated header blocks within one sheet", () => {
    const source = document("a");
    const repeated = {...source, layer: {...source.layer, sheets: [{name: "Titles", cells: [
      ...source.layer.sheets![0]!.cells, ...cells(headers, 5),
    ]}]}};
    expect(build([repeated])).toMatchObject({phaseOne: null, warnings: ["multiple_receivables_tapes"]});
  });

  it("builds one valid tape without claiming missing supporting evidence", () => {
    const result = build([document("a")]);
    expect(result.phaseOne).not.toBeNull();
    expect(result.warnings).not.toContain("multiple_receivables_tapes");
    expect(result.warnings).not.toContain("receivables_tape_not_identified");
  });

  it("withholds defect and eligibility assertions for an ambiguous raw universe", () => {
    const result = detectReceivablesRawEvidence({
      universeId: "synthetic-scope", datasetHash: "b".repeat(64), reportingDate: "2026-02-01",
      documents: [document("a"), document("b")],
    });
    expect(result).toMatchObject({
      defects: [], questions: [], routeFacts: [],
      evidenceCoverage: {complete: false, warnings: ["multiple_receivables_tapes"]},
    });
  });

  it("ignores malformed and unsafe cell references instead of treating suffixes as rows", () => {
    const source = document("a");
    const invalidHeaders = headers.flatMap((v, index) => [
      {ref: `${String.fromCharCode(65 + index)}${"0".repeat(20_000)}!`, v},
      {ref: `${String.fromCharCode(65 + index)}9007199254740992`, v},
      {ref: `${String.fromCharCode(65 + index)}-1`, v},
    ]);
    const malformed = {...source, layer: {...source.layer, sheets: [{name: "Titles", cells: invalidHeaders}]}};
    expect(identifyReceivablesTapes([malformed])).toEqual([]);
    expect(build([malformed])).toMatchObject({phaseOne: null, warnings: ["receivables_tape_not_identified"]});
  });

  it("reports no identified dataset when no tape is present", () => {
    expect(build([{id: "a", fileName: "synthetic.pdf", fileHash: "a".repeat(64), layer: {documentId: "a"}}]))
      .toMatchObject({phaseOne: null, warnings: ["receivables_tape_not_identified"]});
  });
});


describe("declared reporting date and event coverage", () => {
  it("keeps reporting date separate from the observed source period", () => {
    const phase = build([document("a")]).phaseOne!;
    expect(phase.universe.dates).toEqual({reportingDate: "2026-02-01", latestOriginationDate: "2026-01-01", dataStartDate: "2026-01-01", dataEndDate: "2026-01-01"});
    expect(phase.universe.eventCoverage.settlements.status).toBe("not_provided");
  });
  it("refuses to silently reconstruct an earlier snapshot", () => {
    expect(buildReceivablesRawUniverse({universeId: "synthetic", datasetHash: "b".repeat(64), reportingDate: "2025-12-31", documents: [document("a")]}))
      .toMatchObject({phaseOne: null, warnings: ["source_events_after_reporting_date"]});
  });
  it("rejects impossible calendar dates", () => {
    expect(() => buildReceivablesRawUniverse({universeId: "synthetic", datasetHash: "b".repeat(64), reportingDate: "2026-02-30", documents: [document("a")]})).toThrow();
  });
  it("does not equate observed paid titles with complete settlement history", () => {
    const source = document("a");
    source.layer.sheets = [{name: "Titles", cells: [
      ...cells([...headers, "DT PAGAMENTO", "VLR PAGO"], 1),
      ...cells(["T-1", "12345678000190", "2026-01-01", "2026-02-01", "100", "liquidado", "2026-01-15", "100"], 2),
    ]}];
    const phase = build([source]).phaseOne!;
    expect(phase.universe.eventCoverage.settlements.status).toBe("partial");
    expect(phase.universe.dates.dataEndDate).toBe("2026-01-15");
    expect(buildReceivablesRawUniverse({universeId: "synthetic", datasetHash: "b".repeat(64), reportingDate: "2026-01-10", documents: [source]}))
      .toMatchObject({phaseOne: null, warnings: ["source_events_after_reporting_date"]});
  });
});
