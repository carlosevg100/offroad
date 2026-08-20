import {describe, expect, it} from "vitest";

import {assessInstruments, ventureDebtCeiling} from "./assess";
import {catalogue, instrument} from "./catalogue";
import {instrumentSchema, type IssuerProfile} from "./types";

const ltda = (overrides: Partial<IssuerProfile> = {}): IssuerProfile => ({
  legalForm: "ltda",
  amount: "30000000",
  ...overrides,
});

const sa = (overrides: Partial<IssuerProfile> = {}): IssuerProfile => ({
  legalForm: "sa_fechada",
  amount: "30000000",
  ...overrides,
});

describe("the catalogue is complete and self-consistent", () => {
  it("covers every instrument in the vocabulary, once", () => {
    const ids = catalogue.map((profile) => profile.id).sort();
    expect(ids).toEqual([...instrumentSchema.options].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says what each instrument is, in words a non-specialist can read", () => {
    for (const profile of catalogue) {
      expect(profile.what.pt.length, profile.id).toBeGreaterThan(60);
      expect(profile.what.en.length, profile.id).toBeGreaterThan(60);
      expect(profile.legalBasis.length, profile.id).toBeGreaterThan(10);
    }
  });

  it("carries honest costs, not only advantages", () => {
    // The cons are the point of the file: anyone can list advantages, and nobody tells a company
    // that assigning its receivables removes the collateral it was going to offer next.
    for (const profile of catalogue) {
      expect(profile.pros.length, profile.id).toBeGreaterThanOrEqual(2);
      expect(profile.cons.length, profile.id).toBeGreaterThanOrEqual(2);
      for (const entry of [...profile.pros, ...profile.cons]) {
        expect(entry.pt.length, profile.id).toBeGreaterThan(30);
        expect(entry.en.length, profile.id).toBeGreaterThan(30);
      }
    }
  });

  it("explains every blocking condition with what would change it", () => {
    for (const profile of catalogue) {
      for (const condition of profile.eligibility) {
        expect(condition.whenUnmet.pt.length, `${profile.id}/${condition.id}`).toBeGreaterThan(50);
        expect(condition.whenUnmet.en.length, `${profile.id}/${condition.id}`).toBeGreaterThan(50);
      }
    }
  });

  it("refuses an unknown instrument rather than returning undefined", () => {
    expect(() => instrument("nao_existe" as never)).toThrow();
  });
});

describe("what a limitada can and cannot do", () => {
  it("blocks the debenture on the legal form, and says what it would take", () => {
    const assessment = assessInstruments(ltda());
    const debenture = assessment.blocked.find((entry) => entry.instrument === "debenture")!;
    expect(debenture.blockedBy.map((reason) => reason.eligibilityId)).toContain("legal_form");
    expect(debenture.blockedBy[0]!.explanation.pt).toContain("art. 52");
    expect(debenture.blockedBy[0]!.explanation.pt).toContain("transformar em S.A.");
  });

  it("keeps the commercial note open, which is the point of the 2021 change", () => {
    // Lei 14.195/2021 opened it to limitadas and cooperatives. A limitada is not shut out of the
    // capital markets, and a desk that says otherwise is working from a pre-2021 mental model.
    const assessment = assessInstruments(ltda());
    expect(assessment.eligible.map((entry) => entry.instrument)).toContain("nota_comercial");
    expect(assessment.eligible.map((entry) => entry.instrument)).toContain("ccb");
  });

  it("recommends the widest reach available, not the easiest", () => {
    const assessment = assessInstruments(ltda());
    expect(assessment.recommended).toBe("nota_comercial");
    expect(assessment.rationale?.pt).toContain("Recomendamos");
    // And it names the one just out of reach, with the change that would unlock it.
    expect(assessment.rationale?.pt).toContain("não está disponível");
  });

  it("lists becoming an S.A. as unlockable, and an agro qualification as not", () => {
    const assessment = assessInstruments(ltda());
    const unlockable = assessment.unlockable.map((entry) => entry.instrument);
    expect(unlockable).toContain("debenture");
    // A CRA is blocked because the credit is not agribusiness. That is a fact about the company,
    // not a decision it can revisit, and offering it as an action would be dishonest.
    expect(unlockable).not.toContain("cra");
  });
});

describe("what an S.A. unlocks", () => {
  it("opens the debenture once the form and the size both hold", () => {
    const assessment = assessInstruments(sa());
    expect(assessment.recommended).toBe("debenture");
  });

  it("blocks the debenture on size alone for a small raise, and says the number", () => {
    const assessment = assessInstruments(sa({amount: "6000000"}));
    const debenture = assessment.blocked.find((entry) => entry.instrument === "debenture")!;
    expect(debenture.blockedBy).toHaveLength(1);
    expect(debenture.blockedBy[0]!.eligibilityId).toBe("minimum_size");
    expect(debenture.blockedBy[0]!.explanation.pt).toContain("R$ 20 milhões");
    // Small raise, so the note is what it should reach for.
    expect(assessment.recommended).toBe("nota_comercial");
  });

  it("does not exclude anything on size when the amount is unknown", () => {
    // A company that has not said how much it wants must not lose instruments to a test it was
    // never given the chance to pass.
    const assessment = assessInstruments({legalForm: "sa_fechada"});
    expect(assessment.eligible.map((entry) => entry.instrument)).toContain("debenture");
  });
});

describe("the qualified instruments", () => {
  it("requires the real estate qualification for a CRI, whatever property is on the balance sheet", () => {
    const withProperty = assessInstruments(sa({amount: "40000000"}));
    expect(withProperty.blocked.map((entry) => entry.instrument)).toContain("cri");

    const qualifying = assessInstruments(sa({amount: "40000000", realEstateCredit: true}));
    expect(qualifying.eligible.map((entry) => entry.instrument)).toContain("cri");
  });

  it("keeps CRI and CRA as originated rather than issued", () => {
    // The company does not issue these: a securitisation company does, exclusively, under Lei
    // 14.430/2022. Its counterparty is that company, not the final investor, and the pros and
    // cons follow from that.
    expect(instrument("cri").issuerRole).toBe("originates");
    expect(instrument("cra").issuerRole).toBe("originates");
    expect(instrument("cri").cons.some((con) => con.pt.includes("securitizadora"))).toBe(true);
  });

  it("needs a receivables book before it will offer to sell one", () => {
    const none = assessInstruments(sa());
    expect(none.blocked.map((entry) => entry.instrument)).toContain("fidc");

    const withBook = assessInstruments(sa({hasAssignableReceivables: true}));
    expect(withBook.eligible.map((entry) => entry.instrument)).toContain("fidc");
  });

  it("warns that assigning receivables consumes the next lender's collateral", () => {
    // The cost that always arrives late, and the reason this belongs in the cons rather than in
    // a footnote.
    expect(instrument("fidc").cons.some((con) => con.pt.includes("não serve mais de lastro"))).toBe(true);
  });
});

describe("the venture track", () => {
  const startup = (overrides: Partial<IssuerProfile> = {}): IssuerProfile => ({
    legalForm: "ltda",
    amount: "6000000",
    venturebacked: true,
    lastRoundAmount: "25000000",
    runwayMonths: 14,
    ...overrides,
  });

  it("switches track on the round, not on the sector or the size", () => {
    expect(assessInstruments(startup()).track).toBe("venture");
    expect(assessInstruments(ltda()).track).toBe("cash_generation");
  });

  it("tells the caller that coverage and leverage do not apply", () => {
    // The most important field in this module. A DSCR computed from negative EBITDA is not a
    // finding, and presenting it as one tells a good startup it is uninvestable.
    expect(assessInstruments(startup()).capacityApplies).toBe(false);
    expect(assessInstruments(ltda()).capacityApplies).toBe(true);
  });

  it("offers venture debt to a backed company with runway", () => {
    const assessment = assessInstruments(startup());
    expect(assessment.eligible.map((entry) => entry.instrument)).toContain("venture_debt");
    expect(assessment.rationale?.pt).toContain("régua de venture");
  });

  it("refuses venture debt with no institutional round behind it", () => {
    const bootstrapped = assessInstruments({legalForm: "ltda", amount: "5000000", recurringRevenue: true});
    expect(bootstrapped.track).toBe("cash_generation");
    // And the venture instruments are not even in the conversation for a company without a round.
    expect(bootstrapped.eligible.map((entry) => entry.instrument)).not.toContain("venture_debt");
    expect(bootstrapped.blocked.map((entry) => entry.instrument)).not.toContain("venture_debt");
  });

  it("refuses to fund the fall", () => {
    const dying = assessInstruments(startup({runwayMonths: 3}));
    const verdict = dying.blocked.find((entry) => entry.instrument === "venture_debt")!;
    expect(verdict.blockedBy.map((reason) => reason.eligibilityId)).toContain("runway");
    expect(verdict.blockedBy.find((r) => r.eligibilityId === "runway")!.explanation.pt).toContain("financiando a queda");
  });

  it("holds the market convention on how much a round supports", () => {
    // Roughly 30% of the last round. Above it the lender takes equity risk at debt pricing.
    const greedy = assessInstruments(startup({amount: "15000000"}));
    const verdict = greedy.blocked.find((entry) => entry.instrument === "venture_debt")!;
    expect(verdict.blockedBy.map((reason) => reason.eligibilityId)).toContain("round_proportion");
    expect(ventureDebtCeiling("25000000")).toBe("7500000");
  });

  it("offers revenue-based financing only against recurring revenue", () => {
    expect(assessInstruments(startup()).blocked.map((e) => e.instrument)).toContain("revenue_based_financing");
    expect(
      assessInstruments(startup({recurringRevenue: true})).eligible.map((e) => e.instrument),
    ).toContain("revenue_based_financing");
  });

  it("keeps the convertible open for a limitada, which is where most of them are", () => {
    const assessment = assessInstruments(startup());
    expect(assessment.eligible.map((entry) => entry.instrument)).toContain("mutuo_conversivel");
    // And the commercial note carries the detail that makes it work for a limitada.
    expect(instrument("nota_comercial").pros.some((pro) => pro.pt.includes("conversão em participação"))).toBe(true);
  });
});

describe("nothing is presented without its cost", () => {
  it("names a downside for every instrument it recommends", () => {
    for (const issuer of [ltda(), sa(), {legalForm: "ltda" as const, venturebacked: true, lastRoundAmount: "20000000", runwayMonths: 12}]) {
      const assessment = assessInstruments(issuer);
      if (!assessment.recommended) continue;
      expect(instrument(assessment.recommended).cons.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("lists every failed condition, not only the first", () => {
    // Four separate facts about a company are four separate conversations. Collapsing them to
    // "not eligible" throws away the three that could be acted on.
    const tiny = assessInstruments({legalForm: "ltda", amount: "500000"});
    const debenture = tiny.blocked.find((entry) => entry.instrument === "debenture")!;
    expect(debenture.blockedBy.length).toBeGreaterThanOrEqual(2);
  });
});
