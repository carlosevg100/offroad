import {calculateCustomerConcentration, calculateEbitdaAdjustments, calculateNewInstrumentAmount, presentationNumber, testScheduleTieOut} from "@offroad/financial-core";
import {describe, expect, it} from "vitest";

import {institutionalFinancialModelMaterial, type Material} from "./index";
import {syntheticMaterials} from "./synthetic-materials.test-support";

const tableRows = (material: Material, caption: string) => {
  const table = material.blocks.find((block) => block.type === "table" && block.caption.pt === caption);
  if (table?.type !== "table") throw new Error(`missing table ${caption}`);
  return table.rows;
};
const kvValue = (material: Material, label: string) => material.blocks.flatMap((block) => block.type === "kv" ? block.rows : []).find((row) => row.label.pt === label)?.value;

describe("the materials print what the financial-core kernels compute", () => {
  const {materials, desk, trajectory, facts} = syntheticMaterials();
  const byKind = (kind: Material["kind"]) => materials.find((material) => material.kind === kind)!;

  it("states the new instrument as the kernel's sum of the takeout and the new money", () => {
    const lm = trajectory.liabilityManagement!;
    const amount = calculateNewInstrumentAmount({covenantedBalance: lm.covenantedBalance, netNewMoney: lm.netNewMoney});
    expect(amount.value).toBe("42300000");
    expect(tableRows(byKind("package"), "Fontes e usos")[0]).toEqual(["Fonte: novo instrumento", "R$ 42.300.000"]);
  });

  it("answers concentration and the schedule tie-out from the kernels, supports in the kernel's ranking", () => {
    const shares = facts.filter((fact) => /^customers\.top_customers\.\d+\.share_pct$/.test(fact.key.fieldPath));
    const concentration = calculateCustomerConcentration({shares: shares.map((fact) => ({id: fact.key.fieldPath, share: fact.value})), leading: 5});
    const qa = byKind("diligence_qa");
    const row = qa.blocks.flatMap((block) => block.type === "kv" ? block.rows : []).find((entry) => entry.label.pt === "Qual a concentração nos cinco maiores clientes?")!;
    expect(concentration.leadingTotal).toBe("0.627");
    expect(row.value).toEqual({pt: "Cinco maiores: 62,7% da receita; o maior, 18,1%.", en: "Top five: 62.7% of revenue; the largest, 18.1%."});
    expect(row.supportIds).toEqual([...concentration.ranking]);
    const tieOut = testScheduleTieOut({scheduleGap: desk.stack.scheduleGap, totalOnBalance: desk.stack.totalOnBalance, tolerance: "0.02"});
    expect(tieOut).toMatchObject({outcome: "outside_tolerance", magnitude: "6820000", side: "balance_above_schedule"});
    expect(kvValue(qa, "O mapa de dívida bate com o balanço?")?.pt).toBe("Não: R$ 6,8M no balanço e fora do mapa; a companhia precisa explicar.");
  });

  it("answers the non-recurring EBITDA question from the adjustments kernel, and counts it as answered", () => {
    const value = (path: string) => facts.find((fact) => fact.key.fieldPath === path)!.value;
    const adjustments = calculateEbitdaAdjustments({adjustedEbitda: value("historical_financials.2025.adjusted_ebitda"), reportedEbitda: value("historical_financials.2025.ebitda")});
    expect(adjustments).toMatchObject({value: "572000", magnitude: "572000"});
    const qa = byKind("diligence_qa");
    expect(kvValue(qa, "Há itens não recorrentes no EBITDA? Quais?")).toEqual({
      pt: "EBITDA ajustado de R$ 17,4M contra reportado de R$ 16,8M: R$ 0,6M de ajustes, a detalhar item a item.",
      en: "Adjusted EBITDA of R$ 17.4M against reported R$ 16.8M: R$ 0.6M of adjustments, to be detailed item by item.",
    });
    expect(qa.blocks[0]?.type === "paragraph" && qa.blocks[0].text.pt).toContain("27 respondidas a partir da sala e 8 em aberto");
    expect(qa.dependsOn).toContain("historical_financials.2025.adjusted_ebitda");
  });

  it("rounds a ratio on its decimal value: a tie the binary float would print low now rounds up", () => {
    const period = {period: "2026", revenue: "100", ebitda: "40", netIncome: "10", totalAssets: "200", totalLiabilitiesAndEquity: "200", cfads: "30",
      closingGrossDebt: "50", unrestrictedCash: "20", balanceCheck: "0", netDebtToEbitda: "2.675", dscr: "1.005", interestCoverage: "-0.125"};
    const statements = institutionalFinancialModelMaterial({artifactFingerprint: "a".repeat(64), supportIds: [], lang: "pt", scenarios: [{name: "Empate", currency: "BRL", periods: [period]}]});
    const ratios = statements.blocks.find((block) => block.type === "table" && block.rows.some((row) => row[0]?.includes("(x)")));
    if (ratios?.type !== "table") throw new Error("missing ratio table");
    // `Number("1.005").toFixed(2)` is 1.00 and `Number("2.675").toFixed(2)` is 2.67: the float path printed them low.
    expect(ratios.rows.map((row) => row[1])).toEqual(["2,68", "1,01", "-0,13"]);
    expect(statements.presentationCharts?.[0]?.series.points.map((point) => point.value)).toEqual([presentationNumber("40").value]);
  });

  it("refuses a chart point that is not a number instead of plotting zero or NaN", () => {
    const period = {period: "2026", revenue: "100", ebitda: "n/d", netIncome: "10", totalAssets: "200", totalLiabilitiesAndEquity: "200", cfads: "30",
      closingGrossDebt: "50", unrestrictedCash: "20", balanceCheck: "0"};
    expect(() => institutionalFinancialModelMaterial({artifactFingerprint: "a".repeat(64), supportIds: [], scenarios: [{name: "Lacuna", currency: "BRL", periods: [period]}]})).toThrow(RangeError);
  });
});
