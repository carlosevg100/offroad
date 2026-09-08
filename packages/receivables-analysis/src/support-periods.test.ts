import type {IsoDate} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";
import {detectReceivablesRawEvidence, type ReceivablesEvidenceDocument} from "./raw-detection";
import {qualifySupportPeriod} from "./support-periods";

function document(id: string, headers: string[], rows: string[][]): ReceivablesEvidenceDocument {
  return {
    id, fileName: `${id}.xlsx`, fileHash: "a".repeat(64),
    layer: {documentId: id, sheets: [{name: "Dados", cells: [headers, ...rows].flatMap((row, rowIndex) =>
      row.map((v, index) => ({ref: `${String.fromCharCode(65 + index)}${rowIndex + 1}`, v})))}]},
  };
}
const run = (documents: ReceivablesEvidenceDocument[], reportingDate = "2026-08-31") => detectReceivablesRawEvidence({
  documents, reportingDate: reportingDate as IsoDate, datasetHash: "b".repeat(64), universeId: "synthetic",
});
const ledger = (dates: string[]) => document("ledger", ["DATA", "HISTORICO", "DOCUMENTO", "DEBITO", "CREDITO", "SALDO"],
  dates.map((date) => [date, "ajuste de conciliacao", "A", "100", "0", "100"]));
const dilution = (months: string[]) => document("dilution", ["MES", "DEVOLUCAO DE VENDA", "BONIFICACAO", "ABATIMENTO COMERCIAL", "TOTAL", "CONTA CONTABIL"],
  months.map((month) => [month, "100", "0", "0", "100", "despesas comerciais diversas"]));

