import {describe, expect, it} from "vitest";

import {assessCapacity, buildTermSheet} from "./index";

describe("capacity is three walls, and the lowest one is the answer", () => {
  const base = {
    archetypeId: "growth_expansion" as const,
    requested: "38000000",
    cfads: "20000000",
    adjustedEbitda: "33000000",
    existingNetDebt: "58700000",
    annualDebtServiceFactor: "0.28",
  };

  it("names the binding constraint, which is what turns a rejection into a conversation", () => {
    const assessment = assessCapacity({...base, collateralCapacity: "28000000"});
    expect(assessment.bindingConstraint).toBe("collateral");
    expect(assessment.recommended).toBe("28000000");

    // "You asked for 38 and the answer is 28" is a rejection. "Collateral is the wall" is a
    // structure conversation, and companies routinely answer it by finding another asset.
    const wall = assessment.walls.find((w) => w.id === "collateral");
    expect(wall?.explanation.pt).toContain("haircut");
  });

  it("computes cash flow capacity at the archetype's own minimum coverage", () => {
    const assessment = assessCapacity({...base, collateralCapacity: "999000000"});
    const cashFlow = assessment.walls.find((w) => w.id === "cash_flow");
    // 20,000,000 / 1.30 DSCR / 0.28 service factor
    expect(Number(cashFlow?.amount)).toBeCloseTo(54945054.94, 0);
    expect(cashFlow?.explanation.pt).toContain("1.30x");
  });

  it("gives no incremental room when the company is already at the ceiling", () => {
    const assessment = assessCapacity({...base, adjustedEbitda: "10000000", collateralCapacity: "999000000"});
    // 10M × 3.5 = 35M ceiling, already 58.7M drawn: the answer is zero, not a negative number.
    expect(assessment.walls.find((w) => w.id === "market")?.amount).toBe("0");
    expect(assessment.bindingConstraint).toBe("market");
  });

  it("reports what it could not compute rather than treating it as unlimited", () => {
    const assessment = assessCapacity({archetypeId: "growth_expansion", requested: "38000000"});
    expect(assessment.recommended).toBeNull();
    expect(assessment.gaps.length).toBeGreaterThan(0);
    expect(assessment.walls.every((wall) => wall.amount === null)).toBe(true);
  });

  it("carries a trace on every computed wall", () => {
    const assessment = assessCapacity({...base, collateralCapacity: "28000000"});
    for (const calculation of assessment.calculations) {
      expect(calculation.trace.length).toBeGreaterThan(0);
      expect(calculation.inputs.length).toBeGreaterThan(0);
    }
  });
});

describe("the indicative term sheet", () => {
  const capacity = assessCapacity({
    archetypeId: "growth_expansion",
    requested: "38000000",
    cfads: "20000000",
    adjustedEbitda: "33000000",
    existingNetDebt: "58700000",
    annualDebtServiceFactor: "0.28",
    collateralCapacity: "28000000",
  });

  it("explains the amount by naming the wall, not by apologising", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 72});
    const amount = sheet.terms.find((t) => t.id === "amount");
    expect(amount?.value.pt).toContain("28.000.000");
    expect(amount?.rationale.pt).toContain("garantias");
  });

  it("pulls a requested tenor into the band and keeps both sides of the disagreement", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 120});
    const tenor = sheet.terms.find((t) => t.id === "tenor");
    expect(tenor?.value.pt).toBe("84 meses");
    expect(tenor?.origin).toBe("requested");
    // The disagreement is structured rather than buried in prose: what they asked for survives
    // next to why we differ, so nobody is ambushed later by a figure that quietly changed.
    expect(tenor?.divergence?.requested.pt).toBe("120 meses");
    expect(tenor?.divergence?.reason.pt).toContain("reduz muito o conjunto de compradores");
    expect(tenor?.divergence?.reason.en).toContain("narrows the buyer set");
  });

  it("keeps a requested tenor that already fits, and disagrees with nothing", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 60});
    const tenor = sheet.terms.find((t) => t.id === "tenor");
    expect(tenor?.value.pt).toBe("60 meses");
    expect(tenor?.origin).toBe("requested");
    expect(tenor?.divergence).toBeUndefined();
  });

  it("proposes what the company did not state, and says that is what it is doing", () => {
    // A company often knows only how much it needs. Every blank is our job, not missing input.
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity});
    const tenor = sheet.terms.find((t) => t.id === "tenor")!;
    const grace = sheet.terms.find((t) => t.id === "grace")!;

    expect(tenor.origin).toBe("proposed");
    expect(tenor.rationale.pt).toContain("Você não indicou prazo");
    expect(tenor.divergence).toBeUndefined();
    expect(grace.origin).toBe("proposed");
    expect(grace.rationale.pt).toContain("Você não indicou carência");
  });

  it("marks every term as requested or proposed, with no third state", () => {
    // The distinction decides what the sentence beside the number has to do: a proposed term
    // justifies itself from scratch, a requested one explains agreement or disagreement.
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 60});
    for (const term of sheet.terms) {
      expect(["requested", "proposed"], term.id).toContain(term.origin);
    }
  });

  it("answers a hoped-for rate without inventing one", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity, expectedRate: "13% a.a."});
    const pricing = sheet.terms.find((t) => t.id === "pricing")!;
    expect(pricing.origin).toBe("requested");
    expect(pricing.value.pt).toBe("definido pelo investidor");
    expect(pricing.divergence?.requested.pt).toBe("13% a.a.");
    // No counter-rate appears in the investor-facing document; the market read lives internally.
    expect(pricing.divergence?.reason.pt).toContain("documento interno");
    expect(JSON.stringify(pricing)).not.toMatch(/CDI \+ \d/);
  });

  it("says nothing about pricing when nobody asked", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity});
    expect(sheet.terms.find((t) => t.id === "pricing")?.divergence).toBeUndefined();
  });

  it("quotes no price, and says why", () => {
    // Inventing a rate is the fastest way to lose a company's trust when the market answers
    // differently, so the desk states the absence rather than filling it.
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity});
    const pricing = sheet.terms.find((t) => t.id === "pricing");
    expect(pricing?.value.pt).toBe("definido pelo investidor");
    expect(pricing?.rationale.pt).toContain("não precifica");
  });

  it("carries the security package and covenants from the playbook", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity});
    expect(sheet.collateral.join(" ")).toContain("alienação fiduciária");
    expect(sheet.covenants.join(" ")).toContain("DSCR");
  });

  it("says it is indicative in its own structure, in both languages", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity});
    expect(sheet.status).toBe("indicative");
    expect(sheet.disclaimer.pt).toContain("Não constitui oferta");
    expect(sheet.disclaimer.en).toContain("not an offer");
  });

  it("carries the blockers that stop it circulating", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity, blockers: ["R14: escala inconsistente"]});
    expect(sheet.blockers).toHaveLength(1);
  });

  it("gives every term a basis, so nothing looks like it came from nowhere", () => {
    const sheet = buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 72});
    for (const term of sheet.terms) {
      expect(["capacity", "playbook", "company_request", "reconciled_fact"]).toContain(term.basis);
      expect(term.rationale.pt.length).toBeGreaterThan(20);
      expect(term.rationale.en.length).toBeGreaterThan(20);
    }
  });
});
