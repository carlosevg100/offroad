import {businessDayAccrual, diPercentAccrual} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {buildInterestAndIndexationSchedule, type InterestScheduleInput} from "./build-interest-and-indexation-schedule";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const af = (document: string, page: number) => ({document, page, note: "características das séries"});
const escritura = (document: string, clause: string) => ({document, clause, note: "cláusula de pagamento da remuneração e anexo de datas"});
/** A synthetic 252-day calendar for the test: 63 business days per quarter, declared as such; production reads the ANBIMA calendar. */
const calendar = {document: "calendario_sintetico_teste.md", note: "63 dias úteis por trimestre, hipótese de teste; produção usa o calendário ANBIMA"};
const periods: InterestScheduleInput["periods"] = [
  {id: "2026Q3", start: "2026-05-31", end: "2026-08-31", businessDays: 63, anchor: calendar},
  {id: "2026Q4", start: "2026-08-31", end: "2026-11-30", businessDays: 63, anchor: calendar},
  {id: "2027Q1", start: "2026-11-30", end: "2027-02-28", businessDays: 63, anchor: calendar},
  {id: "2027Q2", start: "2027-02-28", end: "2027-05-31", businessDays: 63, anchor: calendar},
];
const curveAnchor = {document: "anbima_ettj_2026-09-04.csv", note: "inflação implícita, vértice 252"};
const cdiAnchor = {document: "bcb_sgs_cdi_diario.json", note: "CDI diário de 0,05166% em 1 a 3 de setembro de 2026, anualizado"};
const flat = (value: string) => Object.fromEntries(periods.map((period) => [period.id, value]));
type Series = InterestScheduleInput["series"][number];
const ipca = (id: string, label: string, principal: string, spread: string, report: string, page: number, doc: string, dates: string[]): Series => ({
  id, label, openingPrincipal: principal, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: spread}, couponDates: dates, amortization: null, indexationTreatment: "capitalized_principal", curveId: "ipca-anbima-2026-09-04",
  anchors: {balance: itr(39, "15"), terms: af(report, page), payments: escritura(doc, "remuneração: pagamento semestral"), amortization: null},
});
/** Camil's six IPCA series (743.955) plus the 13th's DI series and a bank line without terms. Coupon dates semiannual, as the indentures' annexes state. */
const camil = (): InterestScheduleInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  periods,
  curves: [
    {id: "ipca-anbima-2026-09-04", kind: "IPCA", annualRateByPeriod: flat("0.06052"), source: {title: "ANBIMA ETTJ, inflação implícita de 6,052% ao ano no vértice 252, em 04/09/2026", asOf: "2026-09-04", anchor: curveAnchor}},
    {id: "cdi-bcb-2026-09-04", kind: "CDI", annualRateByPeriod: flat("0.1391"), source: {title: "Banco Central, SGS 12, CDI diário de 0,05166% em 1 a 3 de setembro de 2026 (13,91% ao ano)", asOf: "2026-09-04", anchor: cdiAnchor}},
  ],
  series: [
    ipca("deb-13-2", "13ª 2ª série IPCA + 6,3416%", "282357", "0.063416", "af_13a_emissao.pdf", 3, "escritura_13a_emissao.pdf", ["2026-11-13", "2027-05-14"]),
    ipca("deb-13-3", "13ª 3ª série IPCA + 6,5264%", "110321", "0.065264", "af_13a_emissao.pdf", 4, "escritura_13a_emissao.pdf", ["2026-11-13", "2027-05-14"]),
    ipca("deb-14-2", "14ª 2ª série IPCA + 6,8286%", "204059", "0.068286", "af_14a_emissao.pdf", 3, "escritura_14a_emissao.pdf", ["2026-12-15", "2027-06-15"]),
    ipca("deb-14-3", "14ª 3ª série IPCA + 6,9982%", "66024", "0.069982", "af_14a_emissao.pdf", 4, "escritura_14a_emissao.pdf", ["2026-12-15", "2027-06-15"]),
    ipca("deb-15-3", "15ª 3ª série IPCA + 8,20%", "50401", "0.082", "af_15a_emissao.pdf", 4, "escritura_15a_emissao.pdf", ["2026-11-16", "2027-05-17"]),
    ipca("deb-15-4", "15ª 4ª série IPCA + 8,70%", "30793", "0.087", "af_15a_emissao.pdf", 5, "escritura_15a_emissao.pdf", ["2026-11-16", "2027-05-17"]),
    {id: "deb-13-1", label: "13ª 1ª série DI + 0,65%", openingPrincipal: "306038", indexer: "CDI", remuneration: {type: "spread_over_index", spreadPerYear: "0.0065"}, couponDates: ["2026-11-13", "2027-05-14"], amortization: [{date: "2028-11-16", amount: "306038"}], indexationTreatment: null, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_13a_emissao.pdf", 2), payments: escritura("escritura_13a_emissao.pdf", "remuneração: pagamento semestral"), amortization: escritura("escritura_13a_emissao.pdf", "amortização: parcela única no vencimento")}},
    {id: "loan-usd", label: "Capital de giro, USD", openingPrincipal: "867244", indexer: "unknown", remuneration: null, couponDates: null, amortization: null, indexationTreatment: null, curveId: null, anchors: {balance: itr(39, "15"), terms: null, payments: null, amortization: null}},
  ],
  accountingInterestLastPeriod: {value: "170548", periodId: "2026Q2", anchor: itr(48, "22")},
});
const by = (result: ReturnType<typeof buildInterestAndIndexationSchedule>, id: string) => result.schedule_by_series.find((schedule) => schedule.series_id === id)!;

