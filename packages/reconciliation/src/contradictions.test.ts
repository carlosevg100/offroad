import {describe, expect, it} from "vitest";

import {reconcileCase} from "./index";
import type {FactCandidate} from "./facts";

const candidate = (fieldPath: string, value: string, sourceDocument: string, evidenceRank: number, extra: Partial<FactCandidate> = {}): FactCandidate => ({
  fieldPath,
  normalizedValue: value,
  valueType: "number",
  sourceDocument,
  evidenceRank,
  informationClass: evidenceRank <= 2 ? "audited" : evidenceRank <= 5 ? "management" : "company_document",
  confidence: 0.9,
  anchorVerified: true,
  ...extra,
});

/** What a startup's room says about itself twice, and what the desk has to notice. */
describe("contradictions between documents", () => {
  const room: FactCandidate[] = [
    candidate("interim_financials.2026_07.arr", "40000000", "00_Deck.docx", 5, {periodEnd: "2026-07-31"}),
    candidate("interim_financials.2026_07.arr", "37326000", "02_Metricas.xlsx", 5, {periodEnd: "2026-07-31", confidence: 0.99}),
    candidate("transaction.requested_amount", "40000000", "01_Carta.docx", 7),
    candidate("transaction.requested_amount", "42300000", "08_Plano.xlsx", 6),
    candidate("company.runway_months", "16", "01_Carta.docx", 7),
    candidate("interim_financials.2026_07.cash", "24100000", "05_Extrato.csv", 4, {periodEnd: "2026-07-31"}),
    candidate("interim_financials.2026_07.monthly_burn", "1850000", "02_Metricas.xlsx", 5, {periodEnd: "2026-07-31"}),
  ];
  const report = reconcileCase({archetypeId: "venture_debt", candidates: room, documents: [], locale: "pt"});
  const byRule = (id: string) => report.exceptions.filter((exception) => exception.ruleId === id);

  it("flags the deck's ARR against the export, as a source conflict on a material fact", () => {
    const arr = byRule("R3").find((exception) => exception.description.includes(".arr"));
    expect(arr).toBeDefined();
    expect(arr!.severity).toBe("critical");
    expect(arr!.description).toContain("40000000");
    expect(arr!.description).toContain("37326000");
    expect(arr!.evidence.map((entry) => entry.sourceDocument)).toEqual(expect.arrayContaining(["00_Deck.docx", "02_Metricas.xlsx"]));
  });

  it("flags two different asks", () => {
    const ask = byRule("R3").find((exception) => exception.description.includes("requested_amount"));
    expect(ask).toBeDefined();
    expect(ask!.severity).toBe("critical");
  });

  it("computes the runway the statement gives and holds it against the letter", () => {
    const runway = byRule("R18")[0];
    expect(runway).toBeDefined();
    expect(runway!.description).toContain("16");
    expect(runway!.description).toContain("13");
    expect(runway!.severity).toBe("high");
  });

  it("stays quiet when the room agrees with itself", () => {
    const quiet = reconcileCase({
      archetypeId: "venture_debt",
      candidates: [
        candidate("interim_financials.2026_07.arr", "37326000", "00_Deck.docx", 5, {periodEnd: "2026-07-31"}),
        candidate("interim_financials.2026_07.arr", "37326000", "02_Metricas.xlsx", 5, {periodEnd: "2026-07-31"}),
        candidate("company.runway_months", "13", "01_Carta.docx", 7),
        candidate("interim_financials.2026_07.cash", "24100000", "05_Extrato.csv", 4, {periodEnd: "2026-07-31"}),
        candidate("interim_financials.2026_07.monthly_burn", "1850000", "02_Metricas.xlsx", 5, {periodEnd: "2026-07-31"}),
      ],
      documents: [],
      locale: "pt",
    });
    expect(quiet.exceptions.filter((exception) => ["R3", "R18"].includes(exception.ruleId))).toHaveLength(0);
  });
});
