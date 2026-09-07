import JSZip from "jszip";
import {describe, expect, it} from "vitest";

import type {ReconciledFact, TracedCalculation} from "@offroad/reconciliation";

import {toGovernedXlsxBuffer} from "./governed-workbook";
import {buildFinancialModel} from "./model";

const fact = (fieldPath: string, value: string): ReconciledFact => ({
  key: {fieldPath, periodEnd: "2025-12-31"},
  value,
  valueType: "number",
  accepted: {fieldPath, normalizedValue: value, valueType: "number", sourceDocument: "source-1", evidenceRank: 1, informationClass: "financial", confidence: 0.99, anchorVerified: true, periodEnd: "2025-12-31"},
  conflicts: [],
  disputed: false,
});

const calculation = (id: string, value: string): TracedCalculation => ({id, labels: {pt: id, en: id}, value, trace: [], inputs: [], warnings: []});

const model = () => buildFinancialModel({
  archetypeId: "growth_expansion",
  lang: "pt",
  facts: [
    fact("historical_financials.2025.revenue", "400000000"),
    fact("historical_financials.2025.ebitda", "40000000"),
    fact("debt.total_gross", "60000000"),
    fact("historical_financials.2025.cash", "10000000"),
  ],
  calculations: [calculation("adjusted_ebitda", "40000000"), calculation("net_debt", "50000000")],
  requestedAmount: "45000000",
  requestedTermMonths: 60,
  requestedGraceMonths: 12,
  annualInterestRate: "0.155",
  filenames: new Map([["source-1", "DRE_auditada_2025.pdf"]]),
});

const meta = {
  title: "Estrutura de capital — análise preliminar",
  companyName: "Companhia Teste",
  asOfDate: "2026-09-07",
  currency: "BRL",
  scale: "R$ mil",
  classification: "confidential" as const,
};

describe("governed workbook renderer", () => {
  it("adds institutional navigation and role-driven styles without changing formulas", async () => {
    const result = await toGovernedXlsxBuffer(model(), "pt", meta);
    const zip = await JSZip.loadAsync(result.bytes);
    const styles = await zip.file("xl/styles.xml")!.async("string");
    const assumptions = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    const projection = await zip.file("xl/worksheets/sheet3.xml")!.async("string");
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    const custom = await zip.file("docProps/custom.xml")!.async("string");

    expect(styles).toContain("FFFFF4CC");
    expect(styles).toContain("FF0000FF");
    expect(styles).toContain("FF008000");
    expect(assumptions).toContain('showGridLines="0"');
    expect(assumptions).toContain('ySplit="2"');
    expect(projection).toContain('xSplit="1"');
    expect(projection).toContain("Premissas!");
    expect(workbook).toContain('fullCalcOnLoad="1"');
    expect(custom).toContain("Estrutura de capital — análise preliminar");
    expect(custom).toContain("Companhia Teste");
    expect(custom).toContain("2026.09.07-v1");
    expect(result.audit.formulaCount).toBeGreaterThan(100);
    expect(result.audit.crossSheetFormulaCount).toBeGreaterThan(20);
    expect(result.audit.editableInputCount).toBeGreaterThan(5);
    expect(result.audit.hardcodeViolations).toEqual([]);
    expect(result.audit.formulaCoveragePassed).toBe(true);
    expect(result.audit.styleCoveragePassed).toBe(true);
    expect(result.audit.visualInspection).toBe("not_run");
    expect(result.audit.releaseEligible).toBe(false);
  });

  it("produces deterministic bytes for the same governed model", async () => {
    const first = await toGovernedXlsxBuffer(model(), "pt", meta);
    const second = await toGovernedXlsxBuffer(model(), "pt", meta);
    expect(first.audit.contentSha256).toBe(second.audit.contentSha256);
    expect(first.bytes).toEqual(second.bytes);
  });

  it("refuses an ambiguous as-of date", async () => {
    await expect(toGovernedXlsxBuffer(model(), "pt", {...meta, asOfDate: "07/09/2026"})).rejects.toThrow(/YYYY-MM-DD/);
  });
});