describe("build-interest-and-indexation-schedule executor (v2)", () => {
  it("gold: the six IPCA series open at 743.955, update the nominal by the business-day factor of the curve and pay coupons only in the periods that hold a payment date", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    const ipcaSeries = result.schedule_by_series.filter((schedule) => schedule.indexer === "IPCA");
    expect(ipcaSeries).toHaveLength(6);
    expect(ipcaSeries.reduce((sum, schedule) => sum.plus(schedule.rows[0]!.opening_principal), new Decimal(0)).toFixed()).toBe("743955");
    const first = by(result, "deb-13-2");
    expect(first.rows[0]!.indexation_factor).toBe(businessDayAccrual("0.06052", 63).value);
    expect(first.rows[0]!.indexation_capitalized).toBe(new Decimal("282357").times(businessDayAccrual("0.06052", 63).value).toDecimalPlaces(8).toFixed());
    expect(first.rows[0]!.coupon_factor).toBe(businessDayAccrual("0.063416", 63).value);
    expect(first.rows.map((row) => row.coupon_paid === "0")).toEqual([true, false, true, false]);
    expect(first.rows[1]!.coupon_paid).toBe(new Decimal(first.rows[0]!.coupon_accrued).plus(first.rows[1]!.coupon_accrued).toDecimalPlaces(8).toFixed());
    expect(first.principal_projection).toBe("insufficient_evidence");
    expect(first.rows[0]!.principal_paid).toBeNull();
    expect(result.assumptions.some((assumption) => assumption.includes("dated 2026-09-04"))).toBe(true);
    expect(result.assumptions.some((assumption) => assumption.includes("monthly lag"))).toBe(true);
    expect(result.state).toBe("partial");
  });

  it("gold: the DI series compounds the DI factor with the spread factor, with the cross term", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    const di = by(result, "deb-13-1");
    const fatorDi = new Decimal(businessDayAccrual("0.1391", 63).value);
    const fatorSpread = new Decimal(businessDayAccrual("0.0065", 63).value);
    expect(di.rows[0]!.coupon_factor).toBe(fatorDi.plus(1).times(fatorSpread.plus(1)).minus(1).toDecimalPlaces(8).toFixed());
    expect(new Decimal(di.rows[0]!.coupon_factor).gt(fatorDi.plus(fatorSpread))).toBe(true);
    expect(di.principal_projection).toBe("scheduled");
    expect(di.rows.every((row) => row.principal_paid === "0")).toBe(true);
    expect(di.rows[3]!.closing_principal).toBe("306038");
    const factor = result.trace.calculations.find((calculation) => calculation.id === "financial.di_spread_factor:deb-13-1:2026Q3")!;
    expect(factor.unit).toBe("x");
    expect(factor.operands.businessDays).toBe("63");
  });

  it("aggregates by period and by indexer, names the series it cannot project, and keeps the accounting bridge insufficient", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.schedule_aggregate?.by_indexer.map((entry) => entry.indexer)).toEqual(["CDI", "IPCA"]);
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "IPCA")?.series).toHaveLength(6);
    expect(result.schedule_aggregate?.opening_principal_projected).toBe("1049993");
    expect(result.uncovered_series.map((entry) => entry.series_id)).toEqual(["loan-usd"]);
    expect(result.accounting_bridge?.state).toBe("insufficient_evidence");
    expect(result.accounting_bridge?.projected).toBeNull();
    expect(result.accounting_bridge?.reason).toMatch(/not in the projection/);
  });

  it("hypothetical: a percent-of-DI series compounds p times the daily DI, and a fixed series accrues its rate over business days", () => {
    const base = camil();
    const result = buildInterestAndIndexationSchedule({...base, series: [
      {id: "deb-14-1", label: "14ª 1ª série 104% do DI", openingPrincipal: "438918", indexer: "CDI", remuneration: {type: "percent_of_index", percentOfIndex: "1.04"}, couponDates: ["2026-12-15"], amortization: [{date: "2029-06-15", amount: "438918"}], indexationTreatment: null, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: af("af_14a_emissao.pdf", 2), payments: escritura("escritura_14a_emissao.pdf", "remuneração"), amortization: escritura("escritura_14a_emissao.pdf", "amortização")}},
      {id: "deb-15-2", label: "15ª 2ª série prefixada 14,15%", openingPrincipal: "408703", indexer: "fixed", remuneration: {type: "fixed", ratePerYear: "0.1415"}, couponDates: ["2026-11-16"], amortization: null, indexationTreatment: null, curveId: null, anchors: {balance: itr(39, "15"), terms: af("af_15a_emissao.pdf", 3), payments: escritura("escritura_15a_emissao.pdf", "remuneração"), amortization: null}},
    ]});
    expect(by(result, "deb-14-1").rows[0]!.coupon_factor).toBe(diPercentAccrual("0.1391", "1.04", 63).value);
    expect(by(result, "deb-15-2").rows[0]!.coupon_factor).toBe(businessDayAccrual("0.1415", 63).value);
    expect(by(result, "deb-15-2").curve).toBeNull();
  });

  it("names a series whose curve has the wrong kind, whose terms lack an anchor, or whose payment dates are missing; a missing IPCA treatment is a gap, not a default", () => {
    const base = camil();
    const wrongCurve = buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-2" ? {...series, curveId: "cdi-bcb-2026-09-04"} : series)});
    expect(wrongCurve.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/is a CDI curve/);
    const noTerms = buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-2" ? {...series, anchors: {...series.anchors, terms: null}} : series)});
    expect(noTerms.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/carry no anchor/);
    const noDates = buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-2" ? {...series, couponDates: null} : series)});
    expect(noDates.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/payment dates/);
    const noTreatment = buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-2" ? {...series, indexationTreatment: null} : series)});
    expect(noTreatment.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/treatment of the IPCA update/);
    const uncovered = buildInterestAndIndexationSchedule({...base, curves: [], series: base.series.filter((series) => series.id !== "loan-usd")});
    expect(uncovered.state).toBe("blocked");
    expect(uncovered.block_reasons[0]).toMatch(/no series could be projected/);
  });

  it("refuses a unit outside the catalogue, periods that do not chain from the reference date, and duplicate ids", () => {
    const base = camil();
    expect(() => buildInterestAndIndexationSchedule({...base, unit: "R$ mil" as unknown as "BRL"})).toThrow();
    expect(() => buildInterestAndIndexationSchedule({...base, periods: periods.map((period, index) => index === 1 ? {...period, start: "2026-09-01"} : period)})).toThrow(/does not start where/);
    expect(() => buildInterestAndIndexationSchedule({...base, referenceDate: "2026-06-30"})).toThrow(/first period must start at the reference date/);
    expect(() => buildInterestAndIndexationSchedule({...base, series: [...base.series, base.series[0]!]})).toThrow(/duplicate series/);
    expect(() => buildInterestAndIndexationSchedule({...base, curves: [...base.curves!, base.curves![0]!]})).toThrow(/duplicate curve/);
  });

  it("is consistent under twenty permutations of series, curves, periods, dates, record keys and object keys, with the trace in the fingerprint", () => {
    const first = buildInterestAndIndexationSchedule(camil());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reorderKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = camil();
      const shuffled: InterestScheduleInput = {
        ...base,
        periods: permute(base.periods, seed),
        curves: permute(base.curves!, seed + 1).map((curve) => ({...curve, annualRateByPeriod: reorderKeys(curve.annualRateByPeriod)})),
        series: permute(base.series, seed + 2).map((series) => reorderKeys({...series, couponDates: series.couponDates ? permute(series.couponDates, seed + 3) : null})),
      };
      const again = buildInterestAndIndexationSchedule(seed % 2 ? reorderKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
