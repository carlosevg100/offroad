import {describe, expect, it} from "vitest";

import {indicativePrice, pricedInstrumentLabel, ratingBandLabels, spreadBands} from "./index";

describe("the desk's price reference", () => {
  it("has a band for every instrument at the adequate rating, and says it is practice, not observation", () => {
    const instruments = [...new Set(spreadBands.map((band) => band.instrument))];
    expect(instruments).toHaveLength(10);
    for (const instrument of instruments) expect(spreadBands.some((band) => band.instrument === instrument && band.rating === "adequate")).toBe(true);
    const price = indicativePrice({instrument: "ccb", rating: "adequate", cdi: "0.105"})!;
    expect(price.sentence.pt).toContain("prática da mesa");
    expect(price.sentence.pt).not.toContain("observada");
  });

  it("prices Aurora's CCB: adequate, 48 months, 1,3x of collateral, R$ 42M", () => {
    const price = indicativePrice({instrument: "ccb", rating: "adequate", cdi: "0.105", tenorMonths: 48, collateralCoverage: "1.3", amount: "42300000"})!;
    expect(price.bps).toEqual({min: 250, max: 370});
    // (1 + 10,5%) × (1 + 2,5%) - 1 = 13,2625%, not the 13,00% a linear sum would show.
    expect(price.allIn.min).toBe("0.1326");
    expect(price.allIn.max).toBe("0.1459");
    expect(price.adjustments.map((a) => a.id)).toEqual(["security"]);
    expect(price.sentence.pt).toContain("CDI + 2,5%");
  });

  it("names the instrument by its catalog name and the analytical profile by its band, in words, never by their keys", () => {
    // Before: "Base: banda adequate para ccb, 280 a 400 bps" and "Base: adequate band for ccb, 280 to 400 bps".
    const aurora = indicativePrice({instrument: "ccb", rating: "watch", cdi: "0.105"})!;
    expect(aurora.sentence.pt).toContain("Base: Cédula de Crédito Bancário (CCB); perfil analítico: atenção; faixa de 400 a 550 bps; ajustes: +40 bps (Sem garantia real declarada: quirografário.).");
    expect(aurora.sentence.en).toContain("Base: Bank credit note (CCB); analytical profile: watch; range of 400 to 550 bps; adjustments: +40 bps (No security stated: unsecured.).");
    for (const band of spreadBands) {
      const price = indicativePrice({instrument: band.instrument, rating: band.rating, cdi: "0.105", tenorMonths: 84, amount: "8000000"})!;
      const name = pricedInstrumentLabel(band.instrument);
      expect(name.pt).not.toBe("instrumento indicado");
      expect(price.sentence.pt).toContain(`Base: ${name.pt}; perfil analítico: ${ratingBandLabels[band.rating].pt}; faixa de ${band.bps.min} a ${band.bps.max} bps`);
      expect(price.sentence.en).toContain(`Base: ${name.en}; analytical profile: ${ratingBandLabels[band.rating].en}; range of ${band.bps.min} to ${band.bps.max} bps`);
      expect(price.sentence.pt).not.toMatch(/\b(?:strong|adequate|watch|weak|distressed)\b/);
      for (const text of [price.sentence.pt, price.sentence.en]) {
        expect(text).not.toMatch(/\b[a-z]+_[a-z0-9_]+\b/);
        expect(text).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });

  it("closes the door where no lender would look", () => {
    expect(indicativePrice({instrument: "debenture_160", rating: "distressed", cdi: "0.105"})).toBeNull();
  });

  it("charges for duration, for no security and for a small ticket", () => {
    const price = indicativePrice({instrument: "debenture_476", rating: "watch", cdi: "0.105", tenorMonths: 84, amount: "8000000"})!;
    expect(price.adjustments.map((a) => a.id).sort()).toEqual(["security", "size", "tenor"]);
    expect(price.bps.min).toBe(280 + 40 + 40 + 50);
  });
});
