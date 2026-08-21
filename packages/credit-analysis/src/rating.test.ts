import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {buildDeskInputs, type Fact} from "./from-facts";
import {rateCredit} from "./rating";
import {projectLeverageTrajectory} from "./trajectory";

const options = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}};

const aurora: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
  {fieldPath: "debt.instruments.1.balance", value: "9840000"},
  {fieldPath: "debt.instruments.1.rate", value: "CDI + 4,10% a.a."},
  {fieldPath: "debt.instruments.1.maturity", value: "2027-11-20"},
  {fieldPath: "debt.instruments.1.amortization", value: "Mensal"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
  {fieldPath: "projections.2027.ebitda", value: "22270000"},
];

describe("the internal rating", () => {
  it("rates a leveraged middle-market ask with the structure, line by line", () => {
    const inputs = buildDeskInputs(aurora, options);
    const desk = analyzeCreditPosition(inputs.desk!);
    const trajectory = projectLeverageTrajectory(inputs.trajectory!);
    const rating = rateCredit({desk, trajectory, financialExpenses: "6140000", priorEbitda: "14924000", topCustomerShare: "0.181", evidenceRank: "1.8"});
    expect(rating.grade).toBeGreaterThanOrEqual(1);
    expect(rating.grade).toBeLessThanOrEqual(10);
    expect(rating.assessed).toBe(6);
    const leverage = rating.factors.find((factor) => factor.id === "leverage")!;
    expect(leverage.points).toBe(3); // 2,01x post, with the Itaú line taken out inside the ticket
    expect(rating.factors.find((factor) => factor.id === "coverage")!.points).toBe(2); // 2,7x
    expect(rating.factors.find((factor) => factor.id === "trend")!.points).toBe(3); // +12,9%
    expect(rating.factors.find((factor) => factor.id === "liquidity")!.points).toBe(4); // nothing dated within 12 months
    expect(rating.grade).toBe(4);
    expect(rating.band).toBe("adequate");
    expect(rating.summary.pt).toContain("Rating interno");
  });

  it("floors a credit already above 4,5x at grade 8 whatever the other factors say", () => {
    const inputs = buildDeskInputs([
      ...aurora.filter((fact) => !fact.fieldPath.startsWith("projections")),
      {fieldPath: "historical_financials.2025.gross_debt", value: "95000000"},
    ].filter((fact, index, all) => all.findIndex((other) => other.fieldPath === fact.fieldPath) === index || fact.value === "95000000")
      .filter((fact) => !(fact.fieldPath === "historical_financials.2025.gross_debt" && fact.value === "45320000")), options);
    const desk = analyzeCreditPosition(inputs.desk!);
    const rating = rateCredit({desk, trajectory: null, financialExpenses: "1000000", priorEbitda: "10000000", topCustomerShare: "0.05", evidenceRank: "1"});
    expect(rating.factors.find((factor) => factor.id === "leverage")!.points).toBe(0);
    expect(rating.grade).toBeGreaterThanOrEqual(8);
    expect(rating.summary.pt).toContain("piso em 8");
  });

  it("rates a cash-burning company on runway, not on turns", () => {
    const nimbus: Fact[] = [
      {fieldPath: "historical_financials.2025.revenue", value: "28600000"},
      {fieldPath: "historical_financials.2025.ebitda", value: "-19400000"},
      {fieldPath: "historical_financials.2025.cash", value: "36400000"},
      {fieldPath: "historical_financials.2025.receivables", value: "3700000"},
      {fieldPath: "historical_financials.2025.gross_debt", value: "3500000"},
      {fieldPath: "interim_financials.2026_07.revenue_7m", value: "21900000"},
      {fieldPath: "interim_financials.2026_07.cash", value: "24100000"},
      {fieldPath: "interim_financials.2026_07.receivables", value: "4900000"},
      {fieldPath: "interim_financials.2026_07.gross_debt", value: "3200000"},
      {fieldPath: "interim_financials.2026_07.arr", value: "37326000"},
      {fieldPath: "interim_financials.2026_07.monthly_burn", value: "1850000"},
      {fieldPath: "customers.top_customers.1.share_pct", value: "0.068"},
      {fieldPath: "transaction.requested_amount", value: "15000000"},
    ];
    const inputs = buildDeskInputs(nimbus, options);
    const desk = analyzeCreditPosition(inputs.desk!);
    const rating = rateCredit({desk, trajectory: null, evidenceRank: "5"});
    const ids = rating.factors.map((factor) => factor.id);
    expect(ids).toContain("runway");
    expect(ids).not.toContain("leverage");
    expect(ids).not.toContain("coverage");
    expect(rating.factors.find((factor) => factor.id === "runway")!.points).toBe(3); // 19 months
    expect(rating.factors.find((factor) => factor.id === "concentration")!.points).toBe(4);
  });
});