describe("supporting evidence periods", () => {
  it("does not block a historical total for a missing amount in a demonstrably subsequent entry", () => {
    const source = document("ledger", ["DATA", "HISTORICO", "DOCUMENTO", "DEBITO", "CREDITO", "SALDO"], [
      ["2026-08-31", "ajuste de conciliacao", "A", "100", "0", "100"],
      ["2026-09-01", "ajuste de conciliacao", "B", "", "", ""],
    ]);
    const result = run([source]);
    expect(result.defects.find((item) => item.id === "accounting_reconciliation_difference")?.measured?.value).toBe("100");
    expect(result.supportPeriodAssessment?.entries[1]).toMatchObject({qualification: "subsequent", amountStatus: "missing"});
  });

  it("separates subsequent ledger entries from the cutoff without retroactive totals", () => {
    const result = run([ledger(["31/08/2026", "01/09/2026"])]);
    expect(result.defects.find((item) => item.id === "accounting_reconciliation_difference")?.measured?.value).toBe("100");
    expect(result.supportPeriodAssessment?.entries.map((entry) => entry.qualification)).toEqual(["included", "subsequent"]);
    expect(result.supportPeriodAssessment?.reportingDate).toBe("2026-08-31");
    expect(result.evidenceCoverage.complete).toBe(false);
  });

  it.each(["", "31/02/2026", "not a date"])("does not emit a complete adjustment when a relevant date is %s", (date) => {
    const result = run([ledger(["2026-08-01", date])]);
    expect(result.defects).not.toContainEqual(expect.objectContaining({id: "accounting_reconciliation_difference"}));
    expect(result.evidenceCoverage.warnings.some((warning) => warning.startsWith("support_period:"))).toBe(true);
  });

  it("sums only completed monthly intervals and retains future support", () => {
    const result = run([dilution(["08/2026", "09/2026"])]);
    expect(result.defects.find((item) => item.id === "dilution_misclassification")?.measured?.value).toBe("100.00");
    expect(result.supportPeriodAssessment?.entries[0]).toMatchObject({startDate: "2026-08-01", endDate: "2026-08-31"});
  });

  it.each([["13/2026", "2026-08-31", "invalid"], ["08/2026", "2026-08-15", "overlaps_cutoff"]])("never prorates or drops an unqualified monthly interval", (month, cutoff, qualification) => {
    const result = run([dilution([month!])], cutoff);
    expect(result.defects).not.toContainEqual(expect.objectContaining({id: "dilution_misclassification"}));
    expect(result.supportPeriodAssessment?.entries[0]?.qualification).toBe(qualification);
  });

  it("keeps assessment order stable across document order", () => {
    const sources = [ledger(["2026-08-01"]), dilution(["08/2026"])];
    expect(run(sources).supportPeriodAssessment).toEqual(run([...sources].reverse()).supportPeriodAssessment);
  });

  it("requires explicit cancellation timestamp and preserves source-local date", () => {
    expect(qualifySupportPeriod(undefined, "event_timestamp", "2026-08-31").qualification).toBe("missing");
    expect(qualifySupportPeriod("2026-09-02T00:00:00-03:00", "event_timestamp", "2026-08-31").qualification).toBe("subsequent");
    expect(qualifySupportPeriod("2026-08-31T23:30:00-03:00", "event_timestamp", "2026-08-31")).toMatchObject({startDate: "2026-08-31", qualification: "included"});
    expect(qualifySupportPeriod("2026-02-30T12:00:00Z", "event_timestamp", "2026-08-31").qualification).toBe("invalid");
  });
  it("blocks ambiguous support documents instead of selecting the first", () => {
    const first = ledger(["2026-08-01"]);
    const second = {...first, id: "other", layer: {...first.layer, documentId: "other"}};
    const result = run([first, second]);
    expect(result.defects).not.toContainEqual(expect.objectContaining({id: "accounting_reconciliation_difference"}));
    expect(result.supportPeriodAssessment?.entries).toHaveLength(2);
    expect(result.supportPeriodAssessment?.entries.every((entry) => entry.scopeAmbiguous === true)).toBe(true);
  });

  it("rejects invalid cutoff calendars and impossible timestamp offsets", () => {
    expect(() => run([], "2026-02-30")).toThrow(/reporting date/);
    expect(() => qualifySupportPeriod("2026-01-01", "event_date", "2026-02-30")).toThrow(/cutoff/);
    expect(qualifySupportPeriod("2026-08-01T12:00:00+14:59", "event_timestamp", "2026-08-31").qualification).toBe("invalid");
  });

  it.each([
    ["2026-08-30T10:00:00-03:00", "included", true],
    ["2026-09-02T10:00:00-03:00", "subsequent", false],
    [null, "missing", false],
  ] as const)("reconciles cancellation only when its actual event is included", (occurredAt, qualification, finding) => {
    const tape = document("tape", ["NUM TITULO", "CNPJ SACADO", "CHAVE NFE", "DT EMISSAO", "DT VENCIMENTO", "VLR TITULO", "SITUACAO"],
      [["T1", "12345678000190", "1".repeat(44), "2026-08-01", "2026-09-01", "100", "aberto"]]);
    const result = detectReceivablesRawEvidence({documents: [tape], reportingDate: "2026-08-31", datasetHash: "b".repeat(64), universeId: "synthetic",
      fiscalArchives: [{archiveId: "xml", fileHash: "c".repeat(64), invoices: [], cancellations: [{entryName: "event.xml", accessKey: "1".repeat(44), accessKeyValid: true, registrationStatus: "135", occurredAt}]}],
    });
    expect(result.defects.some((item) => item.id === "cancelled_invoice_open")).toBe(finding);
    expect(result.supportPeriodAssessment?.entries[0]?.qualification).toBe(qualification);
  });

  it("does not infer a current debt balance from an unbound balance-sheet column", () => {
    const bank: ReceivablesEvidenceDocument = {id: "bank", fileName: "bank.pdf", fileHash: "a".repeat(64), layer: {
      documentId: "bank", pages: [{blocks: [{text: "Não inclui o desconto de duplicatas"}], tables: []}],
    }};
    const balance: ReceivablesEvidenceDocument = {id: "balance", fileName: "balance.pdf", fileHash: "b".repeat(64), layer: {
      documentId: "balance", pages: [{blocks: [{text: "Balancete julho 2026"}], tables: [{rows: [
        "fornecedores convenio antecipacao", "duplicatas descontadas", "operacoes de fomento mercantil", "parcelamento de tributos federais",
      ].map((label, index) => ({id: String(index), cells: [{id: "label", text: label}, {id: "amount", text: "100"}]}))}]}],
    }};
    const result = run([bank, balance]);
    expect(result.defects.find((item) => item.id === "undeclared_recourse_and_debt")).toMatchObject({id: "undeclared_recourse_and_debt"});
    expect(result.defects.find((item) => item.id === "undeclared_recourse_and_debt")?.measured).toBeUndefined();
    expect(result.supportPeriodAssessment?.entries).toHaveLength(4);
    expect(result.supportPeriodAssessment?.entries.every((entry) => entry.qualification === "missing")).toBe(true);
    expect(result.routeFacts.find((fact) => fact.id === "company_credit_package_available")?.state).toBe("unknown");
  });

  it.each(["2026-08-01", "01/08/2026"])("does not reinterpret month column %s as a daily interval", (raw) => {
    expect(qualifySupportPeriod(raw, "flow_interval", "2026-08-15").qualification).toBe("invalid");
  });

  it.each(["", "bad amount"])("retains a monthly row with %s amount as an explicit gap", (amount) => {
    const source = dilution(["07/2026", "08/2026"]);
    const changed = {...source, layer: {...source.layer, sheets: [{name: "Dados", cells: source.layer.sheets![0]!.cells.map((cell) => cell.ref === "E3" ? {...cell, v: amount} : cell)}]}};
    const result = run([changed]);
    expect(result.defects).not.toContainEqual(expect.objectContaining({id: "dilution_misclassification"}));
    expect(result.supportPeriodAssessment?.entries[1]).toMatchObject({qualification: "included", amountStatus: amount ? "invalid" : "missing"});
  });

  it("excludes an explicit TOTAL footer and retains exact included intervals in provenance", () => {
    const result = run([dilution(["08/2026", "TOTAL"])]);
    const finding = result.defects.find((item) => item.id === "dilution_misclassification");
    expect(finding?.measured?.value).toBe("100.00");
    expect(JSON.stringify(finding?.evidence)).toContain("2026-08-01/2026-08-31");
    expect(JSON.stringify(finding?.evidence)).toContain("TOTAL excluded");
  });

  it("does not replace an invalid ledger credit with zero", () => {
    const source = ledger(["2026-08-01"]);
    const changed = {...source, layer: {...source.layer, sheets: [{name: "Dados", cells: source.layer.sheets![0]!.cells.map((cell) => cell.ref === "E2" ? {...cell, v: "unknown"} : cell)}]}};
    const result = run([changed]);
    expect(result.defects.find((item) => item.id === "accounting_reconciliation_difference")).toBeDefined();
    expect(result.defects.find((item) => item.id === "accounting_reconciliation_difference")?.measured).toBeUndefined();
    expect(result.supportPeriodAssessment?.entries[0]).toMatchObject({qualification: "included", amountStatus: "invalid"});
  });

});
