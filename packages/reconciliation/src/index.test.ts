import {describe, expect, it} from "vitest";

import {buildContext, computeCalculations, reconcileCase, reconcileFacts, runRules, type FactCandidate} from "./index";

const candidate = (over: Partial<FactCandidate> & Pick<FactCandidate, "fieldPath" | "normalizedValue">): FactCandidate => ({
  valueType: "number",
  sourceDocument: "doc",
  evidenceRank: 4,
  informationClass: "management",
  confidence: 0.9,
  anchorVerified: true,
  ...over,
});

describe("precedence between sources", () => {
  it("takes the audited number over the management one, and keeps the loser", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "historical_financials.2025.revenue", normalizedValue: "184700000", sourceDocument: "gerencial.xlsx", evidenceRank: 4, periodEnd: "2025-12-31"}),
      candidate({fieldPath: "historical_financials.2025.revenue", normalizedValue: "184000000", sourceDocument: "df_auditadas.pdf", evidenceRank: 1, informationClass: "audited", periodEnd: "2025-12-31"}),
    ]);

    expect(facts).toHaveLength(1);
    const [fact] = facts;
    expect(fact?.value).toBe("184000000");
    expect(fact?.accepted.sourceDocument).toBe("df_auditadas.pdf");
    // The management figure is not deleted — the difference is the story an investor will ask about.
    expect(fact?.conflicts).toHaveLength(1);
    expect(fact?.conflicts[0]?.candidate.sourceDocument).toBe("gerencial.xlsx");
    expect(fact?.disputed).toBe(false); // within 1%
  });

  it("marks a fact disputed when the difference is beyond tolerance", () => {
    const [fact] = reconcileFacts([
      candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000", evidenceRank: 1, sourceDocument: "df.pdf"}),
      candidate({fieldPath: "debt.total_gross", normalizedValue: "68000000", evidenceRank: 4, sourceDocument: "mapa.xlsx"}),
    ]);
    expect(fact?.disputed).toBe(true);
    expect(fact?.conflicts[0]?.relativeDelta).toBe("0.046154");
  });

  it("prefers a verified anchor at equal rank, and is deterministic", () => {
    const input = [
      candidate({fieldPath: "company.legal_name", normalizedValue: "B", valueType: "text", anchorVerified: false}),
      candidate({fieldPath: "company.legal_name", normalizedValue: "A", valueType: "text", anchorVerified: true}),
    ];
    expect(reconcileFacts(input)[0]?.value).toBe("A");
    expect(reconcileFacts([...input].reverse())[0]?.value).toBe("A");
  });

  it("separates the same field in different periods", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "historical_financials.2024.revenue", normalizedValue: "164300000", periodEnd: "2024-12-31"}),
      candidate({fieldPath: "historical_financials.2025.revenue", normalizedValue: "184700000", periodEnd: "2025-12-31"}),
    ]);
    expect(facts).toHaveLength(2);
  });
});

describe("exceptions are questions with both sides attached", () => {
  it("raises the debt mismatch and shows where each number came from", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000", evidenceRank: 1, sourceDocument: "df_auditadas.pdf"}),
      candidate({fieldPath: "debt.total_gross", normalizedValue: "68000000", evidenceRank: 4, sourceDocument: "mapa_divida.xlsx"}),
    ]);
    const [exception] = runRules(buildContext(facts, "pt")).filter((e) => e.ruleId === "R4");

    expect(exception?.description).toContain("65.000.000");
    expect(exception?.description).toContain("68.000.000");
    expect(exception?.description).toContain("datas-base");
    expect(exception?.evidence.map((e) => e.sourceDocument)).toEqual(["df_auditadas.pdf", "mapa_divida.xlsx"]);
  });

  it("raises sources versus uses when the table does not tie", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "transaction.sources_and_uses.1.side", normalizedValue: "sources", valueType: "text"}),
      candidate({fieldPath: "transaction.sources_and_uses.1.amount", normalizedValue: "60000000"}),
      candidate({fieldPath: "transaction.sources_and_uses.2.side", normalizedValue: "uses", valueType: "text"}),
      candidate({fieldPath: "transaction.sources_and_uses.2.amount", normalizedValue: "68000000"}),
    ]);
    const exceptions = runRules(buildContext(facts, "pt")).filter((e) => e.ruleId === "R11");
    expect(exceptions.length).toBeGreaterThan(0);
    expect(exceptions[0]?.severity).toBe("high");
  });

  it("catches a scale error, because thousands read as units is the expensive one", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "historical_financials.2025.revenue", normalizedValue: "184700", periodEnd: "2025-12-31"}),
      candidate({fieldPath: "historical_financials.2025.ebitda", normalizedValue: "30400000", periodEnd: "2025-12-31"}),
    ]);
    const [exception] = runRules(buildContext(facts, "pt")).filter((e) => e.ruleId === "R14");
    expect(exception?.severity).toBe("critical");
    expect(exception?.blocksExternalOutputs).toBe(true);
  });

  it("says nothing when the numbers agree — silence is the correct output", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000", evidenceRank: 1}),
      candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000", evidenceRank: 4}),
    ]);
    expect(runRules(buildContext(facts, "pt")).filter((e) => e.ruleId === "R4")).toHaveLength(0);
  });

  it("orders by severity, so the reviewer reads the blocking one first", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "historical_financials.2025.revenue", normalizedValue: "184700", periodEnd: "2025-12-31"}),
      candidate({fieldPath: "historical_financials.2025.ebitda", normalizedValue: "30400000", periodEnd: "2025-12-31"}),
      candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000", evidenceRank: 1}),
      candidate({fieldPath: "debt.total_gross", normalizedValue: "68000000", evidenceRank: 4}),
    ]);
    const severities = runRules(buildContext(facts, "pt")).map((e) => e.severity);
    expect(severities[0]).toBe("critical");
  });
});

