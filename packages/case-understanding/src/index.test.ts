import {describe, expect, it} from "vitest";
import type {ReconciledFact, ReconciliationException, TracedCalculation} from "@offroad/reconciliation";

import {assessReadiness} from "./readiness";
import {auditClaims, financialNumbersIn, normalizeNumber} from "./audit";

const fact = (fieldPath: string, value: string, over: Partial<ReconciledFact["accepted"]> = {}): ReconciledFact => ({
  key: {fieldPath},
  value,
  valueType: "number",
  accepted: {
    fieldPath,
    normalizedValue: value,
    valueType: "number",
    sourceDocument: "df.pdf",
    evidenceRank: 1,
    informationClass: "audited",
    confidence: 0.95,
    anchorVerified: true,
    ...over,
  },
  conflicts: [],
  disputed: false,
});

const exception = (severity: ReconciliationException["severity"], ruleId = "R4"): ReconciliationException => ({
  ruleId,
  type: "source_conflict",
  severity,
  title: `regra ${ruleId}`,
  description: "",
  evidence: [],
  ownerRole: "company",
  blocksExternalOutputs: severity === "critical",
});

describe("readiness is five components, not one number", () => {
  const documents = [
    {id: "d1", kind: "audited_financial_statements" as const},
    {id: "d2", kind: "trial_balance" as const},
    {id: "d3", kind: "debt_schedule" as const},
    {id: "d4", kind: "company_registration" as const},
    {id: "d5", kind: "capital_request_letter" as const},
    {id: "d6", kind: "business_plan" as const},
  ];

  it("explains every component in numbers the reader can check", () => {
    const report = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000")],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross", "transaction.requested_amount"],
    });

    expect(report.components).toHaveLength(5);
    for (const component of report.components) {
      expect(component.explanation.pt.length).toBeGreaterThan(20);
      expect(component.explanation.en.length).toBeGreaterThan(20);
      expect(component.score).toBeGreaterThanOrEqual(0);
      expect(component.score).toBeLessThanOrEqual(1);
    }
    expect(report.components.find((c) => c.id === "material_gaps")?.explanation.pt).toContain("1 de 2");
  });

  it("holds the case blocked on a critical exception, whatever the score says", () => {
    const report = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000"), fact("transaction.requested_amount", "38000000")],
      exceptions: [exception("critical", "R14")],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross", "transaction.requested_amount"],
    });

    // A package that is nearly complete with a balance sheet that does not balance is not
    // nearly ready — it is not ready.
    expect(report.state).toBe("blocked");
    expect(report.blockers.map((b) => b.id)).toContain("exception:R14");
  });

  it("blocks on a missing minimum document even with everything else perfect", () => {
    const report = assessReadiness({
      archetypeId: "growth_expansion",
      documents: [{id: "d1", kind: "audited_financial_statements"}],
      facts: [fact("debt.total_gross", "65000000")],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    });
    expect(report.state).toBe("blocked");
    expect(report.blockers.map((b) => b.id)).toContain("minimum_documents");
  });

  it("weighs one critical exception more heavily than several low ones", () => {
    const base = {
      archetypeId: "growth_expansion" as const,
      documents,
      facts: [fact("debt.total_gross", "65000000")],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    };
    const lows = assessReadiness({...base, exceptions: [exception("low"), exception("low"), exception("low")]});
    const critical = assessReadiness({...base, exceptions: [exception("critical")]});
    const score = (report: ReturnType<typeof assessReadiness>) => report.components.find((c) => c.id === "reconciliation")!.score;
    expect(score(critical)).toBeLessThan(score(lows));
  });

  it("rates audited, anchor-verified evidence above a company statement", () => {
    const audited = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000")],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    });
    const hearsay = assessReadiness({
      archetypeId: "growth_expansion",
      documents,
      facts: [fact("debt.total_gross", "65000000", {evidenceRank: 7, anchorVerified: false, informationClass: "company_document"})],
      exceptions: [],
      gaps: [],
      expectedMaterialFields: ["debt.total_gross"],
    });
    const quality = (r: ReturnType<typeof assessReadiness>) => r.components.find((c) => c.id === "evidence_quality")!.score;
    expect(quality(audited)).toBeGreaterThan(quality(hearsay));
    expect(quality(hearsay)).toBe(0);
  });
});

describe("reading numbers out of prose", () => {
  it("finds the magnitudes and ignores what is not one", () => {
    expect(financialNumbersIn("EBITDA de R$ 33,4 milhões em 2025")).toEqual(["33400000"]);
    expect(financialNumbersIn("margem de 18,5% no período")).toEqual([]);
    expect(financialNumbersIn("exercício de 2025")).toEqual([]);
    expect(financialNumbersIn("alavancagem de 2,87x")).toEqual(["2.87"]);
    expect(financialNumbersIn("dívida de R$ 65.000.000")).toEqual(["65000000"]);
  });

  it("reads both Brazilian and international formatting", () => {
    expect(normalizeNumber("1.234.567,89")).toBe("1234567.89");
    expect(normalizeNumber("1,234,567.89")).toBe("1234567.89");
    expect(normalizeNumber("33,4", "milhões")).toBe("33400000");
  });
});

describe("the evidence auditor", () => {
  const facts = [fact("debt.total_gross", "65000000")];
  const calculations: TracedCalculation[] = [
    {id: "leverage_pre_transaction", labels: {pt: "", en: ""}, value: "1.7788", trace: [], inputs: [], warnings: []},
  ];

  it("accepts a claim whose numbers are in the facts it cites, rounding included", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "A dívida bruta é de R$ 65 milhões.", supportIds: ["debt.total_gross"]}],
      facts,
      calculations,
    });
    expect(report.status).toBe("pass");
    expect(report.coverage).toBe(1);
  });

  it("refuses a number that appears nowhere in the support — the citation makes it worse", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "A dívida bruta é de R$ 71 milhões.", supportIds: ["debt.total_gross"]}],
      facts,
      calculations,
    });
    expect(report.status).toBe("blocked");
    expect(report.findings[0]?.reason).toBe("number_not_in_support");
  });

  it("refuses a support id that does not exist", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "R$ 65 milhões.", supportIds: ["debt.imaginary"]}],
      facts,
      calculations,
    });
    expect(report.findings[0]?.reason).toBe("support_not_found");
  });

  it("refuses a material claim with no support at all", () => {
    const report = auditClaims({claims: [{id: "c1", material: true, kind: "fact", text: "R$ 65 milhões.", supportIds: []}], facts, calculations});
    expect(report.findings[0]?.reason).toBe("material_claim_without_support");
  });

  it("refuses a material judgement nobody approved", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "judgment", text: "A alavancagem de 1,7788x é confortável.", supportIds: ["leverage_pre_transaction"]}],
      facts,
      calculations,
    });
    expect(report.findings[0]?.reason).toBe("material_judgment_without_approval");
  });

  it("lets prose that carries no magnitude through, so text stays writable", () => {
    const report = auditClaims({
      claims: [{id: "c1", material: true, kind: "fact", text: "A companhia opera três lojas em São Paulo.", supportIds: ["debt.total_gross"]}],
      facts,
      calculations,
    });
    expect(report.status).toBe("pass");
  });

  it("does not police a non-material claim", () => {
    const report = auditClaims({claims: [{id: "c1", material: false, kind: "judgment", text: "R$ 999 milhões.", supportIds: []}], facts, calculations});
    expect(report.status).toBe("pass");
  });
});
