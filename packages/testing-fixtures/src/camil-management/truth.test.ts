import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";

import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {allocateContractualSchedule, camilManagementLabel, itrDebentureBalanceCosts, itrScheduleBuckets, itrScheduleDebentureCosts, loanTransactionCosts, managementSeries, safraYearOf} from "./truth";
import {openingContractualPrincipal, openingGrossDebt, projectCamil} from "./projection";

const assets = join(import.meta.dirname, "..", "..", "assets", "camil-management");

describe("Camil synthetic management data (case 02)", () => {
  it("ties the gross contractual schedule to every series and bridges it to the ITR", () => {
    const schedule = allocateContractualSchedule();
    for (const bucket of itrScheduleBuckets) expect(schedule.totalByPeriod(bucket.period).plus(schedule.loanScheduleBridgeByPeriod(bucket.period)).toDecimalPlaces(0).toNumber()).toBe(bucket.amount);
    const perSeries = new Map<string, number>();
    for (const row of schedule.rows) perSeries.set(row.id, (perSeries.get(row.id) ?? 0) + row.amount.toNumber());
    for (const series of managementSeries) expect(Math.round(perSeries.get(series.id)!)).toBe(series.balance);
    expect(schedule.partials).toEqual(["deb-15-2: 61.103 amortizados em 2030/31 (parcial, sintético)", "deb-15-1: 119.039 amortizados em 2029/30 (parcial, sintético)"]);
  });

  it("maps calendar dates to safra years (June to May)", () => {
    expect(safraYearOf("2028-10-30")).toBe("2028/29");
    expect(safraYearOf("2029-06-15")).toBe("2029/30");
    expect(safraYearOf("2029-05-31")).toBe("2028/29");
    expect(safraYearOf("2033-11-16")).toBe("after 2031");
  });

  it("ties opening debt to the ITR and clears inflation-linked bullets at maturity", () => {
    expect(openingGrossDebt.toNumber()).toBe(5_670_186);
    expect(openingContractualPrincipal.toNumber()).toBe(5_742_510);
    expect(itrDebentureBalanceCosts).toBe(-63_225);
    const noRollover = projectCamil({rollover: false}).years;
    const final = noRollover.at(-1)!;
    expect(Math.abs(Number(final.grossDebt))).toBeLessThan(0.001);
    expect(noRollover.some((year) => Number(year.principal) > Number(year.contractualPrincipal))).toBe(true);
  });

  it("bridges gross contractual principal to the mixed-basis public maturity buckets", () => {
    const schedule = allocateContractualSchedule();
    for (const bucket of itrScheduleBuckets) {
      expect(schedule.totalByPeriod(bucket.period).plus(schedule.loanScheduleBridgeByPeriod(bucket.period)).minus(bucket.amount).abs().toNumber()).toBeLessThanOrEqual(1);
    }
    const contractual = schedule.rows.reduce((total, row) => total.plus(row.amount), new Decimal(0));
    const scheduleBridge = itrScheduleBuckets.reduce((total, bucket) => total.plus(schedule.loanScheduleBridgeByPeriod(bucket.period)), new Decimal(0));
    const publicSchedule = itrScheduleBuckets.reduce((total, bucket) => total.plus(bucket.amount), new Decimal(0));
    expect(contractual.toNumber()).toBe(5_742_510);
    expect(scheduleBridge.toNumber()).toBe(-9_100);
    expect(contractual.plus(scheduleBridge).toNumber()).toBe(publicSchedule.toNumber());
    expect(publicSchedule.plus(itrScheduleDebentureCosts).toNumber()).toBe(openingGrossDebt.toNumber());
    expect(contractual.plus(loanTransactionCosts).plus(itrDebentureBalanceCosts).toNumber()).toBe(openingGrossDebt.toNumber());
  });

  it("separates DSCR from liquidity coverage and excludes non-equivalent investments from opening liquidity", () => {
    expect(() => projectCamil({rollover: true})).toThrow("rolloverAnnualRate is required");
    const first = projectCamil({rollover: true, rolloverAnnualRate: "0.1541"}).years[0]!;
    expect(Number(first.openingCash)).toBe(1_430_714);
    expect(first.dscr).not.toBe(first.liquidityCoverage);
    expect(Number(first.cashUses)).toBe(Number(first.cashDebtService) + Number(first.leases) + Number(first.dividends));
  });

  it("charges interest on refinanced principal after each refinancing", () => {
    const years = projectCamil({rollover: true, rolloverAnnualRate: "0.1541"}).years;
    expect(Number(years[0]!.rolloverInterest)).toBe(0);
    expect(Number(years[1]!.rolloverInterest)).toBeCloseTo(Number(years[0]!.principal) * 0.1541, 6);
    expect(Number(years[2]!.rolledDebt)).toBeCloseTo(Number(years[0]!.principal) + Number(years[1]!.principal) + Number(years[2]!.principal), 6);
  });

  it("keeps the generated files identical to the manifest and labeled synthetic", () => {
    const manifest = JSON.parse(readFileSync(join(assets, "manifest.json"), "utf8")) as {label: string; files: Array<{name: string; bytes: number; sha256: string}>};
    expect(manifest.label).toBe(camilManagementLabel);
    expect(manifest.files.map((file) => file.name)).toEqual(["01_Orcamento_2026_2027.xlsx", "02_Plano_Capex.xlsx", "03_Politica_Caixa_Minimo.docx", "04_Cronograma_Contratual_Amortizacoes.xlsx"]);
    for (const file of manifest.files) {
      const bytes = readFileSync(join(assets, file.name));
      expect(bytes.byteLength).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    }
  });
});
