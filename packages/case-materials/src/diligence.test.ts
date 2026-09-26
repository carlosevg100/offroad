import {describe, expect, it} from "vitest";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, type Fact} from "@offroad/credit-analysis";
import {calculateEbitdaAdjustments} from "@offroad/financial-core";
import type {ReconciledFact} from "@offroad/reconciliation";

import {answerDiligence, diligenceQa, diligenceQuestionCount} from "./diligence";

const facts: Fact[] = [
  {fieldPath: "company.legal_name", value: "Aurora Distribuidora de Materiais de Construção Ltda"},
  {fieldPath: "company.sector", value: "Distribuição de materiais de construção"},
  {fieldPath: "company.founded_year", value: "2004"},
  {fieldPath: "company.employees", value: "214"},
  {fieldPath: "company.controllers.1.name", value: "Helena Bastos Corrêa"},
  {fieldPath: "company.controllers.1.ownership_pct", value: "0.52"},
  {fieldPath: "customers.top_customers.1.share_pct", value: "0.181"},
  {fieldPath: "customers.top_customers.2.share_pct", value: "0.12"},
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
  {fieldPath: "debt.instruments.1.balance", value: "9840000"},
  {fieldPath: "debt.instruments.1.rate", value: "CDI + 4,10% a.a."},
  {fieldPath: "debt.instruments.1.maturity", value: "2027-11-20"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
  {fieldPath: "projections.2027.ebitda", value: "22270000"},
];
const reconciled: ReconciledFact[] = facts.map((fact) => ({
  key: {fieldPath: fact.fieldPath},
  value: fact.value,
  valueType: "text",
  accepted: {fieldPath: fact.fieldPath, normalizedValue: fact.value, valueType: "text", sourceDocument: "doc", evidenceRank: 1, informationClass: "audited", confidence: 1, anchorVerified: true},
  conflicts: [],
  disputed: false,
}));

describe("the diligence Q&A", () => {
  const inputs = buildDeskInputs(facts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
  const desk = analyzeCreditPosition(inputs.desk!);
  const trajectory = projectLeverageTrajectory(inputs.trajectory!);
  const answers = answerDiligence({facts: reconciled, calculations: [], desk, trajectory});

  it("asks forty questions and drops the startup block for a cash-generative company", () => {
    expect(diligenceQuestionCount).toBe(40);
    expect(answers).toHaveLength(35);
  });

  it("answers what the room and the desk know, and cites it", () => {
    const byId = (id: string) => answers.find((entry) => entry.id === id)!;
    expect(byId("q01").answer?.pt).toContain("2004");
    expect(byId("q02").answer?.pt).toContain("52,0%");
    expect(byId("q11").answer?.pt).toContain("Banco Itaú");
    expect(byId("q13").answer?.pt).toContain("3,00x");
    expect(byId("q17").answer?.pt).toContain("R$ 42,3M");
    expect(byId("q18").answer?.pt).toContain("dinheiro novo");
    expect(byId("q25").answer?.pt).toContain("2026 ≤");
    expect(byId("q26").answer?.pt).toContain("Limitada");
    expect(byId("q11").supportIds).toContain("desk.custo_medio_do_stack");
  });

  it("leaves what it cannot know open, addressed to the company", () => {
    const open = answers.filter((entry) => entry.answer === null).map((entry) => entry.id);
    expect(open).toEqual(expect.arrayContaining(["q28", "q29", "q30", "q32", "q35"]));
  });

  it("compiles into a material with one table per section", () => {
    const material = diligenceQa({facts: reconciled, calculations: [], desk, trajectory});
    expect(material.kind).toBe("diligence_qa");
    expect(material.blocks.filter((block) => block.type === "kv")).toHaveLength(7);
    expect(material.blocks[0]!.type === "paragraph" && material.blocks[0]!.text.pt).toContain("35 perguntas");
    const rows = material.blocks.filter((block) => block.type === "kv").flatMap((block) => block.type === "kv" ? block.rows : []);
    const openRow = rows.find((row) => row.value.pt.startsWith("Em aberto:"));
    const answeredRow = rows.find((row) => row.value.pt.includes("Banco Itaú"));
    expect(openRow?.material).toBe(false);
    expect(answeredRow).toMatchObject({material: true, claimKind: "fact"});
    expect(answeredRow?.supportIds?.length).toBeGreaterThan(0);
  });
});

describe("question 10: non-recurring items in EBITDA", () => {
  const fact = (fieldPath: string, value: string): ReconciledFact => {
    const periodEnd = `${fieldPath.split(".")[1]}-12-31`;
    return {
      key: {fieldPath, periodEnd},
      value,
      valueType: "number",
      accepted: {fieldPath, normalizedValue: value, valueType: "number", sourceDocument: "doc", evidenceRank: 1, informationClass: "audited", confidence: 1, anchorVerified: true, periodEnd},
      conflicts: [],
      disputed: false,
    };
  };
  const q10 = (facts: ReconciledFact[]) => answerDiligence({facts, calculations: [], desk: null, trajectory: null}).find((entry) => entry.id === "q10")!;
  const q10Row = (facts: ReconciledFact[]) => diligenceQa({facts, calculations: [], desk: null, trajectory: null}).blocks
    .flatMap((block) => block.type === "kv" ? block.rows : [])
    .find((row) => row.label.pt === "Há itens não recorrentes no EBITDA? Quais?");
  const aurora = [fact("historical_financials.2025.ebitda", "16848000"), fact("historical_financials.2025.adjusted_ebitda", "17420000")];

  it("answers from the adjusted and the reported EBITDA of the same year, through the adjustments kernel", () => {
    expect(calculateEbitdaAdjustments({adjustedEbitda: "17420000", reportedEbitda: "16848000"}).magnitude).toBe("572000");
    expect(q10(aurora)).toMatchObject({
      answer: {
        pt: "EBITDA ajustado de R$ 17,4M contra reportado de R$ 16,8M: R$ 0,6M de ajustes, a detalhar item a item.",
        en: "Adjusted EBITDA of R$ 17.4M against reported R$ 16.8M: R$ 0.6M of adjustments, to be detailed item by item.",
      },
      supportIds: ["historical_financials.2025.adjusted_ebitda", "historical_financials.2025.ebitda"],
    });
    // Adjustments that lower EBITDA print their magnitude beside the two figures that show the direction.
    expect(q10([fact("historical_financials.2025.ebitda", "16848000"), fact("historical_financials.2025.adjusted_ebitda", "16000000.5")]).answer?.pt)
      .toBe("EBITDA ajustado de R$ 16,0M contra reportado de R$ 16,8M: R$ 0,8M de ajustes, a detalhar item a item.");
  });

  it("says there are no declared adjustments when the adjusted EBITDA equals the reported one", () => {
    expect(q10([fact("historical_financials.2025.ebitda", "16848000"), fact("historical_financials.2025.adjusted_ebitda", "16848000.00")]).answer).toEqual({
      pt: "EBITDA ajustado igual ao reportado, de R$ 16,8M: a companhia não declara ajustes.",
      en: "Adjusted EBITDA equals reported EBITDA, at R$ 16.8M: the company declares no adjustments.",
    });
  });

  it("reads the latest adjusted EBITDA against the reported EBITDA of that same year", () => {
    const answer = q10([
      fact("historical_financials.2024.ebitda", "14924000"), fact("historical_financials.2024.adjusted_ebitda", "15100000"),
      fact("historical_financials.2025.adjusted_ebitda", "17420000"), fact("historical_financials.2025.ebitda", "16848000"),
    ]);
    expect(answer.supportIds).toEqual(["historical_financials.2025.adjusted_ebitda", "historical_financials.2025.ebitda"]);
    expect(answer.answer?.pt).toContain("R$ 0,6M de ajustes");
  });

  it("stays open, addressed to the company, when the pair is not in the case", () => {
    const cases: Record<string, ReconciledFact[]> = {
      "no EBITDA at all": [],
      "reported without adjusted": [fact("historical_financials.2025.ebitda", "16848000")],
      "adjusted without reported": [fact("historical_financials.2025.adjusted_ebitda", "17420000")],
      "reported only for an earlier year": [fact("historical_financials.2024.ebitda", "14924000"), fact("historical_financials.2025.adjusted_ebitda", "17420000")],
      "a value that is not a number": [fact("historical_financials.2025.ebitda", "16848000"), fact("historical_financials.2025.adjusted_ebitda", "n/d")],
    };
    for (const [name, facts] of Object.entries(cases)) {
      expect(q10(facts), name).toMatchObject({answer: null, supportIds: []});
      expect(q10Row(facts), name).toEqual({
        label: {pt: "Há itens não recorrentes no EBITDA? Quais?", en: "Are there non-recurring items in EBITDA? Which?"},
        value: {pt: "Em aberto: pedido à companhia.", en: "Open: requested from the company."},
        material: false,
      });
    }
  });

  it("regression: finds the reported EBITDA that the double-escaped pattern never matched", () => {
    // Until 2026.09.26-v5 the lookup turned the reported path into a pattern and escaped each dot
    // twice, so the pattern demanded a backslash before every dot and no field path matched it:
    // the question stayed open even with both figures in the case.
    const path = "historical_financials.2025.ebitda";
    const doubleEscaped = new RegExp(`^${path.replace(/\./g, "\\\\.")}$`);
    expect(doubleEscaped.test(path)).toBe(false);
    expect(doubleEscaped.test(path.replace(/\./g, "\\."))).toBe(true);
    expect(q10(aurora).answer).not.toBeNull();
    expect(q10Row(aurora)).toMatchObject({material: true, claimKind: "fact", supportIds: ["historical_financials.2025.adjusted_ebitda", path]});
  });
});
