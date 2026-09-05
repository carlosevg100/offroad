import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {accrualFactorAtPrecision, diPercentAccrualByConvention, businessDayAccrual} from "./index";

describe("accrualFactorAtPrecision", () => {
  it("keeps the layer the indenture writes: nine decimals rounded for a spread factor, sixteen truncated for a daily accumulation", () => {
    const spread = accrualFactorAtPrecision({annualRate: "0.0065", businessDays: 63, decimals: 9, mode: "round"});
    expect(spread.value).toBe("0.001621054");
    expect(spread.value.length - 2).toBe(9);
    const eight = accrualFactorAtPrecision({annualRate: "0.0065", businessDays: 63, decimals: 8, mode: "round"});
    expect(eight.value).toBe(businessDayAccrual("0.0065", 63).value);
    const daily = accrualFactorAtPrecision({annualRate: "0.13899875", businessDays: 9, percentOfIndex: "1.04", decimals: 16, mode: "truncate"});
    expect(daily.value.split(".")[1]?.length).toBeLessThanOrEqual(16);
    expect(daily.trace.operands.percentOfIndex).toBe("1.04");
  });

  it("refuses fractional days and a precision outside the range", () => {
    expect(() => accrualFactorAtPrecision({annualRate: "0.1", businessDays: 1.5, decimals: 8, mode: "round"})).toThrow();
    expect(() => accrualFactorAtPrecision({annualRate: "0.1", businessDays: 1, decimals: 30, mode: "round"})).toThrow();
  });

  it("reproduces the indenture's Fator DI for 104% of a daily CDI of 0.05166% over nine business days: 0.00484578", () => {
    const factor = diPercentAccrualByConvention({dailyRate: "0.0005166", businessDays: 9, percentOfIndex: "1.04", dailyProductDecimals: 16, dailyProductMode: "truncate", factorDecimals: 8, factorMode: "round"});
    expect(factor.value).toBe("0.00484578");
    expect(new Decimal("411643").times(factor.value).toFixed()).toBe("1994.73141654");
    expect(diPercentAccrualByConvention({dailyRate: "0.0005166", businessDays: 0, percentOfIndex: "1.04", dailyProductDecimals: 16, dailyProductMode: "truncate", factorDecimals: 8, factorMode: "round"}).value).toBe("0");
  });
});
