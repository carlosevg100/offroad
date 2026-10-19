import {describe, expect, it} from "vitest";
import {brazilianBusinessDays, brazilianNationalHolidays, gregorianEaster} from "./business-day-calendar";

describe("national business-day calendar", () => {
  it("computes Gregorian Easter (2027 on 28 March, the date the C02 oracle got wrong)", () => {
    expect([2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032].map(gregorianEaster)).toEqual([
      "2024-03-31", "2025-04-20", "2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01", "2030-04-21", "2031-04-13", "2032-03-28"]);
  });
  it("lists the national banking holidays with Carnival, Good Friday and Corpus Christi", () => {
    expect(brazilianNationalHolidays(2027)).toEqual(["2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27",
      "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25"]);
    expect(brazilianNationalHolidays(2023)).not.toContain("2023-11-20");
  });
  it("counts business days in (start, end]", () => {
    expect(brazilianBusinessDays("2027-01-15", "2027-01-15")).toBe(0);
    expect(brazilianBusinessDays("2027-01-14", "2027-01-15")).toBe(1);
    // 2027: 261 weekdays less holidays on weekdays (1/1 Fri, 8-9/2, 26/3, 21/4 Wed, 27/5, 7/9 Tue, 12/10 Tue, 2/11 Tue, 15/11 Mon, 20/11 Sat, 25/12 Sat, 1/5 Sat).
    expect(brazilianBusinessDays("2026-12-31", "2027-12-31")).toBe(261 - 10);
    expect(() => brazilianBusinessDays("2027-02-01", "2027-01-01")).toThrow("calendar_reversed_interval");
  });
});