describe("calculations show their work", () => {
  const baseFacts = [
    candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000", evidenceRank: 1, sourceDocument: "mapa_divida.xlsx"}),
    candidate({fieldPath: "historical_financials.2026.cash", normalizedValue: "6300000", periodEnd: "2026-07-31", sourceDocument: "balancete.xlsx"}),
    candidate({fieldPath: "historical_financials.2026.ebitda", normalizedValue: "33000000", periodEnd: "2026-07-31", sourceDocument: "balancete.xlsx"}),
    candidate({fieldPath: "transaction.requested_amount", normalizedValue: "38000000", sourceDocument: "carta_cfo.docx"}),
  ];

  it("computes net debt and leverage, naming the document behind every input", () => {
    const {calculations} = computeCalculations(buildContext(reconcileFacts(baseFacts), "pt"));
    const netDebt = calculations.find((c) => c.id === "net_debt");
    expect(netDebt?.value).toBe("58700000");
    expect(netDebt?.trace.map((t) => t.sourceDocument)).toEqual(["mapa_divida.xlsx", "balancete.xlsx"]);

    const leverage = calculations.find((c) => c.id === "leverage_pre_transaction");
    expect(Number(leverage?.value)).toBeCloseTo(1.7788, 3);
  });

  it("states the assumption behind post-transaction leverage instead of hiding it", () => {
    const {calculations} = computeCalculations(buildContext(reconcileFacts(baseFacts), "pt"));
    const post = calculations.find((c) => c.id === "leverage_post_transaction");
    expect(Number(post?.value)).toBeCloseTo(2.9303, 3);
    expect(post?.warnings.join(" ")).toContain("desembolso integral");
  });

  it("reports a gap instead of estimating a number it cannot compute", () => {
    const {calculations, gaps} = computeCalculations(
      buildContext(reconcileFacts([candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000"})]), "pt"),
    );
    expect(calculations.find((c) => c.id === "net_debt")).toBeUndefined();
    expect(gaps.find((g) => g.id === "net_debt")?.missing).toContain("caixa e equivalentes");
  });

  it("applies the policy haircut to each collateral asset", () => {
    const facts = reconcileFacts([
      candidate({fieldPath: "collateral.assets.1.eligible_base", normalizedValue: "40000000"}),
      candidate({fieldPath: "collateral.assets.1.policy_haircut", normalizedValue: "0.3"}),
      candidate({fieldPath: "collateral.assets.1.description", normalizedValue: "Imóveis operacionais", valueType: "text"}),
    ]);
    const {calculations} = computeCalculations(buildContext(facts, "pt"));
    expect(calculations.find((c) => c.id === "collateral_capacity_total")?.value).toBe("28000000");
  });
});

describe("a case, end to end", () => {
  it("returns facts, exceptions, calculations, gaps and the questions the desk always asks", () => {
    const report = reconcileCase({
      archetypeId: "growth_expansion",
      documents: [
        {id: "d1", kind: "audited_financial_statements"},
        {id: "d2", kind: "debt_schedule"},
      ],
      candidates: [
        candidate({fieldPath: "debt.total_gross", normalizedValue: "65000000", evidenceRank: 1, sourceDocument: "df.pdf"}),
        candidate({fieldPath: "debt.total_gross", normalizedValue: "68000000", evidenceRank: 4, sourceDocument: "mapa.xlsx"}),
      ],
      locale: "pt",
    });

    expect(report.facts).toHaveLength(1);
    expect(report.exceptions.some((e) => e.ruleId === "R4")).toBe(true);

    // Missing documents become requests, in the company's words, with the reason attached.
    const missingPlan = report.gaps.find((g) => g.id === "missing_document:project_plan");
    expect(missingPlan?.severity).toBe("high");
    expect(missingPlan?.description).toContain("O crédito é pago pelo projeto");

    // The desk asks about the ramp-up because it is a growth deal, not because the data surprised it.
    expect(report.questions.map((q) => q.reference)).toContain("optimistic_ramp");
  });
});
