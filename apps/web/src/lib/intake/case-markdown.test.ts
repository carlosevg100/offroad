import {describe, expect, it} from "vitest";
import type {CaseState} from "./case-pipeline";
import {caseDiagnosisMarkdown} from "./case-markdown";

/** Deliberately only the projection consumed by this export, not a fabricated case pipeline. */
function stateFor(cashBasis: "reported" | "missing" | undefined): CaseState {
  return {
    brief: null, capacity: null, trajectory: null, clientQuestions: [],
    reconciliation: {
      financialTruth: {statements: []}, exceptions: [], gaps: [],
      debtTruth: {views: {balanceBasis: "reported_instruments", grossFinancialDebt: "100", unrestrictedCash: "0", netFinancialDebt: "100", offBalanceSheetExposures: "0", ...(cashBasis ? {cashBasis} : {})}, serviceNext12Months: "0", instruments: []},
    },
    operationTruth: {request: {amount: null}, calculatedNeed: null, sourcesAndUses: {totalSources: "0", totalUses: "0", difference: "0"}, proForma: null},
  } as unknown as CaseState;
}

describe("case diagnosis markdown cash provenance", () => {
  it.each(["pt", "en"] as const)("withholds net debt for missing and historical unknown cash in %s", (locale) => {
    const label = locale === "pt" ? "Dívida financeira líquida" : "Net financial debt";
    for (const basis of ["missing", undefined] as const) {
      const markdown = caseDiagnosisMarkdown({state: stateFor(basis), locale, title: "Test"});
      expect(markdown.split("\n").find((line) => line.startsWith(`- ${label}:`)))
        .toBe(`- ${label}: ${locale === "pt" ? "Não informado" : "Not provided"}`);
    }
  });
  it.each(["pt", "en"] as const)("retains net debt100 for explicitly reported zero cash in %s", (locale) => {
    const label = locale === "pt" ? "Dívida financeira líquida" : "Net financial debt";
    const markdown = caseDiagnosisMarkdown({state: stateFor("reported"), locale, title: "Test"});
    const line = markdown.split("\n").find((item) => item.startsWith(`- ${label}:`));
    expect(line?.replace(/\s/g, " ")).toBe(`- ${label}: ${locale === "pt" ? "R$ 100" : "R$100"}`);
  });
  it.each(["pt", "en"] as const)("withholds unknown gross debt and derived negative net debt in %s", (locale) => {
    for (const balanceBasis of ["missing", undefined] as const) {
      const state = stateFor("reported");
      Object.assign(state.reconciliation.debtTruth.views, {balanceBasis, grossFinancialDebt: "0", unrestrictedCash: "100", netFinancialDebt: "-100"});
      const markdown = caseDiagnosisMarkdown({state, locale, title: "Test"});
      for (const label of locale === "pt" ? ["Dívida financeira bruta", "Dívida financeira líquida"] : ["Gross financial debt", "Net financial debt"]) {
        expect(markdown.split("\n").find((line) => line.startsWith(`- ${label}:`)))
          .toBe(`- ${label}: ${locale === "pt" ? "Não informado" : "Not provided"}`);
      }
    }
  });
  it.each(["pt", "en"] as const)("retains negative net debt for explicit known zero debt and reported cash in %s", (locale) => {
    const state = stateFor("reported");
    Object.assign(state.reconciliation.debtTruth.views, {grossFinancialDebt: "0", unrestrictedCash: "100", netFinancialDebt: "-100"});
    const markdown = caseDiagnosisMarkdown({state, locale, title: "Test"});
    const label = locale === "pt" ? "Dívida financeira líquida" : "Net financial debt";
    expect(markdown.split("\n").find((line) => line.startsWith(`- ${label}:`))?.replace(/\s/g, " "))
      .toBe(`- ${label}: ${locale === "pt" ? "-R$ 100" : "-R$100"}`);
  });

});
