import {describe, expect, it} from "vitest";

import {buildInterestAndIndexationSchedule, type InterestScheduleInput} from "./build-interest-and-indexation-schedule";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const af = (document: string) => ({document, note: "características das séries"});
/** Camil's six IPCA series (743,955) plus one DI series, projected over four quarters with a declared curve. Coupons converted to quarterly rates. */
const camil = (): InterestScheduleInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  periods: ["2026Q3", "2026Q4", "2027Q1", "2027Q2"],
  curves: [
    {id: "ipca-anbima-2026-09-04", kind: "IPCA", ratesByPeriod: {"2026Q3": "0.0125", "2026Q4": "0.0125", "2027Q1": "0.0125", "2027Q2": "0.0125"}, source: {title: "ANBIMA ETTJ, inflação implícita de 6,05% ao ano em 04/09/2026", asOf: "2026-09-04"}},
    {id: "cdi-bcb-2026-09-04", kind: "CDI", ratesByPeriod: {"2026Q3": "0.0333", "2026Q4": "0.0333", "2027Q1": "0.0333", "2027Q2": "0.0333"}, source: {title: "Banco Central, SGS 12, CDI diário de 0,05166% em 01 a 03/09/2026", asOf: "2026-09-04"}},
  ],
  series: [
    {id: "deb-13-2", label: "13ª 2ª série IPCA + 6,3416%", openingPrincipal: "282357", indexer: "IPCA", couponRatePerPeriod: "0.015854", indexationTreatment: "capitalized_principal", curveId: "ipca-anbima-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_13a_emissao.pdf")}},
    {id: "deb-13-3", label: "13ª 3ª série IPCA + 6,5264%", openingPrincipal: "110321", indexer: "IPCA", couponRatePerPeriod: "0.016316", indexationTreatment: "capitalized_principal", curveId: "ipca-anbima-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_13a_emissao.pdf")}},
    {id: "deb-14-2", label: "14ª 2ª série IPCA + 6,8286%", openingPrincipal: "204059", indexer: "IPCA", couponRatePerPeriod: "0.017072", indexationTreatment: "capitalized_principal", curveId: "ipca-anbima-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_14a_emissao.pdf")}},
    {id: "deb-14-3", label: "14ª 3ª série IPCA + 6,9982%", openingPrincipal: "66024", indexer: "IPCA", couponRatePerPeriod: "0.017496", indexationTreatment: "capitalized_principal", curveId: "ipca-anbima-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_14a_emissao.pdf")}},
    {id: "deb-15-3", label: "15ª 3ª série IPCA + 8,20%", openingPrincipal: "50401", indexer: "IPCA", couponRatePerPeriod: "0.0205", indexationTreatment: "capitalized_principal", curveId: "ipca-anbima-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_15a_emissao.pdf")}},
    {id: "deb-15-4", label: "15ª 4ª série IPCA + 8,70%", openingPrincipal: "30793", indexer: "IPCA", couponRatePerPeriod: "0.02175", indexationTreatment: "capitalized_principal", curveId: "ipca-anbima-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_15a_emissao.pdf")}},
    {id: "deb-13-1", label: "13ª 1ª série DI + 0,65%", openingPrincipal: "306038", indexer: "CDI", couponRatePerPeriod: "0.001625", indexationTreatment: "cash_paid", curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_13a_emissao.pdf")}},
    {id: "loan-usd", label: "Capital de giro, USD", openingPrincipal: "867244", indexer: "unknown", couponRatePerPeriod: null, indexationTreatment: null, curveId: null, anchors: {balance: itr(39, "15")}},
  ],
  accountingInterestLastPeriod: {value: "170548", period: "2026Q2", anchor: itr(48, "22")},
});

describe("build-interest-and-indexation-schedule executor", () => {
  it("gold: the six IPCA series open at 743,955 and capitalize indexation while paying coupons in cash", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    const ipca = result.scheduleBySeries.filter((schedule) => schedule.indexer === "IPCA");
    expect(ipca).toHaveLength(6);
    const opening = ipca.reduce((sum, schedule) => sum + Number(schedule.rows[0]?.openingPrincipal), 0);
    expect(opening).toBe(743955);
    const first = ipca.find((schedule) => schedule.seriesId === "deb-13-2")!;
    expect(first.rows[0]?.indexationCapitalized).toBe("3529.4625");
    expect(first.rows[0]?.indexationPaid).toBe("0");
    expect(Number(first.rows[0]?.couponPaid)).toBeGreaterThan(0);
    expect(first.curveSource?.asOf).toBe("2026-09-04");
    expect(result.state).toBe("partial");
  });

  it("names the series it cannot project and keeps the accounting bridge as insufficient evidence", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.uncoveredSeries.map((entry) => entry.seriesId)).toEqual(["loan-usd"]);
    expect(result.uncoveredSeries[0]?.reason).toMatch(/indexer or the coupon/);
    expect(result.accountingBridge?.state).toBe("insufficient_evidence");
  });

  it("projects both treatments when the indenture does not say how indexation is paid", () => {
    const unknownTreatment = camil();
    unknownTreatment.series[0]!.indexationTreatment = null;
    const result = buildInterestAndIndexationSchedule(unknownTreatment);
    const variants = result.scheduleBySeries.filter((schedule) => schedule.seriesId === "deb-13-2").map((schedule) => schedule.variant).sort();
    expect(variants).toEqual(["if_capitalized", "if_cash_paid"]);
  });

  it("refuses a curve without source and a series whose curve is missing", () => {
    const noCurve = camil();
    noCurve.series[0]!.curveId = "missing";
    const result = buildInterestAndIndexationSchedule(noCurve);
    expect(result.uncoveredSeries.some((entry) => entry.seriesId === "deb-13-2" && /no registered curve/.test(entry.reason))).toBe(true);
    const unsourced = camil();
    (unsourced.curves![0] as {source: unknown}).source = undefined;
    expect(() => buildInterestAndIndexationSchedule(unsourced)).toThrow();
  });

  it("is consistent under twenty permutations of series and curves", () => {
    const first = buildInterestAndIndexationSchedule(camil());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.series = seed % 2 === 0 ? [...shuffled.series].reverse() : [...shuffled.series.slice(3), ...shuffled.series.slice(0, 3)];
      shuffled.curves = [...shuffled.curves!].reverse();
      const again = buildInterestAndIndexationSchedule(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
