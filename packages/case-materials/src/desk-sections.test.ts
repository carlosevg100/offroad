import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, type Fact} from "@offroad/credit-analysis";

import {capitalStructure, covenantSchedule, riskFactors, sourcesAndUses, trajectoryTable} from "./desk-sections";

const auroraFacts: Fact[] = [
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
  {fieldPath: "debt.instruments.1.amortization", value: "Mensal"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "debt.instruments.2.lender", value: "Banco Santander"},
  {fieldPath: "debt.instruments.2.balance", value: "6260000"},
  {fieldPath: "debt.instruments.2.rate", value: "CDI + 4,45% a.a."},
  {fieldPath: "debt.instruments.2.maturity", value: "2027-03-10"},
  {fieldPath: "debt.instruments.2.amortization", value: "Mensal"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
  {fieldPath: "projections.2027.ebitda", value: "22270000"},
];

const build = () => {
  const inputs = buildDeskInputs(auroraFacts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
  const desk = analyzeCreditPosition(inputs.desk!);
  const trajectory = projectLeverageTrajectory(inputs.trajectory!);
  return {desk, trajectory};
};

describe("the sections a fund underwrites from", () => {
  const {desk, trajectory} = build();

  it("sources and uses balances, and the takeout leads the uses side", () => {
    const block = sourcesAndUses(desk, trajectory)!;
    expect(block.type).toBe("table");
    if (block.type !== "table") return;
    const amountOf = (row: string[]) => new Decimal(row[1]!.replace(/[^\d]/g, ""));
    const source = amountOf(block.rows[0]!);
    const uses = amountOf(block.rows[1]!).plus(amountOf(block.rows[2]!));
    expect(source.eq(uses)).toBe(true);
    expect(block.rows[1]![0]).toContain("quitação das linhas com covenant");
    expect(block.rows[1]![0]).toContain("Banco Itaú");
  });

  it("marks each line kept or taken out in the capital structure", () => {
    const [table] = capitalStructure(desk, trajectory);
    if (table!.type !== "table") throw new Error("expected table");
    const itau = table!.rows.find((row) => row[0] === "Banco Itaú")!;
    const santander = table!.rows.find((row) => row[0] === "Banco Santander")!;
    expect(itau.at(-1)).toBe("quitada na operação");
    expect(santander.at(-1)).toBe("mantida");
  });

  it("pairs every critical and high finding with a treatment", () => {
    const blocks = riskFactors(desk, trajectory);
    const table = blocks.find((block) => block.type === "table");
    if (!table || table.type !== "table") throw new Error("expected table");
    for (const row of table.rows) {
      expect(row[1]!.length).toBeGreaterThan(20);
    }
    const breach = table.rows.find((row) => row[0]!.includes("rompe covenant"));
    expect(breach?.[1]).toContain("quitadas na operação");
  });

  it("renders the trajectory and the proposed covenant as tables", () => {
    const years = trajectoryTable(trajectory);
    const schedule = covenantSchedule(trajectory);
    if (years.type !== "table" || schedule.type !== "table") throw new Error("expected tables");
    expect(years.rows.length).toBe(trajectory.years.length);
    expect(schedule.caption.pt).toContain("primeira aferição");
  });
});
