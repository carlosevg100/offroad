import {describe, expect, it} from "vitest";

import {calculateImpliedEbitda} from "./index";

describe("calculateImpliedEbitda", () => {
  it("divides net debt by the reported index and keeps both operands in the trace", () => {
    const implied = calculateImpliedEbitda("4228477", "4.72");
    expect(implied.value).toBe("895863.77118644");
    expect(implied.trace).toEqual([{label: "net_debt", value: "4228477"}, {label: "reported_index", value: "4.72"}]);
  });

  it("refuses a zero or negative index", () => {
    expect(() => calculateImpliedEbitda("100", "0")).toThrow(RangeError);
    expect(() => calculateImpliedEbitda("100", "-1")).toThrow(RangeError);
  });
});
