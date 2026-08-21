import {describe, expect, it} from "vitest";

import {shortlist, syntheticInvestors} from "./index";

describe("the shortlist", () => {
  it("puts the fund that buys this exact paper first, and says why the others are off", () => {
    const list = shortlist(syntheticInvestors, {archetypeId: "growth_expansion", instrument: "ccb", amount: "42300000", tenorMonths: 48, rating: "adequate", sector: "Distribuição de materiais de construção", secured: true});
    expect(list[0]!.investor.id).toBe("inv-1");
    expect(list[0]!.eligible).toBe(true);
    expect(list[0]!.reasons[0]!.pt).toContain("preferência");
    const bank = list.find((entry) => entry.investor.id === "inv-2")!;
    expect(bank.eligible).toBe(false);
    expect(bank.reasons[0]!.pt).toContain("Não compra esta operação");
    const venture = list.find((entry) => entry.investor.id === "inv-3")!;
    expect(venture.eligible).toBe(false);
  });

  it("finds the venture lender for a sponsor-backed startup and nobody else", () => {
    const list = shortlist(syntheticInvestors, {archetypeId: "venture_debt", instrument: "venture_debt", amount: "15000000", tenorMonths: 36, rating: "watch", sector: "Software", secured: false, ventureBacked: true});
    expect(list.filter((entry) => entry.eligible).map((entry) => entry.investor.id)).toEqual(["inv-3"]);
  });

  it("orders eligible investors by fit, with an unconfirmed appetite costing points", () => {
    const list = shortlist(syntheticInvestors, {archetypeId: "refinance", instrument: "debenture_476", amount: "100000000", tenorMonths: 60, rating: "adequate", sector: "Alimentos", secured: true});
    const eligible = list.filter((entry) => entry.eligible).map((entry) => entry.investor.id);
    expect(eligible).toEqual(["inv-1", "inv-4"]);
    expect(list.find((entry) => entry.investor.id === "inv-4")!.reasons.some((reason) => reason.pt.includes("nunca confirmado"))).toBe(true);
  });
});
