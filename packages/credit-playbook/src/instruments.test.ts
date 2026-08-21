import {describe, expect, it} from "vitest";

import {instrumentVerdicts, instruments} from "./instruments";

describe("the instrument catalogue", () => {
  it("knows ten papers, each with a buyer, a tax line and at least one requirement", () => {
    expect(instruments).toHaveLength(10);
    for (const instrument of instruments) {
      expect(instrument.buyers.length).toBeGreaterThan(0);
      expect(instrument.tax.pt.length).toBeGreaterThan(20);
      expect(instrument.requirements.length).toBeGreaterThan(0);
      expect(instrument.tenorMonths.min).toBeLessThan(instrument.tenorMonths.max);
    }
  });

  it("closes the debenture and the CRA to a limitada distributor, and opens the CCB", () => {
    const verdicts = instrumentVerdicts({legalForm: "ltda", archetypeId: "growth_expansion", amount: "42300000", receivablesCoverage: "1.1"});
    const by = (id: string) => verdicts.find((verdict) => verdict.instrument.id === id)!;
    expect(by("debenture_476").eligible).toBe(false);
    expect(by("debenture_476").reasons[0]!.pt).toContain("sociedade anônima");
    expect(by("cra").eligible).toBe(false);
    expect(by("ccb").eligible).toBe(true);
    expect(by("fidc").eligible).toBe(false);
  });

  it("opens the CRA and the debenture to an agribusiness S.A. refinancing, and closes venture debt", () => {
    const verdicts = instrumentVerdicts({legalForm: "sa", archetypeId: "refinance", amount: "1500000000", agribusiness: true});
    const by = (id: string) => verdicts.find((verdict) => verdict.instrument.id === id)!;
    expect(by("cra").eligible).toBe(true);
    expect(by("debenture_476").eligible).toBe(true);
    expect(by("debenture_160").eligible).toBe(true);
    expect(by("venture_debt").eligible).toBe(false);
  });

  it("opens venture debt to a sponsor-backed startup and nothing securitised", () => {
    const verdicts = instrumentVerdicts({legalForm: "sa", archetypeId: "venture_debt", amount: "15000000", ventureBacked: true});
    const by = (id: string) => verdicts.find((verdict) => verdict.instrument.id === id)!;
    expect(by("venture_debt").eligible).toBe(true);
    expect(by("cra").eligible).toBe(false);
    expect(by("cri").eligible).toBe(false);
  });
});
