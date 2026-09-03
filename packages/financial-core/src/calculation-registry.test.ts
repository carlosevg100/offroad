import {describe, expect, it} from "vitest";

import * as financialCore from "./index";
import {financialCalculationRegistry} from "./index";

describe("financial calculation registry", () => {
  it("binds every stable id to an exported deterministic function", () => {
    for (const functionName of Object.values(financialCalculationRegistry)) {
      expect(typeof financialCore[functionName as keyof typeof financialCore], functionName).toBe("function");
    }
  });
});
