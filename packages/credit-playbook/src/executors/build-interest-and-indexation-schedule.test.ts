import {businessDayAccrual, diPercentAccrual} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {buildInterestAndIndexationSchedule, type InterestScheduleInput} from "./build-interest-and-indexation-schedule";

const d = (value: Decimal.Value) => new Decimal(value);
const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const esc = (document: string, clause: string, note?: string) => ({document, clause, ...(note ? {note} : {})});
/** A synthetic 252-day calendar for the test: 63 business days per quarter, declared as such; production reads the ANBIMA calendar. */
const calendar = {document: "calendario_sintetico_teste.md", note: "63 dias úteis por trimestre e posições declaradas das datas de pagamento; hipótese de teste, produção usa o calendário ANBIMA"};
const periods: InterestScheduleInput["periods"] = [
  {id: "2026Q3", start: "2026-05-31", end: "2026-08-31", businessDays: 63, anchor: calendar},
  {id: "2026Q4", start: "2026-08-31", end: "2026-11-30", businessDays: 63, anchor: calendar},
  {id: "2027Q1", start: "2026-11-30", end: "2027-02-28", businessDays: 63, anchor: calendar},
  {id: "2027Q2", start: "2027-02-28", end: "2027-05-31", businessDays: 63, anchor: calendar},
];
const flat = (value: string) => Object.fromEntries(periods.map((period) => [period.id, value]));
const months = Object.fromEntries(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"].map((month) => [month, "0.004"]));
const cdiCurve: InterestScheduleInput["curves"][number] = {id: "cdi-bcb-2026-09-04", kind: "CDI", dailyRateByPeriod: flat("0.0005166"), source: {title: "Banco Central, SGS 12, CDI diário de 0,05166% em 1 a 3 de setembro de 2026", asOf: "2026-09-04", anchor: {document: "bcb_sgs_cdi_diario.json", note: "taxa diária publicada; o executor anualiza"}}};
const ipcaCurve: InterestScheduleInput["curves"][number] = {id: "ipca-hipotetico", kind: "IPCA", annualRateByPeriod: flat("0.0490"), monthlyRateByMonth: months, source: {title: "variação mensal hipotética de 0,40% (fixture de teste, não é a curva ANBIMA)", asOf: "2026-05-31", anchor: {document: "fixture_hipotetico.md", note: "curva declarada como hipótese"}}};
type Series = InterestScheduleInput["series"][number];
const nominal = (value: string, document: string, note: string): Series["openingPrincipal"] => ({value, basis: "unit_value_x_quantity", anchor: {document, note}});
/** Camil at 31/05/2026. The DI series carry their nominal from the indentures (unit value times quantity); the IPCA balances of the ITR include accrued interest and are not nominals. */
const camil = (): InterestScheduleInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  periods,
  curves: [cdiCurve, ipcaCurve],
  series: [
    {id: "deb-13-1", label: "13ª 1ª série DI + 0,65%", openingPrincipal: nominal("306038", "escritura_13a_emissao.pdf", "306.038 debêntures de R$ 1.000, sem amortização até o vencimento"), openingAccrued: null, indexer: "CDI", remuneration: {type: "spread_over_index", spreadPerYear: "0.0065"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: [{date: "2028-11-14", amount: "306038"}], indexationTreatment: null, indexation: null, rounding: {factorDecimals: 8, factorMode: "round", amountDecimals: 8, amountMode: "truncate", anchor: esc("escritura_13a_emissao.pdf", "7.7", "fatores com 8 casas, J com 8 casas sem arredondamento")}, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: {document: "af_13a_emissao.pdf", page: 2}, payments: esc("escritura_13a_emissao.pdf", "7.8", "pagamento semestral, 14/05 e 14/11"), amortization: esc("escritura_13a_emissao.pdf", "7.7.1", "parcela única em 14/11/2028")}},
    {id: "deb-14-1", label: "14ª 1ª série 104% do DI", openingPrincipal: nominal("438918", "escritura_14a_emissao.pdf", "438.918 debêntures de R$ 1.000"), openingAccrued: null, indexer: "CDI", remuneration: {type: "percent_of_index", percentOfIndex: "1.04"}, couponDates: [{date: "2026-06-12", businessDaysFromPeriodStart: 9}, {date: "2026-12-14", businessDaysFromPeriodStart: 10}], amortization: [{date: "2029-06-14", amount: "438918"}], indexationTreatment: null, indexation: null, rounding: null, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: {document: "af_14a_emissao.pdf", page: 2}, payments: esc("escritura_14a_emissao.pdf", "7.8", "pagamento semestral, 14/06 e 14/12"), amortization: esc("escritura_14a_emissao.pdf", "7.7.1", "parcela única em 14/06/2029")}},
    {id: "deb-15-2", label: "15ª 2ª série prefixada 14,15%", openingPrincipal: nominal("408703", "escritura_15a_emissao.pdf", "408.703 debêntures de R$ 1.000"), openingAccrued: null, indexer: "fixed", remuneration: {type: "fixed", ratePerYear: "0.1415"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: null, indexationTreatment: null, indexation: null, rounding: null, curveId: null, anchors: {balance: itr(39, "15"), terms: {document: "af_15a_emissao.pdf", page: 3}, payments: esc("escritura_15a_emissao.pdf", "7.8", "pagamento semestral, 14/05 e 14/11"), amortization: null}},
    {id: "deb-13-2", label: "13ª 2ª série IPCA + 6,3416%", openingPrincipal: {value: "282357", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.063416"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: null, indexationTreatment: "capitalized_principal", indexation: {anniversaryDay: 14, lagMonths: 2, anchor: esc("escritura_13a_emissao.pdf", "7.9")}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: itr(39, "15"), terms: {document: "af_13a_emissao.pdf", page: 3}, payments: esc("escritura_13a_emissao.pdf", "7.8"), amortization: null}},
    {id: "loan-usd", label: "Capital de giro, USD", openingPrincipal: {value: "867244", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "unknown", remuneration: null, couponDates: null, amortization: null, indexationTreatment: null, indexation: null, rounding: null, curveId: null, anchors: {balance: itr(39, "15"), terms: null, payments: null, amortization: null}},
  ],
  ledgerControl: {seriesIds: ["deb-11", "deb-13-1", "deb-13-2", "deb-14-1", "deb-15-2", "loan-usd"], grossDebt: "5670186", anchor: itr(40, "nota 15, total")},
  accountingInterestLastPeriod: {value: "170548", periodId: "2026Q2", anchor: itr(48, "22")},
});
const by = (result: ReturnType<typeof buildInterestAndIndexationSchedule>, id: string) => result.schedule_by_series.find((schedule) => schedule.series_id === id)!;
const annualCdi = d("1.0005166").pow(252).minus(1).toDecimalPlaces(8).toFixed();
const r8 = (value: string) => d(value).toDecimalPlaces(8);

describe("build-interest-and-indexation-schedule executor (v3)", () => {
  it("gold: the daily CDI is annualized to 13,90%, the DI series compounds the DI and spread factors, and each coupon is split at its payment date", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.schema_version).toBe("method.build-interest-and-indexation-schedule.v3");
    expect(annualCdi).toBe("0.13899875");
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.daily_rate_annualized:cdi-bcb-2026-09-04:2026Q3")?.result).toBe(annualCdi);
    const di = by(result, "deb-13-1");
    expect(di.opening_principal).toEqual({value: "306038", basis: "unit_value_x_quantity", anchor: {document: "escritura_13a_emissao.pdf", note: "306.038 debêntures de R$ 1.000, sem amortização até o vencimento"}});
    expect(di.first_coupon_complete).toBe(false);
    expect(di.curve?.anchor.document).toBe("bcb_sgs_cdi_diario.json");
    // Q3 has no payment: the whole quarter accrues and is carried.
    const f63 = r8(businessDayAccrual(annualCdi, 63).value).plus(1).times(r8(businessDayAccrual("0.0065", 63).value).plus(1)).minus(1).toDecimalPlaces(8);
    const q3 = d("306038").times(f63).toDecimalPlaces(8, Decimal.ROUND_DOWN);
    expect(di.rows[0]!.coupon_factor).toBe(f63.toFixed());
    expect(di.rows[0]!.coupon_paid).toBe("0");
    expect(di.rows[0]!.coupon_carried).toBe(q3.toFixed());
    // Q4 pays on 13/11 after 53 business days: carried plus the accrual to the date; the ten days after the date are carried.
    const f53 = r8(businessDayAccrual(annualCdi, 53).value).plus(1).times(r8(businessDayAccrual("0.0065", 53).value).plus(1)).minus(1).toDecimalPlaces(8);
    const f10 = r8(businessDayAccrual(annualCdi, 10).value).plus(1).times(r8(businessDayAccrual("0.0065", 10).value).plus(1)).minus(1).toDecimalPlaces(8);
    const toPayment = d("306038").plus(q3).times(f53).toDecimalPlaces(8, Decimal.ROUND_DOWN);
    expect(di.rows[1]!.coupon_paid).toBe(q3.plus(toPayment).toFixed());
    expect(di.rows[1]!.coupon_carried).toBe(d("306038").times(f10).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(di.rows[1]!.coupon_factor).toBe(f53.plus(1).times(f10.plus(1)).minus(1).toDecimalPlaces(8).toFixed());
    expect(di.rows.map((row) => row.coupon_paid === "0")).toEqual([true, false, true, false]);
    expect(di.rows.every((row) => row.principal_paid === "0")).toBe(true);
    expect(di.rows[3]!.closing_principal).toBe("306038");
    expect(di.rows[0]!.calendar_anchor).toEqual(calendar);
  });

  it("gold: the 14th's first series pays in the first period (12/06/2026) and in the third (14/12/2026), at 104% of the daily DI", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    const series = by(result, "deb-14-1");
    expect(series.rows.map((row) => row.coupon_paid !== "0")).toEqual([true, false, true, false]);
    const f9 = r8(diPercentAccrual(annualCdi, "1.04", 9).value);
    expect(series.rows[0]!.coupon_paid).toBe(d("438918").times(f9).toDecimalPlaces(8).toFixed());
    expect(series.rows[0]!.coupon_carried).toBe(d("438918").times(r8(diPercentAccrual(annualCdi, "1.04", 54).value)).toDecimalPlaces(8).toFixed());
    expect(series.principal_projection).toBe("scheduled");
    expect(by(result, "deb-15-2").rows[1]!.coupon_paid).not.toBe("0");
    expect(by(result, "deb-15-2").principal_projection).toBe("insufficient_evidence");
    expect(by(result, "deb-15-2").rows[1]!.principal_paid).toBeNull();
  });

  it("gold: a ledger balance is not a nominal, the omitted series is named, the aggregate never turns a missing schedule into zero, and the bridge stays insufficient", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.uncovered_series.map((entry) => entry.series_id)).toEqual(["deb-11", "deb-13-2", "loan-usd"]);
    expect(result.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/ledger balance that includes accrued interest/);
    expect(result.uncovered_series.find((entry) => entry.series_id === "deb-11")?.reason).toMatch(/received no series for it/);
    expect(result.ledger_coverage?.projected).toBe(d("306038").plus("438918").plus("408703").toFixed());
    expect(result.ledger_coverage?.share).toBe(d("1153659").div("5670186").toDecimalPlaces(8).toFixed());
    expect(result.schedule_aggregate?.principal_projection_complete).toBe(false);
    expect(result.schedule_aggregate?.by_period.every((row) => row.principal_paid === null && row.closing_principal === null)).toBe(true);
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "CDI")?.closing_principal).toBe(d("306038").plus("438918").toFixed());
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "fixed")?.closing_principal).toBeNull();
    expect(result.accounting_bridge?.state).toBe("insufficient_evidence");
    expect(result.accounting_bridge?.projected).toBeNull();
    expect(result.assumptions.some((assumption) => /deb-13-1: the remuneration accrued at 2026-05-31 is not in the base/.test(assumption))).toBe(true);
    expect(result.assumptions.some((assumption) => /deb-14-1: the indenture's rounding/.test(assumption))).toBe(true);
    expect(result.state).toBe("partial");
  });

  it("hypothetical IPCA: the nominal is updated at each anniversary by the lagged month, both treatments are projected when the base is silent, and paid indexation never enters cash interest", () => {
    const base = camil();
    const hypothetical: Series = {id: "h-ipca", label: "hipotética IPCA + 6%", openingPrincipal: {value: "100000", basis: "trustee_report_nominal", anchor: {document: "fixture_hipotetico.md", note: "VNa hipotético"}}, openingAccrued: {value: "500", anchor: {document: "fixture_hipotetico.md", note: "juros corridos hipotéticos"}}, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.06"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}], amortization: [{date: "2027-05-14", amount: "50000"}], indexationTreatment: null, indexation: {anniversaryDay: 14, lagMonths: 2, anchor: {document: "escritura_13a_emissao.pdf", clause: "7.9"}}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: {document: "fixture_hipotetico.md"}, terms: {document: "fixture_hipotetico.md"}, payments: {document: "fixture_hipotetico.md"}, amortization: {document: "fixture_hipotetico.md"}}};
    const result = buildInterestAndIndexationSchedule({...base, series: [hypothetical], ledgerControl: null, accountingInterestLastPeriod: null});
    const series = by(result, "h-ipca");
    expect(series.treatment_scenarios?.map((scenario) => scenario.treatment)).toEqual(["capitalized_principal", "cash_paid"]);
    expect(series.first_coupon_complete).toBe(true);
    // Q3 (31/05 to 31/08) holds the anniversaries of 14/06, 14/07 and 14/08: three monthly updates of 0,40% on the lagged months.
    expect(series.rows[0]!.indexation_factor).toBe(d("1.004").pow(3).minus(1).toDecimalPlaces(8).toFixed());
    expect(result.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.ipca_anniversary_update:h-ipca:2026Q3:")).map((calculation) => calculation.operands.laggedMonth)).toEqual(["2026-04", "2026-05", "2026-06"]);
    const capitalized = series.treatment_scenarios![0]!;
    const paid = series.treatment_scenarios![1]!;
    expect(d(capitalized.rows[0]!.closing_principal).gt("100000")).toBe(true);
    expect(paid.rows[0]!.closing_principal).toBe("100000");
    expect(d(paid.rows[0]!.indexation_paid).gt(0)).toBe(true);
    expect(paid.rows[0]!.coupon_paid).toBe("0");
    expect(paid.totals.cash_indexation).toBe(paid.rows.reduce((sum, row) => sum.plus(row.indexation_paid), d(0)).toFixed());
    expect(capitalized.totals.cash_indexation).toBe("0");
    expect(capitalized.rows[3]!.principal_paid).toBe("50000");
    expect(result.schedule_aggregate?.treatment_scenarios_pending).toEqual(["h-ipca"]);
    expect(result.assumptions.some((assumption) => /both treatments are projected/.test(assumption))).toBe(true);
    // The first coupon includes the accrued remuneration the base holds at the reference date.
    expect(d(capitalized.rows[1]!.coupon_paid).gt(d(capitalized.rows[0]!.coupon_accrued).plus(capitalized.rows[1]!.coupon_accrued))).toBe(true);
  });

  it("names a series whose IPCA curve lacks monthly variations or whose anniversary is not in the base, refuses a curve with both rate forms, a coupon beyond its period, indexation on a DI series and a wrong unit", () => {
    const base = camil();
    const noMonthly = buildInterestAndIndexationSchedule({...base, curves: [cdiCurve, {...ipcaCurve, monthlyRateByMonth: null}], series: base.series.map((series) => series.id === "deb-13-2" ? {...series, openingPrincipal: {value: "282357", basis: "trustee_report_nominal", anchor: {document: "fixture_hipotetico.md"}}} : series)});
    expect(noMonthly.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/carries no monthly index variations/);
    const noAnniversary = buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-2" ? {...series, openingPrincipal: {value: "282357", basis: "trustee_report_nominal", anchor: {document: "fixture_hipotetico.md"}}, indexation: null} : series)});
    expect(noAnniversary.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/anniversary day and the index lag/);
    expect(() => buildInterestAndIndexationSchedule({...base, curves: [{...cdiCurve, annualRateByPeriod: flat("0.139")}, ipcaCurve]})).toThrow(/exactly one of/);
    expect(() => buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-1" ? {...series, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 70}]} : series)})).toThrow(/claims 70 business days/);
    expect(() => buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-1" ? {...series, indexationTreatment: "cash_paid" as const} : series)})).toThrow(/belong to IPCA series only/);
    expect(() => buildInterestAndIndexationSchedule({...base, unit: "BRL thousands" as unknown as "BRL"})).toThrow();
    expect(() => buildInterestAndIndexationSchedule({...base, series: [...base.series, base.series[0]!]})).toThrow(/duplicate series/);
    const nothing = buildInterestAndIndexationSchedule({...base, curves: [], series: base.series.filter((series) => series.indexer === "CDI")});
    expect(nothing.state).toBe("blocked");
  });

  it("is consistent under twenty permutations of series, curves, periods, coupon dates, record keys and object keys", () => {
    const first = buildInterestAndIndexationSchedule(camil());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = camil();
      const shuffled: InterestScheduleInput = {
        ...base,
        periods: permute(base.periods, seed),
        curves: permute(base.curves!, seed + 1),
        series: permute(base.series, seed + 2).map((series) => ({...series, couponDates: series.couponDates ? permute(series.couponDates, seed + 3) : null})),
        ledgerControl: {...base.ledgerControl!, seriesIds: permute(base.ledgerControl!.seriesIds, seed + 4)},
      };
      const again = buildInterestAndIndexationSchedule(seed % 2 ? reversedKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
