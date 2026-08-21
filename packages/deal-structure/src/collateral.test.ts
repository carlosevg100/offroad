import {describe, expect, it} from "vitest";

import {designCollateralPackage} from "./collateral";

describe("the security package", () => {
  const assets = [
    {description: "Recebíveis de clientes", type: "receivables" as const, value: "51940000", encumbered: "24400000"},
    {description: "Estoques", type: "inventory" as const, value: "42180000"},
    {description: "CD de São José dos Campos", type: "property" as const, value: "28000000", appraised: true},
    {description: "Frota (11 veículos)", type: "vehicles" as const, value: "3200000", encumbered: "1820000"},
    {description: "Aval dos sócios", type: "guarantee" as const, value: "0"},
  ];

  it("takes the free receivables and the appraised property before the inventory", () => {
    const pkg = designCollateralPackage({assets, amount: "25000000", coverage: "1.3"});
    const selected = pkg.lines.filter((line) => line.selected).map((line) => line.asset.description);
    expect(selected).toEqual(["Recebíveis de clientes", "CD de São José dos Campos"]);
    // 27,54M free receivables at 30% = 19,28M; 28M property at 40% = 16,8M: 36,08M over 32,5M required.
    expect(pkg.sufficient).toBe(true);
    expect(Number(pkg.coverageAchieved)).toBeCloseTo(36.078 / 25, 2);
    expect(pkg.lines.find((line) => line.asset.type === "receivables")!.haircutSource).toBe("policy");
    expect(pkg.notes.some((note) => note.pt.includes("Aval"))).toBe(true);
  });

  it("names the shortfall and what would close it", () => {
    const pkg = designCollateralPackage({assets, amount: "60000000", coverage: "1.3"});
    expect(pkg.sufficient).toBe(false);
    expect(Number(pkg.shortfall)).toBeGreaterThan(0);
    expect(pkg.notes.some((note) => note.pt.includes("faltam"))).toBe(true);
    expect(pkg.lines.filter((line) => line.selected).length).toBe(4);
  });

  it("uses the haircut the room states over the policy", () => {
    const pkg = designCollateralPackage({assets: [{description: "Recebíveis", type: "receivables", value: "10000000", haircut: "0.2"}], amount: "5000000"});
    expect(pkg.lines[0]!.haircutSource).toBe("room");
    expect(pkg.lines[0]!.eligible).toBe("8000000.00");
  });
});
