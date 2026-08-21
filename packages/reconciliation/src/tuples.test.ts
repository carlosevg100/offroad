import {describe, expect, it} from "vitest";

import {reconcileCase} from "./index";
import type {FactCandidate} from "./facts";

const row = (document: string, index: number, lender: string, balance: string, rank: number): FactCandidate[] => [
  {fieldPath: `debt.instruments.${index}.lender`, normalizedValue: lender, valueType: "text", sourceDocument: document, evidenceRank: rank, informationClass: "management", confidence: 0.9, anchorVerified: true},
  {fieldPath: `debt.instruments.${index}.balance`, normalizedValue: balance, valueType: "number", sourceDocument: document, evidenceRank: rank, informationClass: "management", confidence: 0.9, anchorVerified: true},
];

describe("instrument rows from two documents", () => {
  it("never share a number, and are not reported as a contradiction", () => {
    const report = reconcileCase({
      archetypeId: "refinance",
      candidates: [
        ...row("01_ITR.pdf", 1, "11ª emissão, 1ª série", "151795000", 2),
        ...row("01_ITR.pdf", 2, "11ª emissão, 2ª série", "505984000", 2),
        ...row("03_Carta.docx", 1, "Banco Itaú", "9840000", 7),
      ],
      documents: [],
      locale: "pt",
    });
    const instruments = report.facts.filter((fact) => fact.key.fieldPath.startsWith("debt.instruments.")).map((fact) => fact.key.fieldPath).sort();
    expect(instruments).toEqual(["debt.instruments.1.balance", "debt.instruments.1.lender", "debt.instruments.2.balance", "debt.instruments.2.lender", "debt.instruments.3.balance", "debt.instruments.3.lender"]);
    expect(report.facts.find((fact) => fact.key.fieldPath === "debt.instruments.3.lender")?.value).toBe("Banco Itaú");
    expect(report.facts.every((fact) => fact.conflicts.length === 0)).toBe(true);
    expect(report.exceptions.filter((exception) => exception.ruleId === "R3")).toHaveLength(0);
  });
});

describe("one series described by two documents", () => {
  it("is one instrument with the balance from one and the rate from the other", () => {
    const report = reconcileCase({
      archetypeId: "refinance",
      candidates: [
        ...row("01_ITR.pdf", 1, "11ª emissão, 1ª série", "151795000", 2),
        {fieldPath: "debt.instruments.1.lender", normalizedValue: "11ª Emissão - 1ª Série", valueType: "text", sourceDocument: "02_AGOE.pdf", evidenceRank: 7, informationClass: "company_document", confidence: 0.9, anchorVerified: true},
        {fieldPath: "debt.instruments.1.rate", normalizedValue: "CDI + 1,55% a.a.", valueType: "text", sourceDocument: "02_AGOE.pdf", evidenceRank: 7, informationClass: "company_document", confidence: 0.9, anchorVerified: true},
        ...row("03_Carta.docx", 1, "Banco Itaú", "9840000", 7),
      ],
      documents: [],
      locale: "pt",
    });
    const paths = report.facts.filter((fact) => fact.key.fieldPath.startsWith("debt.instruments.")).map((fact) => `${fact.key.fieldPath}=${fact.value}`).sort();
    expect(paths).toEqual(["debt.instruments.1.balance=151795000", "debt.instruments.1.lender=11ª emissão, 1ª série", "debt.instruments.1.rate=CDI + 1,55% a.a.", "debt.instruments.2.balance=9840000", "debt.instruments.2.lender=Banco Itaú"]);
  });
});
