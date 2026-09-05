import {describe, expect, it} from "vitest";

import {estimateExitCostBySeries, type ExitCostInput} from "./estimate-exit-cost-by-series";

const esc = (document: string, clause: string) => ({document, clause});
const camil = (exitDate: string): ExitCostInput => ({
  exitDate,
  unit: "BRL thousand",
  series: [
    {id: "deb-13-1", label: "13ª 1ª série, Taxa DI", principal: "306038", rule: {mechanism: "flat_premium_pro_rata", premiumPerYearPercent: "0.40", businessDaysRemaining: 504, availableFrom: "2026-05-14"}, anchor: esc("escritura_13a_emissao.pdf", "7.18.1")},
    {id: "deb-14-1", label: "14ª 1ª série, Taxa DI", principal: "438918", rule: {mechanism: "flat_premium_pro_rata", premiumPerYearPercent: "0.40", businessDaysRemaining: 756, availableFrom: "2026-06-15"}, anchor: esc("escritura_14a_emissao.pdf", "7.18.1")},
    {id: "deb-15-1", label: "15ª 1ª série, Taxa DI", principal: "770123", rule: {mechanism: "flat_premium_pro_rata", premiumPerYearPercent: "0.40", businessDaysRemaining: 1000, availableFrom: "2027-11-15"}, anchor: esc("escritura_15a_emissao.pdf", "7.16.1.1")},
    {id: "deb-13-2", label: "13ª 2ª série, IPCA", principal: "282357", rule: {mechanism: "make_whole", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", presentValueAtReference: null, accruedValue: "282357", availableFrom: "2027-05-14"}, anchor: esc("escritura_13a_emissao.pdf", "7.18.2.1")},
    {id: "deb-11", label: "11ª emissão, CDI + 1,55%", principal: "657779", rule: {mechanism: "redemption_offer", premiumPercent: null, requiresFullAdherence: true, availableFrom: null}, anchor: esc("escritura_11a_emissao.pdf", "4.14.1")},
  ],
});

describe("estimate-exit-cost-by-series executor", () => {
  it("prices the DI series that are open and blocks the ones inside their lockout", () => {
    const result = estimateExitCostBySeries(camil("2026-09-04"));
    const by = Object.fromEntries(result.exitCosts.map((entry) => [entry.seriesId, entry]));
    expect(by["deb-13-1"]?.state).toBe("estimated");
    expect(by["deb-13-1"]?.premium).toBe("2448.304");
    expect(by["deb-14-1"]?.state).toBe("estimated");
    expect(by["deb-15-1"]?.state).toBe("not_permitted");
    expect(by["deb-15-1"]?.reason).toMatch(/2027-11-15/);
  });

  it("does not estimate a make-whole without the reference quote, and names the quote it needs", () => {
    const result = estimateExitCostBySeries(camil("2027-06-01"));
    const ipca = result.exitCosts.find((entry) => entry.seriesId === "deb-13-2")!;
    expect(ipca.state).toBe("insufficient_evidence");
    expect(ipca.reason).toMatch(/NTN-B/);
  });

  it("treats the 11th's redemption offer as negotiated and conditioned on full adherence", () => {
    const result = estimateExitCostBySeries(camil("2026-09-04"));
    const eleventh = result.exitCosts.find((entry) => entry.seriesId === "deb-11")!;
    expect(eleventh.state).toBe("insufficient_evidence");
    expect(eleventh.reason).toMatch(/adherence of all holders/);
    expect(result.totals.seriesBlocked).toBe(3);
  });

  it("computes the make-whole as the greater of accrued and present value once the quote exists", () => {
    const withQuote = camil("2027-06-01");
    withQuote.series[3]!.rule = {mechanism: "make_whole", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", presentValueAtReference: "290000", accruedValue: "282357", availableFrom: "2027-05-14"};
    const ipca = estimateExitCostBySeries(withQuote).exitCosts.find((entry) => entry.seriesId === "deb-13-2")!;
    expect(ipca.premium).toBe("7643");
    expect(ipca.totalPayable).toBe("290000");
  });

  it("is consistent across twenty runs", () => {
    const first = estimateExitCostBySeries(camil("2026-09-04"));
    for (let index = 0; index < 20; index += 1) expect(estimateExitCostBySeries(camil("2026-09-04")).trace.outputFingerprint).toBe(first.trace.outputFingerprint);
  });
});
