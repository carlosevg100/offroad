import {describe, expect, it} from "vitest";

import {briefCompleteness, dealBriefFormSchema, dealBriefOf, parseAmount, toDealBrief} from "./deal-brief";

describe("parseAmount", () => {
  it("reads the ways a Brazilian actually types a number", () => {
    // The first field of the first screen. A parser that accepts one format is where people quit.
    expect(parseAmount("45000000")).toBe("45000000.00");
    expect(parseAmount("45.000.000")).toBe("45000000.00");
    expect(parseAmount("45.000.000,00")).toBe("45000000.00");
    expect(parseAmount("R$ 45.000.000")).toBe("45000000.00");
    expect(parseAmount(" 45000000 ")).toBe("45000000.00");
  });

  it("treats the last comma as the decimal point, not as a separator", () => {
    expect(parseAmount("1.234,56")).toBe("1234.56");
    expect(parseAmount("1234,5")).toBe("1234.50");
  });

  it("understands the magnitude words, because people write them", () => {
    expect(parseAmount("45 milhões")).toBe("45000000.00");
    expect(parseAmount("45 milhoes")).toBe("45000000.00");
    expect(parseAmount("R$ 45 mi")).toBe("45000000.00");
    expect(parseAmount("1,5 milhão")).toBe("1500000.00");
    expect(parseAmount("800 mil")).toBe("800000.00");
    expect(parseAmount("1,2 bilhões")).toBe("1200000000.00");
  });

  it("refuses a sentence rather than reading a number out of it", () => {
    // "mais ou menos 40" stripped to digits is R$ 40,00 — a request that matches no fund on
    // earth, for a reason nobody looking at the screen could see. Same failure the extraction
    // ledger calls a scale error, arriving through the front door.
    expect(parseAmount("mais ou menos 40")).toBeNull();
    expect(parseAmount("uns quarenta")).toBeNull();
    expect(parseAmount("cerca de 40 a 50 milhões")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0")).toBeNull();
  });
});

describe("toDealBrief", () => {
  const form = (overrides: Record<string, unknown> = {}) =>
    dealBriefFormSchema.parse({amount: "", term_months: "", grace_months: "", sector: "", geography: "", instruments: [], collateral_kinds: [], ...overrides});

  it("accepts a brief that is almost entirely empty", () => {
    // The normal state. A form that refuses to save until it is complete is a form people abandon.
    expect(toDealBrief(form())).toEqual({});
    expect(toDealBrief(form({amount: "45.000.000"}))).toEqual({requestedAmount: "45000000.00"});
  });

  it("refuses a number that was typed and could not be read", () => {
    // Saving it as absent would silently discard something the company believes it told us.
    expect(toDealBrief(form({amount: "mais ou menos 40"}))).toBeNull();
  });

  it("refuses grace that outlasts the facility", () => {
    // The database refuses it anyway; catching it here turns a 500 into a sentence.
    expect(toDealBrief(form({term_months: "24", grace_months: "24"}))).toBeNull();
    expect(toDealBrief(form({term_months: "60", grace_months: "12"}))).toEqual({
      requestedTermMonths: 60,
      requestedGraceMonths: 12,
    });
  });

  it("uppercases the state and rejects anything that is not one", () => {
    expect(toDealBrief(form({geography: "sp"}))).toEqual({geography: "SP"});
    expect(() => form({geography: "São Paulo"})).toThrow();
  });

  it("refuses an instrument or a collateral kind outside the vocabulary", () => {
    // The same vocabulary the mandate compares against. A typo here would produce a request that
    // matches no fund for a reason nobody could see.
    expect(() => form({instruments: ["debenture", "inventado"]})).toThrow();
    expect(() => form({collateral_kinds: ["recebiveis", "pix"]})).toThrow();
    expect(toDealBrief(form({instruments: ["debenture", "ccb"]}))).toEqual({instruments: ["debenture", "ccb"]});
  });

  it("keeps several instruments, because keeping options open widens the buyer set", () => {
    const brief = toDealBrief(form({instruments: ["debenture", "nota_comercial", "ccb"]}));
    expect(brief?.instruments).toHaveLength(3);
  });
});

describe("dealBriefOf", () => {
  it("reads a row back into the shape the fit assessment consumes", () => {
    expect(
      dealBriefOf({
        requested_amount: 45000000,
        requested_term_months: 60,
        requested_grace_months: 12,
        sector: "varejo",
        geography: "SP",
        instruments: ["debenture"],
        collateral_kinds: ["recebiveis"],
        expected_rate: "CDI + 4",
      }),
    ).toEqual({
      requestedAmount: "45000000",
      requestedTermMonths: 60,
      requestedGraceMonths: 12,
      sector: "varejo",
      geography: "SP",
      instruments: ["debenture"],
      collateralKinds: ["recebiveis"],
      expectedRate: "CDI + 4",
    });
  });

  it("omits what the session does not carry, rather than emitting empties", () => {
    expect(
      dealBriefOf({
        requested_amount: null,
        requested_term_months: null,
        requested_grace_months: null,
        sector: null,
        geography: null,
        instruments: null,
        collateral_kinds: [],
        expected_rate: null,
      }),
    ).toEqual({});
  });
});

describe("briefCompleteness", () => {
  it("counts only the fields that decide who could buy", () => {
    // Grace shapes the structure; it never decides eligibility, so it is not one of the six.
    const full = briefCompleteness({
      requestedAmount: "1",
      requestedTermMonths: 60,
      requestedGraceMonths: 12,
      sector: "varejo",
      geography: "SP",
      instruments: ["debenture"],
      collateralKinds: ["recebiveis"],
    });
    expect(full).toEqual({answered: 6, total: 6, missing: []});
  });

  it("treats an empty list as unanswered", () => {
    const partial = briefCompleteness({requestedAmount: "1", instruments: []});
    expect(partial.answered).toBe(1);
    expect(partial.missing).toContain("instruments");
  });
});
