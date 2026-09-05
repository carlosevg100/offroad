import {accrualFactorAtPrecision, businessDayAccrual, diPercentAccrual} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

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
const cdiCurve: NonNullable<InterestScheduleInput["curves"]>[number] = {id: "cdi-bcb-2026-09-04", kind: "CDI", dailyRateByPeriod: flat("0.0005166"), source: {title: "Banco Central, SGS 12, CDI diário de 0,05166% em 1 a 3 de setembro de 2026", asOf: "2026-09-04", anchor: {document: "bcb_sgs_cdi_diario.json", note: "taxa diária publicada; o executor anualiza"}}};
const ipcaCurve: NonNullable<InterestScheduleInput["curves"]>[number] = {id: "ipca-hipotetico", kind: "IPCA", annualRateByPeriod: flat("0.0490"), monthlyRateByMonth: months, source: {title: "variação mensal hipotética de 0,40% (fixture de teste, não é a curva ANBIMA)", asOf: "2026-05-31", anchor: {document: "fixture_hipotetico.md", note: "curva declarada como hipótese"}}};
type Series = InterestScheduleInput["series"][number];
const nominal = (value: string, document: string, note: string): Series["openingPrincipal"] => ({value, basis: "unit_value_x_quantity", anchor: {document, note}});
/** Camil at 31/05/2026. The DI series carry their nominal from the indentures (unit value times quantity); the IPCA balances of the ITR include accrued interest and are not nominals. */
const rounding13 = {indexFactor: {decimals: 8, mode: "round" as const}, spreadFactor: {decimals: 9, mode: "round" as const}, interestFactor: {decimals: 9, mode: "round" as const}, dailyAccumulation: {decimals: 16, mode: "truncate" as const}, amount: {decimals: 8, mode: "truncate" as const}, anchor: esc("escritura_13a_emissao.pdf", "7.7", "fator DI com 8 casas, spread e Fator Juros com 9, acumulação diária truncada em 16, J com 8 sem arredondamento")};
const camil = (): InterestScheduleInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"},
  periods,
  curves: [cdiCurve, ipcaCurve],
  series: [
    {id: "deb-13-1", label: "13ª 1ª série DI + 0,65%", openingPrincipal: nominal("304160", "escritura_13a_emissao.pdf", "304.160 debêntures de R$ 1.000 (o saldo contábil do ITR, 306.038, inclui juros corridos e custos)"), openingAccrued: null, indexer: "CDI", remuneration: {type: "spread_over_index", spreadPerYear: "0.0065"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: [{date: "2028-11-14", amount: "304160", businessDaysFromPeriodStart: 53}], indexationTreatment: null, indexation: null, rounding: rounding13, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: {document: "af_13a_emissao.pdf", page: 2}, payments: esc("escritura_13a_emissao.pdf", "7.8", "pagamento semestral, 14/05 e 14/11"), amortization: esc("escritura_13a_emissao.pdf", "7.7.1", "parcela única em 14/11/2028")}},
    {id: "deb-14-1", label: "14ª 1ª série 104% do DI", openingPrincipal: nominal("411643", "escritura_14a_emissao.pdf", "411.643 debêntures de R$ 1.000 (saldo contábil do ITR: 438.918)"), openingAccrued: null, indexer: "CDI", remuneration: {type: "percent_of_index", percentOfIndex: "1.04"}, couponDates: [{date: "2026-06-12", businessDaysFromPeriodStart: 9}, {date: "2026-12-14", businessDaysFromPeriodStart: 10}], amortization: [{date: "2029-06-14", amount: "411643", businessDaysFromPeriodStart: 10}], indexationTreatment: null, indexation: null, rounding: {...rounding13, anchor: esc("escritura_14a_emissao.pdf", "7.10.1.2")}, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: {document: "af_14a_emissao.pdf", page: 2}, payments: esc("escritura_14a_emissao.pdf", "7.8", "pagamento semestral, 14/06 e 14/12"), amortization: esc("escritura_14a_emissao.pdf", "7.7.1", "parcela única em 14/06/2029")}},
    {id: "deb-15-2", label: "15ª 2ª série prefixada 14,15%", openingPrincipal: nominal("406349", "escritura_15a_emissao.pdf", "406.349 debêntures de R$ 1.000 (saldo contábil do ITR: 408.703)"), openingAccrued: null, indexer: "fixed", remuneration: {type: "fixed", ratePerYear: "0.1415"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: [{date: "2031-11-14", amount: "203174.5", businessDaysFromPeriodStart: 53}, {date: "2032-11-12", amount: "203174.5", businessDaysFromPeriodStart: 52}], indexationTreatment: null, indexation: null, rounding: {...rounding13, anchor: esc("escritura_15a_emissao.pdf", "7.10.1.2.1")}, curveId: null, anchors: {balance: itr(39, "15"), terms: {document: "af_15a_emissao.pdf", page: 3}, payments: esc("escritura_15a_emissao.pdf", "7.8", "pagamento semestral, 14/05 e 14/11"), amortization: esc("escritura_15a_emissao.pdf", "7.7.1", "50% em 14/11/2031 e o saldo em 12/11/2032")}},
    {id: "deb-13-2", label: "13ª 2ª série IPCA + 6,3416%", openingPrincipal: {value: "282357", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.063416"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: null, indexationTreatment: "capitalized_principal", indexation: {anniversaryDay: 14, lagMonths: 2, anniversaryDates: null, proRataByPeriod: null, anchor: esc("escritura_13a_emissao.pdf", "7.9", "atualização incorporada ao Valor Nominal Unitário Atualizado")}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: itr(39, "15"), terms: {document: "af_13a_emissao.pdf", page: 3}, payments: esc("escritura_13a_emissao.pdf", "7.8"), amortization: null}},
    {id: "deb-11-1", label: "11ª 1ª série CDI + 1,55%", openingPrincipal: {value: "151795", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "CDI", remuneration: {type: "spread_over_index", spreadPerYear: "0.0155"}, couponDates: null, amortization: null, indexationTreatment: null, indexation: null, rounding: null, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: {document: "af_11a_emissao.pdf", page: 2}, payments: null, amortization: null}},
    {id: "deb-11-2", label: "11ª 2ª série CDI + 1,55%", openingPrincipal: {value: "505984", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "CDI", remuneration: {type: "spread_over_index", spreadPerYear: "0.0155"}, couponDates: null, amortization: null, indexationTreatment: null, indexation: null, rounding: null, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: {document: "af_11a_emissao.pdf", page: 2}, payments: null, amortization: null}},
    {id: "deb-13-3", label: "13ª 3ª série IPCA + 6,5264%", openingPrincipal: {value: "110321", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.065264"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: null, indexationTreatment: "capitalized_principal", indexation: {anniversaryDay: 14, lagMonths: 2, anniversaryDates: null, proRataByPeriod: null, anchor: esc("escritura_13a_emissao.pdf", "7.9")}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: itr(39, "15"), terms: {document: "af_13a_emissao.pdf", page: 4}, payments: esc("escritura_13a_emissao.pdf", "7.8"), amortization: null}},
    {id: "deb-14-2", label: "14ª 2ª série IPCA + 6,8286%", openingPrincipal: {value: "204059", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.068286"}, couponDates: [{date: "2026-06-12", businessDaysFromPeriodStart: 9}, {date: "2026-12-14", businessDaysFromPeriodStart: 10}], amortization: null, indexationTreatment: "capitalized_principal", indexation: {anniversaryDay: 14, lagMonths: 2, anniversaryDates: null, proRataByPeriod: null, anchor: esc("escritura_14a_emissao.pdf", "7.9")}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: itr(39, "15"), terms: {document: "af_14a_emissao.pdf", page: 3}, payments: esc("escritura_14a_emissao.pdf", "7.8"), amortization: null}},
    {id: "deb-14-3", label: "14ª 3ª série IPCA + 6,9982%", openingPrincipal: {value: "66024", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.069982"}, couponDates: [{date: "2026-06-12", businessDaysFromPeriodStart: 9}, {date: "2026-12-14", businessDaysFromPeriodStart: 10}], amortization: null, indexationTreatment: "capitalized_principal", indexation: {anniversaryDay: 14, lagMonths: 2, anniversaryDates: null, proRataByPeriod: null, anchor: esc("escritura_14a_emissao.pdf", "7.9")}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: itr(39, "15"), terms: {document: "af_14a_emissao.pdf", page: 4}, payments: esc("escritura_14a_emissao.pdf", "7.8"), amortization: null}},
    {id: "deb-15-1", label: "15ª 1ª série 105% do DI", openingPrincipal: {value: "254118", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "CDI", remuneration: {type: "percent_of_index", percentOfIndex: "1.05"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: null, indexationTreatment: null, indexation: null, rounding: null, curveId: "cdi-bcb-2026-09-04", anchors: {balance: itr(39, "15"), terms: {document: "af_15a_emissao.pdf", page: 2}, payments: esc("escritura_15a_emissao.pdf", "7.8"), amortization: null}},
    {id: "deb-15-3", label: "15ª 3ª série IPCA + 8,20%", openingPrincipal: {value: "50401", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.082"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: null, indexationTreatment: "capitalized_principal", indexation: {anniversaryDay: 14, lagMonths: 2, anniversaryDates: null, proRataByPeriod: null, anchor: esc("escritura_15a_emissao.pdf", "7.9")}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: itr(39, "15"), terms: {document: "af_15a_emissao.pdf", page: 4}, payments: esc("escritura_15a_emissao.pdf", "7.8"), amortization: null}},
    {id: "deb-15-4", label: "15ª 4ª série IPCA + 8,70%", openingPrincipal: {value: "30793", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.087"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}, {date: "2027-05-14", businessDaysFromPeriodStart: 52}], amortization: null, indexationTreatment: "capitalized_principal", indexation: {anniversaryDay: 14, lagMonths: 2, anniversaryDates: null, proRataByPeriod: null, anchor: esc("escritura_15a_emissao.pdf", "7.9")}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: itr(39, "15"), terms: {document: "af_15a_emissao.pdf", page: 5}, payments: esc("escritura_15a_emissao.pdf", "7.8"), amortization: null}},
    {id: "loan-usd", label: "Capital de giro, USD", openingPrincipal: {value: "867244", basis: "ledger_balance_including_accrued", anchor: itr(39, "15")}, openingAccrued: null, indexer: "unknown", remuneration: null, couponDates: null, amortization: null, indexationTreatment: null, indexation: null, rounding: null, curveId: null, anchors: {balance: itr(39, "15"), terms: null, payments: null, amortization: null}},
  ],
  ledgerControl: {seriesIds: ["deb-11-1", "deb-11-2", "deb-13-1", "deb-13-2", "deb-13-3", "deb-14-1", "deb-14-2", "deb-14-3", "deb-15-1", "deb-15-2", "deb-15-3", "deb-15-4", "loan-usd", "loan-brl"], grossDebt: "5670186", anchor: itr(40, "nota 15, total")},
  accountingInterestLastPeriod: {value: "170548", periodId: "2026Q2", anchor: itr(48, "22")},
});
const by = (result: ReturnType<typeof buildInterestAndIndexationSchedule>, id: string) => result.schedule_by_series.find((schedule) => schedule.series_id === id)!;
const annualCdi = d("1.0005166").pow(252).minus(1).toDecimalPlaces(8).toFixed();
const r8 = (value: string) => d(value).toDecimalPlaces(8);
const r9 = (value: string) => d(value).toDecimalPlaces(9);

describe("build-interest-and-indexation-schedule executor (v5)", () => {
  it("gold: the daily CDI is annualized to 13,90%, the DI series compounds the DI and spread factors, and each coupon is split at its payment date", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.schema_version).toBe("method.build-interest-and-indexation-schedule.v5");
    expect(annualCdi).toBe("0.13899875");
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.daily_rate_annualized:cdi-bcb-2026-09-04:2026Q3")?.result).toBe(annualCdi);
    const di = by(result, "deb-13-1");
    expect(di.opening_principal.value).toBe("304160");
    expect(di.opening_principal.basis).toBe("unit_value_x_quantity");
    expect(di.first_coupon_complete).toBe(false);
    expect(di.curve?.anchor.document).toBe("bcb_sgs_cdi_diario.json");
    // Q3 has no payment: the whole quarter accrues and is carried.
    const spread = (days: number) => d(accrualFactorAtPrecision({annualRate: "0.0065", businessDays: days, decimals: 9, mode: "round"}).value);
    const f63 = r8(businessDayAccrual(annualCdi, 63).value).plus(1).times(spread(63).plus(1)).minus(1).toDecimalPlaces(9);
    expect(spread(63).toFixed()).toBe("0.001621054");
    const q3 = d("304160").times(f63).toDecimalPlaces(8, Decimal.ROUND_DOWN);
    expect(di.rows![0]!.coupon_factor).toBe(f63.toDecimalPlaces(8).toFixed());
    expect(di.rows![0]!.coupon_paid).toBe("0");
    expect(di.rows![0]!.coupon_carried).toBe(q3.toFixed());
    // Q4 pays on 13/11 after 53 business days: carried plus the accrual to the date; the ten days after the date are carried.
    const f53 = r8(businessDayAccrual(annualCdi, 53).value).plus(1).times(spread(53).plus(1)).minus(1).toDecimalPlaces(9);
    const f10 = r8(businessDayAccrual(annualCdi, 10).value).plus(1).times(spread(10).plus(1)).minus(1).toDecimalPlaces(9);
    const toPayment = d("304160").plus(q3).times(f53).toDecimalPlaces(8, Decimal.ROUND_DOWN);
    expect(di.rows![1]!.coupon_paid).toBe(q3.plus(toPayment).toFixed());
    expect(di.rows![1]!.coupon_carried).toBe(d("304160").times(f10).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(di.rows![1]!.coupon_factor).toBe(f53.plus(1).times(f10.plus(1)).minus(1).toDecimalPlaces(8).toFixed());
    expect(di.rows!.map((row) => row.coupon_paid === "0")).toEqual([true, false, true, false]);
    expect(di.rows!.every((row) => row.principal_paid === "0")).toBe(true);
    expect(di.rows![3]!.closing_principal).toBe("304160");
    expect(di.rounding?.spreadFactor).toEqual({decimals: 9, mode: "round"});
    expect(di.rows![0]!.calendar_anchor).toEqual(calendar);
  });

  it("gold: the 14th's first series pays in the first period (12/06/2026) and in the third (14/12/2026), at 104% of the daily DI", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    const series = by(result, "deb-14-1");
    expect(series.rows!.map((row) => row.coupon_paid !== "0")).toEqual([true, false, true, false]);
    // The daily accumulation is truncated at sixteen decimals and the interest factor rounded at nine, as the 14th writes.
    const f9 = d(accrualFactorAtPrecision({annualRate: annualCdi, businessDays: 9, percentOfIndex: "1.04", decimals: 16, mode: "truncate"}).value).toDecimalPlaces(9);
    expect(d(f9).minus(diPercentAccrual(annualCdi, "1.04", 9).value).abs().lt("0.000000005")).toBe(true);
    expect(series.rows![0]!.coupon_paid).toBe(d("411643").times(f9).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(series.rows![0]!.coupon_carried).toBe(d("411643").times(d(accrualFactorAtPrecision({annualRate: annualCdi, businessDays: 54, percentOfIndex: "1.04", decimals: 16, mode: "truncate"}).value).toDecimalPlaces(9)).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(series.principal_projection).toBe("scheduled");
    expect(by(result, "deb-15-2").rows![1]!.coupon_paid).not.toBe("0");
    expect(by(result, "deb-15-2").principal_projection).toBe("scheduled");
    expect(by(result, "deb-15-2").rows![1]!.principal_paid).toBe("0");
  });

  it("gold: a ledger balance is not a nominal, the omitted series is named, the aggregate never turns a missing schedule into zero, and the bridge stays insufficient", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.uncovered_series.map((entry) => entry.series_id)).toEqual(["deb-11-1", "deb-11-2", "deb-13-2", "deb-13-3", "deb-14-2", "deb-14-3", "deb-15-1", "deb-15-3", "deb-15-4", "loan-brl", "loan-usd"]);
    expect(result.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/ledger balance that includes accrued interest/);
    expect(result.uncovered_series.find((entry) => entry.series_id === "loan-brl")?.reason).toMatch(/received no series for it/);
    expect(result.schedule_by_series).toHaveLength(3);
    expect(result.ledger_coverage?.projected).toBe(d("304160").plus("411643").plus("406349").toFixed());
    expect(result.ledger_coverage?.share).toBe(d("1122152").div("5670186").toDecimalPlaces(8).toFixed());
    expect(result.schedule_aggregate?.principal_projection_complete).toBe(true);
    expect(result.schedule_aggregate?.by_period.every((row) => row.principal_paid === "0")).toBe(true);
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "CDI")?.closing_principal).toBe(d("304160").plus("411643").toFixed());
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "fixed")?.closing_principal).toBe("406349");
    expect(result.accounting_bridge?.state).toBe("insufficient_evidence");
    expect(result.accounting_bridge?.projected).toBeNull();
    expect(result.assumptions.some((assumption) => /deb-13-1: the remuneration accrued at 2026-05-31 is not in the base/.test(assumption))).toBe(true);
    expect(result.assumptions.some((assumption) => /the indenture's rounding/.test(assumption))).toBe(false);
    expect(result.state).toBe("partial");
  });

  it("hypothetical IPCA: the nominal is updated at each anniversary by the lagged month, both treatments are projected when the base is silent, and paid indexation never enters cash interest", () => {
    const base = camil();
    const hypothetical: Series = {id: "h-ipca", label: "hipotética IPCA + 6%", openingPrincipal: {value: "100000", basis: "trustee_report_nominal", anchor: {document: "fixture_hipotetico.md", note: "VNa hipotético"}}, openingAccrued: {value: "500", anchor: {document: "fixture_hipotetico.md", note: "juros corridos hipotéticos"}}, indexer: "IPCA", remuneration: {type: "spread_over_index", spreadPerYear: "0.06"}, couponDates: [{date: "2026-11-13", businessDaysFromPeriodStart: 53}], amortization: [{date: "2027-05-14", amount: "50000", businessDaysFromPeriodStart: 52}], indexationTreatment: null, indexation: {anniversaryDay: 14, lagMonths: 2, anniversaryDates: null, proRataByPeriod: null, anchor: {document: "escritura_13a_emissao.pdf", clause: "7.9"}}, rounding: null, curveId: "ipca-hipotetico", anchors: {balance: {document: "fixture_hipotetico.md"}, terms: {document: "fixture_hipotetico.md"}, payments: {document: "fixture_hipotetico.md"}, amortization: {document: "fixture_hipotetico.md"}}};
    const result = buildInterestAndIndexationSchedule({...base, series: [hypothetical], ledgerControl: null, accountingInterestLastPeriod: null});
    const series = by(result, "h-ipca");
    expect(series.treatment_scenarios?.map((scenario) => scenario.treatment)).toEqual(["capitalized_principal", "cash_paid"]);
    expect(series.first_coupon_complete).toBe(true);
    // Q3 (31/05 to 31/08) holds the anniversaries of 14/06, 14/07 and 14/08: three monthly updates of 0,40% on the lagged months.
    expect(series.treatment_scenarios![0]!.rows[0]!.indexation_factor).toBe(d("1.004").pow(3).minus(1).toDecimalPlaces(8).toFixed());
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
    // Neither scenario is chosen: the series has no main rows and stands outside every aggregate.
    expect(series.rows).toBeNull();
    expect(series.totals).toBeNull();
    expect(result.schedule_aggregate?.by_period.every((row) => row.cash_interest === "0" && row.closing_principal === null)).toBe(true);
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "IPCA")?.closing_principal).toBeNull();
    // The first coupon includes the accrued remuneration the base holds at the reference date.
    expect(d(capitalized.rows[1]!.coupon_paid).gt(d(capitalized.rows[0]!.coupon_accrued).plus(capitalized.rows[1]!.coupon_accrued))).toBe(true);
    // With the business-day counts, the period end carries the pro rata (1 + variation)^(dup/dut) after the last anniversary.
    const settled = {...hypothetical, indexationTreatment: "capitalized_principal" as const};
    const proRata = buildInterestAndIndexationSchedule({...base, series: [{...settled, indexation: {...settled.indexation!, proRataByPeriod: Object.fromEntries(periods.map((period) => [period.id, {dup: 11, dut: 21}]))}}], ledgerControl: null, accountingInterestLastPeriod: null});
    expect(by(proRata, "h-ipca").rows![0]!.indexation_factor).toBe(d("1.004").pow(3).times(d("1.004").pow(d(11).div(21))).minus(1).toDecimalPlaces(8).toFixed());
    // A pro rata whose lagged month is not in the curve is a gap, never the previous month's variation.
    const shortCurve = {...ipcaCurve, monthlyRateByMonth: Object.fromEntries(Object.entries(months).filter(([month]) => month !== "2027-03"))};
    const missing = buildInterestAndIndexationSchedule({...base, curves: [cdiCurve, shortCurve], series: [{...settled, indexation: {...settled.indexation!, proRataByPeriod: Object.fromEntries(periods.map((period) => [period.id, {dup: 11, dut: 21}]))}}], ledgerControl: null, accountingInterestLastPeriod: null});
    expect(missing.uncovered_series.find((entry) => entry.series_id === "h-ipca")?.reason).toMatch(/lacks the monthly variation of 2027-03 .* nothing is filled from another month/);
    // Anniversary dates listed by the base replace the calendar-day rule, and the approximation is no longer declared.
    const listed = buildInterestAndIndexationSchedule({...base, series: [{...settled, indexation: {...settled.indexation!, anniversaryDates: ["2026-06-12", "2026-07-14", "2026-08-14", "2026-09-14", "2026-10-14", "2026-11-13", "2026-12-14", "2027-01-14", "2027-02-12", "2027-03-12", "2027-04-14", "2027-05-14"]}}], ledgerControl: null, accountingInterestLastPeriod: null});
    expect(listed.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.ipca_anniversary_update:h-ipca:2026Q3:")).map((calculation) => calculation.operands.anniversary)).toEqual(["2026-06-12", "2026-07-14", "2026-08-14"]);
    expect(listed.assumptions.some((assumption) => /calendar-day anniversaries are used/.test(assumption))).toBe(false);
    expect(proRata.assumptions.some((assumption) => /calendar-day anniversaries are used/.test(assumption))).toBe(true);
    expect(proRata.trace.calculations.some((calculation) => calculation.id === "financial.ipca_pro_rata:h-ipca:2026Q3" && calculation.operands.dup === "11")).toBe(true);
    expect(proRata.assumptions.some((assumption) => /dup\/dut\) is not projected/.test(assumption))).toBe(false);
    expect(result.assumptions.some((assumption) => /h-ipca: IPCA updates are applied at each anniversary .* \(dup\/dut\) is not projected/.test(assumption))).toBe(true);
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
    expect(() => buildInterestAndIndexationSchedule({...base, unit: "BRL million"})).toThrow(/does not name the unit BRL million/);
    expect(() => buildInterestAndIndexationSchedule({...base, series: base.series.map((series) => series.id === "deb-13-1" ? {...series, couponDates: [{date: "2026-09-10", businessDaysFromPeriodStart: 8}, {date: "2026-11-13", businessDaysFromPeriodStart: 5}]} : series)})).toThrow(/positions inside a period must advance/);
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

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(buildInterestAndIndexationSchedule(camil()) as unknown as Record<string, unknown>, "financial/build-interest-and-indexation-schedule.md")).toEqual([]);
  });

  it("hypothetical: an amortization inside a period reduces the interest base from its own date, and positions must advance", () => {
    const base = camil();
    const early: Series = {...base.series.find((series) => series.id === "deb-13-1")!, id: "h-amort", label: "hipotética com amortização no meio do período", amortization: [{date: "2026-07-15", amount: "104160", businessDaysFromPeriodStart: 31}], anchors: {...base.series[0]!.anchors, amortization: {document: "fixture_hipotetico.md"}}};
    const result = buildInterestAndIndexationSchedule({...base, series: [early], ledgerControl: null, accountingInterestLastPeriod: null});
    const row = by(result, "h-amort").rows![0]!;
    expect(row.principal_paid).toBe("104160");
    expect(row.closing_principal).toBe("200000");
    // The accrual after the amortization runs on 200.000, so the period's carried coupon is below the one on the full nominal.
    const full = by(buildInterestAndIndexationSchedule({...base, series: [{...early, amortization: [{date: "2028-11-14", amount: "304160", businessDaysFromPeriodStart: 53}]}], ledgerControl: null, accountingInterestLastPeriod: null}), "h-amort").rows![0]!;
    expect(d(row.coupon_carried).lt(full.coupon_carried)).toBe(true);
    expect(result.trace.calculations.some((calculation) => calculation.id === "financial.amortization:h-amort:2026Q3:2026-07-15" && calculation.operands.businessDays === "31")).toBe(true);
    expect(() => buildInterestAndIndexationSchedule({...base, series: [{...early, amortization: [{date: "2026-07-15", amount: "1", businessDaysFromPeriodStart: 31}, {date: "2026-07-20", amount: "1", businessDaysFromPeriodStart: 30}]}]})).toThrow(/does not advance inside 2026Q3/);
  });
});
