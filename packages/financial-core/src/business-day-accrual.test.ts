import {describe, expect, it} from "vitest";

import {businessDayAccrual, diPercentAccrual} from "./index";

describe("business-day accrual factors", () => {
  it("accrues an annual rate over business days of a 252-day year, as the indentures write it", () => {
    // 6,3416% a.a. over 63 business days: (1.063416)^(63/252) - 1 = 1.549034%.
    expect(businessDayAccrual("0.063416", 63).value).toBe("0.01549034");
    expect(businessDayAccrual("0.1391", 252).value).toBe("0.1391");
    expect(businessDayAccrual("0.1391", 0).value).toBe("0");
  });

  it("compounds p% of a flat DI day by day", () => {
    // 104% of a 13,91% DI over 252 days is above 13,91% times 1,04 because the days compound.
    const factor = diPercentAccrual("0.1391", "1.04", 252);
    expect(Number(factor.value)).toBeGreaterThan(0.1391 * 1.04);
    expect(diPercentAccrual("0.1391", "1", 252).value).toBe(businessDayAccrual("0.1391", 252).value);
    expect(diPercentAccrual("0.1391", "0", 252).value).toBe("0");
  });

  it("refuses negative day counts and impossible rates", () => {
    expect(() => businessDayAccrual("0.1", -1)).toThrow(RangeError);
    expect(() => businessDayAccrual("-1.5", 10)).toThrow(RangeError);
    expect(() => diPercentAccrual("0.1", "-0.5", 10)).toThrow(RangeError);
  });
});
