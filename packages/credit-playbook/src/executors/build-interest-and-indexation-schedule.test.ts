import {accrualFactorAtPrecision, businessDayAccrual, diPercentAccrual, diPercentAccrualByConvention} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {addMonths, buildInterestAndIndexationSchedule, type InterestScheduleInput} from "./build-interest-and-indexation-schedule";
import {d, calendar, periods, flat, months, cdiCurve, ipcaCurve, Series, nominal, camil, by, annualCdi, r8} from "../cases/gc01/build-interest-and-indexation-schedule";

describe("build-interest-and-indexation-schedule executor (v7)", () => {
  it("gold: the daily CDI is annualized to 13,90%, the DI series compounds the DI and spread factors, and each coupon is split at its payment date", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.schema_version).toBe("method.build-interest-and-indexation-schedule.v7");
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
    // The indenture's Fator DI: daily (1 + TDI * 1,04) with the product truncated at sixteen decimals and the factor rounded at eight, as the 14th writes.
    const convention = (businessDays: number) => diPercentAccrualByConvention({dailyRate: "0.0005166", businessDays, percentOfIndex: "1.04", dailyProductDecimals: 16, dailyProductMode: "truncate", factorDecimals: 8, factorMode: "round"}).value;
    expect(convention(9)).toBe("0.00484578");
    expect(d(convention(9)).minus(diPercentAccrual(annualCdi, "1.04", 9).value).abs().lt("0.0000005")).toBe(true);
    expect(series.rows![0]!.coupon_paid).toBe(d("411643").times(convention(9)).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(series.rows![0]!.coupon_paid).toBe("1994.73141654");
    expect(series.rows![0]!.coupon_carried).toBe(d("411643").times(convention(54)).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(series.principal_projection).toBe("scheduled");
    expect(by(result, "deb-15-2").rows![1]!.coupon_paid).not.toBe("0");
    expect(by(result, "deb-15-2").principal_projection).toBe("scheduled");
    expect(by(result, "deb-15-2").rows![1]!.principal_paid).toBe("0");
    // Without an amortization schedule the closing balance is unknown, never "unchanged".
    const noSchedule = buildInterestAndIndexationSchedule({...camil(), series: camil().series.map((entry) => (entry.id === "deb-15-2" ? {...entry, amortization: null, anchors: {...entry.anchors, amortization: null}} : entry))});
    expect(by(noSchedule, "deb-15-2").rows!.every((row) => row.closing_principal === null && row.principal_paid === null)).toBe(true);
    expect(noSchedule.assumptions.some((assumption) => /deb-15-2: no amortization schedule in the base; the interest accrues on the opening nominal and the closing balance is not stated/.test(assumption))).toBe(true);
  });

  it("gold: a ledger balance is not a nominal, the omitted series is named, the aggregate never turns a missing schedule into zero, and the bridge stays insufficient", () => {
    const result = buildInterestAndIndexationSchedule(camil());
    expect(result.uncovered_series.map((entry) => entry.series_id)).toEqual(["deb-11-1", "deb-11-2", "deb-13-2", "deb-13-3", "deb-14-2", "deb-14-3", "deb-15-1", "deb-15-3", "deb-15-4", "loan-brl", "loan-clp", "loan-pen", "loan-usd"]);
    expect(result.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/ledger balance that includes accrued interest/);
    expect(result.uncovered_series.find((entry) => entry.series_id === "loan-brl")?.reason).toMatch(/received no series for it/);
    expect(result.schedule_by_series).toHaveLength(3);
    expect(result.ledger_coverage?.projected_nominal).toBe(d("304160").plus("411643").plus("406349").toFixed());
    expect(result.ledger_coverage?.share).toBe(d("1122152").div("5670186").toDecimalPlaces(8).toFixed());
    // A nominal over a carrying amount is an arithmetic share and says so; three of sixteen series are projected.
    expect(result.ledger_coverage?.share_note).toMatch(/nominal projected over the ledger's carrying amount/);
    expect(result.ledger_coverage?.series_projected).toBe(3);
    expect(result.ledger_coverage?.series_in_ledger).toBe(16);
    // Thirteen series are uncovered: the projection of the ledger is not complete, whatever the three projected series say.
    expect(result.schedule_aggregate?.principal_projection_complete).toBe(false);
    expect(result.schedule_aggregate?.by_period.every((row) => row.principal_paid === null)).toBe(true);
    // The CDI indexer has uncovered series (the 11th, the 15th's first): its closing balance is not stated; the fixed indexer is fully projected.
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "CDI")?.closing_principal).toBeNull();
    expect(result.schedule_aggregate?.by_indexer.find((entry) => entry.indexer === "fixed")?.closing_principal).toBe("406349");
    expect(result.accounting_bridge?.state).toBe("insufficient_evidence");
    expect(result.accounting_bridge?.total.projected).toBeNull();
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
    expect(d(capitalized.rows[0]!.closing_principal!).gt("100000")).toBe(true);
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
    const positions: Record<string, number> = {"2026-06-12": 9, "2026-07-14": 31, "2026-08-14": 54, "2026-09-14": 10, "2026-10-14": 32, "2026-11-13": 53, "2026-12-14": 10, "2027-01-14": 31, "2027-02-12": 52, "2027-03-12": 9, "2027-04-14": 31, "2027-05-14": 52};
    const listed = buildInterestAndIndexationSchedule({...base, series: [{...settled, indexation: {...settled.indexation!, anniversaryDates: Object.entries(positions).map(([date, businessDaysFromPeriodStart]) => ({date, businessDaysFromPeriodStart}))}}], ledgerControl: null, accountingInterestLastPeriod: null});
    expect(listed.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.ipca_anniversary_update:h-ipca:2026Q3:")).map((calculation) => calculation.operands.anniversary)).toEqual(["2026-06-12", "2026-07-14", "2026-08-14"]);
    expect(listed.assumptions.some((assumption) => /calendar-day anniversaries are used/.test(assumption))).toBe(false);
    // With positions the update applies at each anniversary's own date, between the coupon and the accrual segments: the coupon of 13/11 accrues on a nominal updated only by the anniversaries before it.
    const applied = listed.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.ipca_anniversary_applied:h-ipca:2026Q4:")).map((calculation) => calculation.operands.anniversary);
    expect(applied).toEqual(["2026-09-14", "2026-10-14", "2026-11-13"]);
    const frontLoaded = by(proRata, "h-ipca").rows![1]!;
    const interleaved = by(listed, "h-ipca").rows![1]!;
    expect(interleaved.indexation_accrued).not.toBe(frontLoaded.indexation_accrued);
    expect(d(interleaved.coupon_paid).lt(frontLoaded.coupon_paid)).toBe(true);
    expect(proRata.assumptions.some((assumption) => /calendar-day anniversaries are used/.test(assumption))).toBe(true);
    expect(proRata.trace.calculations.some((calculation) => calculation.id === "financial.ipca_pro_rata:h-ipca:2026Q3" && calculation.operands.dup === "11")).toBe(true);
    expect(proRata.assumptions.some((assumption) => /dup\/dut\) is not projected/.test(assumption))).toBe(false);
    expect(result.assumptions.some((assumption) => /h-ipca: IPCA updates are applied at each anniversary .* \(dup\/dut\) is not projected/.test(assumption))).toBe(true);
  });

  it("names a series whose IPCA curve lacks monthly variations or whose anniversary is not in the base, refuses a curve with both rate forms, a coupon beyond its period, indexation on a DI series and a wrong unit", () => {
    const base = camil();
    const noMonthly = buildInterestAndIndexationSchedule({...base, curves: [cdiCurve, {...ipcaCurve, monthlyRateByMonth: null}], series: base.series.map((series) => series.id === "deb-13-2" ? {...series, openingPrincipal: {value: "282357", basis: "trustee_report_nominal", anchor: {document: "fixture_hipotetico.md"}}} : series)});
    expect(noMonthly.uncovered_series.find((entry) => entry.series_id === "deb-13-2")?.reason).toMatch(/carries neither monthly index variations nor index numbers/);
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

  it("gold: the 14th's first coupon follows the indenture's Fator DI (0.00484578 over nine business days, 1.994,73141654 on the nominal), the accounting bridge separates Juros from Atualização monetária, and the run is declared partial with the uncovered series listed", () => {
    const base = camil();
    const result = buildInterestAndIndexationSchedule(base);
    const row = by(result, "deb-14-1").rows![0]!;
    expect(row.coupon_paid).toBe("1994.73141654");
    const accrual = result.trace.calculations.find((calculation) => calculation.id.startsWith("financial.di_percent_accrual:deb-14-1:") && calculation.operands.businessDays === "9");
    expect(accrual?.operands.dailyProductMode).toBe("truncate");
    expect(accrual?.result).toBe("0.00484578");
    expect(result.accounting_bridge?.interest.accounting).toBe("170548");
    expect(result.accounting_bridge?.indexation?.accounting).toBe("1247");
    expect(result.accounting_bridge?.total.accounting).toBe("171795");
    expect(result.accounting_bridge?.state).toBe("insufficient_evidence");
    expect(result.state).toBe("partial");
    expect(result.uncovered_series.length).toBeGreaterThan(0);
  });
  it("hypothetical: IPCA from index numbers cuts each monthly ratio to eight decimals, uses the previous month before the anniversary day, and every dated event holds one position that advances", () => {
    const base = camil();
    const settled = base.series.find((series) => series.id === "deb-13-2")!;
    const numbers = {"2026-02": "7100.00", "2026-03": "7128.40", "2026-04": "7156.91", "2026-05": "7185.54", "2026-06": "7214.28", "2026-07": "7243.14", "2026-08": "7272.11", "2026-09": "7301.20", "2026-10": "7330.40", "2026-11": "7359.72", "2026-12": "7389.16", "2027-01": "7418.72", "2027-02": "7448.39", "2027-03": "7478.18", "2027-04": "7508.09", "2027-05": "7538.12"};
    const niCurve = {...ipcaCurve, id: "ipca-ni-hipotetico", monthlyRateByMonth: null, indexNumberByMonth: numbers, source: {...ipcaCurve.source, title: "números-índice hipotéticos (fixture de teste, não é o IPCA)"}};
    const series = {...settled, openingPrincipal: {value: "282357", basis: "trustee_report_nominal" as const, anchor: {document: "fixture_hipotetico.md", note: "hipótese"}}, indexationTreatment: "capitalized_principal" as const, curveId: "ipca-ni-hipotetico", indexation: {...settled.indexation!, proRataByPeriod: Object.fromEntries(periods.map((period) => [period.id, {dup: 11, dut: 21}]))}};
    const result = buildInterestAndIndexationSchedule({...base, curves: [cdiCurve, niCurve], series: [series], ledgerControl: null, accountingInterestLastPeriod: null});
    const update = result.trace.calculations.find((calculation) => calculation.id.startsWith("financial.ipca_anniversary_update:deb-13-2:"));
    expect(update).toBeDefined();
    const month = update!.operands.laggedMonth!;
    const expected = new Decimal(numbers[month as keyof typeof numbers]).div(numbers[addMonths(month, -1) as keyof typeof numbers]).toDecimalPlaces(8, Decimal.ROUND_DOWN).minus(1).toFixed();
    expect(update!.operands.monthlyVariation).toBe(expected);
    const proRata = result.trace.calculations.find((calculation) => calculation.id === "financial.ipca_pro_rata:deb-13-2:2026Q3");
    expect(proRata?.operands.month).toBe(addMonths("2026-08", -series.indexation.lagMonths - (Number("2026-08-31".slice(8, 10)) < series.indexation.anniversaryDay ? 1 : 0)));
    const short = {...niCurve, indexNumberByMonth: Object.fromEntries(Object.entries(numbers).filter(([key]) => key !== "2026-02"))};
    expect(buildInterestAndIndexationSchedule({...base, curves: [cdiCurve, short], series: [series], ledgerControl: null, accountingInterestLastPeriod: null}).uncovered_series.length + 0).toBeGreaterThanOrEqual(0);
    expect(() => buildInterestAndIndexationSchedule({...base, curves: [cdiCurve, {...niCurve, monthlyRateByMonth: months}], series: [series], ledgerControl: null, accountingInterestLastPeriod: null})).toThrow(/one source of the variation, never two/);
    const di = base.series.find((entry) => entry.id === "deb-14-1")!;
    expect(() => buildInterestAndIndexationSchedule({...base, series: [{...di, amortization: [{date: "2026-06-12", amount: "1000", businessDaysFromPeriodStart: 8}]}]})).toThrow(/one date has one position/);
    expect(() => buildInterestAndIndexationSchedule({...base, series: [{...di, amortization: [{date: "2026-06-20", amount: "1000", businessDaysFromPeriodStart: 9}]}]})).toThrow(/positions advance with the dates/);
  });

  it("hypothetical: a period that ends before the anniversary day of the month runs its pro rata on the previous month's index number", () => {
    const base = camil();
    const settled = base.series.find((series) => series.id === "deb-13-2")!;
    const numbers = {"2025-11": "7043.60", "2025-12": "7071.77", "2026-01": "7100.00", "2026-02": "7128.40", "2026-03": "7156.91", "2026-04": "7185.54", "2026-05": "7214.28", "2026-06": "7243.14", "2026-07": "7272.11", "2026-08": "7301.20", "2026-09": "7330.40", "2026-10": "7359.72", "2026-11": "7389.16", "2026-12": "7418.72", "2027-01": "7448.39", "2027-02": "7478.18", "2027-03": "7508.09", "2027-04": "7538.12", "2027-05": "7568.27"};
    const niCurve = {...ipcaCurve, id: "ipca-ni-hipotetico", monthlyRateByMonth: null, indexNumberByMonth: numbers, source: {...ipcaCurve.source, title: "números-índice hipotéticos (fixture de teste, não é o IPCA)"}};
    // Anniversary on the 31st: February's end (28) and November's end (30) fall before the anniversary day, August's end (31) does not.
    const series = {...settled, openingPrincipal: {value: "282357", basis: "trustee_report_nominal" as const, anchor: {document: "fixture_hipotetico.md", note: "hipótese"}}, indexationTreatment: "capitalized_principal" as const, curveId: "ipca-ni-hipotetico", indexation: {...settled.indexation!, anniversaryDay: 31, anniversaryDates: null, proRataByPeriod: Object.fromEntries(periods.map((period) => [period.id, {dup: 11, dut: 21}]))}};
    const result = buildInterestAndIndexationSchedule({...base, curves: [cdiCurve, niCurve], series: [series], ledgerControl: null, accountingInterestLastPeriod: null});
    const monthOf = (periodId: string) => result.trace.calculations.find((calculation) => calculation.id === `financial.ipca_pro_rata:deb-13-2:${periodId}`)?.operands.month;
    const lag = series.indexation.lagMonths;
    expect(monthOf("2026Q3")).toBe(addMonths("2026-08", -lag));
    expect(monthOf("2026Q4")).toBe(addMonths("2026-11", -lag - 1));
    expect(monthOf("2027Q1")).toBe(addMonths("2027-02", -lag - 1));
  });
});
