import {describe, expect, it} from "vitest";

import {instrumentVerdicts, instruments} from "./instruments";

describe("the instrument catalogue", () => {
  it("maps the FIDC route without calling the vehicle the company's instrument", () => {
    const verdict = instrumentVerdicts({legalForm: "ltda", archetypeId: "working_capital", amount: "50000000", receivablesCoverage: "2"})
      .find((entry) => entry.instrument.id === "fidc")!;
    expect(verdict.route.capitalVehicles).toEqual(["fidc"]);
    expect(verdict.route.obligationInstruments).toEqual(["receivables_assignment"]);
    expect(verdict.route.distributedSecurities).toContain("fidc_senior_quota");
  });

  it("knows eleven papers, each with a buyer, a tax line and at least one requirement", () => {
    expect(instruments).toHaveLength(11);
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

  it("states the CVM 160 offer regime and none of the revoked ICVM 476 caps", () => {
    const by = (id: string) => instruments.find((instrument) => instrument.id === id)!;
    // The legacy key stays; the paper it names is the professional-investor debenture of CVM 160.
    expect(by("debenture_476").offerRegime).toEqual({rule: "cvm_160", rite: "automatic", audiences: ["professional"], issuerRegistrationRequired: false});
    expect(by("debenture_476").labels.pt).toBe("Debênture para investidor profissional (CVM 160, rito automático)");
    expect(by("debenture_476").requirements.map((requirement) => requirement.pt).join(" ")).toContain("sem limite de investidores procurados ou de subscritores");
    expect(by("debenture_160").offerRegime).toEqual({rule: "cvm_160", rite: "automatic_or_ordinary", audiences: ["qualified", "general_public"], issuerRegistrationRequired: true});
    expect(by("nota_comercial").offerRegime).toEqual({rule: "cvm_160", rite: "automatic", audiences: ["professional"], issuerRegistrationRequired: false});
    for (const id of ["ccb", "nce", "cra", "cri", "fidc", "venture_debt", "finame", "leasing"]) expect(by(id).offerRegime).toBeUndefined();
    const text = JSON.stringify(instruments);
    expect(text).not.toMatch(/75 investidores|50 subscritores|75 professional investors|50 subscribers|esforços restritos|restricted efforts|antiga 476|formerly 476/);
  });

  it("carries the credit IOF each paper pays under Decreto 6.306 as amended in 2025", () => {
    const by = (id: string) => instruments.find((instrument) => instrument.id === id)!;
    expect(Object.fromEntries(instruments.map((instrument) => [instrument.id, instrument.creditIof]))).toEqual({
      ccb: "general_rate",
      nce: "exempt",
      debenture_476: "not_levied",
      debenture_160: "not_levied",
      nota_comercial: "not_levied",
      cra: "not_levied",
      cri: "not_levied",
      fidc: "not_levied",
      venture_debt: "depends_on_paper",
      finame: "zero_rate",
      leasing: "not_levied",
    });
    // FINAME is at a zero rate, not at the general credit IOF the catalogue used to state.
    expect(by("finame").tax.pt).toMatch(/^Alíquota zero de IOF de crédito em operação com recursos da FINAME \(Decreto 6\.306\/2007, art\. 8º\)/);
    for (const id of ["debenture_476", "debenture_160", "nota_comercial", "cra", "cri"]) expect(by(id).tax.pt).toMatch(/sem IOF de crédito/i);
    expect(by("ccb").tax.pt).toContain("até 3,373% do principal");
    expect(by("fidc").tax.pt).toContain("IOF de 0,38% na aquisição primária de cotas, pago pelo cotista");
    // The incentivised debenture is Law 12,431 and benefits the investor; the infrastructure one is Law 14,801 and benefits the issuer.
    expect(by("debenture_476").tax.pt).toContain("salvo debênture incentivada (Lei 12.431), isenta para pessoa física");
    expect(by("debenture_476").tax.pt).toContain("Na debênture de infraestrutura (Lei 14.801) o benefício é da emissora");
  });

  it("opens the nota comercial to a limitada and names it when the debenture is closed", () => {
    const verdicts = instrumentVerdicts({legalForm: "ltda", archetypeId: "growth_expansion", amount: "42300000"});
    const by = (id: string) => verdicts.find((verdict) => verdict.instrument.id === id)!;
    expect(by("nota_comercial").eligible).toBe(true);
    expect(by("nota_comercial").route).toMatchObject({obligationInstruments: ["commercial_note"], distributedSecurities: ["commercial_note"], distributionRoutes: ["private_distribution"]});
    expect(by("debenture_476").eligible).toBe(false);
    expect(by("debenture_476").reasons.map((reason) => reason.pt)).toContain("A limitada não emite debênture; a nota comercial e a CCB são as rotas equivalentes.");
    // The CCB stays the first open paper, so the engine's preferred instrument does not move.
    expect(verdicts.find((verdict) => verdict.eligible)?.instrument.id).toBe("ccb");
    const other = instrumentVerdicts({legalForm: "other", archetypeId: "growth_expansion", amount: "42300000"}).find((verdict) => verdict.instrument.id === "nota_comercial")!;
    expect(other.eligible).toBe(false);
    expect(other.reasons.map((reason) => reason.pt)).toContain("A cooperativa também emite nota comercial; confirmada essa forma societária, a rota se abre.");
    const small = instrumentVerdicts({legalForm: "ltda", archetypeId: "growth_expansion", amount: "20000000"}).find((verdict) => verdict.instrument.id === "nota_comercial")!;
    expect(small.eligible).toBe(false);
  });

  it("opens venture debt to a sponsor-backed startup and nothing securitised", () => {
    const verdicts = instrumentVerdicts({legalForm: "sa", archetypeId: "venture_debt", amount: "15000000", ventureBacked: true});
    const by = (id: string) => verdicts.find((verdict) => verdict.instrument.id === id)!;
    expect(by("venture_debt").eligible).toBe(true);
    expect(by("cra").eligible).toBe(false);
    expect(by("cri").eligible).toBe(false);
  });
});
