import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {allocateContractualSchedule, camilManagementLabel, itrScheduleBuckets, managementSeries, safraYearOf} from "./truth";

const assets = join(import.meta.dirname, "..", "..", "assets", "camil-management");

describe("Camil synthetic management data (case 02)", () => {
  it("ties the contractual schedule to the safra-year buckets of the ITR, series by series", () => {
    const schedule = allocateContractualSchedule();
    for (const bucket of itrScheduleBuckets) expect(schedule.totalByPeriod(bucket.period).toDecimalPlaces(0).toNumber()).toBe(bucket.amount);
    const perSeries = new Map<string, number>();
    for (const row of schedule.rows) perSeries.set(row.id, (perSeries.get(row.id) ?? 0) + row.amount.toNumber());
    for (const series of managementSeries.filter((entry) => entry.maturity !== null)) expect(Math.round(perSeries.get(series.id)!)).toBe(series.balance);
    expect(schedule.partials).toEqual(["deb-15-2: 61.103 amortizados em 2030/31 (parcial, sintético)", "deb-15-1: 119.039 amortizados em 2029/30 (parcial, sintético)"]);
  });

  it("maps calendar dates to safra years (June to May)", () => {
    expect(safraYearOf("2028-10-30")).toBe("2028/29");
    expect(safraYearOf("2029-06-15")).toBe("2029/30");
    expect(safraYearOf("2029-05-31")).toBe("2028/29");
    expect(safraYearOf("2033-11-16")).toBe("after 2031");
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
